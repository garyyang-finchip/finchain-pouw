// The read-only probe of contract accounts before a round on ledger v2 (docs/ledger-v2.md 11.7):
// what the cell guard would answer for each account now, and how much gas the account's signature
// check and the cell guard take against the account as it is deployed, compared with the 200,000
// and 500,000 gas the ledger gives them. Nothing is sent, nothing is deployed and no key is used:
// every measurement is an eth_call in which the guard's committed build and a small gas meter are
// placed at two unused addresses by a state override, for that call only.
"use strict";

const { ethers } = require("ethers");
const g = require("../../client/lib/genesis");
const m2 = require("../../client/lib/manifest2");

// the bounds of the ledger (GenesisLedgerV2): a guard's static call, an account's signature check
const GUARD_GAS = 500_000n;
const SIGNATURE_GAS = 200_000n;
// the two delegated operations a guard is asked about (contracts/v2/TypesV2.sol)
const OPERATIONS = { submitG0: 1, confirmTender: 2 };
const MAGIC = "0x1626ba7e";

// The gas meter: called with the target (20 bytes), the gas to give it (32 bytes) and the call data,
// it makes the static call and returns four words - whether the call succeeded, the first word of
// its answer, the gas the call took as seen from the caller, and the size of the answer. The gas
// includes the access of the target and a few dozen gas of setup, as the ledger's own call does.
const OP = { SUB: 0x03, SHR: 0x1c, CALLDATALOAD: 0x35, CALLDATASIZE: 0x36, CALLDATACOPY: 0x37, RETURNDATASIZE: 0x3d, POP: 0x50,
  MLOAD: 0x51, MSTORE: 0x52, GAS: 0x5a, PUSH1: 0x60, DUP1: 0x80, DUP3: 0x82, RETURN: 0xf3, STATICCALL: 0xfa };
const METER_PROGRAM = [
  ["PUSH1", 0x34], "CALLDATASIZE", "SUB", //                      the size of the call data to pass on
  "DUP1", ["PUSH1", 0x34], ["PUSH1", 0x80], "CALLDATACOPY", //     copied to memory at 0x80
  "GAS", ["PUSH1", 0x40], "MSTORE", //                             the gas before the call, at 0x40
  ["PUSH1", 0x20], ["PUSH1", 0x20], "DUP3", ["PUSH1", 0x80], //    one word of answer to 0x20; the call data
  ["PUSH1", 0x00], "CALLDATALOAD", ["PUSH1", 0x60], "SHR", //      the target
  ["PUSH1", 0x14], "CALLDATALOAD", //                              the gas it is given
  "STATICCALL",
  "GAS", ["PUSH1", 0x40], "MLOAD", "SUB", ["PUSH1", 0x40], "MSTORE", // the gas the call took, at 0x40
  ["PUSH1", 0x00], "MSTORE", "POP", //                             whether it succeeded, at 0x00
  "RETURNDATASIZE", ["PUSH1", 0x60], "MSTORE", //                  the size of its answer, at 0x60
  ["PUSH1", 0x80], ["PUSH1", 0x00], "RETURN",
];
function assemble(program) {
  const bytes = [];
  for (const step of program) {
    if (Array.isArray(step)) bytes.push(OP[step[0]], step[1]);
    else bytes.push(OP[step]);
  }
  return ethers.hexlify(Uint8Array.from(bytes));
}
const METER_CODE = assemble(METER_PROGRAM);
// two addresses no contract is at on any chain this is run on; the probe checks that before using them
const METER_AT = "0x00000000000000000000000000000000c0115ead";
const GUARD_AT = "0x00000000000000000000000000000000c0115eaf";

/// One metered static call at `blockTag`: `{ success, word, gasUsed, answerBytes }`.
async function metered(provider, blockTag, target, gas, data, overrides = {}) {
  const input = ethers.concat([target, ethers.toBeHex(gas, 32), data]);
  const raw = await provider.send("eth_call", [{ to: METER_AT, data: input }, blockTag, { [METER_AT]: { code: METER_CODE }, ...overrides }]);
  const [success, word, gasUsed, size] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "bytes32", "uint256", "uint256"], raw);
  return { success: success === 1n, word, gasUsed, answerBytes: Number(size) };
}

