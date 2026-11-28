// The client for a deployment of ledger v2: the audit job and the confirmation of a tender, sent by
// the participant's own key or by a delegate key under the participant's permit, each with a record
// of the run (docs/ledger-v2.md 2, 12 and 13). The permit is the record that scripts/sign-permit.js
// wrote where the participant's key is; this client never sees that key, only the delegate's.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");
const g = require("./genesis");
const v2 = require("./ledger2");
const a2 = require("./audit2");
const permitLib = require("./permit");
const m2 = require("./manifest2");
const { sealed } = require("./canonical");
const { CLIENT, endpointHost } = require("./report");

const RUN_SCHEMA = "finchain-pouw.ledger-v2.run/2";
const RECORD_SCHEMA = "finchain-pouw.signed-statement/1";
// what a run record says of how its transaction was authorized
/// How a receipt was entered, from the receipt and its transaction: under a permit, by the
/// participant's own key (the transaction's origin is the participant), by the participant's account
/// itself (a contract account calling the entry, through its execute or otherwise, in a transaction
/// another key sent), or not known (a direct entry whose origin could not be read).
const LABEL = { DELEGATED: "delegated-by-owner-permit", DIRECT: "direct-by-key", ACCOUNT: "direct-by-account", UNKNOWN: "direct-route-unknown" };

/// The label of a receipt, by the evidence only.
function labelOf(receipt, origin) {
  if (receipt.authorization !== ethers.ZeroHash) return LABEL.DELEGATED;
  if (typeof origin !== "string" || !ethers.isAddress(origin)) return LABEL.UNKNOWN;
  return ethers.getAddress(origin) === ethers.getAddress(receipt.sender) ? LABEL.DIRECT : LABEL.ACCOUNT;
}
const TOKEN_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

/// The audit of the epoch before agrees with the ledger but left receipts undecided: nothing is
/// found wrong, and nothing is shown right either. Nothing is submitted (docs/decisions.md P71).
class AuditIncomplete extends Error {}

/// A run that stopped after it had sent something: `transactions` is what it sent, each with its
/// outcome - confirmed, failed, or unknown when the answer was lost.
class RunStopped extends Error {
  constructor(message, transactions, cause) { super(message, cause ? { cause } : undefined); this.transactions = transactions; }
}

/// The receipt that this run's transaction recorded is not the one the client computed: `result` is
/// the run as it happened, with the receipt's own fields and `differences`.
class ReceiptDiffers extends Error {
  constructor(result) {
    super(`the receipt ${result.receiptId} that the transaction recorded is not the one this client computed: ${result.differences.join("; ")}`);
    this.result = result; this.transactions = result.transactions;
  }
}

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const V2_INTERFACES = [v2.abi.ledger, v2.abi.adapter, v2.abi.policy].map((fragments) => new ethers.Interface(fragments));

/// The contract error behind a failed call or transaction, by the interfaces of ledger v2 first and
/// then by the kernel's: `{ name, args }`, or null.
function refusal(e) {
  const data = typeof e === "string" ? e
    : [e?.data, e?.info?.error?.data, e?.error?.data, e?.info?.error?.data?.data].find((d) => typeof d === "string" && d.length >= 10);
  if (data) {
    for (const i of V2_INTERFACES) {
      let parsed = null;
      try { parsed = i.parseError(data); } catch { parsed = null; }
      if (parsed) return { name: parsed.name, args: parsed.args.map((a) => a.toString()) };
    }
  }
  return g.refusal(e);
}

