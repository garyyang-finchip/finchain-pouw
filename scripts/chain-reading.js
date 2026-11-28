#!/usr/bin/env node
// How long to wait and what a step costs on a chain, read from its endpoint now. Read-only; no key.
"use strict";

const { ethers } = require("ethers");
const c = require("./lib/common");
const { readEndpoint, coverage } = require("./lib/reading");
const g = require("../client/lib/genesis");

const USAGE = `usage: node scripts/chain-reading.js [--rpc <url>] [--chain-id <n>] [--tx-bytes <n>]
                                  [--address <address> --gas <n> --txs <n> [--value <eth>] [--funds <eth>] [--margin <percent>]]
                                  [--out <file>] [--json]

Reads, and only reads, the endpoint's latest and finalized blocks - how far the finalized block's
time is behind the latest's - and the fee cap a transaction sent now would carry, with the data fee
of an OP Stack rollup for a transaction of --tx-bytes. With --address it also says whether that
address's funds cover --gas at that fee cap plus the data fee of --txs transactions, with --margin
on top, and --value besides: a transaction is taken only if its sender holds its gas limit times its
fee cap, its data fee and what it sends. Every reading is of the latest block and holds for now only: take it again before each step.

  --rpc <url>          JSON-RPC endpoint (or POUW_RPC)
  --chain-id <n>       refuse an endpoint that answers for another chain
  --tx-bytes <n>       the size of one transaction for the data fee (default 2000)
  --address <address>  the sender whose funds are checked
  --gas <n>            the gas of the steps it is to send, summed
  --txs <n>            how many transactions those are
  --value <eth>        what those transactions send, counted without the margin (default 0)
  --funds <eth>        the funds to count instead of the address's balance - for an address still to be
                       funded, the amount the configuration gives it
  --margin <percent>   added to what is needed (default 50)
  --out <file>         also write the record to a new file (a file that exists is not replaced)
  --json               print the record instead of text

Exit status: 0 read, and covered when --address is given; 2 not covered, or coverage not established
because the data fee could not be read; 1 any other failure.`;

const whole = (v, what) => { if (!/^\d+$/.test(String(v))) throw new Error(`${what} is a whole number, not ${v}`); return BigInt(v); };

async function main() {
  const opts = c.parse(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return 0; }
  const rpc = c.need(opts.rpc ?? process.env.POUW_RPC, "--rpc (or POUW_RPC)");
  const provider = c.connectRpc(rpc);
  const reading = await readEndpoint(provider, { txBytes: Number(whole(opts["tx-bytes"] ?? 2000, "--tx-bytes")) });
  if (opts["chain-id"] !== undefined && whole(opts["chain-id"], "--chain-id") !== reading.chainId) {
    throw new Error(`the endpoint answers for chain ${reading.chainId}, not ${opts["chain-id"]}`);
  }
  let cover = null;
  if (opts.address !== undefined) {
    const address = ethers.getAddress(opts.address);
    const assumed = opts.funds !== undefined;
    const funds = assumed ? ethers.parseEther(opts.funds) : await provider.getBalance(address);
    cover = { address, fundsAssumed: assumed, ...coverage(reading, {
      funds, gas: whole(c.need(opts.gas, "--gas"), "--gas"), transactions: whole(c.need(opts.txs, "--txs"), "--txs"),
      marginPercent: whole(opts.margin ?? 50, "--margin"), value: ethers.parseEther(opts.value ?? "0") }) };
  } else if (opts.gas !== undefined || opts.txs !== undefined || opts.funds !== undefined || opts.value !== undefined) {
    throw new Error("--gas, --txs, --value and --funds go with --address");
  }

  const record = g.jsonable({
    schema: "finchain-pouw.chain-reading/1", endpointHost: c.endpointHost(rpc), client: { name: "finchain-pouw", version: c.version() },
    recordedAt: new Date().toISOString(), ...reading, coverage: cover,
    reading: [
      "Every value is the endpoint's answer at its latest block when it was asked; the finalized block is the one it named then. It holds for now only.",
      "feeCap is maxFeePerGas where the endpoint gives one, else gasPrice: what a transaction sent now would carry, and what its sender must hold per unit of its gas limit.",
      "The data fee is the GasPriceOracle's upper bound for a transaction of txBytes; it is not the fee of a particular transaction.",
    ],
  });
  if (opts.out !== undefined) c.createJson(c.expand(opts.out), record);

  const eth = (v) => (v === null ? "not known" : `${ethers.formatEther(v)} ETH`);
  const gwei = (v) => (v === null || v === undefined ? "not given" : `${ethers.formatUnits(v, "gwei")} gwei`);
  const lines = [
    `chain ${reading.chainId}, endpoint ${record.endpointHost}, observed ${reading.observedAt}`,
    `  latest     block ${reading.latest.number}, ${c.iso(reading.latest.timestamp)}`,
    reading.finalized ? `  finalized  block ${reading.finalized.number}, ${c.iso(reading.finalized.timestamp)}: ${reading.finalityLagSeconds} s behind the latest`
      : "  finalized  not given by the endpoint",
    `  fee cap    ${gwei(reading.fees.feeCap)} (maxFeePerGas ${gwei(reading.fees.maxFeePerGas)}, maxPriorityFeePerGas ${gwei(reading.fees.maxPriorityFeePerGas)}, gasPrice ${gwei(reading.fees.gasPrice)})`,
    reading.dataFee.perTransaction !== null ? `  data fee   at most ${eth(reading.dataFee.perTransaction)} for a transaction of ${reading.dataFee.txBytes} bytes (${reading.dataFee.how})`
      : `  data fee   not known: ${reading.dataFee.unavailable}`,
  ];
  if (cover) {
    lines.push(`  ${cover.address}: ${cover.fundsAssumed ? "to hold" : "holds"} ${eth(cover.funds)}; ${cover.gas} gas at the fee cap ${eth(cover.execution)}, `
      + `data fee of ${cover.transactions} transaction(s) ${eth(cover.data)}, with ${cover.marginPercent}% on top${cover.value > 0n ? ` and ${eth(cover.value)} sent` : ""} ${eth(cover.withMargin)}: `
      + (cover.covered === null ? "NOT ESTABLISHED, the data fee is not known" : cover.covered ? "COVERED" : "NOT COVERED"));
  }
  console.log(opts.json ? JSON.stringify(record, null, 2) : lines.join("\n"));
  return cover && cover.covered !== true ? 2 : 0;
}

c.run(main, "chain-reading");
