// The client for a deployment of ledger v2: the audit job and the confirmation of a tender, sent by
// the participant's own key or by a delegate key under the participant's permit, each with a record
// of the run (docs/ledger-v2.md 2, 12 and 13). The permit is the record that scripts/sign-permit.js
// wrote where the participant's key is; this client never sees that key, only the delegate's.
"use strict";

const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");
const g = require("./genesis");
const v2 = require("./ledger2");
const a2 = require("./audit2");
const permitLib = require("./permit");
const { sealed } = require("./canonical");
const { CLIENT, endpointHost } = require("./report");

const RUN_SCHEMA = "finchain-pouw.ledger-v2.run/1";
const RECORD_SCHEMA = "finchain-pouw.signed-statement/1";
// what a run record says of how its transaction was authorized
const LABEL = { DELEGATED: "delegated-by-owner-permit", DIRECT: "direct-by-key" };
const TOKEN_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

/// The audit of the epoch before agrees with the ledger but left receipts undecided: nothing is
/// found wrong, and nothing is shown right either. Nothing is submitted (docs/decisions.md P71).
class AuditIncomplete extends Error {}

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
  return {
    file, sha256: sha256(bytes), digest: entry.digest, statement: entry.statement, message: entry.message,
    tuple: permitLib.permitTuple(entry.statement), signature: entry.signature, signer: given.signer ?? null,
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

/// The same call as a transaction would make, asked without one: whatever the contract would refuse
/// is refused before anything is sent.
async function dryRun(contract, method, args) {
  try { await contract[method].staticCall(...args); } catch (e) {
    const r = refusal(e);
    throw new Error(`${method} would be refused${r ? `: ${r.name}(${r.args.join(", ")})` : ` (${e.shortMessage ?? e.message})`}; nothing was sent`);
  }
}

/// The receipt that a transaction recorded, with the origin the ledger's event names.
async function recorded(ctx, rc, id) {
  const ev = rc ? g.eventOf(rc, ctx.ledger, "ReceiptRecorded") : null;
  return {
    receipt: v2.plainReceipt(await ctx.ledger.receipt(id)), status: v2.plainStatus(await ctx.ledger.status(id)),
    origin: ev ? ev.args.origin : null, operator: ev ? Number(ev.args.operator) : null,
  };
}

/// Do the current epoch's audit job (g0.ref) for the participant: recompute the epoch before in
/// full, and submit only when the recomputation agrees with the ledger and is complete. With a
/// permit the delegate sends `submitG0For`; without one the key sends `submitG0` for itself.
///   permit  - from readPermitFile, or null
///   permits - permits given to the audit of the epoch before (audit2.js permitIndex)
async function workG0(ctx, signer, { permit = null, permits = [], wait = 1, expectEpoch = null } = {}) {
  const { participant, sender } = await party(signer, permit, permitLib.OP.SUBMIT_G0);
  const ledger = ctx.ledger.connect(signer);
  const epoch = await ctx.policy.currentEpoch();
  if (expectEpoch !== null && BigInt(expectEpoch) !== epoch) throw new Error(`the work was meant for epoch ${expectEpoch}; the chain is in epoch ${epoch}`);
  const contributionId = v2.g0ContributionId(ctx.domain, g.AUDIT_V1_FUNCTION_ID, epoch, 0, participant);
  const base = { command: "work", participant, sender, permit, epoch, contributionId };
  // what is recorded is not sent again: found by its contribution id before anything else is done
  const existing = await ctx.ledger.receiptOfContribution(contributionId);
  if (existing !== 0n) return { ...base, receiptId: existing, ...(await recorded(ctx, null, existing)), txHash: null, block: null, gasUsed: 0n, alreadyRecorded: true, work: null };
  if (permit !== null) await checkPermitNow(ctx, permit, sender, permitLib.OP.SUBMIT_G0);

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
  // opening an epoch is nobody's act in particular: the sending key sends it directly
  if ((await ledger.seedOf(epoch)) === ethers.ZeroHash) await (await ledger.openEpoch()).wait(wait);
  const seed = await ledger.seedOf(epoch);
  if (seed === ethers.ZeroHash) throw new Error(`epoch ${epoch} has no seed: it turned before it could be opened; run again`);
  const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, participant);
  const output = g.auditOutput(instance, g.auditInputHash(epoch, work.subject));
  const key = g.profileKey(g.PROFILE_G0_REF);
  const [method, args] = permit === null ? ["submitG0", [key, epoch, 0, output]] : ["submitG0For", [permit.tuple, permit.signature, key, epoch, 0, output]];
  await dryRun(ledger, method, args);
  const rc = await (await ledger[method](...args)).wait(wait);
  const id = g.eventOf(rc, ctx.ledger, "ReceiptRecorded").args.id;
  return { ...base, receiptId: id, ...(await recorded(ctx, rc, id)), instance, output, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, alreadyRecorded: false, work };
}

