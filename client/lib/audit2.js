// Ledger v2: the audit of an epoch from the chain alone (docs/ledger-v2.md 13.1).
//
// The same discipline as the audit of the kernel in genesis.js: one block is taken, everything is
// read at it - the logs up to it, every view and every code at its number - and nothing is reported
// if the block is no longer the block it was when the reads are done. What is re-decided:
//
//   - every receipt of the epoch whose work this client can read again: a G0 receipt of the audit
//     function, and a G1 receipt that a tender adapter confirmed. Its verdict, its one reason in the
//     order of the ledger, its relation and its GMU, from the seed, the epoch before, the tender's
//     own log and the policy as it was in force;
//   - the operator each worker is attributed to, from the policy's log, against the receipt's
//     record and the ledger's stored attribution;
//   - the digest, the totals and the audit subject; each operator's share and each worker's
//     allocation under the two caps; the close record when there is one.
//
// A report keeps three things apart. `findings` are the differences between the recomputation and
// the ledger. `undecided` are the receipts whose work this client could not read again, and for
// which the recorded status stands in the replay:
//
//   - a receipt of a module this client cannot read: its facts are not derived. Its unit and its
//     content key are still held to the ledger's rules, because those need the log only;
//   - a G0 receipt of a function this client does not carry: the verdict is the function's, and is
//     taken as recorded; what follows from the verdict - the GMU, the one reason - is re-decided.
//
// A report `agrees` when it has no finding, is `complete` when nothing is undecided - that is, the
// work of every receipt was re-decided within what this client reads - and is `ok` only when both
// hold. `complete` says nothing of the authorization behind the receipts: that evidence has states
// of its own, per receipt, which say how far it reaches and are neither findings nor undecided:
//
//   - the permit behind a delegated entry. The receipt holds the digest of the permit, and a digest
//     does not show a permit. Where the delegate sent its transaction to the ledger or to the
//     module itself, the permit and its signature are that transaction's own input, and the audit
//     reads them there and holds the whole call to the receipt. Where the call went through another
//     contract they are not at the top of the input: then the audit looks among the permits it was
//     given (`permits`), and without one it reports the digest alone;
//   - the signature of a contract account: the ledger asked the account when the receipt was
//     recorded, and the account's answer at another time is another fact;
//   - which of the ledger's two rules a permit passed. Whether the account had code when the permit
//     was used is state of that moment, and not in the block the audit reads. The audit infers the
//     rule from the permit and the frozen rules of the ledger: a permit that names no guard passes
//     for an account without code only, a permit that names one passes for an account with code
//     only, so each is held to its rule. The account's code at the audit's block is reported
//     beside it and decides nothing.
//
// Nothing here holds a key or sends a transaction.

"use strict";

const { ethers } = require("ethers");
const g = require("./genesis");
const v2 = require("./ledger2");
const permitLib = require("./permit");

const { POOL_G0, POOL_G1, INELIGIBLE: I, UNIT } = v2;
const { VERDICT, RELATION, RELATION_NAME, AUTHORITY_EVIDENCE } = g;
const ZERO = ethers.ZeroAddress;
const NONE = ethers.ZeroHash;

// how a receipt entered the ledger
const ENTRY = { DIRECT: "direct", DELEGATED: "delegated" };
// what the audit holds of the permit behind a delegated entry
const PERMIT_EVIDENCE = {
  IN_TRANSACTION: "permit-in-the-transaction",         // the receipt's transaction is the delegate's own call, with the permit in its input
  INVALID_IN_TRANSACTION: "entry-call-without-a-valid-permit", // the entry's own call, with no permit of this ledger's version in it: a finding
  SUPPLIED: "permit-supplied",                         // one of the permits given to the audit has the receipt's digest
  NOT_AVAILABLE: "permit-not-available",               // the call went through another contract, and no given permit matches: the digest is all there is
};
// what is known of the transaction that recorded a receipt
const TRANSACTION = {
  ENTRY: "the-entry",                         // its top-level call is the receipt's entry: the sender, the input and any permit are held to the receipt
  TO_A_MODULE_NOT_READ: "to-a-module-not-read", // its top-level call is to the receipt's module, which this client does not read: its sender is the origin, no more is read
  THROUGH_A_CONTRACT: "through-a-contract",   // its top-level call is to another contract: its sender is the origin, and no more is read from it
};
// what the audit can say of the signature under a supplied permit
const SIGNATURE_EVIDENCE = {
  VERIFIED: "signature-of-the-account-verified",   // a permit without a guard: the signature recovers to the account
  CONTRACT: "contract-account-not-asked-again",    // a permit with a guard: the ledger asked the account at the time; the audit does not ask at another
  NOT_SUPPLIED: "signature-not-supplied",
  NOT_THE_ACCOUNTS: "signature-not-of-the-account", // a permit without a guard whose signature does not recover to the account
};
// which of the ledger's two rules a supplied permit passed when it was used
const ACCOUNT_AT_USE = { NO_CODE: "without-code", CONTRACT: "with-code" };
// where the facts behind a G1 receipt come from
const FACTS_EVIDENCE = {
  DERIVED: "derived-from-the-source",        // read again from the tender contract and its log
  NOT_READABLE: "module-not-readable",       // the profile's module is not one this client reads
  NOT_EVALUATED: "verdict-as-recorded",       // a G0 function this client does not carry: its verdict is not evaluated again
};

// The one form of a key's signature the ledger accepts (docs/ledger-v2.md 4): 65 bytes, s in the
// lower half of the curve's order, v 27 or 28. Anything else recovers to nobody, as in the ledger.
const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;
function recoverAsTheLedger(digest, signature) {
  let bytes;
  try { bytes = ethers.getBytes(signature); } catch { return null; }
  if (bytes.length !== 65) return null;
  const r = ethers.hexlify(bytes.slice(0, 32)); const s = ethers.hexlify(bytes.slice(32, 64)); const v = bytes[64];
  if (BigInt(s) > SECP256K1_HALF_N || (v !== 27 && v !== 28)) return null;
  try { return ethers.recoverAddress(digest, { r, s, v }); } catch { return null; }
}

/// The log that was read does not reach back to what the audit needs: a start block too late for
/// the deployment, or an endpoint that served an incomplete log. Nothing is reported from such a
/// reading, because a difference it found could be the gap.
class HistoryIncomplete extends Error {}

function plainParams(p) {
  return { ...g.plainParams(p), operatorCapBps: BigInt(p.operatorCapBps) };
}

function plainProfile(p) {
  return { ...g.plainProfile(p), role: Number(p.role), countsUnits: Boolean(p.countsUnits), unitSetRoot: p.unitSetRoot, issuerSetRoot: p.issuerSetRoot };
}

// ---------------------------------------------------------------- the connection

/// Connect to a deployment of ledger v2. `deployment` names the ledger and, where known, the chain
/// and the blocks the logs are read from; the policy and the seed source are read from the ledger.
/// With `pin`, every read of the connection is made at that block.
///
/// The log starts. `deployBlock` is the block of the deployment's first contract, as the kernel's
/// manifests have it: the policy is deployed first and its first parameters are emitted by its
/// constructor, so the policy's log must be read from that block or earlier. A deployment may name
/// the starts apart: `policyDeployBlock`, `ledgerDeployBlock` and `tenderDeployBlock`, each falling
/// back to `deployBlock`, and that to 0. A start that is too late is not silently a shorter history:
/// the audit checks that the log reaches back to what it needs and throws HistoryIncomplete when it
/// does not.
async function connect(deployment, runner, { tag = "finalized", logChunk, pin = null } = {}) {
  logChunk = Number(logChunk ?? deployment.logChunk ?? 0);
  const provider = runner.provider ?? runner;
  // a v2 manifest names its contracts by role (manifest2.js); a bare deployment names the ledger
  const ledgerAddress = deployment.ledger ?? deployment.contracts?.GenesisLedgerV2;
  const policyAddress = deployment.policy ?? deployment.contracts?.GenesisPolicyV2;
  if (!ledgerAddress) throw new Error("the deployment names no ledger");
  const ledger = new ethers.Contract(ledgerAddress, v2.abi.ledger, runner);
  const read = (what, call) => (pin ? g.stateRead(pin, what, () => call(g.at(pin))) : call({}));
  if (pin && (await g.stateRead(pin, "the ledger's code", () => provider.getCode(ledger.target, pin.number))) === "0x") {
    throw new Error(`no contract at the ledger's address ${ledger.target} at block ${pin.number}`);
  }
  const { chainId } = await provider.getNetwork();
  if (deployment.chainId !== undefined && BigInt(deployment.chainId) !== chainId) {
    throw new Error(`the deployment is on chain ${deployment.chainId}; the endpoint answers for chain ${chainId}`);
  }
  const address = await ledger.getAddress();
  const domain = await read("the ledger's domain", (o) => ledger.domain(o));
  if (domain !== v2.ledgerDomain(chainId, address)) throw new Error(`ledger domain ${domain} is not the v2 domain of chain ${chainId} and this address`);
  const factDomain = await read("the ledger's fact domain", (o) => ledger.factDomain(o));
  if (factDomain !== v2.factDomain(chainId, address)) throw new Error(`fact domain ${factDomain} is not the v2 fact domain of chain ${chainId} and this address`);
  const policy = new ethers.Contract(await read("the ledger's policy", (o) => ledger.policy(o)), v2.abi.policy, runner);
  const same = (a, b) => a === undefined || ethers.getAddress(a) === ethers.getAddress(b);
  if (!same(policyAddress, await policy.getAddress())) throw new Error("the deployment's policy is not the ledger's policy");
  return {
    deployment, provider, runner, ledger, policy, chainId, domain, factDomain, address,
    seedSource: await read("the ledger's seed source", (o) => ledger.seedSource(o)),
    genesisTime: await read("the policy's genesis time", (o) => policy.genesisTime(o)),
    epochDuration: await read("the policy's epoch duration", (o) => policy.epochDuration(o)),
    policyFromBlock: Number(deployment.policyDeployBlock ?? deployment.deployBlock ?? 0),
    fromBlock: Number(deployment.ledgerDeployBlock ?? deployment.deployBlock ?? 0),
    tenderFromBlock: Number(deployment.tenderDeployBlock ?? deployment.deployBlock ?? 0),
    tag, logChunk, pin,
  };
}