/// A permit given for sending: the record of scripts/sign-permit.js, read by the audit's own rules
/// (audit2.js permitIndex) - a Permit for this chain and this ledger, whole, and signed. A bare
/// message, which the audit accepts by agreement, is not sent: what goes into a transaction is the
/// statement the participant's key signed, as the script wrote it.
function readPermitFile(ctx, file) {
  const bytes = fs.readFileSync(file);
  let given;
  try { given = JSON.parse(bytes.toString("utf8")); } catch (e) { throw new Error(`${file} is not JSON: ${e.message}`); }
  if (given === null || typeof given !== "object" || given.schema !== RECORD_SCHEMA) {
    throw new Error(`${file}: a permit is given as the record that scripts/sign-permit.js writes (schema ${RECORD_SCHEMA})`);
  }
  const known = a2.permitIndex(ctx, [given]);
  if (known.unusable.length > 0) throw new Error(`${file}: the record is unusable: ${known.unusable[0].why}`);
  if (known.foreign.length > 0) {
    const d = known.foreign[0].domain;
    throw new Error(`${file}: the permit is for the ledger ${d.verifyingContract} on chain ${d.chainId}, not for ${ctx.address} on chain ${ctx.chainId}`);
  }
  const [entry] = [...known.byDigest.values()];
  if (!entry.signature) throw new Error(`${file}: the record holds no signature - it is the unsigned form that goes into an operation package`);
  // the key whose ECDSA signature the record holds, recovered from it; the record's signer field is
  // what the record declares, which the signature does not bind, and it must not contradict the key
  let signatureKey = null;
  try { signatureKey = ethers.recoverAddress(entry.digest, entry.signature); } catch { signatureKey = null; }
  let declaredSigner = null;
  if (Object.prototype.hasOwnProperty.call(given, "signer") && given.signer !== null) {
    if (typeof given.signer !== "string" || !ethers.isAddress(given.signer)) throw new Error(`${file}: the record's signer field is not an address`);
    declaredSigner = ethers.getAddress(given.signer);
    if (signatureKey !== null && declaredSigner !== signatureKey) {
      throw new Error(`${file}: the record's signer field names ${declaredSigner}, but its signature is the key ${signatureKey}'s: the field is not bound by the signature, and a record that contradicts itself is not used`);
    }
  }
  return {
    file, sha256: sha256(bytes), digest: entry.digest, statement: entry.statement, message: entry.message,
    tuple: permitLib.permitTuple(entry.statement), signature: entry.signature, signatureKey, declaredSigner,
  };
}

/// Who sends, for whom, and under what: the participant is the permit's account or the key itself.
async function party(signer, permit, operation) {
  const sender = await signer.getAddress();
  if (permit === null) return { participant: sender, sender };
  const m = permit.message;
  if (m.delegate !== sender) throw new Error(`the sending key ${sender} is not the permit's delegate ${m.delegate}: only the delegate can use it`);
  if ((Number(m.scope) & operation) === 0) {
    throw new Error(`the permit's scope (${permitLib.scopeNames(m.scope).join(", ") || "none"}) does not include ${operation === permitLib.OP.SUBMIT_G0 ? "submit-g0" : "confirm-tender"}`);
  }
  return { participant: m.account, sender };
}

/// Every check of the permit that the ledger makes, made now by the ledger itself and without a
/// transaction: a permit it would refuse is refused here, with the ledger's own reason, and nothing
/// is sent.
async function checkPermitNow(ctx, permit, sender, operation) {
  try { return await ctx.ledger.checkPermit(permit.tuple, permit.signature, sender, operation); } catch (e) {
    const r = refusal(e);
    throw new Error(`the ledger refuses the permit now${r ? `: ${r.name}(${r.args.join(", ")})` : ` (${e.shortMessage ?? e.message})`}; nothing was sent`);
  }
}

