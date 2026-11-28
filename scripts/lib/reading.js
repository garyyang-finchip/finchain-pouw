// What an endpoint says now about waiting and paying: how far its finalized block is behind its
// latest, the fee cap a transaction sent now would carry, and the data fee of an OP Stack rollup.
// From that, whether an address's funds cover a budget of gas and transactions. Read-only.
"use strict";

const { ethers } = require("ethers");

/// The OP Stack predeploy that prices the data a transaction posts to the settlement layer.
const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";
const ORACLE_ABI = [
  "function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)",
  "function getL1Fee(bytes data) view returns (uint256)",
];

/// The readings, all at the endpoint's latest block, except the finalized block itself. This is an
/// operating reading, not a snapshot of state: it is taken again before each step that depends on it.
///   txBytes - the size of one transaction, for the data fee's upper bound
async function readEndpoint(provider, { txBytes = 2000 } = {}) {
  const observedAt = new Date().toISOString();
  const { chainId } = await provider.getNetwork();
  const latest = await provider.getBlock("latest");
  let finalized = null;
  try { finalized = await provider.getBlock("finalized"); } catch { finalized = null; }
  const fees = await provider.getFeeData();
  const feeCap = fees.maxFeePerGas ?? fees.gasPrice;
  if (feeCap === null || feeCap === undefined) throw new Error("the endpoint gives neither a fee cap nor a gas price");
  const dataFee = { oracle: GAS_PRICE_ORACLE, txBytes, perTransaction: null, how: null, unavailable: null };
  if ((await provider.getCode(GAS_PRICE_ORACLE)) === "0x") {
    dataFee.unavailable = `no GasPriceOracle at ${GAS_PRICE_ORACLE}: the data fee cannot be read on this chain`;
  } else {
    const oracle = new ethers.Contract(GAS_PRICE_ORACLE, ORACLE_ABI, provider);
    try {
      dataFee.perTransaction = await oracle.getL1FeeUpperBound(BigInt(txBytes));
      dataFee.how = "getL1FeeUpperBound";
    } catch {
      // before the oracle had an upper bound: the fee of that many bytes, none of them zero
      try {
        dataFee.perTransaction = await oracle.getL1Fee(`0x${"ff".repeat(txBytes)}`);
        dataFee.how = "getL1Fee of non-zero bytes";
      } catch (e) {
        dataFee.unavailable = `the GasPriceOracle answers neither getL1FeeUpperBound nor getL1Fee (${e.shortMessage ?? e.message})`;
      }
    }
  }
  return {
    chainId, observedAt,
    latest: { number: latest.number, timestamp: BigInt(latest.timestamp) },
    finalized: finalized ? { number: finalized.number, timestamp: BigInt(finalized.timestamp) } : null,
    finalityLagSeconds: finalized ? BigInt(latest.timestamp) - BigInt(finalized.timestamp) : null,
    fees: { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, gasPrice: fees.gasPrice, feeCap },
    dataFee,
  };
}

/// Whether `funds` cover `gas` at the fee cap read now plus the data fee of `transactions`, with
/// `marginPercent` on top, and `value` - what those transactions send - besides. A transaction is taken only if its sender holds its gas limit times its
/// fee cap, and on a rollup its data fee as well, so the fee cap is the measure, not the price paid.
/// When the data fee could not be read, coverage is not established: `covered` is null.
function coverage(reading, { funds, gas, transactions, marginPercent, value = 0n }) {
  gas = BigInt(gas); transactions = BigInt(transactions); value = BigInt(value);
  const margin = BigInt(marginPercent);
  const execution = gas * reading.fees.feeCap;
  const data = reading.dataFee.perTransaction === null ? null : transactions * reading.dataFee.perTransaction;
  const needed = data === null ? null : execution + data;
  const withMargin = needed === null ? null : (needed * (100n + margin) + 99n) / 100n + value;
  return {
    funds, gas, transactions, marginPercent: margin, value, execution, data, needed, withMargin,
    covered: withMargin === null ? null : funds >= withMargin,
  };
}

module.exports = { GAS_PRICE_ORACLE, readEndpoint, coverage };