// ---------------------------------------------------------------- the policy as it was in force

/// The policy of an epoch, replayed from the policy's own log up to `toBlock`: the parameters, the
/// profile versions, each party's operator and admission, and each account's guard binding. Every
/// change is scheduled for the epoch after the one it is made in, so the records of one kind come in
/// the order of the epochs they apply from, and the last one at or before the epoch is in force.
async function policyAt(ctx, epoch, toBlock) {
  epoch = BigInt(epoch);
  const from = ctx.policyFromBlock ?? ctx.fromBlock;
  const read = (name) => g.logs(ctx, ctx.policy, name, [], from, toBlock);
  let params = null; let paramsVersion = 0; let first = null;
  for (const ev of await read("ParamsRegistered")) {
    const p = plainParams(ev.args.params);
    if (first === null || Number(ev.args.version) < first) first = Number(ev.args.version);
    if (p.activeFromEpoch <= epoch) { params = p; paramsVersion = Number(ev.args.version); }
  }
  // the policy's constructor registers version 1: a log without it does not start at the policy
  if (first !== 1 || params === null) {
    throw new HistoryIncomplete(`the policy's log from block ${from} to ${toBlock} ${first === null ? "holds no parameters" : first !== 1
      ? `starts at parameters version ${first}` : `holds no parameters in force for epoch ${epoch}`}: the policy's first parameters are registered when it is deployed, so the log was read from too late a block (policyDeployBlock or deployBlock), or the endpoint served an incomplete log`);
  }

  // The profile versions of each key, replayed as the policy changes them (GenesisPolicyV2
  // registerProfile and retireProfile). A registration either adds the next version, or replaces the
  // last one while that one is still ahead: the same version number and id, the same activation
  // epoch, the new values, and no retirement - the policy pops the old entry and pushes a fresh one.
  // A retirement marks the last version. Anything else is not a transition this policy makes, so a
  // log that shows it does not begin at the start, or was served incomplete.
  const versions = new Map(); // key -> [{ profile, retiredFrom }] by version
  const profileEvents = [...await read("ProfileRegistered"), ...await read("ProfileRetired")].sort((a, b) => (g.before(a, b) ? -1 : 1));
  const gap = (what) => new HistoryIncomplete(`the policy's log from block ${from} ${what}: the log was read from too late a block, or the endpoint served an incomplete log`);
  for (const ev of profileEvents) {
    const list = versions.get(ev.args.key) ?? [];
    const n = list.length; const last = n > 0 ? list[n - 1] : null;
    if (ev.fragment.name === "ProfileRegistered") {
      const profile = plainProfile(ev.args.profile);
      if (profile.version === n + 1 && (last === null || profile.activeFromEpoch > last.profile.activeFromEpoch)) {
        list.push({ profile, retiredFrom: null }); // the next version
      } else if (profile.version === n && last !== null && profile.id === last.profile.id && profile.activeFromEpoch === last.profile.activeFromEpoch) {
        list[n - 1] = { profile, retiredFrom: null }; // the last version replaced while still ahead: new values, retirement cleared
      } else {
        throw gap(`shows version ${profile.version} of profile ${ev.args.key} from epoch ${profile.activeFromEpoch} ${n === 0 ? "and no earlier one" : `after version ${n} from epoch ${last.profile.activeFromEpoch}`}, which is not a transition the policy makes`);
      }
    } else {
      if (last === null || last.profile.id !== ev.args.id) throw gap(`shows a retirement of version ${ev.args.id} of profile ${ev.args.key} that is not its last registered version`);
      last.retiredFrom = BigInt(ev.args.retiredFromEpoch);
    }
    versions.set(ev.args.key, list);
  }
  const profiles = new Map();
  for (const [key, list] of versions) {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v.profile.activeFromEpoch > epoch) continue;
      if (v.retiredFrom === null || epoch < v.retiredFrom) profiles.set(key, v.profile);
      break;
    }
  }

  const operators = new Map(); const admitted = new Map(); const guards = new Map();
  for (const ev of await read("OperatorDeclared")) if (BigInt(ev.args.fromEpoch) <= epoch) operators.set(ev.args.party, Number(ev.args.operator));
  for (const ev of await read("AdmissionSet")) if (BigInt(ev.args.fromEpoch) <= epoch) admitted.set(ev.args.party, Boolean(ev.args.admitted));
  for (const ev of await read("GuardBound")) {
    if (BigInt(ev.args.fromEpoch) > epoch) continue;
    guards.set(ev.args.account, { guard: ev.args.guard, version: BigInt(ev.args.version), fromEpoch: BigInt(ev.args.fromEpoch), codeHash: ev.args.codeHash });
  }
  return {
    params, paramsVersion, profiles, profileById: new Map([...profiles.values()].map((p) => [p.id, p])),
    operatorOf: (a) => operators.get(a) ?? 0, isAdmitted: (a) => admitted.get(a) ?? false,
    // null when no guard was ever bound for the epoch; a binding of the zero address is an unbinding
    guardOf: (a) => guards.get(a) ?? null,
  };
}

// ---------------------------------------------------------------- the receipts of an epoch

