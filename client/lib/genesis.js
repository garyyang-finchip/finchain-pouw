// Genesis Mining client library: the arithmetic of the kernel, repeated off chain.
//
// Everything a worker or an auditor needs is derived here from the chain alone - the event log, a
// block header and a few view calls - with the same encodings the contracts use. Nothing in this
// file holds a key. It needs ethers v6 and nothing else, and speaks JSON-RPC only.
//
// How the chain is read. An audit, and a check of a deployment, read one block and nothing else:
// the block at `ctx.tag` (`finalized` on a public chain) is taken once - its number, its hash and
// its time - and from then on every log is read up to it and every view, every nested read and
// every piece of code is asked for at that block number. When the reads are done the block's hash
// is asked for again, and a different answer fails the run. The block's own time and the time at
// which it was observed are recorded apart. An epoch's figures can only be changed by transactions
// in blocks whose timestamp lies inside the epoch, so the one condition on the block is that its
// time is at or past the epoch's end.
//
// An endpoint that cannot serve state at that block makes the run fail, with that reason
// (StateUnavailable). There is no fallback to a later block. Up to release 0.1.3 state was read at
// the latest block, on the ground that only frozen values were read: that left a report unable to
// say at which block the `sealed` flag had been true, and is replaced.

"use strict";

const { ethers } = require("ethers");
const { sealed: withHashes } = require("./canonical");

const abi = {
  policy: require("../abi/GenesisPolicy.json"),
  ledger: require("../abi/GenesisLedger.json"),
  audit: require("../abi/AuditV1.json"),
  adapter: require("../abi/TenderAdapter8414.json"),
  taskTender: require("../abi/ITaskTender8414.json"),
};

const coder = ethers.AbiCoder.defaultAbiCoder();
const enc = (types, values) => ethers.keccak256(coder.encode(types, values));

const POOL_G0 = 0;
const POOL_G1 = 1;
const VERDICT = { ACCEPTED: 1, REJECTED: 2 };
const VERDICT_NAME = ["none", "accepted", "rejected"];
const RELATION = { NONE_FOUND: 0, DECLARED_RELATED: 1, ATTESTED_INDEPENDENT: 2 };
const RELATION_NAME = ["none-found", "declared-related", "attested-independent"];
const INELIGIBLE = {
  NONE: 0, REJECTED: 1, NOT_ADMITTED: 2, SELF_DEALING: 3, BEFORE_GENESIS: 4, RELATION: 5, ASSET: 6, BOUNTY: 7,
  DEMANDER_CAP: 8, PAIR_CAP: 9, WORKER_CAP: 10, DEMANDER_NOT_ADMITTED: 11,
};
const INELIGIBLE_NAME = ["eligible", "rejected", "worker-not-admitted", "self-dealing", "delivered-before-genesis",
  "declared-related-not-subsidized", "bounty-asset-not-native", "bounty-below-minimum", "demander-cap", "pair-cap",
  "worker-cap", "demander-not-admitted"];

const PROFILE_G0_REF = "g0.ref";
const PROFILE_G1_TENDER = "g1.tender";
const profileKey = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));
const AUDIT_V1_FUNCTION_ID = ethers.keccak256(ethers.toUtf8Bytes("finchain-pouw.g0.ref.audit-v1"));
const LEDGER_DOMAIN_TAG = "finchain-pouw.genesis-ledger.v1";
const MANIFEST_SCHEMA = "finchain-pouw.deployment/1";

// ---------------------------------------------------------------- encodings (as in the contracts)

const ledgerDomain = (chainId, ledger) => enc(["string", "uint256", "address"], [LEDGER_DOMAIN_TAG, chainId, ledger]);
const configHash = (domain, policy, seedSource, genesisTime, epochDuration) =>
  enc(["bytes32", "address", "address", "uint64", "uint64"], [domain, policy, seedSource, genesisTime, epochDuration]);
const epochSeed = (domain, epoch, material) => enc(["bytes32", "uint64", "bytes32"], [domain, epoch, material]);
const g0Instance = (seed, functionId, jobIndex, worker) =>
  enc(["bytes32", "bytes32", "uint32", "address"], [seed, functionId, jobIndex, worker]);
const g0ContributionId = (domain, functionId, epoch, jobIndex, worker) =>
  enc(["bytes32", "uint8", "bytes32", "uint64", "uint32", "address"], [domain, POOL_G0, functionId, epoch, jobIndex, worker]);
const g1ContributionId = (domain, source, tokenId, submissionId) =>
  enc(["bytes32", "uint8", "address", "uint256", "uint256"], [domain, POOL_G1, source, tokenId, submissionId]);
const g1Ref = (source, tokenId, submissionId) => enc(["address", "uint256", "uint256"], [source, tokenId, submissionId]);
const auditInputHash = (epoch, subject) => enc(["bytes32", "uint64", "bytes32"], [AUDIT_V1_FUNCTION_ID, epoch, subject]);
const auditOutput = (instance, inputHash) => enc(["bytes32", "bytes32"], [instance, inputHash]);
const digestStep = (digest, id, r, st) =>
  enc(["bytes32", "uint256", "bytes32", "address", "uint8", "uint8", "uint8", "uint8", "uint64", "uint64"],
    [digest, id, r.contributionId, r.worker, r.pool, st.verdict, st.ineligible, st.relation, st.gmuMeasured, st.gmuSubsidized]);
const auditSubject = (epoch, digest, receiptCount, totals) =>
  enc(["uint64", "bytes32", "uint64", "uint128", "uint128", "uint128", "uint128"],
    [epoch, digest, receiptCount, totals.measured[0], totals.measured[1], totals.subsidized[0], totals.subsidized[1]]);
const tableHashOf = (table) => enc(["address[]", "uint256[]"], [table.map((t) => t.worker), table.map((t) => t.allocation)]);

// ---------------------------------------------------------------- allocation (as in the ledger)

function budgetOf(params, epoch) {
  if (Number(params.halvingInterval) === 0) return params.budgetBase;
  const halvings = (BigInt(epoch) - BigInt(params.activeFromEpoch)) / BigInt(params.halvingInterval);
  return halvings >= 128n ? 0n : params.budgetBase >> halvings;
}

function poolBudgets(params, epoch) {
  const budget = budgetOf(params, epoch);
  const g0 = (budget * BigInt(params.splitG0Bps)) / 10000n;
  return { budget, pools: [g0, budget - g0] };
}

function share(poolBudget, contribution, total, capBps) {
  if (contribution === 0n || total === 0n) return 0n;
  const raw = (poolBudget * contribution) / total;
  const cap = (poolBudget * BigInt(capBps)) / 10000n;
  return raw > cap ? cap : raw;
}

// ---------------------------------------------------------------- plain values

function plainParams(p) {
  return {
    activeFromEpoch: BigInt(p.activeFromEpoch), budgetBase: BigInt(p.budgetBase), halvingInterval: BigInt(p.halvingInterval),
    splitG0Bps: BigInt(p.splitG0Bps), workerCapBps: BigInt(p.workerCapBps), minBountyWei: BigInt(p.minBountyWei),
    maxSubsidizedPerDemander: BigInt(p.maxSubsidizedPerDemander), maxSubsidizedPerPair: BigInt(p.maxSubsidizedPerPair),
    subsidizeDeclaredRelated: Boolean(p.subsidizeDeclaredRelated),
  };
}

function plainProfile(p) {
  return {
    key: p.key, id: p.id, pool: Number(p.pool), version: Number(p.version), module: p.module, baseGmu: BigInt(p.baseGmu),
    maxGmuPerWorkerPerEpoch: BigInt(p.maxGmuPerWorkerPerEpoch), jobsPerEpoch: Number(p.jobsPerEpoch),
    activeFromEpoch: BigInt(p.activeFromEpoch), retiredFromEpoch: BigInt(p.retiredFromEpoch), name: p.name,
  };
}