/// A signed permit checked at one block without a transaction, as the ledger would check it when its
/// delegate sends: the caller, the scope, the epochs, the nonce and the revocation, the account's
/// signature - by ERC-1271 for an account with code - and the guard, each under the gas bound the
/// ledger gives it. This is the path of a valid permit; a measurement of the refusal of a foreign
/// signature (the probe) does not stand for it. No key is read and nothing is sent.
///
/// The block is taken once and every read is made at its number: the ledger's check, the account's
/// code, the guard's reading, the epoch and, last, the endpoint's gas estimate, asked with the block
/// as eth_estimateGas's own block parameter. Then the block's hash is asked for again, and only then
/// is the record put together. A read the endpoint could not serve stops the check with
/// StateUnavailable; it is never taken for the ledger's answer. Only a contract's own answer is a
/// refusal, and only the policy's NotStarted makes the epoch absent (`beforeGenesis`). The gas
/// estimate alone is optional: an endpoint that gives none at that block leaves it null, with the
/// reason in `gasEstimateUnavailable`, and the check stands without it.
async function permitCheck(ctx, permit, { delegate = null, operation, pin = null } = {}) {
  pin = pin ?? ctx.pin ?? await g.pinBlock(ctx.provider, ctx.tag);
  const sender = ethers.getAddress(delegate ?? permit.message.delegate);
  const at = { blockTag: pin.number };
  const read = (what, call) => g.stateRead(pin, what, call);
  const why = (e) => e?.info?.error?.message ?? e?.error?.message ?? e?.shortMessage ?? e?.message ?? String(e);

  let accepted = false; let digest = null; let refused = null;
  try {
    digest = await read("the ledger's check of the permit", () => ctx.ledger.checkPermit(permit.tuple, permit.signature, sender, operation, at));
    accepted = true;
  } catch (e) {
    if (e instanceof g.StateUnavailable) throw e;
    const r = refusal(e);
    refused = r ? `${r.name}(${r.args.join(", ")})` : why(e);
  }
  const account = permit.message.account;
  const hasCode = (await read(`the code at ${account}`, () => ctx.provider.getCode(account, pin.number))) !== "0x";
  const guard = permit.message.guard !== ethers.ZeroAddress ? await m2.cellGuardReading(ctx.provider, account, { pin }) : null;
  let epoch = null; let beforeGenesis = false;
  try { epoch = await read("the policy's current epoch", () => ctx.policy.currentEpoch(at)); } catch (e) {
    if (e instanceof g.StateUnavailable) throw e;
    const r = refusal(e);
    if (r?.name !== "NotStarted") throw new Error(`the policy answers its current epoch at block ${pin.number} with ${r ? `${r.name}(${r.args.join(", ")})` : why(e)}`);
    beforeGenesis = true;
  }
  let gasEstimate = null; let gasEstimateUnavailable = null;
  if (typeof ctx.provider.send !== "function") gasEstimateUnavailable = "the provider takes no request with a block parameter";
  else {
    const call = { from: sender, to: ctx.address, data: ctx.ledger.interface.encodeFunctionData("checkPermit", [permit.tuple, permit.signature, sender, operation]) };
    try { gasEstimate = BigInt(await ctx.provider.send("eth_estimateGas", [call, ethers.toQuantity(pin.number)])); } catch (e) { gasEstimateUnavailable = why(e); }
  }
  await g.recheck(ctx.provider, pin);
  return {
    block: { number: pin.number, hash: pin.hash, timestamp: pin.timestamp, finality: pin.finality, observedAt: pin.observedAt, hashRechecked: true },
    epoch, beforeGenesis,
    permit: { digest: permit.digest, account, delegate: permit.message.delegate, scope: permitLib.scopeNames(permit.message.scope), notBeforeEpoch: permit.message.notBeforeEpoch,
      notAfterEpoch: permit.message.notAfterEpoch, nonce: permit.message.nonce, guard: permit.message.guard, guardBindingVersion: permit.message.guardBindingVersion,
      signatureKey: permit.signatureKey, declaredSigner: permit.declaredSigner, recordSha256: permit.sha256 },
    sender, operation: permitLib.scopeNames(operation), accountHasCode: hasCode, accepted, digestReturned: digest, refused, gasEstimate, gasEstimateUnavailable, guard,
  };
}

// ---------------------------------------------------------------- what a run sends

/// A run's transactions, written down the moment the endpoint takes each one and again with its
/// outcome. `onEvent` is told each time, and waited for, so that a caller can keep the journal
/// outside the process before the run goes on.
function newRun(onEvent = () => {}) { return { transactions: [], onEvent }; }

/// What a run has sent so far, in words, for a message that stops it.
function sentText(run) {
  if (run.transactions.length === 0) return "nothing was sent";
  return `nothing more was sent; this run sent ${run.transactions.map((t) => `${t.step} (tx ${t.txHash ?? "with no hash"}, ${t.status})`).join(" and ")}`;
}

/// Stop a run: an Error that says what was sent, and carries it when anything was.
function stop(run, message, cause) {
  const text = `${message}; ${sentText(run)}`;
  return run.transactions.length === 0 ? Object.assign(new Error(text), cause ? { cause } : {}) : new RunStopped(text, run.transactions, cause);
}

/// Send one transaction of a run: `submit` returns the endpoint's answer, which is written down at
/// once with the hash, the sender and the nonce; then the receipt is waited for and the outcome is
/// written down. A refusal before the endpoint took the transaction sends nothing; an answer that
/// was lost leaves the outcome unknown, and the transaction is named for it to be looked up.
async function sendTx(run, step, from, submit, wait) {
  let tx;
  try { tx = await submit(); } catch (e) {
    const r = refusal(e);
    if (r || e.code === "CALL_EXCEPTION") throw stop(run, `${step} was refused before it was taken: ${r ? `${r.name}(${r.args.join(", ")})` : e.shortMessage ?? e.message}`, e);
    const entry = { step, txHash: null, from, nonce: null, status: "unknown", error: e.shortMessage ?? e.message };
    run.transactions.push(entry);
    await run.onEvent({ event: "unknown", ...entry });
    throw stop(run, `${step}: the endpoint gave no answer, and whether it took the transaction is unknown - look up the nonce of ${from}`, e);
  }
  const entry = { step, txHash: tx.hash, from: tx.from, nonce: tx.nonce, status: "submitted" };
  run.transactions.push(entry);
  await run.onEvent({ event: "submitted", ...entry });
  let rc;
  try { rc = await tx.wait(wait); } catch (e) {
    if (e.receipt) Object.assign(entry, { status: "failed", block: e.receipt.blockNumber, gasUsed: e.receipt.gasUsed });
    else Object.assign(entry, { status: "unknown", error: e.shortMessage ?? e.message });
    await run.onEvent({ event: entry.status, ...entry });
    const r = refusal(e);
    throw stop(run, entry.status === "failed" ? `${step} failed in block ${entry.block}${r ? `: ${r.name}(${r.args.join(", ")})` : ""}` : `${step}: its receipt was not obtained (${entry.error}); look it up by its hash ${tx.hash}`, e);
  }
  Object.assign(entry, { status: "confirmed", block: rc.blockNumber, gasUsed: rc.gasUsed });
  await run.onEvent({ event: "confirmed", ...entry });
  return rc;
}