/// The receipts of one epoch in the order they were recorded, from the log: each with its status,
/// the top-level sender of its transaction and the operator its worker was attributed to.
async function readEpochReceipts(ctx, epoch, toBlock) {
  const recorded = await g.logs(ctx, ctx.ledger, "ReceiptRecorded", [null, epoch], ctx.fromBlock, toBlock);
  if (recorded.length === 0) return [];
  // receipts are numbered from 1 without a gap, and an epoch's are consecutive: the one before the
  // epoch's first must be in the log too, or the log does not reach back to the epoch's start
  const ids = recorded.map((ev) => BigInt(ev.args.id)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const gap = `the ledger's log from block ${ctx.fromBlock} to ${toBlock}`;
  if (ids[ids.length - 1] - ids[0] + 1n !== BigInt(ids.length)) throw new HistoryIncomplete(`${gap} shows receipts ${ids[0]} to ${ids[ids.length - 1]} of epoch ${epoch} with a gap: the endpoint served an incomplete log`);
  if (ids[0] > 1n && (await g.logs(ctx, ctx.ledger, "ReceiptRecorded", [ids[0] - 1n], ctx.fromBlock, toBlock)).length === 0) {
    throw new HistoryIncomplete(`${gap} starts in the middle of the history: receipt ${ids[0]} is the first it shows of epoch ${epoch}, and receipt ${ids[0] - 1n} is not in it. The log was read from too late a block (ledgerDeployBlock or deployBlock), or the endpoint served an incomplete log`);
  }
  const first = Math.min(...recorded.map((ev) => ev.blockNumber));
  const last = Math.max(...recorded.map((ev) => ev.blockNumber));
  const statuses = new Map();
  for (const ev of await g.logs(ctx, ctx.ledger, "ReceiptStatus", [], first, last)) {
    if (statuses.has(ev.args.id)) throw new Error(`receipt ${ev.args.id}: more than one status record`);
    statuses.set(ev.args.id, v2.plainStatus(ev.args.status));
  }
  const out = recorded.map((ev) => {
    const status = statuses.get(ev.args.id);
    if (!status) throw new Error(`receipt ${ev.args.id}: no status record in blocks ${first}-${last}`);
    return {
      id: ev.args.id, blockNumber: ev.blockNumber, index: ev.index, txHash: ev.transactionHash,
      origin: ev.args.origin, operator: Number(ev.args.operator), receipt: v2.plainReceipt(ev.args.receipt), status,
    };
  });
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/// Replay an epoch's receipts with the statuses and the operators given: the digest, the totals,
/// what each worker and each operator has, and the audit subject.
function replay(epoch, items) {
  let digest = NONE;
  const totals = { measured: [0n, 0n], subsidized: [0n, 0n] };
  const workers = new Map(); const operators = new Map();
  for (const it of items) {
    const { receipt: r, status: st } = it;
    digest = v2.digestStep(digest, it.id, r, st, it.operator);
    totals.measured[r.pool] += st.gmuMeasured;
    totals.subsidized[r.pool] += st.gmuSubsidized;
    const w = workers.get(r.worker) ?? { operator: it.operator, measured: [0n, 0n], subsidized: [0n, 0n], receipts: 0 };
    w.measured[r.pool] += st.gmuMeasured;
    w.subsidized[r.pool] += st.gmuSubsidized;
    w.receipts += 1;
    workers.set(r.worker, w);
    const o = operators.get(it.operator) ?? { subsidized: [0n, 0n] };
    o.subsidized[r.pool] += st.gmuSubsidized;
    operators.set(it.operator, o);
  }
  const receiptCount = BigInt(items.length);
  return { epoch: BigInt(epoch), digest, receiptCount, totals, workers, operators, subject: v2.auditSubject(epoch, digest, receiptCount, totals) };
}

/// What the audit job of `epoch` commits to on a v2 ledger: the epoch before replayed from its log,
/// or - for epoch 0 - the deployment's configuration. Throws AuditMismatch when the recomputation
/// and the ledger disagree.
async function auditSubjectFor(ctx, epoch, pin = null) {
  epoch = BigInt(epoch);
  pin = pin ?? ctx.pin ?? await g.pinBlock(ctx.provider, ctx.tag);
  if (epoch === 0n) {
    const mine = v2.configHash(ctx.domain, await ctx.policy.getAddress(), ctx.seedSource, ctx.genesisTime, ctx.epochDuration);
    const theirs = await g.stateRead(pin, "the ledger's configuration hash", () => ctx.ledger.configHash(g.at(pin)));
    if (mine !== theirs) throw new g.AuditMismatch(`configuration: recomputed ${mine}, ledger ${theirs}`);
    return { audited: null, subject: mine, receipts: 0 };
  }
  const toBlock = g.requireEndedAt(ctx, epoch - 1n, pin);
  const items = await readEpochReceipts(ctx, epoch - 1n, toBlock);
  const done = replay(epoch - 1n, items);
  const theirs = await g.stateRead(pin, `the audit subject of epoch ${epoch - 1n}`, () => ctx.ledger.auditSubject(epoch - 1n, g.at(pin)));
  if (done.subject !== theirs) throw new g.AuditMismatch(`epoch ${epoch - 1n}: recomputed subject ${done.subject}, ledger ${theirs}`);
  return { audited: epoch - 1n, subject: done.subject, receipts: items.length };
}

// ---------------------------------------------------------------- permits given to the audit

/// The permits given to an audit, by the digest each has on this ledger. They serve the receipts
/// whose transaction does not show its permit: a deployment publishes them for those. Two forms are
/// read, under two rules:
///
///  - a bare message - the permit's eight fields, alone or under `message`, with an optional
///    `signature` - is read, by agreement, as a permit for this chain and this ledger, in the
///    shorthand the signing script accepts (operation names for the scope, guard fields left out
///    for an account without code);
///  - a full record is anything that carries a mark of one: `schema`, `kind`, `typedData`, or at
///    its top level `domain`, `types` or `primaryType`. It is read as what it says and nothing is
///    filled in, converted or dropped for it, and it never falls back to the bare reading: a
///    signing record without its typed data, or typed data without a part, is unusable. Its
///    typed data has all four parts: a primary type that is Permit; types that define Permit and
///    EIP712Domain as the frozen types and nothing else, each field a name and a type in the
///    frozen order; a domain with the four frozen fields and no other; a message with the eight
///    fields and no other, each a value of its declared type. Its stated digest, where it has
///    one, is the digest of that typed data. A record that fails any of this is unusable,
///    whatever a repaired version of it would have been. A record that passes and whose domain
///    is another chain or another ledger is foreign. Neither is read in this domain instead.
///
/// Foreign and unusable records are listed and used for nothing.
const RECORD_SCHEMA = "finchain-pouw.signed-statement/1";
const DOMAIN_FIELDS = ["name", "version", "chainId", "verifyingContract"];
// what makes a given item a full record, which is then never read as a bare message
const FULL_RECORD_MARKS = ["schema", "kind", "typedData", "domain", "types", "primaryType"];

/// Whether a list of typed-data fields is `frozen` as a type: the same fields, each a name and a type
/// and nothing else, in the same order. The order of the members inside a field is no part of a type.
function sameFields(given, frozen) {
  if (!Array.isArray(given) || given.length !== frozen.length) return false;
  return given.every((f, i) => f !== null && typeof f === "object" && !Array.isArray(f)
    && Object.keys(f).length === 2 && f.name === frozen[i].name && f.type === frozen[i].type);
}

/// A typed-data value of `type` as it is, or the reason it is not one: addresses as address strings,
/// unsigned integers as whole numbers (a number, a bigint, a decimal or 0x string) within the width.
function typedValueFault(value, type) {
  if (type === "address") return typeof value === "string" && ethers.isAddress(value) ? null : `${JSON.stringify(value)} is not an address`;
  const m = /^uint(\d+)$/.exec(type);
  if (m) {
    let v;
    if (typeof value === "bigint") v = value;
    else if (typeof value === "number" && Number.isInteger(value)) v = BigInt(value);
    else if (typeof value === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(value)) v = BigInt(value);
    else return `${JSON.stringify(value)} is not a whole number for ${type}`;
    return v >= 0n && v < (1n << BigInt(m[1])) ? null : `${value} does not fit ${type}`;
  }
  if (type === "string") return typeof value === "string" ? null : `${JSON.stringify(value)} is not a string`;
  return `type ${type} is not one this reader knows`;
}

/// The structural check of a full typed-data record. Returns the record's own digest, computed from
/// its own domain and message as given, or throws with the first fault found.
function ownDigestOfTyped(typed) {
  const fail = (why) => { throw new Error(why); };
  if (typed === null || typeof typed !== "object" || Array.isArray(typed)) fail("its typed data is not an object");
  if (typed.primaryType === undefined) fail("no primary type: a full record names it");
  if (typed.primaryType !== "Permit") fail(`primary type ${typed.primaryType} is not Permit`);
  const types = typed.types;
  if (types === undefined || types === null || typeof types !== "object") fail("no types: a full record defines its types");
  if (types.Permit === undefined) fail("its types do not define Permit");
  if (!sameFields(types.Permit, permitLib.TYPES.Permit)) fail("its Permit type is not the frozen one");
  if (types.EIP712Domain === undefined) fail("its types do not define EIP712Domain: a full record defines its domain type");
  if (!sameFields(types.EIP712Domain, permitLib.DOMAIN_TYPE)) fail("its domain type is not the frozen one");
  const extraTypes = Object.keys(types).filter((k) => k !== "Permit" && k !== "EIP712Domain");
  if (extraTypes.length > 0) fail(`its types define ${extraTypes.join(", ")}, which Permit does not use`);
  const d = typed.domain;
  if (d === undefined || typeof d !== "object") fail("no domain");
  const extraDomain = Object.keys(d).filter((k) => !DOMAIN_FIELDS.includes(k));
  if (extraDomain.length > 0) fail(`its domain has ${extraDomain.join(", ")}, which the frozen domain does not`);
  for (const f of permitLib.DOMAIN_TYPE) {
    if (d[f.name] === undefined) fail(`its domain lacks ${f.name}`);
    const why = typedValueFault(d[f.name], f.type); if (why) fail(`domain ${f.name}: ${why}`);
  }
  const msg = typed.message;
  if (msg === undefined || typeof msg !== "object") fail("no message");
  const extraMessage = Object.keys(msg).filter((k) => !permitLib.TYPES.Permit.some((f) => f.name === k));
  if (extraMessage.length > 0) fail(`its message has ${extraMessage.join(", ")}, which Permit does not`);
  for (const f of permitLib.TYPES.Permit) {
    if (msg[f.name] === undefined) fail(`its message lacks ${f.name}`);
    const why = typedValueFault(msg[f.name], f.type); if (why) fail(`message ${f.name}: ${why}`);
  }
  return ethers.TypedDataEncoder.hash(d, { Permit: permitLib.TYPES.Permit }, msg);
}

function permitIndex(ctx, permits = []) {
  const byDigest = new Map(); const foreign = []; const unusable = [];
  permits.forEach((given, index) => {
    const refuse = (why) => unusable.push({ index, why });
    const isObject = given !== null && typeof given === "object" && !Array.isArray(given);
    const full = isObject && FULL_RECORD_MARKS.some((k) => given[k] !== undefined);
    if (given?.schema !== undefined && given.schema !== RECORD_SCHEMA) return refuse(`schema ${given.schema} is not ${RECORD_SCHEMA}`);
    if (given?.kind !== undefined && given.kind !== "Permit") return refuse(`a ${given.kind}, not a Permit`);
    // a full record is read whole or not at all: its typed data is under `typedData`, or it is itself
    // typed data; a record that carries a mark of one and neither is not read as a bare message
    let typed = null;
    if (full) {
      if (given.typedData !== undefined) typed = given.typedData;
      else if (given.domain !== undefined || given.types !== undefined || given.primaryType !== undefined) typed = given;
      else return refuse(`it carries ${FULL_RECORD_MARKS.filter((k) => given[k] !== undefined).join(" and ")} but no typed data: a signing record is read with its typed data, never as a bare message`);
    }
    const stated = given?.digest !== undefined ? String(given.digest).toLowerCase() : null;
    let message = typed ? typed.message : given?.message ?? given;
    let own = null;
    if (typed) {
      // read as it is: structure first, then its own digest, then where it belongs
      try { own = ownDigestOfTyped(typed); } catch (e) { return refuse(e.message); }
      if (stated !== null && stated !== own) return refuse(`its stated digest ${stated} is not the digest of its own typed data ${own}`);
    }
    let st;
    try { st = permitLib.statement("Permit", ctx.chainId, ctx.address, message ?? {}); } catch (e) { return refuse(e.message); }
    const digest = permitLib.digestOf(st);
    if (typed) {
      if (own !== digest) {
        const d = typed.domain;
        foreign.push({ index, domain: { name: d.name, version: d.version, chainId: String(d.chainId), verifyingContract: d.verifyingContract }, digest: own }); return;
      }
    } else if (stated !== null && stated !== digest) {
      foreign.push({ index, statedDigest: stated, digestHere: digest }); return;
    }
    if (!byDigest.has(digest)) byDigest.set(digest, { digest, statement: st, message: st.message, signature: null, usedBy: [] });
    if (given?.signature) byDigest.get(digest).signature = given.signature;
  });
  return { byDigest, foreign, unusable };
}

// ---------------------------------------------------------------- the audit

/// Recompute an ended epoch of a v2 ledger from primary data and compare every figure with the
/// ledger. Everything is read at one block: `pin`, the connection's, or the block at the
/// connection's tag taken now. Returns a report: `findings` are the differences between the
/// recomputation and the ledger, `undecided` the receipts whose work this client could not read
/// again. `report.agrees` says there is no difference, `report.complete` that nothing was left
/// undecided, and `report.ok` is true only when both hold.
///   requireSealed - also report it as a difference when the epoch has no close record at that block
///   permits       - the permits the deployment has published (see permitIndex)
async function auditEpoch(ctx, epoch, { pin = null, requireSealed = false, permits = [] } = {}) {
  epoch = BigInt(epoch);
  pin = pin ?? ctx.pin ?? await g.pinBlock(ctx.provider, ctx.tag);
  const findings = [];
  const note = (what, expected, found) => findings.push({ what, recomputed: String(expected), ledger: String(found) });
  const undecided = [];
  const state = (what, call) => g.stateRead(pin, what, () => call(g.at(pin)));
  const codeAt = (address) => g.stateRead(pin, `the code of ${address}`, () => ctx.provider.getCode(address, pin.number));

  const toBlock = g.requireEndedAt(ctx, epoch, pin);
  if ((await state("the ledger's domain", (o) => ctx.ledger.domain(o))) !== ctx.domain) note("ledger domain at the block", ctx.domain, "another");
  const summary = await state(`the summary of epoch ${epoch}`, (o) => ctx.ledger.epochSummary(epoch, o));
  const pol = await policyAt(ctx, epoch, toBlock);
  const items = await readEpochReceipts(ctx, epoch, toBlock);
  const known = permitIndex(ctx, permits);

  // the seed as captured, and the subject the epoch's audit jobs had to commit to
  const opened = await g.logs(ctx, ctx.ledger, "EpochOpened", [epoch], ctx.fromBlock, toBlock);
  let seed = NONE;
  if (opened.length > 0) {
    seed = v2.epochSeed(ctx.domain, epoch, opened[0].args.seedMaterial);
    if (seed !== opened[0].args.seed) note("seed", seed, opened[0].args.seed);
  }
  if (seed !== summary.seed) note("seed (stored)", seed, summary.seed);
  const g0Subject = items.some((it) => it.receipt.pool === POOL_G0) ? (await auditSubjectFor(ctx, epoch, pin)).subject : null;
  if (items.length === 0 && summary.receiptCount > 0n) {
    throw new HistoryIncomplete(`the ledger's log from block ${ctx.fromBlock} to ${toBlock} shows no receipt of epoch ${epoch}, and the ledger counts ${summary.receiptCount}: the log was read from too late a block (ledgerDeployBlock or deployBlock), or the endpoint served an incomplete log`);
  }

  // what the ledger's own log says beyond the receipts: the content keys taken, the permits ended,
  // the minimum nonces raised, the facts recorded. Ledger-wide, in the chain's order.
  const all = (name) => g.logs(ctx, ctx.ledger, name, [], ctx.fromBlock, toBlock);
  const keyTaker = new Map();
  for (const ev of await all("ContentKeyTaken")) {
    if (keyTaker.has(ev.args.contentKey)) note(`content key ${ev.args.contentKey}`, "taken once", `taken again by receipt ${ev.args.receiptId}`);
    else keyTaker.set(ev.args.contentKey, BigInt(ev.args.receiptId));
  }
  // The keys as the audit has them. Before the epoch's first receipt: what the log says was taken,
  // which is for the audits of the earlier epochs to hold. From then on: what the epoch's own
  // receipts take, in their order - compared with the log and with the ledger's store at the end.
  const epochIds = new Set(items.map((it) => it.id));
  const occupied = new Map();
  for (const [contentKey, id] of keyTaker) if (items.length > 0 && id < items[0].id) occupied.set(contentKey, id);
  const ended = await all("PermitEnded");
  const raised = await all("MinNonceRaised");
  const factIds = new Set((await all("FactRecorded")).map((ev) => ev.args.factId));
  const factCount = await state("the number of facts", (o) => ctx.ledger.factCount(o));
  if (BigInt(factIds.size) !== factCount) note("facts recorded", factIds.size, factCount);

  // the modules of the epoch's G1 profiles: a tender adapter is read again, anything else is not
  const modules = new Map();
  const moduleOf = async (p) => {
    if (modules.has(p.module)) return modules.get(p.module);
    const adapter = new ethers.Contract(p.module, v2.abi.adapter, ctx.provider);
    let info = { readable: false };
    try {
      const reportsTo = await state(`the ledger of the module ${p.module}`, (o) => adapter.ledger(o));
      const source = await state(`the tender contract of the module ${p.module}`, (o) => adapter.taskToken(o));
      const key = await state(`the profile of the module ${p.module}`, (o) => adapter.profileKey(o));
      if (reportsTo !== ctx.address) note(`module ${p.module}: ledger`, ctx.address, reportsTo);
      if (key !== p.key) note(`module ${p.module}: profile`, p.key, key);
      // A confirmation of a submission that has its receipt already is answered with that receipt
      // and leaves a record of its own. The record of the confirmation that made the receipt is the
      // first one after the receipt's own record, in the receipt's transaction.
      const confirmed = new Map();
      for (const ev of await g.logs(ctx, adapter, "TenderConfirmed", [], ctx.fromBlock, toBlock)) {
        const k = `${ev.transactionHash}:${ev.args.receiptId}`;
        confirmed.set(k, [...(confirmed.get(k) ?? []), ev]);
      }
      const confirmationOf = (it) => (confirmed.get(`${it.txHash}:${it.id}`) ?? []).filter((ev) => ev.index > it.index)
        .sort((a, b) => a.index - b.index)[0]?.args;
      info = { readable: true, source, confirmationOf, tender: new ethers.Contract(source, g.abi.taskTender, ctx.provider) };
    } catch (e) {
      if (e instanceof g.StateUnavailable) throw e;
      if (!g.isContractAnswer(e)) throw e;
    }
    modules.set(p.module, info);
    return info;
  };
  const histories = new Map();
  const historyOf = async (tender, source, tokenId) => {
    const k = `${source}:${tokenId}`;
    if (!histories.has(k)) histories.set(k, await g.tenderHistory(ctx, tender, tokenId, toBlock));
    return histories.get(k);
  };
  const functionIds = new Map();
  const functionIdOf = async (module) => {
    if (!functionIds.has(module)) {
      const fn = new ethers.Contract(module, g.abi.audit, ctx.provider);
      functionIds.set(module, await state(`the function id of ${module}`, (o) => fn.functionId(o)));
    }
    return functionIds.get(module);
  };
  // The transaction of a receipt. Its sender is the origin the ledger recorded. When it is sent to
  // the ledger or to the receipt's module, its top-level call is the entry that recorded the
  // receipt - the ledger's two G0 entries, the adapter's two confirmations - and nothing else can
  // have: then its sender is the recorded sender, and its input is held to the receipt in full. When
  // it is sent to another contract, the entry was reached through that contract: its sender is the
  // origin, and no more is read from it.
  const adapterInterface = new ethers.Interface(v2.abi.adapter);
  const transactions = new Map();
  const transactionOf = async (it, module, moduleReadable) => {
    if (transactions.has(it.txHash)) return transactions.get(it.txHash);
    let found = null;
    const tx = await ctx.provider.getTransaction(it.txHash);
    if (tx && tx.blockNumber === it.blockNumber) {
      const target = tx.to === ctx.address ? "ledger" : tx.to === module ? "module" : null;
      const kind = !target ? TRANSACTION.THROUGH_A_CONTRACT : target === "module" && !moduleReadable ? TRANSACTION.TO_A_MODULE_NOT_READ : TRANSACTION.ENTRY;
      found = { from: tx.from, to: tx.to, target, kind, entry: null, args: null, permit: null, invalid: null };
      if (kind === TRANSACTION.ENTRY) {
        let call = null;
        try { call = (target === "ledger" ? ctx.ledger.interface : adapterInterface).parseTransaction({ data: tx.data }); } catch { call = null; }
        const entries = target === "ledger" ? ["submitG0", "submitG0For"] : ["confirm", "confirmFor"];
        if (!call || !entries.includes(call.name)) found.invalid = `its input is not a call of ${entries.join(" or ")}${call ? ` (${call.name})` : ""}`;
        else {
          found.entry = call.name;
          const a = call.args;
          found.args = call.name.startsWith("submitG0")
            ? (call.name === "submitG0" ? { profileKey: a[0], epoch: BigInt(a[1]), jobIndex: Number(a[2]), outputHash: a[3] } : { profileKey: a[2], epoch: BigInt(a[3]), jobIndex: Number(a[4]), outputHash: a[5] })
            : (call.name === "confirm" ? { tokenId: BigInt(a[0]), submissionId: BigInt(a[1]) } : { tokenId: BigInt(a[2]), submissionId: BigInt(a[3]) });
          if (call.name.endsWith("For")) {
            try {
              const statement = permitLib.statement("Permit", ctx.chainId, ctx.address, a[0].toObject());
              found.permit = { digest: permitLib.digestOf(statement), statement, message: statement.message, signature: a[1] };
            } catch (e) { found.invalid = `the permit in its input is not one of this ledger's version: ${e.message}`; }
          }
        }
      }
    }
    transactions.set(it.txHash, found);
    return found;
  };
  const hasCode = new Map();
  const isContract = async (address) => {
    if (!hasCode.has(address)) hasCode.set(address, (await codeAt(address)) !== "0x");
    return hasCode.get(address);
  };

  // re-decide every receipt in order
  const observations = [];
  const accrued = new Map(); const demanderCount = new Map(); const pairCount = new Map();
  const redecided = [];
  for (const it of items) {
    const { receipt: r, status: recorded } = it;
    const p = pol.profileById.get(r.profileId);
    const st = { verdict: 0, ineligible: I.NONE, relation: RELATION.NONE_FOUND, gmuMeasured: 0n, gmuSubsidized: 0n, duplicateOf: 0n };
    const what = (field) => `receipt ${it.id}: ${field}`;
    if (r.epoch !== epoch) note(what("epoch"), epoch, r.epoch);
    if (!p) {
      note(what("profile"), "a profile in force for the epoch", r.profileId);
      redecided.push({ ...it, facts: FACTS_EVIDENCE.NOT_READABLE });
      continue;
    }
    const subsidy = () => {
      const k = `${p.key}:${r.worker}`; const used = accrued.get(k) ?? 0n;
      if (used >= p.maxGmuPerWorkerPerEpoch) return [0n, I.WORKER_CAP];
      const room = p.maxGmuPerWorkerPerEpoch - used; const gmu = p.baseGmu < room ? p.baseGmu : room;
      accrued.set(k, used + gmu); return [gmu, I.NONE];
    };
    // what the recorded status adds to the counters when the audit cannot decide the receipt itself
    const followRecorded = () => {
      if (recorded.gmuSubsidized === 0n) return;
      const k = `${p.key}:${r.worker}`; accrued.set(k, (accrued.get(k) ?? 0n) + recorded.gmuSubsidized);
      if (r.pool === POOL_G1) {
        demanderCount.set(r.counterparty, (demanderCount.get(r.counterparty) ?? 0n) + 1n);
        const pk = `${r.counterparty}:${r.worker}`; pairCount.set(pk, (pairCount.get(pk) ?? 0n) + 1n);
      }
    };
    if (p.pool !== r.pool) note(what("pool"), p.pool, r.pool);
    if (r.role !== p.role) note(what("role"), p.role, r.role);
    if (recorded.verifier !== p.module) note(what("verifier"), p.module, recorded.verifier);

    // the operator the worker is attributed to: the policy's log, against the receipt's record
    const operator = pol.operatorOf(r.worker);
    if (it.operator !== operator) note(what("operator"), operator, it.operator);

    // how the receipt entered: by the participant itself, or by a delegate under a permit
    const participant = r.pool === POOL_G0 ? r.worker : r.counterparty;
    const operation = r.pool === POOL_G0 ? permitLib.OP.SUBMIT_G0 : permitLib.OP.CONFIRM_TENDER;
    const entry = { kind: r.authorization === NONE ? ENTRY.DIRECT : ENTRY.DELEGATED, participant, sender: r.sender, origin: it.origin, authorization: r.authorization };
    let decided = true; // whether the audit re-decided the status itself
    let g0JobIndex = -1;

    if (r.pool === POOL_G0) {
      const functionId = await functionIdOf(p.module);
      if (r.counterparty !== ZERO) note(what("counterparty"), ZERO, r.counterparty);
      if (r.unit !== UNIT.NONE || r.contentKey !== NONE || r.parent !== NONE || r.envelopeHash !== NONE) note(what("task fields"), "none on a G0 receipt", "some");
      let jobIndex = -1;
      for (let j = 0; j < p.jobsPerEpoch; j++) if (v2.g0Instance(seed, functionId, j, r.worker) === r.workId) jobIndex = j;
      if (jobIndex < 0) note(what("instance"), "an instance of this epoch's seed for the worker", r.workId);
      g0JobIndex = jobIndex;
      if (r.contributionId !== v2.g0ContributionId(ctx.domain, functionId, epoch, Math.max(jobIndex, 0), r.worker)) note(what("contributionId"), "the instance's", r.contributionId);
      let accepted;
      if (functionId !== g.AUDIT_V1_FUNCTION_ID) {
        // the input and the expected output are the function's own, and this client carries one
        // function: the verdict is taken as recorded, and what follows from it is re-decided
        undecided.push({ receiptId: it.id, what: "verdict", why: `the function ${functionId} is not one this client evaluates`, module: p.module });
        accepted = recorded.verdict === VERDICT.ACCEPTED;
        if (!accepted && recorded.verdict !== VERDICT.REJECTED) note(what("verdict"), "accepted or rejected", recorded.verdict);
        it.facts = FACTS_EVIDENCE.NOT_EVALUATED;
      } else {
        const inputHash = g.auditInputHash(epoch, g0Subject);
        if (inputHash !== r.inputHash) note(what("inputHash"), inputHash, r.inputHash);
        accepted = jobIndex === 0 && r.outputHash === g.auditOutput(r.workId, inputHash);
        it.facts = FACTS_EVIDENCE.DERIVED;
      }
      // one reason, the first that applies: rejected, not admitted, operator not declared, worker cap
      if (accepted) {
        st.verdict = VERDICT.ACCEPTED; st.gmuMeasured = p.baseGmu;
        if (!pol.isAdmitted(r.worker)) st.ineligible = I.NOT_ADMITTED;
        else if (operator === 0) st.ineligible = I.OPERATOR_NOT_DECLARED;
        else [st.gmuSubsidized, st.ineligible] = subsidy();
      } else {
        st.verdict = VERDICT.REJECTED; st.ineligible = I.REJECTED;
      }
    } else {
      // The unit and the content key are the module's statement. Under a profile that counts task
      // units the ledger's two first rules follow from that statement and from the log alone, so
      // they are held for every receipt, whatever its module.
      let unitReason = I.NONE;
      if (p.countsUnits) {
        if (r.unit === UNIT.NONE || r.unit > UNIT.WRONG_ISSUER) note(what("unit"), "a unit, under a profile that counts them", r.unit);
        if (r.unit !== UNIT.WHOLE) unitReason = I.NOT_A_TASK_UNIT;
        else {
          const taker = occupied.get(r.contentKey);
          if (r.contentKey === NONE) note(what("contentKey"), "a key, for a whole unit", NONE);
          if (taker !== undefined) { unitReason = I.DUPLICATE_CONTRIBUTION; st.duplicateOf = taker; }
          else occupied.set(r.contentKey, it.id); // the first whole unit of a key takes it, subsidized or not
        }
      } else if (r.unit !== UNIT.NONE || r.contentKey !== NONE) {
        note(what("unit"), "no unit and no key, under a profile that does not count them", `${r.unit}, ${r.contentKey}`);
      }

      const m = await moduleOf(p);
      it.moduleReadable = m.readable;
      const c = m.readable ? m.confirmationOf(it) : undefined;
      if (!c) {
        undecided.push({ receiptId: it.id, what: "facts", module: p.module,
          why: m.readable ? "the module has no confirmation record for this receipt in the receipt's transaction" : "the module is not one this client reads" });
        decided = false; it.facts = FACTS_EVIDENCE.NOT_READABLE;
        // the two rules that need no facts are still the ledger's to have applied
        if (unitReason !== I.NONE) {
          if (recorded.ineligible !== unitReason) note(what("ineligible"), unitReason, recorded.ineligible);
          if (recorded.gmuMeasured !== 0n || recorded.gmuSubsidized !== 0n) note(what("GMU"), 0, `${recorded.gmuMeasured}, ${recorded.gmuSubsidized}`);
          if (recorded.duplicateOf !== st.duplicateOf) note(what("duplicateOf"), st.duplicateOf, recorded.duplicateOf);
        } else {
          if (recorded.ineligible === I.NOT_A_TASK_UNIT || recorded.ineligible === I.DUPLICATE_CONTRIBUTION) note(what("ineligible"), "neither of the two unit reasons", recorded.ineligible);
          if (recorded.gmuMeasured !== p.baseGmu) note(what("gmuMeasured"), p.baseGmu, recorded.gmuMeasured);
          if (recorded.duplicateOf !== 0n) note(what("duplicateOf"), 0, recorded.duplicateOf);
        }
      } else {
        const tokenId = c.tokenId; const submissionId = c.submissionId; const source = m.source; const tender = m.tender;
        const hist = await historyOf(tender, source, tokenId);
        const owner = g.lastBefore(hist.owners, it)?.args.to ?? ZERO;
        const judge = g.lastBefore(hist.judges, it)?.args.newAuthority ?? ZERO;
        const binding = g.lastBefore(hist.bindings, it);
        const settled = hist.settled.find((ev) => ev.args.submissionId === submissionId && g.before(ev, it));
        const byDefault = hist.defaults.some((ev) => ev.args.submissionId === submissionId && g.before(ev, it));
        const sub = await state(`submission ${submissionId} of tender ${tokenId}`, (o) => tender.submissionOf(tokenId, submissionId, o));
        const terms = await state(`the terms of tender ${tokenId}`, (o) => tender.tenderTermsOf(tokenId, o));
        if (!settled) note(what("settlement"), "a FulfillmentAccepted record of the tender before the receipt", "none");
        if (Number(sub.status) !== 1) note(what("tender status"), "Accepted", sub.status);
        if (r.workId !== v2.g1WorkId(ctx.chainId, source, tokenId, submissionId)) note(what("workId"), v2.g1WorkId(ctx.chainId, source, tokenId, submissionId), r.workId);
        if (r.contributionId !== v2.g1ContributionId(ctx.domain, source, tokenId, submissionId)) note(what("contributionId"), "the submission's", r.contributionId);
        if (r.worker !== sub.fulfiller) note(what("worker"), sub.fulfiller, r.worker);
        if (r.counterparty !== owner) note(what("demander"), owner, r.counterparty);
        if (r.outputHash !== sub.resultHash) note(what("outputHash"), sub.resultHash, r.outputHash);
        const inputHash = binding && BigInt(binding.args.version) === BigInt(sub.taskVersion) ? binding.args.taskHash : NONE;
        if (r.inputHash !== inputHash) note(what("inputHash"), inputHash, r.inputHash);
        // the module's own record of the confirmation is the receipt's
        if (c.sender !== r.sender) note(what("sender, in the module's record"), r.sender, c.sender);
        if (c.authorization !== r.authorization) note(what("authorization, in the module's record"), r.authorization, c.authorization);
        if (Number(c.ineligible) !== recorded.ineligible) note(what("reason, in the module's record"), recorded.ineligible, c.ineligible);

        st.verdict = VERDICT.ACCEPTED;
        const demanderOperator = pol.operatorOf(owner);
        if (operator !== 0 && (operator === demanderOperator || operator === pol.operatorOf(judge))) st.relation = RELATION.DECLARED_RELATED;
        if (unitReason !== I.NONE) {
          st.ineligible = unitReason; // measures nothing; a duplicate names the receipt that counted
        } else {
          st.gmuMeasured = p.baseGmu;
          const q = pol.params; const dk = owner; const pk = `${owner}:${r.worker}`;
          if (r.worker === owner || r.worker === judge) st.ineligible = I.SELF_DEALING;
          else if (BigInt(sub.submittedAt) < ctx.genesisTime) st.ineligible = I.BEFORE_GENESIS;
          else if (!pol.isAdmitted(r.worker)) st.ineligible = I.NOT_ADMITTED;
          else if (!pol.isAdmitted(owner)) st.ineligible = I.DEMANDER_NOT_ADMITTED;
          else if (operator === 0) st.ineligible = I.OPERATOR_NOT_DECLARED;
          else if (demanderOperator === 0) st.ineligible = I.DEMANDER_OPERATOR_NOT_DECLARED;
          else if (st.relation === RELATION.DECLARED_RELATED && !q.subsidizeDeclaredRelated) st.ineligible = I.RELATION;
          else if (terms.asset !== ZERO) st.ineligible = I.ASSET;
          else if (BigInt(terms.rewardPerCompletion) < q.minBountyWei) st.ineligible = I.BOUNTY;
          else if ((demanderCount.get(dk) ?? 0n) >= q.maxSubsidizedPerDemander) st.ineligible = I.DEMANDER_CAP;
          else if ((pairCount.get(pk) ?? 0n) >= q.maxSubsidizedPerPair) st.ineligible = I.PAIR_CAP;
          else {
            [st.gmuSubsidized, st.ineligible] = subsidy();
            if (st.ineligible === I.NONE) { demanderCount.set(dk, (demanderCount.get(dk) ?? 0n) + 1n); pairCount.set(pk, (pairCount.get(pk) ?? 0n) + 1n); }
          }
        }

        // what the tender's log shows and the ledger's rules cannot read (docs/ledger-v2.md 10)
        const settlement = sub.machineSettled ? "verified" : byDefault ? "default" : "judged";
        const ownerAtSettlement = settled ? g.lastBefore(hist.owners, settled)?.args.to ?? null : null;
        const authority = g.authorityAtSettlement(hist, settled);
        const noted = [];
        if (authority.evidence === AUTHORITY_EVIDENCE.INSUFFICIENT) noted.push("authority-changed-in-the-acceptance-transaction");
        else if (authority.registered) {
          if (r.worker === authority.registered) noted.push("worker-judged-its-own-delivery");
          if (authority.registered !== judge) noted.push("judge-changed-between-settlement-and-bridge");
        }
        if (ownerAtSettlement && r.worker === ownerAtSettlement) noted.push("worker-owned-the-tender-when-it-settled");
        if (ownerAtSettlement && ownerAtSettlement !== owner) noted.push("owner-changed-between-settlement-and-bridge");
        noted.sort((x, y) => g.OBSERVATION_ORDER.indexOf(x) - g.OBSERVATION_ORDER.indexOf(y));
        it.tender = {
          source, tokenId, submissionId, demander: owner, judge, asset: terms.asset, reward: BigInt(terms.rewardPerCompletion),
          settlement, ownerAtSettlement, authority, factRecorded: factIds.has(v2.factId(ctx.factDomain, source, tokenId, submissionId)),
        };
        if (noted.length > 0) observations.push({ receiptId: it.id, worker: r.worker, subsidized: st.gmuSubsidized > 0n, noted });
        it.facts = FACTS_EVIDENCE.DERIVED;
      }
    }

    // the transaction: its sender is the origin; when it is the entry's own call, the sender too,
    // and its input must be the one the receipt was recorded from
    const tx = await transactionOf(it, p.module, r.pool === POOL_G1 ? Boolean(it.moduleReadable) : true);
    if (!tx) note(what("transaction"), `the transaction ${it.txHash} in block ${it.blockNumber}`, "none served");
    else {
      if (tx.from !== it.origin) note(what("origin, in the transaction"), tx.from, it.origin);
      if (tx.kind === TRANSACTION.ENTRY) {
        if (tx.from !== r.sender) note(what("sender, in the transaction"), tx.from, r.sender);
        const wantTarget = r.pool === POOL_G0 ? "ledger" : "module";
        const wantEntry = r.pool === POOL_G0 ? (entry.kind === ENTRY.DIRECT ? "submitG0" : "submitG0For") : (entry.kind === ENTRY.DIRECT ? "confirm" : "confirmFor");
        if (tx.target !== wantTarget) note(what("entry, in the transaction"), `a call of the ${wantTarget}`, `a call of the ${tx.target}`);
        else if (tx.invalid) note(what("entry, in the transaction"), `a call of ${wantEntry}`, tx.invalid);
        else if (tx.entry !== wantEntry) note(what("entry, in the transaction"), wantEntry, tx.entry);
        else if (r.pool === POOL_G0) {
          if (tx.args.profileKey !== p.key) note(what("profile, in the transaction"), p.key, tx.args.profileKey);
          if (tx.args.epoch !== r.epoch) note(what("epoch, in the transaction"), r.epoch, tx.args.epoch);
          if (tx.args.jobIndex !== g0JobIndex) note(what("jobIndex, in the transaction"), g0JobIndex, tx.args.jobIndex);
          if (tx.args.outputHash !== r.outputHash) note(what("outputHash, in the transaction"), r.outputHash, tx.args.outputHash);
        } else if (it.tender) {
          if (tx.args.tokenId !== it.tender.tokenId) note(what("tokenId, in the transaction"), it.tender.tokenId, tx.args.tokenId);
          if (tx.args.submissionId !== it.tender.submissionId) note(what("submissionId, in the transaction"), it.tender.submissionId, tx.args.submissionId);
        }
      }
    }
    entry.transaction = tx ? tx.kind : null;

    // the entry: the participant itself, or a delegate under a permit
    if (entry.kind === ENTRY.DIRECT) {
      if (r.sender !== participant) note(what("sender of a direct entry"), participant, r.sender);
    } else {
      const position = it;
      const endedBefore = ended.find((ev) => ev.args.account === participant && ev.args.digest === r.authorization && g.before(ev, position));
      if (endedBefore) note(what("permit"), "not ended before the receipt", `ended in block ${endedBefore.blockNumber}`);
      const minimum = BigInt(g.lastBefore(raised.filter((ev) => ev.args.account === participant), position)?.args.minNonce ?? 0n);
      const binding = pol.guardOf(participant);
      entry.accountHasCodeAtBlock = await isContract(participant);
      entry.guard = binding && binding.guard !== ZERO ? { guard: binding.guard, version: binding.version, fromEpoch: binding.fromEpoch } : null;
      const inTransaction = tx?.permit ?? null;
      // the ledger made the receipt's digest from the permit its entry was called with
      if (inTransaction && inTransaction.digest !== r.authorization) note(what("authorization"), `${inTransaction.digest}, of the permit in the transaction`, r.authorization);
      // the entry's own call, with no permit of this version in it: the ledger could not have recorded
      // the receipt from it, and that is a finding above; nothing given to the run stands in for it
      const entryCall = tx?.kind === TRANSACTION.ENTRY;
      const supplied = inTransaction ?? (entryCall ? null : known.byDigest.get(r.authorization));
      if (!supplied) {
        entry.permit = { evidence: entryCall ? PERMIT_EVIDENCE.INVALID_IN_TRANSACTION : PERMIT_EVIDENCE.NOT_AVAILABLE };
      } else {
        const m = supplied.message;
        if (!inTransaction) supplied.usedBy.push(it.id);
        const namesGuard = m.guard !== ZERO || m.guardBindingVersion !== 0n;
        entry.permit = {
          evidence: inTransaction ? PERMIT_EVIDENCE.IN_TRANSACTION : PERMIT_EVIDENCE.SUPPLIED, account: m.account, delegate: m.delegate, scope: m.scope, notBeforeEpoch: m.notBeforeEpoch,
          notAfterEpoch: m.notAfterEpoch, nonce: m.nonce, guard: m.guard, guardBindingVersion: m.guardBindingVersion,
          accountAtUse: namesGuard ? ACCOUNT_AT_USE.CONTRACT : ACCOUNT_AT_USE.NO_CODE,
        };
        // the ledger checked each of these when it recorded the receipt: a permit that fails one
        // here is a permit the ledger would have refused
        if (m.account !== participant) note(what("permit: account"), participant, m.account);
        if (m.delegate !== r.sender) note(what("permit: delegate"), r.sender, m.delegate);
        if ((m.scope & BigInt(operation)) === 0n) note(what("permit: scope"), `includes operation ${operation}`, m.scope);
        if (epoch < m.notBeforeEpoch || epoch > m.notAfterEpoch) note(what("permit: epochs"), `includes epoch ${epoch}`, `${m.notBeforeEpoch} to ${m.notAfterEpoch}`);
        if (m.nonce < minimum) note(what("permit: nonce"), `at least the minimum ${minimum}`, m.nonce);
        if (namesGuard) {
          // passed for an account with code only, and only with the binding in force
          if (!entry.guard) note(what("permit: guard"), "a guard bound for the epoch", `${m.guard}, binding ${m.guardBindingVersion}`);
          else if (m.guard !== entry.guard.guard || m.guardBindingVersion !== entry.guard.version) {
            note(what("permit: guard"), `${entry.guard.guard}, binding ${entry.guard.version}`, `${m.guard}, binding ${m.guardBindingVersion}`);
          }
          entry.signature = supplied.signature === null ? SIGNATURE_EVIDENCE.NOT_SUPPLIED : SIGNATURE_EVIDENCE.CONTRACT;
        } else if (supplied.signature === null) {
          entry.signature = SIGNATURE_EVIDENCE.NOT_SUPPLIED;
        } else {
          // passed for an account without code only, whose signature is its own key's
          const signer = recoverAsTheLedger(supplied.digest, supplied.signature);
          if (signer === participant) entry.signature = SIGNATURE_EVIDENCE.VERIFIED;
          else { entry.signature = SIGNATURE_EVIDENCE.NOT_THE_ACCOUNTS; note(what("permit: signature"), `a signature of ${participant}`, signer ?? "not a signature"); }
        }
      }
    }
    it.entry = entry;

    if (decided) {
      for (const k of ["verdict", "ineligible", "relation", "gmuMeasured", "gmuSubsidized", "duplicateOf"]) {
        if (st[k] !== recorded[k]) note(what(k), st[k], recorded[k]);
      }
      redecided.push({ ...it, operator, status: { ...st, verifier: recorded.verifier } });
    } else {
      followRecorded();
      redecided.push({ ...it, operator });
    }
  }

  // the keys the epoch's receipts took, against the log's record and the ledger's store
  for (const [contentKey, id] of occupied) {
    if (!epochIds.has(id)) continue;
    const logged = keyTaker.get(contentKey);
    if (logged !== id) note(`receipt ${id}: content key taken`, `the key ${contentKey}, by this receipt`, logged === undefined ? "by none" : `by receipt ${logged}`);
    const stored = await state(`the receipt that took the key ${contentKey}`, (o) => ctx.ledger.contentKeyOwner(contentKey, o));
    if (stored !== id) note(`content key ${contentKey}, as stored`, `taken by receipt ${id}`, stored === 0n ? "taken by none" : `taken by receipt ${stored}`);
  }
  for (const [contentKey, id] of keyTaker) {
    if (epochIds.has(id) && occupied.get(contentKey) !== id) note(`receipt ${id}: content key taken`, "no key, or another", `the key ${contentKey}`);
  }

  // totals and the subject, from the re-decided receipts and the operators of the policy's log
  const done = replay(epoch, redecided);
  if (done.digest !== summary.digest) note("digest", done.digest, summary.digest);
  if (done.receiptCount !== summary.receiptCount) note("receiptCount", done.receiptCount, summary.receiptCount);
  const onchain = { measured: [summary.measuredG0, summary.measuredG1], subsidized: [summary.subsidizedG0, summary.subsidizedG1] };
  for (const pool of [POOL_G0, POOL_G1]) {
    if (done.totals.measured[pool] !== onchain.measured[pool]) note(`measured G${pool}`, done.totals.measured[pool], onchain.measured[pool]);
    if (done.totals.subsidized[pool] !== onchain.subsidized[pool]) note(`subsidized G${pool}`, done.totals.subsidized[pool], onchain.subsidized[pool]);
  }
  const subjectOnchain = await state(`the audit subject of epoch ${epoch}`, (o) => ctx.ledger.auditSubject(epoch, o));
  if (done.subject !== subjectOnchain) note("audit subject", done.subject, subjectOnchain);

  // the two caps: each operator's share of each pool, then each address's part of its operator's
  const { budget, pools } = g.poolBudgets(pol.params, epoch);
  if (budget !== summary.budget) note("budget", budget, summary.budget);
  if (pools[0] !== summary.budgetG0) note("budget G0", pools[0], summary.budgetG0);
  if (pools[1] !== summary.budgetG1) note("budget G1", pools[1], summary.budgetG1);
  if (Number(summary.paramsVersion) !== pol.paramsVersion) note("params version", pol.paramsVersion, summary.paramsVersion);
  const q = pol.params;
  const operators = new Map();
  for (const [operator, o] of done.operators) {
    const shares = [POOL_G0, POOL_G1].map((pool) => v2.operatorShare(pools[pool], o.subsidized[pool], done.totals.subsidized[pool], q.operatorCapBps));
    for (const pool of [POOL_G0, POOL_G1]) {
      const stored = await state(`the subsidized GMU of operator ${operator}`, (x) => ctx.ledger.subsidizedOfOperator(epoch, pool, operator, x));
      if (stored !== o.subsidized[pool]) note(`operator ${operator}: subsidized G${pool}`, o.subsidized[pool], stored);
      const theirs = await state(`the share of operator ${operator}`, (x) => ctx.ledger.operatorShare(epoch, pool, operator, x));
      if (theirs !== shares[pool]) note(`operator ${operator}: share of G${pool}`, shares[pool], theirs);
    }
    const cap = [POOL_G0, POOL_G1].map((pool) => (pools[pool] * q.operatorCapBps) / 10000n);
    operators.set(operator, {
      operator, addresses: [], subsidized: o.subsidized, share: shares, allocation: 0n, allocated: [0n, 0n],
      // whether the operator's cap, and not its GMU, set its share of a pool
      capped: [POOL_G0, POOL_G1].map((pool) => o.subsidized[pool] > 0n && (pools[pool] * o.subsidized[pool]) / done.totals.subsidized[pool] > cap[pool]),
    });
  }
  const table = []; let allocated = 0n;
  for (const [worker, w] of done.workers) {
    const o = done.operators.get(w.operator);
    const perPool = [POOL_G0, POOL_G1].map((pool) => v2.share(pools[pool], w.subsidized[pool], o.subsidized[pool], done.totals.subsidized[pool],
      q.operatorCapBps, q.workerCapBps));
    const mine = perPool[0] + perPool[1];
    const theirs = await state(`the allocation of ${worker}`, (x) => ctx.ledger.allocation(epoch, worker, x));
    if (mine !== theirs) note(`allocation of ${worker}`, mine, theirs);
    const [stored, storedOperator] = await state(`the operator of ${worker} in epoch ${epoch}`, (x) => ctx.ledger.operatorAt(epoch, worker, x));
    if (!stored || Number(storedOperator) !== w.operator) note(`operator of ${worker}, as stored`, w.operator, stored ? storedOperator : "none stored");
    allocated += mine;
    const row = operators.get(w.operator);
    row.addresses.push(worker); row.allocation += mine; row.allocated[0] += perPool[0]; row.allocated[1] += perPool[1];
    table.push({ worker, operator: w.operator, admitted: pol.isAdmitted(worker), receipts: w.receipts,
      measured: w.measured, subsidized: w.subsidized, allocation: mine, allocationG0: perPool[0], allocationG1: perPool[1] });
  }
  table.sort((a, b) => (a.worker.toLowerCase() < b.worker.toLowerCase() ? -1 : 1));
  if (allocated > budget) note("sum of allocations", `at most the budget ${budget}`, allocated);
  for (const o of operators.values()) {
    o.addresses.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
    for (const pool of [POOL_G0, POOL_G1]) {
      if (o.allocated[pool] > o.share[pool]) note(`operator ${o.operator}: allocations in G${pool}`, `at most its share ${o.share[pool]}`, o.allocated[pool]);
    }
  }

  // the close record, as in the kernel: it changes no figure, and when it is there its figures are
  // the recomputed ones and it was emitted at or after the epoch's end
  const seals = await g.logs(ctx, ctx.ledger, "EpochSealed", [epoch], ctx.fromBlock, toBlock);
  const closeRecord = { present: seals.length > 0, block: null, blockTimestamp: null, txHash: null, logIndex: null };
  if (seals.length > 1) note("close records", "at most one", seals.length);
  if (Boolean(summary.isSealed) !== closeRecord.present) note("sealed flag", closeRecord.present, summary.isSealed);
  if (closeRecord.present) {
    const ev = seals[0]; const a = ev.args;
    const sealBlock = await ctx.provider.getBlock(ev.blockNumber);
    Object.assign(closeRecord, { block: ev.blockNumber, blockTimestamp: BigInt(sealBlock.timestamp), txHash: ev.transactionHash, logIndex: ev.index });
    if (BigInt(sealBlock.timestamp) < g.epochEnd(ctx, epoch)) note("close record: time", `at or after the epoch's end ${g.epochEnd(ctx, epoch)}`, sealBlock.timestamp);
    const want = { digest: done.digest, receiptCount: done.receiptCount, paramsVersion: BigInt(pol.paramsVersion), budget,
      measuredG0: done.totals.measured[0], measuredG1: done.totals.measured[1], subsidizedG0: done.totals.subsidized[0], subsidizedG1: done.totals.subsidized[1] };
    for (const [k, v] of Object.entries(want)) if (a[k] !== v) note(`close record: ${k}`, v, a[k]);
  } else if (requireSealed) {
    note("close record", "an EpochSealed event at or before the block", "none");
  }

  // the guards behind the epoch's delegated entries: the code at the block is the code that was bound
  const guards = [];
  for (const account of new Set(redecided.filter((it) => it.entry?.guard).map((it) => it.entry.participant))) {
    const b = pol.guardOf(account);
    const codeHash = ethers.keccak256(await codeAt(b.guard));
    if (codeHash !== b.codeHash) note(`guard ${b.guard} of ${account}: code`, b.codeHash, codeHash);
    guards.push({ account, guard: b.guard, version: b.version, fromEpoch: b.fromEpoch, codeHash: b.codeHash, codeAtBlock: codeHash });
  }
  guards.sort((a, b) => (a.account.toLowerCase() < b.account.toLowerCase() ? -1 : 1));

  const count = (list, f) => list.reduce((acc, it) => { const k = f(it); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const g1 = redecided.filter((it) => it.receipt.pool === POOL_G1);
  const subsidizedG1 = g1.filter((it) => it.status.gmuSubsidized > 0n);
  const delegated = redecided.filter((it) => it.entry?.kind === ENTRY.DELEGATED);

  // the block is still the block it was: only then is anything reported
  await g.recheck(ctx.provider, pin);

  return {
    ok: findings.length === 0 && undecided.length === 0, agrees: findings.length === 0, complete: undecided.length === 0, findings, undecided,
    epoch, pin, settledBlock: toBlock, seed, paramsVersion: pol.paramsVersion, params: q,
    mode: q.subsidizeDeclaredRelated ? "controlled-self-test" : "standard",
    budget, pools, receipts: redecided, digest: done.digest, receiptCount: done.receiptCount, totals: done.totals,
    subject: done.subject, table, tableHash: g.tableHashOf(table), allocated, unallocated: budget - allocated,
    isSealed: closeRecord.present, closeRecord, observations,
    operators: [...operators.values()].sort((a, b) => a.operator - b.operator),
    undeclaredAddresses: table.filter((t) => t.operator === 0).length,
    entries: {
      direct: redecided.length - delegated.length, delegated: delegated.length,
      byTransaction: count(redecided.filter((it) => it.entry), (it) => it.entry.transaction ?? "not-served"),
      byPermitEvidence: count(delegated, (it) => it.entry.permit.evidence),
      bySignatureEvidence: count(delegated.filter((it) => it.entry.signature), (it) => it.entry.signature),
    },
    permits: {
      supplied: [...known.byDigest.values()].map((k) => ({ digest: k.digest, account: k.message.account, delegate: k.message.delegate,
        signature: k.signature !== null, usedBy: k.usedBy })),
      foreign: known.foreign, unusable: known.unusable,
    },
    guards,
    facts: { recorded: factIds.size, byEvidence: count(redecided, (it) => it.facts) },
    g1: {
      receipts: g1.length, subsidized: subsidizedG1.length,
      byRelation: count(g1, (it) => RELATION_NAME[it.status.relation]),
      bySettlement: count(g1.filter((it) => it.tender), (it) => it.tender.settlement),
      subsidizedByRelation: count(subsidizedG1, (it) => RELATION_NAME[it.status.relation]),
      subsidizedBySettlement: count(subsidizedG1.filter((it) => it.tender), (it) => it.tender.settlement),
      byAuthorityEvidence: count(g1.filter((it) => it.tender), (it) => it.tender.authority.evidence),
      withFactRecorded: g1.filter((it) => it.tender?.factRecorded).length,
    },
  };
}

module.exports = {
  ENTRY, PERMIT_EVIDENCE, SIGNATURE_EVIDENCE, ACCOUNT_AT_USE, FACTS_EVIDENCE, TRANSACTION, HistoryIncomplete, plainParams, plainProfile, connect, policyAt, readEpochReceipts, replay,
  auditSubjectFor, permitIndex, ownDigestOfTyped, typedValueFault, recoverAsTheLedger, auditEpoch,
};