function plainReceipt(r) {
  return {
    epoch: BigInt(r.epoch), pool: Number(r.pool), profileId: r.profileId, worker: r.worker, counterparty: r.counterparty,
    ref: r.ref, inputHash: r.inputHash, outputHash: r.outputHash, contributionId: r.contributionId, recordedAt: BigInt(r.recordedAt),
  };
}

function plainStatus(s) {
  return {
    verdict: Number(s.verdict), ineligible: Number(s.ineligible), relation: Number(s.relation),
    gmuMeasured: BigInt(s.gmuMeasured), gmuSubsidized: BigInt(s.gmuSubsidized), verifier: s.verifier,
  };
}

/// A value ready for JSON: big integers as decimal strings, maps as objects.
function jsonable(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(jsonable);
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), jsonable(x)]));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)]));
  return v;
}

// ---------------------------------------------------------------- connection

class AuditMismatch extends Error {}
class NotFinalYet extends Error {}
/// The endpoint could not serve state at the block the run reads. Nothing was read at another block.
class StateUnavailable extends Error {}
/// The block the run read no longer has the hash it had when the run began.
class SnapshotMoved extends Error {}

// The call shape of a contract account: the common `execute(target, value, data)`. An agent whose
// on-chain identity is a contract (a FOGA cell account, any smart account of this shape) acts
// through it, and what the ledger and a tender see is the account's address, not the key's.
const ACCOUNT_ABI = [
  "function execute(address target, uint256 value, bytes data) returns (bytes)",
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "error CallFailed(bytes data)",
];

/// The contract error behind a failed call or transaction, by name, whichever contract of the
/// kernel raised it - also when a contract account wrapped it; null when the failure carries none.
function refusal(e) {
  const data = typeof e === "string" ? e
    : [e?.data, e?.info?.error?.data, e?.error?.data, e?.info?.error?.data?.data].find((d) => typeof d === "string" && d.length >= 10);
  if (!data) return null;
  for (const fragments of [...Object.values(abi), ACCOUNT_ABI]) {
    let parsed = null;
    try { parsed = new ethers.Interface(fragments).parseError(data); } catch { parsed = null; }
    if (!parsed) continue;
    if (parsed.name === "CallFailed") return refusal(parsed.args[0]) ?? { name: "CallFailed", args: [parsed.args[0]] };
    return { name: parsed.name, args: parsed.args.map((a) => a.toString()) };
  }
  return null;
}

/// Who acts. A key by itself: the worker of record is the key's address. A key driving a contract
/// account: every call goes through the account's `execute`, and the worker of record - and the
/// tender owner the adapter checks - is the account. The key must be one the account obeys.
///
/// A key that a running agent node also sends from must not be used here: two programs sending from
/// one key collide on nonces, and a node that finds its nonce consumed by another program can be
/// left with an operation it cannot resolve by itself.
async function actorOf(signer, account) {
  const key = await signer.getAddress();
  if (!account) return { address: key, key, account: null, send: (to, data) => signer.sendTransaction({ to, data }) };
  const contract = new ethers.Contract(ethers.getAddress(account), ACCOUNT_ABI, signer);
  if ((await signer.provider.getCode(contract.target)) === "0x") throw new Error(`${contract.target} is not a contract account`);
  const obeys = [];
  for (const role of ["owner", "operator"]) { try { obeys.push(await contract[role]()); } catch { /* the account has no such role */ } }
  if (obeys.length > 0 && !obeys.includes(key)) throw new Error(`the key ${key} is neither the owner nor the operator of the account ${contract.target}`);
  return { address: contract.target, key, account: contract.target, send: (to, data) => contract.execute(to, 0, data) };
}

/// The contracts of one deployment. The manifest names the ledger; the policy and the seed source
/// are read from the ledger itself, and whatever else the manifest says about them must agree, so a
/// wrong manifest cannot point the client at contracts that do not belong together.
///   tag      - the block the client treats as settled: "finalized" (default), "safe", "latest", or a number
///   logChunk - largest block range of one log query; 0 = no limit. Public endpoints cap the range of
///              a log query; the default is the manifest's own hint for its chain's endpoint, if any
///   pin      - a block taken with `pinBlock`: the connection itself is then read at that block, and
///              an audit or a check made with it reads nothing else
async function connect(manifest, runner, { tag = "finalized", logChunk, pin = null } = {}) {
  logChunk = Number(logChunk ?? manifest.logChunk ?? 0);
  const provider = runner.provider ?? runner;
  const ledger = new ethers.Contract(manifest.contracts.GenesisLedger, abi.ledger, runner);
  const read = (what, call) => (pin ? stateRead(pin, what, () => call(at(pin))) : call({}));
  if (pin && (await stateRead(pin, "the ledger's code", () => provider.getCode(ledger.target, pin.number))) === "0x") {
    throw new Error(`no contract at the ledger's address ${ledger.target} at block ${pin.number}`);
  }
  const policy = new ethers.Contract(await read("the ledger's policy", (o) => ledger.policy(o)), abi.policy, runner);
  const seedSource = await read("the ledger's seed source", (o) => ledger.seedSource(o));
  const { chainId } = await provider.getNetwork();
  if (manifest.chainId !== undefined && BigInt(manifest.chainId) !== chainId) {
    throw new Error(`the manifest is for chain ${manifest.chainId}; the endpoint answers for chain ${chainId}`);
  }
  const domain = await read("the ledger's domain", (o) => ledger.domain(o));
  const expected = ledgerDomain(chainId, await ledger.getAddress());
  if (domain !== expected) throw new Error(`ledger domain ${domain} is not the domain of chain ${chainId} and this address`);
  const same = (a, b) => a === undefined || ethers.getAddress(a) === ethers.getAddress(b);
  if (!same(manifest.contracts.GenesisPolicy, await policy.getAddress())) throw new Error("the manifest's GenesisPolicy is not the ledger's policy");
  if (!same(manifest.contracts.SeedSource, seedSource)) throw new Error("the manifest's SeedSource is not the ledger's seed source");
  return {
    manifest, provider, runner, ledger, policy, seedSource, chainId, domain,
    genesisTime: await read("the policy's genesis time", (o) => policy.genesisTime(o)),
    epochDuration: await read("the policy's epoch duration", (o) => policy.epochDuration(o)),
    fromBlock: manifest.deployBlock ?? 0, tenderFromBlock: manifest.external?.taskToken8414?.deployBlock ?? 0,
    tag, logChunk, pin,
  };
}

// ---------------------------------------------------------------- one block, and nothing after it

/// Take the block a run reads: the block at `tag`, with its number, hash and time, and the time at
/// which it was observed. A tag that is a number names a block outright; whether that block is at or
/// below the endpoint's finalized block is recorded with it, as far as the endpoint says.
async function pinBlock(provider, tag = "finalized") {
  const observedAt = new Date().toISOString();
  const block = await provider.getBlock(tag);
  if (!block) throw new Error(`the endpoint has no block for ${tag}`);
  let finality = String(tag);
  if (typeof tag === "number") {
    let finalized = null;
    try { finalized = await provider.getBlock("finalized"); } catch { finalized = null; }
    finality = finalized ? (block.number <= finalized.number ? "at-or-below-finalized" : "above-finalized") : "unknown";
  }
  return { tag: String(tag), number: block.number, hash: block.hash, timestamp: BigInt(block.timestamp), finality, observedAt };
}

/// The overrides of a view call at the pinned block.
const at = (pin) => ({ blockTag: pin.number });

/// Whether a failed call is the contract's own answer - a revert, which is state that was served -
/// rather than the endpoint failing to serve the state.
function isContractAnswer(e) {
  const data = [e?.data, e?.info?.error?.data, e?.error?.data].find((d) => typeof d === "string" && d.startsWith("0x"));
  if (data !== undefined) return true;
  if (e?.code === "BAD_DATA") return true; // an answer that is not what the interface says: no contract there, or another one
  // a provider that reports a revert in words only; ethers' own "missing revert data" is not one
  return e?.code !== "CALL_EXCEPTION" && /execution reverted|reverted with/i.test(String(e?.message ?? ""));
}