/// The same call as a transaction would make, asked without one: whatever the contract would refuse
/// at this moment is refused before anything more is sent. The chain can change after it is asked;
/// the transaction is then decided by the contract, as always.
async function dryRun(contract, method, args, run = newRun()) {
  try { await contract[method].staticCall(...args); } catch (e) {
    const r = refusal(e);
    throw stop(run, `${method} would be refused${r ? `: ${r.name}(${r.args.join(", ")})` : ` (${e.shortMessage ?? e.message})`}`, e);
  }
}

/// The receipt with its status, and the transaction that recorded it with the origin the ledger's
/// event names: from this run's receipt, or, for a receipt recorded before, read back from the
/// ledger's log - "unknown" when that cannot be read.
async function recorded(ctx, rc, id) {
  const out = { receipt: v2.plainReceipt(await ctx.ledger.receipt(id)), status: v2.plainStatus(await ctx.ledger.status(id)) };
  if (rc) {
    const ev = g.eventOf(rc, ctx.ledger, "ReceiptRecorded");
    return { ...out, origin: ev.args.origin, operator: Number(ev.args.operator), recordedIn: { txHash: rc.hash, block: rc.blockNumber, read: "this run's transaction" } };
  }
  try {
    const head = await ctx.provider.getBlockNumber();
    const [ev] = await g.logs(ctx, ctx.ledger, "ReceiptRecorded", [id], ctx.fromBlock, head);
    if (ev) return { ...out, origin: ev.args.origin, operator: Number(ev.args.operator), recordedIn: { txHash: ev.transactionHash, block: ev.blockNumber, read: "read back from the ledger's log" } };
    return { ...out, origin: "unknown", operator: null, recordedIn: { txHash: "unknown", block: "unknown", read: `not found in the ledger's log from block ${ctx.fromBlock}` } };
  } catch (e) {
    return { ...out, origin: "unknown", operator: null, recordedIn: { txHash: "unknown", block: "unknown", read: `the ledger's log could not be read (${e.shortMessage ?? e.message})` } };
  }
}

/// Where a receipt that this run's transaction recorded is not the one the client computed: each
/// field that differs, in words. Empty when it is the one.
function receiptDifferences(receipt, expected) {
  const out = [];
  for (const [field, value] of Object.entries(expected)) {
    const got = receipt[field];
    const same = typeof value === "string" && typeof got === "string" ? value.toLowerCase() === got.toLowerCase() : value === got;
    if (!same) out.push(`${field}: computed ${value}, recorded ${got}`);
  }
  return out;
}

// ---------------------------------------------------------------- the built-in work this client does

const AUDIT_V1_BUILD = path.join(__dirname, "..", "..", "build", "v2", "AuditV1.json");
const same = (a, b) => typeof a === "string" && typeof b === "string" && ethers.isAddress(a) && ethers.isAddress(b) && ethers.getAddress(a) === ethers.getAddress(b);