/// What one metered call shows, each thing apart: the gas the caller saw, whether the call succeeded
/// with the bound it was given - which is what a bound is for - whether its answer has the form the
/// ledger reads, and, when it failed, whether it used up what it was given. The caller's gas includes
/// the access of the callee and the setup, so it is not compared with the callee's bound.
function callOf(r, bound, answerValid) {
  return {
    callerGas: r.gasUsed, succeededWithTheBound: r.success, answerBytes: r.answerBytes, answerValid: r.success && answerValid,
    failure: r.success ? null : r.gasUsed >= bound ? "used at least the gas it was given" : "reverted",
  };
}

/// Probe each account at one block. `accounts` are `{ name, account }`. Returns the record's body.
/// The block is taken once, every read is made at its number, and its hash is asked for again at the
/// end: when it is not the same block any more, nothing is returned (genesis.js recheck).
async function probe(provider, accounts, { blockTag = "finalized" } = {}) {
  const pin = await g.pinBlock(provider, blockTag);
  const tag = ethers.toQuantity(pin.number);
  for (const a of [METER_AT, GUARD_AT]) {
    if ((await provider.getCode(a, tag)) !== "0x") throw new Error(`there is code at ${a} on this chain: the probe does not place its meter or the guard there`);
  }
  const guardBuild = m2.loadBuild("FogaCellGuard");
  if (guardBuild.immutableReferences.length !== 0) throw new Error("the guard's build has immutable values: it cannot be placed by its runtime code alone");
  const guard = new ethers.Interface(guardBuild.abi);
  const account1271 = new ethers.Interface(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);
  // a signature by a key made for this probe and dropped after it: well formed, and not the owner's
  const digest = ethers.id("finchain-pouw: cell probe, a digest no permit has");
  const signature = ethers.Wallet.createRandom().signingKey.sign(digest).serialized;

  const parties = [];
  for (const { name, account } of accounts) {
    const address = ethers.getAddress(account);
    const reading = await m2.cellGuardReading(provider, address, { blockTag: tag });
    const guardCalls = {};
    for (const [op, code] of Object.entries(OPERATIONS)) {
      const r = await metered(provider, tag, GUARD_AT, GUARD_GAS, guard.encodeFunctionData("allows", [address, code]), { [GUARD_AT]: { code: guardBuild.deployedBytecode } });
      // the ledger reads one word: 1 allows, anything else - or no word - refuses
      const call = callOf(r, GUARD_GAS, r.answerBytes === 32 && (BigInt(r.word) === 0n || BigInt(r.word) === 1n));
      guardCalls[op] = { ...call, allows: call.answerValid && BigInt(r.word) === 1n };
    }
    const s = await metered(provider, tag, address, SIGNATURE_GAS, account1271.encodeFunctionData("isValidSignature", [digest, signature]));
    const sig = callOf(s, SIGNATURE_GAS, s.answerBytes >= 32);
    const signatureCheck = { ...sig, answer: sig.answerValid ? s.word.slice(0, 10) : null };
    signatureCheck.acceptedTheForeignSignature = signatureCheck.answer === MAGIC;
    // the guard of the chain and the reading of the views agree, or the probe says that they do not
    const agrees = guardCalls.submitG0.allows === reading.allows && guardCalls.confirmTender.allows === reading.allows;
    parties.push({ name, account: address, reading, guard: guardCalls, signature: signatureCheck, readingAgreesWithGuard: agrees });
  }
  await g.recheck(provider, pin);
  return {
    block: { number: pin.number, hash: pin.hash, timestamp: pin.timestamp, asked: String(blockTag), finality: pin.finality, observedAt: pin.observedAt, hashRechecked: true },
    bounds: { guard: GUARD_GAS, signature: SIGNATURE_GAS },
    guardBuild: { file: "build/v2/FogaCellGuard.json", runtimeCodeHash: ethers.keccak256(guardBuild.deployedBytecode) },
    meter: { code: METER_CODE, at: METER_AT, guardAt: GUARD_AT },
    signatureProbe: { digest, signer: "a key made for this probe and not kept", signature },
    parties,
  };
}

module.exports = { GUARD_GAS, SIGNATURE_GAS, OPERATIONS, METER_PROGRAM, METER_CODE, METER_AT, GUARD_AT, assemble, metered, callOf, probe };