/// One read of state at the pinned block. A failure that is not the contract's own answer is the
/// endpoint's: the run stops with StateUnavailable and reads no other block in its place.
async function stateRead(pin, what, call) {
  try {
    return await call();
  } catch (e) {
    if (isContractAnswer(e)) throw e;
    const why = e?.info?.error?.message ?? e?.error?.message ?? e?.shortMessage ?? e?.message ?? String(e);
    throw new StateUnavailable(`the endpoint could not serve ${what} at block ${pin.number} (${why}); the run reads this block only and does not fall back to a later one`);
  }
}

/// The pinned block must still have the hash it had: asked for again after the reads.
async function recheck(provider, pin) {
  const again = await provider.getBlock(pin.number);
  if (!again || again.hash !== pin.hash) {
    throw new SnapshotMoved(`block ${pin.number} had the hash ${pin.hash} when the run began and has ${again?.hash ?? "none"} now: nothing of this run is reported`);
  }
}

/// The block a run reads, as it goes into a record: what was read. How the block was asked for - by
/// which tag, and how it stood to the endpoint's finalized block - belongs to the run, and is recorded
/// beside it (`snapshotTag`, `snapshotFinality`).
const snapshotOf = (pin) => ({ number: pin.number, hash: pin.hash, timestamp: pin.timestamp });

/// The block the client treats as settled, asked for now. An audit takes it once (`pinBlock`); this
/// is for a caller that waits for the settled block to pass a moment.
async function horizon(ctx) {
  const block = await ctx.provider.getBlock(ctx.tag);
  if (!block) throw new Error(`the endpoint has no block for ${ctx.tag}`);
  return { number: block.number, timestamp: BigInt(block.timestamp) };
}

const epochEnd = (ctx, epoch) => ctx.genesisTime + (BigInt(epoch) + 1n) * ctx.epochDuration;

/// The pinned block's number, once that block is at or past the end of `epoch`: from then on no
/// reorganization can change the epoch's receipts. Before that, NotFinalYet.
function requireEndedAt(ctx, epoch, pin) {
  const end = epochEnd(ctx, epoch);
  if (pin.timestamp < end) {
    throw new NotFinalYet(`epoch ${epoch} ends at ${end}; the ${ctx.tag} block (${pin.number}) is at ${pin.timestamp}: wait until it passes the epoch's end`);
  }
  return pin.number;
}

async function requireEnded(ctx, epoch) {
  return requireEndedAt(ctx, epoch, ctx.pin ?? await pinBlock(ctx.provider, ctx.tag));
}

// ---------------------------------------------------------------- reading the log

async function logs(ctx, contract, eventName, args, fromBlock, toBlock) {
  const filter = contract.filters[eventName](...(args ?? []));
  const from = Number(fromBlock); const to = Number(toBlock);
  if (!ctx.logChunk || to - from < ctx.logChunk) return contract.queryFilter(filter, from, to);
  const out = [];
  for (let a = from; a <= to; a += ctx.logChunk) out.push(...await contract.queryFilter(filter, a, Math.min(a + ctx.logChunk - 1, to)));
  return out;
}

/// Position of a log in the chain's order.
const before = (a, b) => a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.index < b.index);
const lastBefore = (events, pos) => { let found = null; for (const ev of events) if (before(ev, pos)) found = ev; return found; };