/// Confirm a settled submission of an ERC-8414 tender that the participant owns (g1.tender). With a
/// permit the delegate sends `confirmFor` to the adapter; without one the owner's key sends `confirm`.
async function confirmTender(ctx, signer, { tokenId, submissionId, permit = null, wait = 1 }) {
  tokenId = BigInt(tokenId); submissionId = BigInt(submissionId);
  const { participant, sender } = await party(signer, permit, permitLib.OP.CONFIRM_TENDER);
  const epoch = await ctx.policy.currentEpoch();
  const profile = await ctx.policy.activeProfile(g.profileKey(g.PROFILE_G1_TENDER), epoch);
  const adapter = new ethers.Contract(profile.module, v2.abi.adapter, signer);
  const source = await adapter.taskToken();
  const owner = await new ethers.Contract(source, TOKEN_ABI, ctx.provider).ownerOf(tokenId);
  if (owner !== participant) {
    throw new Error(`the tender ${tokenId} is owned by ${owner}, not by ${participant}: only its owner, or a delegate under the owner's permit, confirms it; nothing was sent`);
  }
  const contributionId = v2.g1ContributionId(ctx.domain, source, tokenId, submissionId);
  const base = { command: "bridge", participant, sender, permit, contributionId, tender: { source, tokenId, submissionId, adapter: adapter.target } };
  const existing = await ctx.ledger.receiptOfContribution(contributionId);
  if (existing !== 0n) {
    const r = await recorded(ctx, null, existing);
    return { ...base, epoch: r.receipt.epoch, receiptId: existing, ...r, txHash: null, block: null, gasUsed: 0n, alreadyRecorded: true };
  }
  if (permit !== null) await checkPermitNow(ctx, permit, sender, permitLib.OP.CONFIRM_TENDER);
  const [method, args] = permit === null ? ["confirm", [tokenId, submissionId]] : ["confirmFor", [permit.tuple, permit.signature, tokenId, submissionId]];
  await dryRun(adapter, method, args);
  const rc = await (await adapter[method](...args)).wait(wait);
  const id = g.eventOf(rc, adapter, "TenderConfirmed").args.receiptId;
  const r = await recorded(ctx, rc, id);
  return { ...base, epoch: r.receipt.epoch, receiptId: id, ...r, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, alreadyRecorded: false };
}

/// The record of one run of `work` or `bridge`: which run sent which transaction, for whom, under
/// what. Participant, sender and origin are kept apart, and the label says how the sending key was
/// authorized - it says nothing about which program decided to do the work (A74, condition 7).
function runRecord(ctx, r, { rpc = "", recordedAt = new Date().toISOString(), host = null } = {}) {
  const d = ctx.deployment ?? {};
  const delegated = r.permit !== null;
  const m = delegated ? r.permit.message : null;
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
    label: delegated ? LABEL.DELEGATED : LABEL.DIRECT,
    participant: r.participant,
    sender: r.sender,
    origin: r.origin,
    permit: delegated ? {
      digest: r.permit.digest, account: m.account, delegate: m.delegate, scope: permitLib.scopeNames(m.scope), notBeforeEpoch: m.notBeforeEpoch,
      notAfterEpoch: m.notAfterEpoch, nonce: m.nonce, guard: m.guard, guardBindingVersion: m.guardBindingVersion, signer: r.permit.signer,
      recordSha256: r.permit.sha256,
    } : null,
    epoch: r.epoch,
    receiptId: r.receiptId,
    contributionId: r.contributionId,
    alreadyRecorded: r.alreadyRecorded,
    txHash: r.txHash,
    block: r.block,
    gasUsed: r.gasUsed,
    receipt: { worker: r.receipt.worker, counterparty: r.receipt.counterparty, sender: r.receipt.sender, authorization: r.receipt.authorization },
    status: {
      verdict: g.VERDICT_NAME[r.status.verdict] ?? String(r.status.verdict), eligibility: v2.INELIGIBLE_NAME[r.status.ineligible] ?? String(r.status.ineligible),
      relation: g.RELATION_NAME[r.status.relation] ?? String(r.status.relation), gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized,
    },
    ...(r.command === "work" ? { work: r.work } : {}),
    ...(r.command === "bridge" ? { tender: r.tender } : {}),
    reading: [
      delegated
        ? "The sending key acted under the participant's permit, within the operations and epochs it names; when the receipt was recorded the ledger checked the permit and, for an account with code, the account's signature and its guard."
        : "The sending key is the participant: it sent for itself.",
      "Participant, sender and origin are recorded apart: the participant is the worker or the demander of record, the sender called the entry, the origin is the transaction's top-level sender.",
      "This record says which run of the reference client sent the transaction, started by whoever holds the sending key. It is no evidence that the participant's own software initiated the work, or of who ran a model.",
      ...(r.alreadyRecorded ? ["The receipt was recorded before this run, which found it by its contribution id and sent nothing; the origin is not read back for it."] : []),
    ],
  }));
}

/// The exit status of a command built on the audit of an epoch of ledger v2: 0 when it is `ok`, 5 when
/// it agrees with the ledger but left receipts undecided, 2 when it differs (docs/decisions.md P71).
const auditExitStatus = (report) => (report.ok ? 0 : report.agrees ? 5 : 2);

/// Create a file with `text`, or fail: an official output of the v2 client never replaces a file
/// (docs/decisions.md P68, A87). A link at the path is a path that exists.
function createFile(file, text) {
  try { fs.writeFileSync(file, text, { flag: "wx" }); } catch (e) {
    if (e.code === "EEXIST") throw new Error(`${file} exists already: nothing is overwritten, and the record was not written`);
    throw e;
  }
}
function refuseExisting(file) {
  let there = true;
  try { fs.lstatSync(file); } catch (e) { if (e.code !== "ENOENT") throw e; there = false; }
  if (there) throw new Error(`--out ${file} exists already: an output of the v2 client is a new file and nothing is overwritten`);
}

module.exports = { RUN_SCHEMA, LABEL, AuditIncomplete, refusal, readPermitFile, checkPermitNow, workG0, confirmTender, runRecord, auditExitStatus, createFile, refuseExisting };