/// The g0.ref profile in force in `epoch`, with its function held to the one this client evaluates
/// before anything is sent: AuditV1 bound to this ledger - its function id, its ledger, its code
/// against the build of build/v2 with the immutable values aside, and the deployment's AuditV1
/// where the deployment names one. The profile's name is not the function's identity. What else
/// the ledger would refuse - recording paused, a profile of another pool or without the job - is
/// found by the entry asked without a transaction, with the ledger's own reason.
async function g0Profile(ctx, epoch) {
  let p;
  try { p = await ctx.policy.activeProfile(g.profileKey(g.PROFILE_G0_REF), epoch); } catch (e) {
    const r = refusal(e);
    throw new Error(`no g0.ref profile is in force in epoch ${epoch}${r ? `: ${r.name}(${r.args.join(", ")})` : ` (${e.shortMessage ?? e.message})`}; nothing was sent`);
  }
  const why = [];
  const named = ctx.deployment?.contracts?.AuditV1;
  if (named !== undefined && !same(named, p.module)) why.push(`it is not the deployment's AuditV1 ${named}`);
  const fn = new ethers.Contract(p.module, g.abi.audit, ctx.provider);
  const ask = async (call) => { try { return await call(); } catch { return null; } };
  const id = await ask(() => fn.functionId());
  if (id !== g.AUDIT_V1_FUNCTION_ID) why.push(`its function id is ${id ?? "not readable"}, not audit-v1's`);
  const reads = await ask(() => fn.ledger());
  if (!same(reads, ctx.address)) why.push(`it does not read this ledger (${reads ?? "no answer"})`);
  const build = JSON.parse(fs.readFileSync(AUDIT_V1_BUILD, "utf8"));
  const code = await ctx.provider.getCode(p.module);
  if (code.length !== build.deployedBytecode.length || g.maskedCode(code, build.immutableReferences) !== g.maskedCode(build.deployedBytecode, build.immutableReferences)) {
    why.push("its code is not the AuditV1 build of build/v2");
  }
  if (why.length > 0) {
    throw new Error(`the g0.ref profile in force in epoch ${epoch} names the function at ${p.module}, which this client does not evaluate: ${why.join("; ")}. This client does the audit job of AuditV1 only; nothing was sent`);
  }
  return p;
}

/// Do the current epoch's audit job (g0.ref) for the participant: recompute the epoch before in
/// full, and submit only when the recomputation agrees with the ledger and is complete. With a
/// permit the delegate sends `submitG0For`; without one the key sends `submitG0` for itself.
///   permit  - from readPermitFile, or null
///   permits - permits given to the audit of the epoch before (audit2.js permitIndex)
///   expectEpoch - the epoch the work is meant for: nothing is done unless the chain is in it
///   onEvent - told of each transaction when it is taken and again with its outcome
/// Before any transaction, everything that can be known before the epoch's seed is checked: the
/// permit, the profile and its function, and the entry itself asked without a transaction. Opening
/// the epoch is a transaction of its own and is in the run's record; a refusal after it says so.
async function workG0(ctx, signer, { permit = null, permits = [], wait = 1, expectEpoch = null, onEvent } = {}) {
  const { participant, sender } = await party(signer, permit, permitLib.OP.SUBMIT_G0);
  const ledger = ctx.ledger.connect(signer);
  const run = newRun(onEvent);
  const epoch = await ctx.policy.currentEpoch();
  if (expectEpoch !== null && BigInt(expectEpoch) !== epoch) throw new Error(`the work was meant for epoch ${expectEpoch}; the chain is in epoch ${epoch}; nothing was sent`);
  const contributionId = v2.g0ContributionId(ctx.domain, g.AUDIT_V1_FUNCTION_ID, epoch, 0, participant);
  const base = { command: "work", given: { sendingKey: sender, permit }, participant, epoch, transactions: run.transactions };
  // what is recorded is not sent again: found by its contribution id before anything else is done.
  // Finding it needs no permit in force: what this run was given is kept apart from the receipt's own
  const existing = await ctx.ledger.receiptOfContribution(contributionId);
  if (existing !== 0n) {
    const r = await recorded(ctx, null, existing);
    return { ...base, sender: r.receipt.sender, contributionId: r.receipt.contributionId, receiptId: existing, ...r, txHash: null, block: null, gasUsed: null, alreadyRecorded: true, work: null, differences: [] };
  }
  if (permit !== null) await checkPermitNow(ctx, permit, sender, permitLib.OP.SUBMIT_G0);
  await g0Profile(ctx, epoch);

  let work;
  if (epoch === 0n) {
    const { subject } = await a2.auditSubjectFor(ctx, 0n);
    work = { audited: null, subject, receipts: 0, tableHash: null, agrees: true, complete: true };
  } else {
    const report = await a2.auditEpoch(ctx, epoch - 1n, { permits });
    if (!report.agrees) {
      const e = new g.AuditMismatch(`epoch ${epoch - 1n}: the recomputation differs from the ledger in ${report.findings.length} place(s): ${report.findings.map((f) => f.what).join("; ")}`);
      e.report = report;
      throw e;
    }
    if (!report.complete) {
      const e = new AuditIncomplete(`epoch ${epoch - 1n}: the recomputation agrees with the ledger but left ${report.undecided.length} receipt(s) undecided (${report.undecided.map((u) => u.receiptId).join(", ")}): nothing is submitted for work that was not re-decided in full`);
      e.report = report;
      throw e;
    }
    work = { audited: epoch - 1n, subject: report.subject, receipts: report.receipts.length, tableHash: report.tableHash, agrees: true, complete: true };
  }
  const key = g.profileKey(g.PROFILE_G0_REF);
  const entry = (output) => (permit === null ? ["submitG0", [key, epoch, 0, output]] : ["submitG0For", [permit.tuple, permit.signature, key, epoch, 0, output]]);
  if ((await ledger.seedOf(epoch)) === ethers.ZeroHash) {
    // the output depends on the seed the opening captures: the entry is asked first with an output
    // that only decides the verdict, so that every refusal known now comes before the opening
    const [method, args] = entry(ethers.ZeroHash);
    await dryRun(ledger, method, args, run);
    // opening an epoch is nobody's act in particular: the sending key sends it directly
    await sendTx(run, "openEpoch", sender, () => ledger.openEpoch(), wait);
  }
  const seed = await ledger.seedOf(epoch);
  if (seed === ethers.ZeroHash) throw stop(run, `epoch ${epoch} has no seed: it turned before it could be opened; run again`);
  const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, participant);
  const inputHash = g.auditInputHash(epoch, work.subject);
  const output = g.auditOutput(instance, inputHash);
  const [method, args] = entry(output);
  await dryRun(ledger, method, args, run);
  const rc = await sendTx(run, method, sender, () => ledger[method](...args), wait);
  const id = g.eventOf(rc, ctx.ledger, "ReceiptRecorded").args.id;
  const r = await recorded(ctx, rc, id);
  const differences = receiptDifferences(r.receipt, {
    contributionId, worker: participant, sender, authorization: permit === null ? ethers.ZeroHash : permit.digest, epoch, pool: v2.POOL_G0, workId: instance, inputHash, outputHash: output,
  });
  const result = { ...base, sender: r.receipt.sender, contributionId: r.receipt.contributionId, receiptId: id, ...r, instance, output, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, alreadyRecorded: false, work, differences };
  if (differences.length > 0) throw new ReceiptDiffers(result);
  return result;
}