/// The receipts of one epoch in the order they were recorded, each with its status, from the log.
async function readEpochReceipts(ctx, epoch, toBlock) {
  const recorded = await logs(ctx, ctx.ledger, "ReceiptRecorded", [null, epoch], ctx.fromBlock, toBlock);
  if (recorded.length === 0) return [];
  const first = Math.min(...recorded.map((ev) => ev.blockNumber));
  const last = Math.max(...recorded.map((ev) => ev.blockNumber));
  const statuses = new Map();
  for (const ev of await logs(ctx, ctx.ledger, "ReceiptStatus", [], first, last)) {
    if (statuses.has(ev.args.id)) throw new Error(`receipt ${ev.args.id}: more than one status record`);
    statuses.set(ev.args.id, plainStatus(ev.args.status));
  }
  const out = recorded.map((ev) => {
    const status = statuses.get(ev.args.id);
    if (!status) throw new Error(`receipt ${ev.args.id}: no status record in blocks ${first}-${last}`);
    return {
      id: ev.args.id, blockNumber: ev.blockNumber, index: ev.index, txHash: ev.transactionHash,
      receipt: plainReceipt(ev.args.receipt), status,
    };
  });
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/// Replay an epoch's receipts with the statuses given: digest, totals, contributions per worker.
function replayRecorded(epoch, items) {
  let digest = ethers.ZeroHash;
  const totals = { measured: [0n, 0n], subsidized: [0n, 0n] };
  const workers = new Map();
  for (const it of items) {
    const { receipt: r, status: st } = it;
    digest = digestStep(digest, it.id, r, st);
    totals.measured[r.pool] += st.gmuMeasured;
    totals.subsidized[r.pool] += st.gmuSubsidized;
    const w = workers.get(r.worker) ?? { measured: [0n, 0n], subsidized: [0n, 0n], receipts: 0 };
    w.measured[r.pool] += st.gmuMeasured;
    w.subsidized[r.pool] += st.gmuSubsidized;
    w.receipts += 1;
    workers.set(r.worker, w);
  }
  const receiptCount = BigInt(items.length);
  return { epoch: BigInt(epoch), digest, receiptCount, totals, workers, subject: auditSubject(epoch, digest, receiptCount, totals) };
}

// ---------------------------------------------------------------- the G0 audit job (a worker's work)

/// What the audit job of `epoch` commits to, recomputed from the chain: the previous epoch replayed
/// from its log, or - for epoch 0 - the deployment's configuration. Throws AuditMismatch when the
/// recomputation and the ledger disagree; a worker does not submit over a disagreement.
async function auditSubjectFor(ctx, epoch, pin = null) {
  epoch = BigInt(epoch);
  pin = pin ?? ctx.pin ?? await pinBlock(ctx.provider, ctx.tag);
  if (epoch === 0n) {
    const mine = configHash(ctx.domain, await ctx.policy.getAddress(), ctx.seedSource, ctx.genesisTime, ctx.epochDuration);
    const theirs = await stateRead(pin, "the ledger's configuration hash", () => ctx.ledger.configHash(at(pin)));
    if (mine !== theirs) throw new AuditMismatch(`configuration: recomputed ${mine}, ledger ${theirs}`);
    return { audited: null, subject: mine, receipts: 0 };
  }
  const toBlock = requireEndedAt(ctx, epoch - 1n, pin);
  const items = await readEpochReceipts(ctx, epoch - 1n, toBlock);
  const replay = replayRecorded(epoch - 1n, items);
  const theirs = await stateRead(pin, `the audit subject of epoch ${epoch - 1n}`, () => ctx.ledger.auditSubject(epoch - 1n, at(pin)));
  if (replay.subject !== theirs) {
    throw new AuditMismatch(`epoch ${epoch - 1n}: recomputed subject ${replay.subject}, ledger ${theirs}`);
  }
  return { audited: epoch - 1n, subject: replay.subject, receipts: items.length };
}

/// Do the current epoch's audit job for `signer` and submit it.
///
/// The job of epoch N is the audit of epoch N-1. The reference client does it in full: it re-decides
/// every receipt of N-1 from primary data (auditEpoch) and derives its output from its own result,
/// so the output is accepted only if the worker's independent recomputation equals what the ledger
/// holds. If the two differ the client stops with AuditMismatch and submits nothing. The submission
/// names its epoch, so one that lands after the epoch has turned is refused and spends nothing.
///
/// The ledger cannot tell this from a client that reads the subject off the chain: an accepted
/// receipt is evidence of presence and of a conforming submission, not of the audit having been done.
async function workAudit(ctx, signer, { wait = 1, account = null, expectEpoch = null } = {}) {
  const actor = await actorOf(signer, account);
  const ledger = ctx.ledger.connect(signer);
  const epoch = await ctx.policy.currentEpoch();
  if (expectEpoch !== null && BigInt(expectEpoch) !== epoch) throw new Error(`the work was meant for epoch ${expectEpoch}; the chain is in epoch ${epoch}`);
  // A submission can have been sent and its answer lost, or the process stopped after sending. The
  // work is found by its contribution id before anything is done: what is recorded is not sent again.
  const existing = await ledger.receiptOfContribution(g0ContributionId(ctx.domain, AUDIT_V1_FUNCTION_ID, epoch, 0, actor.address));
  if (existing !== 0n) {
    const recorded = plainReceipt(await ledger.receipt(existing));
    return {
      worker: actor.address, key: actor.key, account: actor.account, epoch, audited: null, receiptsAudited: 0, auditedTableHash: null,
      instance: recorded.ref, output: recorded.outputHash, receiptId: existing, status: plainStatus(await ledger.status(existing)),
      txHash: null, gasUsed: 0n, alreadyRecorded: true,
    };
  }
  let audited = null; let subject; let receiptsAudited = 0; let auditedTableHash = null;
  if (epoch === 0n) {
    ({ subject } = await auditSubjectFor(ctx, 0n));
  } else {
    const report = await auditEpoch(ctx, epoch - 1n);
    if (!report.ok) {
      const e = new AuditMismatch(`epoch ${epoch - 1n}: the recomputation differs from the ledger in ${report.findings.length} place(s): ${report.findings.map((f) => f.what).join("; ")}`);
      e.report = report;
      throw e;
    }
    audited = epoch - 1n; subject = report.subject; receiptsAudited = report.receipts.length; auditedTableHash = report.tableHash;
  }
  // opening an epoch is nobody's act in particular: the key sends it directly
  if ((await ledger.seedOf(epoch)) === ethers.ZeroHash) await (await ledger.openEpoch()).wait(wait);
  const seed = await ledger.seedOf(epoch);
  if (seed === ethers.ZeroHash) throw new Error(`epoch ${epoch} has no seed: it turned before it could be opened; run again`);
  const instance = g0Instance(seed, AUDIT_V1_FUNCTION_ID, 0, actor.address);
  const output = auditOutput(instance, auditInputHash(epoch, subject));
  const tx = await actor.send(ledger.target, ledger.interface.encodeFunctionData("submitG0", [profileKey(PROFILE_G0_REF), epoch, 0, output]));
  const rc = await tx.wait(wait);
  const id = eventOf(rc, ledger, "ReceiptRecorded").args.id;
  return {
    worker: actor.address, key: actor.key, account: actor.account, epoch, audited, receiptsAudited, auditedTableHash, instance, output,
    receiptId: id, status: plainStatus(await ledger.status(id)), txHash: rc.hash, gasUsed: rc.gasUsed, alreadyRecorded: false,
  };
}

/// The first event named `name` that `contract` emitted in a transaction.
function eventOf(rc, contract, name) {
  for (const l of rc.logs) {
    if (l.address !== contract.target) continue;
    let p = null;
    try { p = contract.interface.parseLog(l); } catch { p = null; }
    if (p && p.name === name) return p;
  }
  throw new Error(`the transaction ${rc.hash} carries no ${name} event of ${contract.target}`);
}

/// Confirm a settled submission of an ERC-8414 tender to the ledger, as the tender's owner (or as
/// the key that drives the owner, when the owner is a contract account).
async function bridgeTender(ctx, signer, { tokenId, submissionId, wait = 1, account = null }) {
  const actor = await actorOf(signer, account);
  const epoch = await ctx.policy.currentEpoch();
  const profile = await ctx.policy.activeProfile(profileKey(PROFILE_G1_TENDER), epoch);
  const adapter = new ethers.Contract(profile.module, abi.adapter, signer);
  // Found by its contribution id first, as in `workAudit`: a confirmation that is recorded is not sent
  // again. This holds for the tender's owner only - anybody else is refused by the adapter, whether a
  // receipt exists or not, and is to be told so by the adapter.
  const source = await adapter.taskToken();
  let existing = await ctx.ledger.receiptOfContribution(g1ContributionId(ctx.domain, source, tokenId, submissionId));
  if (existing !== 0n && (await new ethers.Contract(source, abi.taskTender, signer).ownerOf(tokenId)) !== actor.address) existing = 0n;
  let id = existing; let rc = null;
  if (existing === 0n) {
    const tx = await actor.send(adapter.target, adapter.interface.encodeFunctionData("bridge", [tokenId, submissionId]));
    rc = await tx.wait(wait);
    id = eventOf(rc, adapter, "TenderBridged").args.receiptId;
  }
  const receipt = plainReceipt(await ctx.ledger.receipt(id));
  return {
    demander: receipt.counterparty, key: actor.key, account: actor.account, adapter: adapter.target, receiptId: id, epoch: receipt.epoch,
    worker: receipt.worker, status: plainStatus(await ctx.ledger.status(id)), txHash: rc?.hash ?? null, gasUsed: rc?.gasUsed ?? 0n,
    alreadyRecorded: existing !== 0n,
  };
}

// ---------------------------------------------------------------- a deployment against the builds

/// Runtime code with the immutable values blanked: what a build and its deployment have in common.
function maskedCode(code, ranges) {
  const bytes = ethers.getBytes(code);
  for (const [start, length] of ranges) bytes.fill(0, start, start + length);
  return ethers.hexlify(bytes);
}

const codeHashOf = async (provider, address, blockTag = "latest") => ethers.keccak256(await provider.getCode(address, blockTag));

/// Check a deployment against this repository's builds and against its own manifest: the code at
/// each address is the build's runtime code (immutable values aside) and has the hash the manifest
/// records; the contracts point at one another and at the external tender contract as the manifest
/// says; the profiles in force name these modules. `loadBuild(name)` returns build/<name>.json.
/// Everything is read at one block - `pin`, the connection's, or the block at the connection's tag
/// taken now - and the result names it.
async function verifyDeployment(ctx, loadBuild, { pin = null } = {}) {
  pin = pin ?? ctx.pin ?? await pinBlock(ctx.provider, ctx.tag);
  const m = ctx.manifest;
  const checks = [];
  const check = (what, ok, detail) => { checks.push({ what, ok: Boolean(ok), ...(detail === undefined ? {} : { detail: String(detail) }) }); return Boolean(ok); };
  const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
  const codeAt = (address) => stateRead(pin, `the code at ${address}`, () => ctx.provider.getCode(address, pin.number));
  const code = {};
  for (const [role, entry] of Object.entries(m.code ?? {})) {
    const address = m.contracts?.[role];
    if (!address) { check(`${role}: the manifest records its code and names its address`, false, "no address"); continue; }
    const onchain = await codeAt(address);
    const build = loadBuild(entry.contract);
    const hash = ethers.keccak256(onchain);
    code[role] = { address, contract: entry.contract, codeHash: hash };
    const sameLength = onchain.length === build.deployedBytecode.length;
    check(`${role} at ${address}: the code on chain is this repository's build of ${entry.contract}`,
      onchain !== "0x" && sameLength && maskedCode(onchain, build.immutableReferences) === maskedCode(build.deployedBytecode, build.immutableReferences),
      sameLength ? undefined : `code of ${(onchain.length - 2) / 2} bytes, the build has ${(build.deployedBytecode.length - 2) / 2}`);
    check(`${role}: the code hash is the one the manifest records`, eq(entry.codeHash, hash), `${hash}`);
  }
  // every contract an epoch's figures depend on has to be named and to have its code on record: a
  // manifest that leaves one out - the function that verifies G0 work, say - proves nothing about it
  const required = ["GenesisPolicy", "SeedSource", "GenesisLedger", "AuditV1", "TenderAdapter8414"];
  const missing = required.filter((role) => !m.contracts?.[role] || !m.code?.[role]?.codeHash);
  check("the manifest names every contract of the deployment and records its code", missing.length === 0, missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`);

  const ledgerAddress = ctx.ledger.target;
  // a contract that is not what its role says does not answer these reads: that is a failed check, not
  // a failure. An endpoint that cannot serve the block is a failure, and stops the run
  const read = async (what, call) => {
    try { return await stateRead(pin, what, () => call(at(pin))); } catch (e) { if (e instanceof StateUnavailable) throw e; return null; }
  };
  check("the ledger's policy is the manifest's GenesisPolicy", eq(m.contracts.GenesisPolicy, ctx.policy.target), ctx.policy.target);
  check("the ledger's seed source is the manifest's SeedSource", eq(m.contracts.SeedSource, ctx.seedSource), ctx.seedSource);
  // the connection's own values, asked for again at the block of this check
  check("the ledger answers at this block as it did when the connection was made",
    eq(await read("the ledger's policy", (o) => ctx.ledger.policy(o)), ctx.policy.target) && eq(await read("the ledger's seed source", (o) => ctx.ledger.seedSource(o)), ctx.seedSource)
      && (await read("the ledger's domain", (o) => ctx.ledger.domain(o))) === ctx.domain);
  if (m.clock) {
    check("the policy's clock is the manifest's", BigInt(m.clock.genesisTime) === ctx.genesisTime && BigInt(m.clock.epochDuration) === ctx.epochDuration,
      `genesis ${ctx.genesisTime}, epochs of ${ctx.epochDuration} s`);
  }
  if (m.contracts.AuditV1) {
    const fn = new ethers.Contract(m.contracts.AuditV1, abi.audit, ctx.provider);
    check("the audit function reads this ledger", eq(await read("the audit function's ledger", (o) => fn.ledger(o)), ledgerAddress));
    check("the audit function is audit-v1", (await read("the audit function's id", (o) => fn.functionId(o))) === AUDIT_V1_FUNCTION_ID);
  }
  if (m.contracts.TenderAdapter8414) {
    const adapter = new ethers.Contract(m.contracts.TenderAdapter8414, abi.adapter, ctx.provider);
    const reads = await read("the adapter's tender contract", (o) => adapter.taskToken(o));
    check("the adapter reports to this ledger", eq(await read("the adapter's ledger", (o) => adapter.ledger(o)), ledgerAddress));
    check("the adapter reads the manifest's ERC-8414 contract", eq(reads, m.external?.taskToken8414?.address), reads ?? "no answer");
    check("the adapter records under g1.tender", (await read("the adapter's profile", (o) => adapter.profileKey(o))) === profileKey(PROFILE_G1_TENDER));
  }
  if (m.external?.taskToken8414?.codeHash) {
    const hash = ethers.keccak256(await codeAt(m.external.taskToken8414.address));
    check("the ERC-8414 contract's code is what it was when the adapter was pointed at it", eq(hash, m.external.taskToken8414.codeHash), hash);
  }

  // the profiles in force (for the epoch of the block, or for epoch 0 before the start) name these modules
  const started = pin.timestamp >= ctx.genesisTime;
  const epoch = started ? (pin.timestamp - ctx.genesisTime) / ctx.epochDuration : 0n;
  const moduleOf = async (name) => (await read(`the ${name} profile`, (o) => ctx.policy.activeProfile(profileKey(name), epoch, o)))?.module ?? null;
  const g0Module = await moduleOf(PROFILE_G0_REF);
  check(`epoch ${epoch}: the g0.ref profile's function is the manifest's AuditV1`, g0Module && eq(g0Module, m.contracts.AuditV1), g0Module ?? "no profile in force");
  const g1Module = await moduleOf(PROFILE_G1_TENDER);
  check(`epoch ${epoch}: the g1.tender profile's adapter is the manifest's TenderAdapter8414`, g1Module && eq(g1Module, m.contracts.TenderAdapter8414), g1Module ?? "no profile in force");

  // not checks: who can register versions and admit parties, and whether recording is paused
  const info = { steward: await read("the steward", (o) => ctx.policy.steward(o)), paused: await read("the pause", (o) => ctx.policy.paused(o)) };
  await recheck(ctx.provider, pin);
  return { ok: checks.every((c) => c.ok), checks, code, epoch, started, info, pin };
}

// ---------------------------------------------------------------- the independent audit of an epoch

/// The policy as it applied to `epoch`, replayed from the policy's own events in the chain's order.
/// A version registered again for the same epoch, while that epoch was still ahead, replaces the
/// earlier registration - exactly as in the contract.
async function policyAt(ctx, epoch, toBlock) {
  epoch = BigInt(epoch);
  let params = null; let paramsVersion = 0;
  for (const ev of await logs(ctx, ctx.policy, "ParamsRegistered", [], ctx.fromBlock, toBlock)) {
    const p = plainParams(ev.args.params);
    if (p.activeFromEpoch <= epoch) { params = p; paramsVersion = Number(ev.args.version); }
  }

  const versions = new Map(); // key -> [{ profile, retiredFrom }] by version
  const profileEvents = [
    ...await logs(ctx, ctx.policy, "ProfileRegistered", [], ctx.fromBlock, toBlock),
    ...await logs(ctx, ctx.policy, "ProfileRetired", [], ctx.fromBlock, toBlock),
  ].sort((a, b) => (before(a, b) ? -1 : 1));
  for (const ev of profileEvents) {
    const list = versions.get(ev.args.key) ?? [];
    if (ev.fragment.name === "ProfileRegistered") {
      const profile = plainProfile(ev.args.profile);
      list[profile.version - 1] = { profile, retiredFrom: null }; // a replacement starts unretired
      list.length = profile.version;
    } else {
      const entry = list.find((v) => v && v.profile.id === ev.args.id);
      if (entry) entry.retiredFrom = BigInt(ev.args.retiredFromEpoch);
    }
    versions.set(ev.args.key, list);
  }
  const profiles = new Map(); // key -> the version in force for the epoch
  for (const [key, list] of versions) {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v.profile.activeFromEpoch > epoch) continue;
      if (v.retiredFrom === null || epoch < v.retiredFrom) profiles.set(key, v.profile);
      break; // a retired version is not replaced by an older one
    }
  }

  const operators = new Map(); const admitted = new Map();
  for (const ev of await logs(ctx, ctx.policy, "OperatorDeclared", [], ctx.fromBlock, toBlock)) {
    if (BigInt(ev.args.fromEpoch) <= epoch) operators.set(ev.args.party, Number(ev.args.operator));
  }
  for (const ev of await logs(ctx, ctx.policy, "AdmissionSet", [], ctx.fromBlock, toBlock)) {
    if (BigInt(ev.args.fromEpoch) <= epoch) admitted.set(ev.args.party, Boolean(ev.args.admitted));
  }
  return {
    params, paramsVersion, profiles, profileById: new Map([...profiles.values()].map((p) => [p.id, p])),
    operatorOf: (a) => operators.get(a) ?? 0, isAdmitted: (a) => admitted.get(a) ?? false,
  };
}

/// The block a tender was minted in: where its history begins. The tender contract may be far older
/// than the tender, and a public endpoint serves a log query over a limited range only, so the mint
/// is looked for from the newest range backwards and everything else is read from there on. When no
/// mint record is found the whole range is read.
async function mintBlockOf(ctx, tender, tokenId, toBlock) {
  const filter = tender.filters.Transfer(ethers.ZeroAddress, null, tokenId);
  const lo = Number(ctx.tenderFromBlock); const hi = Number(toBlock);
  if (!ctx.logChunk) return (await tender.queryFilter(filter, lo, hi))[0]?.blockNumber ?? lo;
  for (let b = hi; b >= lo; b -= ctx.logChunk) {
    const found = await tender.queryFilter(filter, Math.max(lo, b - ctx.logChunk + 1), b);
    if (found.length > 0) return found[0].blockNumber;
  }
  return lo;
}

/// One tender's history from its own log: who owned it, who judged it and which task it was bound
/// to, in the chain's order. ERC-8414 lets all three change hands; the log is the complete record.
async function tenderHistory(ctx, tender, tokenId, toBlock) {
  const from = await mintBlockOf(ctx, tender, tokenId, toBlock);
  return {
    mintBlock: from,
    owners: await logs(ctx, tender, "Transfer", [null, null, tokenId], from, toBlock),
    judges: await logs(ctx, tender, "AcceptanceAuthorityChanged", [tokenId], from, toBlock),
    bindings: await logs(ctx, tender, "TaskUpdated", [tokenId], from, toBlock),
    settled: await logs(ctx, tender, "FulfillmentAccepted", [tokenId], from, toBlock),
    defaults: await logs(ctx, tender, "FulfillmentClaimedUnjudged", [tokenId], from, toBlock),
  };
}

// What the tender's log can say about the authority at a settlement.
const AUTHORITY_EVIDENCE = {
  REGISTERED: "registered-authority-visible", // the last registered authority before the acceptance, and no change in its transaction
  INSUFFICIENT: "evidence-insufficient",      // the authority of this tender changed in the acceptance's own transaction
  NO_ACCEPTANCE: "no-acceptance-record",      // the log has no acceptance of this submission before the receipt
};
const OBSERVATION_ORDER = ["authority-changed-in-the-acceptance-transaction", "worker-judged-its-own-delivery",
  "worker-owned-the-tender-when-it-settled", "judge-changed-between-settlement-and-bridge", "owner-changed-between-settlement-and-bridge"];

/// The authority of one tender at one acceptance, as far as that tender's own log settles it.
/// `hist` is the history of one tender of one source, so a change counts only when it is of the same
/// source and the same token and in the same transaction as the acceptance. Two things are kept
/// apart: `registered`, the address the last record before the acceptance names - a fact of the log
/// in every case - and `evidence`, which says whether that fact can stand for the authority that
/// was consulted. Who carried out a verification is established in neither case.
function authorityAtSettlement(hist, settled) {
  if (!settled) return { registered: null, changedInAcceptanceTransaction: false, evidence: AUTHORITY_EVIDENCE.NO_ACCEPTANCE };
  const registered = lastBefore(hist.judges, settled)?.args.newAuthority ?? null;
  const changed = hist.judges.some((ev) => ev.transactionHash === settled.transactionHash);
  return { registered, changedInAcceptanceTransaction: changed, evidence: changed ? AUTHORITY_EVIDENCE.INSUFFICIENT : AUTHORITY_EVIDENCE.REGISTERED };
}

/// Recompute an ended epoch from primary data and compare every figure with the ledger:
///  - each receipt's verdict and eligibility, re-decided from the seed, the previous epoch, the
///    ERC-8414 contract's own log and the policy in force;
///  - the digest, the totals and the audit subject;
///  - every worker's allocation;
///  - the epoch's close record, when there is one.
/// Everything is read at one block: `pin`, the connection's, or the block at the connection's tag
/// taken now. Returns a report; `report.ok` is true only when nothing differs.
///   requireSealed - also report it as a difference when the epoch has no close record at that block
async function auditEpoch(ctx, epoch, { pin = null, requireSealed = false } = {}) {
  epoch = BigInt(epoch);
  pin = pin ?? ctx.pin ?? await pinBlock(ctx.provider, ctx.tag);
  const findings = [];
  const note = (what, expected, found) => findings.push({ what, recomputed: String(expected), ledger: String(found) });
  const state = (what, call) => stateRead(pin, what, () => call(at(pin)));

  const toBlock = requireEndedAt(ctx, epoch, pin);
  // the connection's own values at this block: a ledger that was not there yet, or another one, does not pass
  if ((await state("the ledger's domain", (o) => ctx.ledger.domain(o))) !== ctx.domain) note("ledger domain at the block", ctx.domain, "another");
  const summary = await state(`the summary of epoch ${epoch}`, (o) => ctx.ledger.epochSummary(epoch, o));
  const pol = await policyAt(ctx, epoch, toBlock);
  const items = await readEpochReceipts(ctx, epoch, toBlock);

  // the seed as captured, and the subject the epoch's audit jobs had to commit to
  const opened = await logs(ctx, ctx.ledger, "EpochOpened", [epoch], ctx.fromBlock, toBlock);
  let seed = ethers.ZeroHash;
  if (opened.length > 0) {
    seed = epochSeed(ctx.domain, epoch, opened[0].args.seedMaterial);
    if (seed !== opened[0].args.seed) note("seed", seed, opened[0].args.seed);
  }
  if (seed !== summary.seed) note("seed (stored)", seed, summary.seed);
  const g0Subject = items.some((it) => it.receipt.pool === POOL_G0) ? (await auditSubjectFor(ctx, epoch, pin)).subject : null;

  // the bridge records of the epoch's G1 adapters, by the transaction that made each receipt
  const ledgerAddress = await ctx.ledger.getAddress();
  const bridged = new Map();
  for (const p of pol.profiles.values()) {
    if (p.pool !== POOL_G1) continue;
    const adapter = new ethers.Contract(p.module, abi.adapter, ctx.provider);
    const reportsTo = await state(`the ledger of the adapter ${p.module}`, (o) => adapter.ledger(o));
    if (reportsTo !== ledgerAddress) note(`adapter ${p.module}: ledger`, ledgerAddress, reportsTo);
    const source = await state(`the tender contract of the adapter ${p.module}`, (o) => adapter.taskToken(o));
    for (const ev of await logs(ctx, adapter, "TenderBridged", [], ctx.fromBlock, toBlock)) {
      bridged.set(`${ev.transactionHash}:${ev.args.receiptId}`, { source, tokenId: ev.args.tokenId, submissionId: ev.args.submissionId });
    }
  }
  const histories = new Map();
  const historyOf = async (tender, source, tokenId) => {
    const k = `${source}:${tokenId}`;
    if (!histories.has(k)) histories.set(k, await tenderHistory(ctx, tender, tokenId, toBlock));
    return histories.get(k);
  };

  // re-decide every receipt in order
  const observations = []; // what the tender's log shows and the ledger's rules cannot read
  const accrued = new Map(); const demanderCount = new Map(); const pairCount = new Map();
  const functionIds = new Map(); // G0 module -> function id
  const redecided = [];
  for (const it of items) {
    const { receipt: r, status: recorded } = it;
    const p = pol.profileById.get(r.profileId);
    const st = { verdict: 0, ineligible: INELIGIBLE.NONE, relation: RELATION.NONE_FOUND, gmuMeasured: 0n, gmuSubsidized: 0n };
    const subsidy = () => {
      const k = `${p.key}:${r.worker}`; const used = accrued.get(k) ?? 0n;
      if (used >= p.maxGmuPerWorkerPerEpoch) return [0n, INELIGIBLE.WORKER_CAP];
      const room = p.maxGmuPerWorkerPerEpoch - used; const gmu = p.baseGmu < room ? p.baseGmu : room;
      accrued.set(k, used + gmu); return [gmu, INELIGIBLE.NONE];
    };
    if (r.epoch !== epoch) note(`receipt ${it.id}: epoch`, epoch, r.epoch);
    if (!p) {
      note(`receipt ${it.id}: profile`, "a profile in force for the epoch", r.profileId);
      redecided.push(it);
      continue;
    }
    if (p.pool !== r.pool) note(`receipt ${it.id}: pool`, p.pool, r.pool);
    if (recorded.verifier !== p.module) note(`receipt ${it.id}: verifier`, p.module, recorded.verifier);

    if (r.pool === POOL_G0) {
      if (!functionIds.has(p.module)) {
        const fn = new ethers.Contract(p.module, abi.audit, ctx.provider);
        functionIds.set(p.module, await state(`the function id of ${p.module}`, (o) => fn.functionId(o)));
      }
      const functionId = functionIds.get(p.module);
      if (functionId !== AUDIT_V1_FUNCTION_ID) note(`receipt ${it.id}: function`, "a function this client can re-evaluate", functionId);
      let jobIndex = -1;
      for (let j = 0; j < p.jobsPerEpoch; j++) if (g0Instance(seed, functionId, j, r.worker) === r.ref) jobIndex = j;
      if (jobIndex < 0) note(`receipt ${it.id}: instance`, "an instance of this epoch's seed for the worker", r.ref);
      if (r.contributionId !== g0ContributionId(ctx.domain, functionId, epoch, Math.max(jobIndex, 0), r.worker)) note(`receipt ${it.id}: contributionId`, "the instance's", r.contributionId);
      if (r.counterparty !== ethers.ZeroAddress) note(`receipt ${it.id}: counterparty`, ethers.ZeroAddress, r.counterparty);
      const inputHash = auditInputHash(epoch, g0Subject);
      if (inputHash !== r.inputHash) note(`receipt ${it.id}: inputHash`, inputHash, r.inputHash);
      if (jobIndex === 0 && r.outputHash === auditOutput(r.ref, inputHash)) {
        st.verdict = VERDICT.ACCEPTED; st.gmuMeasured = p.baseGmu;
        if (!pol.isAdmitted(r.worker)) st.ineligible = INELIGIBLE.NOT_ADMITTED;
        else [st.gmuSubsidized, st.ineligible] = subsidy();
      } else {
        st.verdict = VERDICT.REJECTED; st.ineligible = INELIGIBLE.REJECTED;
      }
    } else {
      const b = bridged.get(`${it.txHash}:${it.id}`);
      if (!b) {
        note(`receipt ${it.id}: bridge record`, "a TenderBridged event of the profile's adapter in the receipt's transaction", "none");
        redecided.push(it);
        continue;
      }
      const tender = new ethers.Contract(b.source, abi.taskTender, ctx.provider);
      const hist = await historyOf(tender, b.source, b.tokenId);
      const owner = lastBefore(hist.owners, it)?.args.to ?? ethers.ZeroAddress;
      const judge = lastBefore(hist.judges, it)?.args.newAuthority ?? ethers.ZeroAddress;
      const binding = lastBefore(hist.bindings, it);
      const settled = hist.settled.find((ev) => ev.args.submissionId === b.submissionId && before(ev, it));
      const byDefault = hist.defaults.some((ev) => ev.args.submissionId === b.submissionId && before(ev, it));
      // fixed once delivered, and Accepted is terminal; the terms are immutable from the mint: both are read at the block all the same
      const sub = await state(`submission ${b.submissionId} of tender ${b.tokenId}`, (o) => tender.submissionOf(b.tokenId, b.submissionId, o));
      const terms = await state(`the terms of tender ${b.tokenId}`, (o) => tender.tenderTermsOf(b.tokenId, o));
      if (!settled) note(`receipt ${it.id}: settlement`, "a FulfillmentAccepted record of the tender before the receipt", "none");
      if (Number(sub.status) !== 1) note(`receipt ${it.id}: tender status`, "Accepted", sub.status);
      if (r.ref !== g1Ref(b.source, b.tokenId, b.submissionId)) note(`receipt ${it.id}: ref`, g1Ref(b.source, b.tokenId, b.submissionId), r.ref);
      if (r.contributionId !== g1ContributionId(ctx.domain, b.source, b.tokenId, b.submissionId)) note(`receipt ${it.id}: contributionId`, "the submission's", r.contributionId);
      if (r.worker !== sub.fulfiller) note(`receipt ${it.id}: worker`, sub.fulfiller, r.worker);
      if (r.counterparty !== owner) note(`receipt ${it.id}: demander`, owner, r.counterparty);
      if (r.outputHash !== sub.resultHash) note(`receipt ${it.id}: outputHash`, sub.resultHash, r.outputHash);
      const inputHash = binding && BigInt(binding.args.version) === BigInt(sub.taskVersion) ? binding.args.taskHash : ethers.ZeroHash;
      if (r.inputHash !== inputHash) note(`receipt ${it.id}: inputHash`, inputHash, r.inputHash);

      st.verdict = VERDICT.ACCEPTED; st.gmuMeasured = p.baseGmu;
      const op = pol.operatorOf(r.worker);
      if (op !== 0 && (op === pol.operatorOf(owner) || op === pol.operatorOf(judge))) st.relation = RELATION.DECLARED_RELATED;
      const q = pol.params; const dk = owner; const pk = `${owner}:${r.worker}`;
      if (r.worker === owner || r.worker === judge) st.ineligible = INELIGIBLE.SELF_DEALING;
      else if (BigInt(sub.submittedAt) < ctx.genesisTime) st.ineligible = INELIGIBLE.BEFORE_GENESIS;
      else if (!pol.isAdmitted(r.worker)) st.ineligible = INELIGIBLE.NOT_ADMITTED;
      else if (!pol.isAdmitted(owner)) st.ineligible = INELIGIBLE.DEMANDER_NOT_ADMITTED;
      else if (st.relation === RELATION.DECLARED_RELATED && !q.subsidizeDeclaredRelated) st.ineligible = INELIGIBLE.RELATION;
      else if (terms.asset !== ethers.ZeroAddress) st.ineligible = INELIGIBLE.ASSET;
      else if (BigInt(terms.rewardPerCompletion) < q.minBountyWei) st.ineligible = INELIGIBLE.BOUNTY;
      else if ((demanderCount.get(dk) ?? 0n) >= q.maxSubsidizedPerDemander) st.ineligible = INELIGIBLE.DEMANDER_CAP;
      else if ((pairCount.get(pk) ?? 0n) >= q.maxSubsidizedPerPair) st.ineligible = INELIGIBLE.PAIR_CAP;
      else {
        [st.gmuSubsidized, st.ineligible] = subsidy();
        if (st.ineligible === INELIGIBLE.NONE) { demanderCount.set(dk, (demanderCount.get(dk) ?? 0n) + 1n); pairCount.set(pk, (pairCount.get(pk) ?? 0n) + 1n); }
      }
      // how the tender settled: the ledger counts the three paths alike, the report tells them apart
      const settlement = sub.machineSettled ? "verified" : byDefault ? "default" : "judged";
      // The ledger's rules read the tender as it stands when it is bridged: ERC-8414 keeps no state of
      // who owned or judged it when it settled, and both can be handed on in between. The log has it,
      // within a limit. What the log shows is the authority that was registered: the last
      // AcceptanceAuthorityChanged record of this tender before the acceptance. It does not show who
      // carried out a verification. The reference contract calls a verifier before it emits the
      // acceptance, and the right to judge can be handed on from inside that call: the record before
      // the acceptance is then the successor's. So where the authority of this tender changed in the
      // acceptance's own transaction, the registered address is still reported for what it is, the
      // evidence is marked insufficient, and nothing is concluded about a party from it.
      const ownerAtSettlement = settled ? lastBefore(hist.owners, settled)?.args.to ?? null : null;
      const authority = authorityAtSettlement(hist, settled);
      const noted = [];
      if (authority.evidence === AUTHORITY_EVIDENCE.INSUFFICIENT) {
        noted.push("authority-changed-in-the-acceptance-transaction");
      } else if (authority.registered) {
        if (r.worker === authority.registered) noted.push("worker-judged-its-own-delivery");
        if (authority.registered !== judge) noted.push("judge-changed-between-settlement-and-bridge");
      }
      if (ownerAtSettlement && r.worker === ownerAtSettlement) noted.push("worker-owned-the-tender-when-it-settled");
      if (ownerAtSettlement && ownerAtSettlement !== owner) noted.push("owner-changed-between-settlement-and-bridge");
      // one fixed order, whatever was found
      noted.sort((x, y) => OBSERVATION_ORDER.indexOf(x) - OBSERVATION_ORDER.indexOf(y));
      it.tender = {
        source: b.source, tokenId: b.tokenId, submissionId: b.submissionId, demander: owner, judge, asset: terms.asset,
        reward: BigInt(terms.rewardPerCompletion), settlement, ownerAtSettlement, authority,
      };
      if (noted.length > 0) observations.push({ receiptId: it.id, worker: r.worker, subsidized: st.gmuSubsidized > 0n, noted });
    }
    for (const k of ["verdict", "ineligible", "relation", "gmuMeasured", "gmuSubsidized"]) {
      if (st[k] !== recorded[k]) note(`receipt ${it.id}: ${k}`, st[k], recorded[k]);
    }
    redecided.push({ ...it, status: { ...st, verifier: recorded.verifier } });
  }

  // totals and the subject, from the re-decided receipts
  const replay = replayRecorded(epoch, redecided);
  if (replay.digest !== summary.digest) note("digest", replay.digest, summary.digest);
  if (replay.receiptCount !== summary.receiptCount) note("receiptCount", replay.receiptCount, summary.receiptCount);
  const onchain = { measured: [summary.measuredG0, summary.measuredG1], subsidized: [summary.subsidizedG0, summary.subsidizedG1] };
  for (const pool of [POOL_G0, POOL_G1]) {
    if (replay.totals.measured[pool] !== onchain.measured[pool]) note(`measured G${pool}`, replay.totals.measured[pool], onchain.measured[pool]);
    if (replay.totals.subsidized[pool] !== onchain.subsidized[pool]) note(`subsidized G${pool}`, replay.totals.subsidized[pool], onchain.subsidized[pool]);
  }
  const subjectOnchain = await state(`the audit subject of epoch ${epoch}`, (o) => ctx.ledger.auditSubject(epoch, o));
  if (replay.subject !== subjectOnchain) note("audit subject", replay.subject, subjectOnchain);

  // the allocation table
  const { budget, pools } = poolBudgets(pol.params, epoch);
  if (budget !== summary.budget) note("budget", budget, summary.budget);
  if (Number(summary.paramsVersion) !== pol.paramsVersion) note("params version", pol.paramsVersion, summary.paramsVersion);
  const table = []; let allocated = 0n;
  for (const [worker, w] of replay.workers) {
    const perPool = [POOL_G0, POOL_G1].map((pool) => share(pools[pool], w.subsidized[pool], replay.totals.subsidized[pool], pol.params.workerCapBps));
    const mine = perPool[0] + perPool[1];
    const theirs = await state(`the allocation of ${worker}`, (o) => ctx.ledger.allocation(epoch, worker, o));
    if (mine !== theirs) note(`allocation of ${worker}`, mine, theirs);
    allocated += mine;
    table.push({ worker, operator: pol.operatorOf(worker), admitted: pol.isAdmitted(worker), receipts: w.receipts,
      measured: w.measured, subsidized: w.subsidized, allocation: mine, allocationG0: perPool[0], allocationG1: perPool[1] });
  }
  table.sort((a, b) => (a.worker.toLowerCase() < b.worker.toLowerCase() ? -1 : 1));
  if (allocated > budget) note("sum of allocations", `at most the budget ${budget}`, allocated);

  // The close record: the EpochSealed event of this ledger, within the block. It changes no figure;
  // when it is there, its figures are the recomputed ones and it was emitted after the epoch's end.
  const seals = await logs(ctx, ctx.ledger, "EpochSealed", [epoch], ctx.fromBlock, toBlock);
  const closeRecord = { present: seals.length > 0, block: null, blockTimestamp: null, txHash: null, logIndex: null };
  if (seals.length > 1) note("close records", "at most one", seals.length);
  if (Boolean(summary.isSealed) !== closeRecord.present) note("sealed flag", closeRecord.present, summary.isSealed);
  if (closeRecord.present) {
    const ev = seals[0]; const a = ev.args;
    const sealBlock = await ctx.provider.getBlock(ev.blockNumber);
    Object.assign(closeRecord, { block: ev.blockNumber, blockTimestamp: BigInt(sealBlock.timestamp), txHash: ev.transactionHash, logIndex: ev.index });
    if (BigInt(sealBlock.timestamp) < epochEnd(ctx, epoch)) note("close record: time", `at or after the epoch's end ${epochEnd(ctx, epoch)}`, sealBlock.timestamp);
    const want = { digest: replay.digest, receiptCount: replay.receiptCount, paramsVersion: BigInt(pol.paramsVersion), budget,
      measuredG0: replay.totals.measured[0], measuredG1: replay.totals.measured[1], subsidizedG0: replay.totals.subsidized[0], subsidizedG1: replay.totals.subsidized[1] };
    for (const [k, v] of Object.entries(want)) if (a[k] !== v) note(`close record: ${k}`, v, a[k]);
  } else if (requireSealed) {
    note("close record", "an EpochSealed event at or before the block", "none");
  }

  // What the figures do not say by themselves. The share cap binds an address; the same table read
  // per declared operator shows a concentration across addresses when it was declared - and only then.
  const operators = new Map();
  for (const row of table) {
    if (row.operator === 0) continue;
    const o = operators.get(row.operator) ?? { operator: row.operator, addresses: [], allocation: 0n };
    o.addresses.push(row.worker); o.allocation += row.allocation;
    operators.set(row.operator, o);
  }
  const g1 = redecided.filter((it) => it.receipt.pool === POOL_G1);
  const count = (list, f) => list.reduce((acc, it) => { const k = f(it); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const subsidizedG1 = g1.filter((it) => it.status.gmuSubsidized > 0n);

  // the block is still the block it was: only then is anything reported
  await recheck(ctx.provider, pin);

  return {
    ok: findings.length === 0, findings, epoch, pin, settledBlock: toBlock, seed, paramsVersion: pol.paramsVersion, params: pol.params,
    // an epoch whose parameters subsidize declared-related parties is a controlled self-test, not evidence of demand
    mode: pol.params.subsidizeDeclaredRelated ? "controlled-self-test" : "standard",
    budget, pools, receipts: redecided, digest: replay.digest, receiptCount: replay.receiptCount, totals: replay.totals,
    subject: replay.subject, table, tableHash: tableHashOf(table), allocated, unallocated: budget - allocated,
    isSealed: closeRecord.present, closeRecord, observations,
    operators: [...operators.values()].sort((a, b) => a.operator - b.operator),
    undeclaredAddresses: table.filter((t) => t.operator === 0).length,
    g1: {
      receipts: g1.length, subsidized: subsidizedG1.length,
      byRelation: count(g1, (it) => RELATION_NAME[it.status.relation]),
      bySettlement: count(g1.filter((it) => it.tender), (it) => it.tender.settlement),
      subsidizedByRelation: count(subsidizedG1, (it) => RELATION_NAME[it.status.relation]),
      subsidizedBySettlement: count(subsidizedG1.filter((it) => it.tender), (it) => it.tender.settlement),
      byAuthorityEvidence: count(g1.filter((it) => it.tender), (it) => it.tender.authority.evidence),
    },
  };
}

module.exports = {
  abi, POOL_G0, POOL_G1, VERDICT, VERDICT_NAME, RELATION, RELATION_NAME, INELIGIBLE, INELIGIBLE_NAME, PROFILE_G0_REF,
  PROFILE_G1_TENDER, AUDIT_V1_FUNCTION_ID, MANIFEST_SCHEMA, profileKey, ledgerDomain, configHash, epochSeed, g0Instance,
  g0ContributionId, g1ContributionId, g1Ref, auditInputHash, auditOutput, digestStep, auditSubject, tableHashOf, budgetOf,
  poolBudgets, share, connect, refusal, actorOf, eventOf, horizon, epochEnd, requireEnded, readEpochReceipts, replayRecorded,
  auditSubjectFor, workAudit, bridgeTender, policyAt, mintBlockOf, tenderHistory, auditEpoch, verifyDeployment, maskedCode, codeHashOf,
  pinBlock, snapshotOf, recheck, stateRead, authorityAtSettlement, AUTHORITY_EVIDENCE, withHashes,
  // the reading of a chain at one block, for the audit of a v2 deployment (audit2.js)
  at, isContractAnswer, requireEndedAt, logs, before, lastBefore, OBSERVATION_ORDER,
  AuditMismatch, NotFinalYet, StateUnavailable, SnapshotMoved, ACCOUNT_ABI,
  plainParams, plainProfile, plainReceipt, plainStatus, jsonable,
};