/// Confirm a settled submission of an ERC-8414 tender that the participant owns (g1.tender). With a
/// permit the delegate sends `confirmFor` to the adapter; without one the owner's key sends `confirm`.
/// The adapter is the module of the g1.tender profile in force, held to this ledger and to the
/// deployment's adapter where the deployment names one. With `expectEpoch`, nothing is done unless the
/// chain is in that epoch.
async function confirmTender(ctx, signer, { tokenId, submissionId, permit = null, wait = 1, expectEpoch = null, onEvent }) {
  tokenId = BigInt(tokenId); submissionId = BigInt(submissionId);
  const { participant, sender } = await party(signer, permit, permitLib.OP.CONFIRM_TENDER);
  const run = newRun(onEvent);
  const epoch = await ctx.policy.currentEpoch();
  if (expectEpoch !== null && BigInt(expectEpoch) !== epoch) throw new Error(`the confirmation was meant for epoch ${expectEpoch}; the chain is in epoch ${epoch}; nothing was sent`);
  let profile;
  try { profile = await ctx.policy.activeProfile(g.profileKey(g.PROFILE_G1_TENDER), epoch); } catch (e) {
    const r = refusal(e);
    throw new Error(`no g1.tender profile is in force in epoch ${epoch}${r ? `: ${r.name}(${r.args.join(", ")})` : ` (${e.shortMessage ?? e.message})`}; nothing was sent`);
  }
  const adapter = new ethers.Contract(profile.module, v2.abi.adapter, signer);
  const named = ctx.deployment?.contracts?.TenderAdapter8414V2;
  const reads = await adapter.ledger().catch(() => null);
  if ((named !== undefined && !same(named, profile.module)) || !same(reads, ctx.address)) {
    throw new Error(`the g1.tender profile in force in epoch ${epoch} names the module ${profile.module}, which ${!same(reads, ctx.address) ? "does not report to this ledger" : `is not the deployment's adapter ${named}`}; nothing was sent`);
  }
  const source = await adapter.taskToken();
  const owner = await new ethers.Contract(source, TOKEN_ABI, ctx.provider).ownerOf(tokenId);
  if (owner !== participant) {
    throw new Error(`the tender ${tokenId} is owned by ${owner}, not by ${participant}: only its owner, or a delegate under the owner's permit, confirms it; nothing was sent`);
  }
  const contributionId = v2.g1ContributionId(ctx.domain, source, tokenId, submissionId);
  const base = { command: "bridge", given: { sendingKey: sender, permit }, participant, tender: { source, tokenId, submissionId, adapter: adapter.target }, transactions: run.transactions };
  const existing = await ctx.ledger.receiptOfContribution(contributionId);
  if (existing !== 0n) {
    const r = await recorded(ctx, null, existing);
    return { ...base, sender: r.receipt.sender, contributionId: r.receipt.contributionId, epoch: r.receipt.epoch, receiptId: existing, ...r, txHash: null, block: null, gasUsed: null, alreadyRecorded: true, differences: [] };
  }
  if (permit !== null) await checkPermitNow(ctx, permit, sender, permitLib.OP.CONFIRM_TENDER);
  const [method, args] = permit === null ? ["confirm", [tokenId, submissionId]] : ["confirmFor", [permit.tuple, permit.signature, tokenId, submissionId]];
  await dryRun(adapter, method, args, run);
  const rc = await sendTx(run, method, sender, () => adapter[method](...args), wait);
  const id = g.eventOf(rc, adapter, "TenderConfirmed").args.receiptId;
  const r = await recorded(ctx, rc, id);
  const differences = receiptDifferences(r.receipt, {
    contributionId, counterparty: participant, sender, authorization: permit === null ? ethers.ZeroHash : permit.digest, pool: v2.POOL_G1,
  });
  const result = { ...base, sender: r.receipt.sender, contributionId: r.receipt.contributionId, epoch: r.receipt.epoch, receiptId: id, ...r, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, alreadyRecorded: false, differences };
  if (differences.length > 0) throw new ReceiptDiffers(result);
  return result;
}

/// The record of one run of `work` or `bridge`. What this run was given and sent is kept apart
/// from what the receipt itself shows: the label, the sender, the permit and the origin are the
/// receipt's, as the ledger recorded it - by this run's transaction, or before it. Participant,
/// sender and origin are kept apart, and the label says how the receipt was entered - it says
/// nothing about which program decided to do the work (A74, condition 7).
function runRecord(ctx, r, { rpc = "", recordedAt = new Date().toISOString(), host = null } = {}) {
  const d = ctx.deployment ?? {};
  const given = r.given.permit;
  const permitOf = (p) => {
    const m = p.message;
    return {
      digest: p.digest, account: m.account, delegate: m.delegate, scope: permitLib.scopeNames(m.scope), notBeforeEpoch: m.notBeforeEpoch, notAfterEpoch: m.notAfterEpoch,
      nonce: m.nonce, guard: m.guard, guardBindingVersion: m.guardBindingVersion, signatureKey: p.signatureKey, declaredSigner: p.declaredSigner, recordSha256: p.sha256,
    };
  };
  const authorization = r.receipt.authorization;
  const delegated = authorization !== ethers.ZeroHash;
  // the permit the receipt was recorded under: its statement where this run was given that permit
  const permit = !delegated ? null
    : given !== null && given.digest === authorization ? permitOf(given)
      : { digest: authorization, statement: "not given to this run: the audit reads it from the receipt's transaction" };
  return sealed(g.jsonable({
    schema: RUN_SCHEMA,
    environment: d.environment ?? "unspecified",
    labels: d.labels ?? [],
    deployment: d.name ?? "unnamed",
    chainId: ctx.chainId,
    ledger: ctx.address,
    endpointHost: endpointHost(rpc),
    recordedAt,
    client: CLIENT,
    ...(host ? { host } : {}),
    command: r.command,
    given: { sendingKey: r.given.sendingKey, permit: given === null ? null : permitOf(given) },
    transactions: r.transactions,
    alreadyRecorded: r.alreadyRecorded,
    label: labelOf(r.receipt, r.origin),
    participant: r.participant,
    sender: r.sender,
    origin: r.origin,
    permit,
    epoch: r.epoch,
    receiptId: r.receiptId,
    contributionId: r.contributionId,
    txHash: r.recordedIn.txHash,
    block: r.recordedIn.block,
    gasUsed: r.gasUsed,
    recordedIn: r.recordedIn.read,
    receipt: { worker: r.receipt.worker, counterparty: r.receipt.counterparty, sender: r.receipt.sender, authorization },
    status: {
      verdict: g.VERDICT_NAME[r.status.verdict] ?? String(r.status.verdict), eligibility: v2.INELIGIBLE_NAME[r.status.ineligible] ?? String(r.status.ineligible),
      relation: g.RELATION_NAME[r.status.relation] ?? String(r.status.relation), gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized,
    },
    differences: r.differences,
    ...(r.command === "work" ? { work: r.work } : {}),
    ...(r.command === "bridge" ? { tender: r.tender } : {}),
    reading: [
      r.alreadyRecorded
        ? "The receipt was recorded before this run, which found it by its contribution id and sent nothing. What this run was given is under given; the label, the sender, the permit and the origin are the receipt's own, and its transaction is as recordedIn says."
        : "This run sent the transactions listed, each written down when the endpoint took it and again with its outcome; the last recorded the receipt.",
      {
        [LABEL.DELEGATED]: "The receipt was entered by its sender under the participant's permit, whose digest is its authorization: when it was recorded the ledger checked the permit and, for an account with code, that the account accepted the signature and its guard. That an account accepts a signature does not show that only its current owner could make it.",
        [LABEL.DIRECT]: "The receipt was entered directly, with no permit, in a transaction whose origin is the participant: the participant's own key sent it.",
        [LABEL.ACCOUNT]: "The receipt was entered directly, with no permit, by the participant's account itself in a transaction another key sent (the origin): a contract account calling the entry, through its execute or otherwise. It was not the participant's own key that sent it.",
        [LABEL.UNKNOWN]: "The receipt was entered directly, with no permit, by its sender, the participant; the origin of its transaction could not be read, so whether a key or a contract account sent it is not known.",
      }[labelOf(r.receipt, r.origin)],
      "Participant, sender and origin are recorded apart: the participant is the worker or the demander of record, the sender called the entry, the origin is the transaction's top-level sender.",
      ...(given !== null ? ["Of the permit given, signatureKey is the key whose ECDSA signature the record holds, recovered from it (null when the signature is not one), and declaredSigner is what the record's signer field says, which the signature does not bind; the client refuses a record where the two differ."] : []),
      "This record says which run of the reference client sent the transactions, started by whoever holds the sending key. It is no evidence that the participant's own software initiated the work, or of who ran a model.",
    ],
  }));
}

/// The exit status of a command built on the audit of an epoch of ledger v2: 0 when it is `ok`, 5 when
/// it agrees with the ledger but left receipts undecided, 2 when it differs (docs/decisions.md P71).
const auditExitStatus = (report) => (report.ok ? 0 : report.agrees ? 5 : 2);

// ---------------------------------------------------------------- the output of a command

/// Take the place of an output before anything is read or sent: the file is created, so that a path
/// that exists - a link included - or that cannot be created is refused while nothing has been sent.
/// An official output of the v2 client never replaces a file it did not create (P68, A87).
function reserveOutput(file) {
  let fd;
  try { fd = fs.openSync(file, "wx", 0o644); } catch (e) {
    if (e.code === "EEXIST") throw new Error(`--out ${file} exists already: an output of the v2 client is a new file and nothing is overwritten; nothing was sent`);
    if (e.code === "ENOENT") throw new Error(`--out ${file}: the directory ${path.dirname(file)} does not exist; nothing was sent`);
    throw new Error(`--out ${file} cannot be created (${e.code ?? e.message}); nothing was sent`);
  }
  return { file, fd, events: 0, done: false };
}

/// While a run goes on, its output holds the journal: one event per line, each written through to
/// the disk when it happens, so that what was sent is kept whatever happens after it.
function appendEvent(out, event) {
  fs.writeSync(out.fd, `${JSON.stringify(g.jsonable({ at: new Date().toISOString(), ...event }))}\n`);
  fs.fsyncSync(out.fd);
  out.events += 1;
}

/// The record takes the place of the journal at the end. With a journal, the record is written to a
/// new file beside it first and then put in the output's place, so that a failure to write it
/// leaves the journal as it was.
function finishOutput(out, text) {
  if (out.events === 0) {
    fs.writeSync(out.fd, text, 0);
    fs.fsyncSync(out.fd);
    fs.closeSync(out.fd);
  } else {
    const temporary = `${out.file}.${process.pid}.record`;
    try {
      fs.writeFileSync(temporary, text, { flag: "wx" });
      fs.renameSync(temporary, out.file);
    } catch (e) { throw new Error(`the record could not be written (${e.message}); the journal of the run is in ${out.file}`); }
    fs.closeSync(out.fd);
  }
  out.done = true;
}

/// A command that stops: its output is left with the journal when anything was written to it, and
/// removed when it is still the empty file this run created.
function releaseOutput(out) {
  if (out.done) return null;
  try { fs.closeSync(out.fd); } catch { /* closed already */ }
  if (out.events > 0) return out.file;
  try { if (fs.statSync(out.file).size === 0) fs.unlinkSync(out.file); } catch { /* gone already */ }
  return null;
}

module.exports = {
  RUN_SCHEMA, LABEL, labelOf, permitCheck, AuditIncomplete, RunStopped, ReceiptDiffers, refusal, readPermitFile, checkPermitNow, workG0, confirmTender, receiptDifferences,
  runRecord, auditExitStatus, reserveOutput, appendEvent, finishOutput, releaseOutput,
};
