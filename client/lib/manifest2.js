// The manifest of a ledger v2 deployment, and the check of a deployment against it
// (docs/ledger-v2.md 1 and 16). A v2 manifest names every contract of the deployment with its code
// on record, where each log starts, the guard bound to each contract account with the guard's code
// hash, and the deployment it supersedes. The same check runs right after a deployment, as its
// read-back, and later from the outside on any block.
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const g = require("./genesis");
const v2 = require("./ledger2");

const MANIFEST_SCHEMA = "finchain-pouw.deployment/2";
// every contract an epoch's figures depend on; a deployment that binds a guard of its own names it too
const ROLES = ["GenesisPolicyV2", "SeedSource", "GenesisLedgerV2", "AuditV1", "TenderAdapter8414V2"];
const SEED_SOURCES = ["L1BlockSeedSource", "PrevBlockSeedSource"];
const GUARDS = ["FogaCellGuard"];
const root = path.join(__dirname, "..", "..");

/// A build of ledger v2, as committed under build/v2.
const loadBuild = (name) => JSON.parse(fs.readFileSync(path.join(root, "build", "v2", `${name}.json`), "utf8"));
const guardAbi = require("../abi/FogaCellGuard.json");

/// Where each log of a v2 manifest starts, as the audit reads them (audit2.js connect).
function logStarts(m) {
  return {
    deployBlock: m.deployBlock,
    policy: m.policyDeployBlock ?? m.deployBlock,
    ledger: m.ledgerDeployBlock ?? m.deployBlock,
    tender: m.tenderDeployBlock ?? m.deployBlock,
  };
}

/// Whether a log read from `start` holds the whole history of the contract at `address`: it does
/// when `start` is block 0, when the contract had no code at the block before `start` - so that
/// everything it ever emitted is at or after `start`, however and by whom it was created - or, when
/// that block's state is not served, when `deployTx` names the transaction that created it, mined
/// at or after `start`. Two fields of a manifest that agree with each other show neither. Returns
/// `{ ok, verified, detail }`: `verified` false when the history could not be established either way.
async function historyCovered(provider, address, start, deployTx = null) {
  if (start === 0) return { ok: true, verified: true, detail: "from block 0: nothing comes before it" };
  let before;
  try { before = await provider.getCode(address, start - 1); } catch (e) { before = { error: e.shortMessage ?? e.message }; }
  if (typeof before === "string") {
    return before === "0x"
      ? { ok: true, verified: true, detail: `no code at block ${start - 1}: all of its history is at or after block ${start}` }
      : { ok: false, verified: true, detail: `it had code at block ${start - 1}: what it emitted before block ${start} would be left out` };
  }
  if (deployTx) {
    let rc = null;
    try { rc = await provider.getTransactionReceipt(deployTx); } catch { rc = null; }
    if (rc && rc.status === 1 && rc.contractAddress && ethers.getAddress(rc.contractAddress) === ethers.getAddress(address)) {
      return rc.blockNumber >= start
        ? { ok: true, verified: true, detail: `created by ${deployTx} in block ${rc.blockNumber}, at or after block ${start}` }
        : { ok: false, verified: true, detail: `created by ${deployTx} in block ${rc.blockNumber}, before block ${start}: its early history would be left out` };
    }
    return { ok: false, verified: false, detail: `not verified: the code at block ${start - 1} is not served (${before.error}), and ${deployTx} is not a successful transaction that created ${address}` };
  }
  return { ok: false, verified: false, detail: `not verified: the code at block ${start - 1} is not served (${before.error}), and no transaction that created the contract is named` };
}

/// Check a deployment of ledger v2 against its manifest at one block. `ctx` is a connection made with
/// audit2.js `connect` from the manifest itself. Returns `{ ok, checks, code, epoch, started, info,
/// pin }`: `checks` are the statements checked and whether each holds; `info` reports what is not
/// judged - who can change the policy and whether it is paused.
async function verifyDeployment(ctx, { pin = null, build = loadBuild } = {}) {
  pin = pin ?? ctx.pin ?? await g.pinBlock(ctx.provider, ctx.tag);
  const m = ctx.deployment;
  const checks = [];
  const check = (what, ok, detail) => { checks.push({ what, ok: Boolean(ok), ...(detail === undefined ? {} : { detail: String(detail) }) }); return Boolean(ok); };
  const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
  const codeAt = (address) => g.stateRead(pin, `the code at ${address}`, () => ctx.provider.getCode(address, pin.number));
  // a contract that is not what its role says does not answer these reads: that is a failed check, not
  // a failure. An endpoint that cannot serve the block is a failure, and stops the run
  const read = async (what, call) => {
    try { return await g.stateRead(pin, what, () => call(g.at(pin))); } catch (e) { if (e instanceof g.StateUnavailable) throw e; return null; }
  };

  check(`the manifest is of schema ${MANIFEST_SCHEMA}`, m.schema === MANIFEST_SCHEMA, m.schema);
  const code = {};
  for (const [role, entry] of Object.entries(m.code ?? {})) {
    const address = m.contracts?.[role];
    if (!address) { check(`${role}: the manifest records its code and names its address`, false, "no address"); continue; }
    const known = ROLES.includes(role) || GUARDS.includes(role);
    const fits = role === "SeedSource" ? SEED_SOURCES.includes(entry.contract) : entry.contract === role;
    if (!check(`${role}: a role of a v2 deployment, filled by the build it names`, known && fits, entry.contract)) continue;
    const onchain = await codeAt(address);
    const b = build(entry.contract);
    const hash = ethers.keccak256(onchain);
    code[role] = { address, contract: entry.contract, codeHash: hash };
    const sameLength = onchain.length === b.deployedBytecode.length;
    check(`${role} at ${address}: the code on chain is this repository's build of ${entry.contract} (build/v2)`,
      onchain !== "0x" && sameLength && g.maskedCode(onchain, b.immutableReferences) === g.maskedCode(b.deployedBytecode, b.immutableReferences),
      sameLength ? undefined : `code of ${(onchain.length - 2) / 2} bytes, the build has ${(b.deployedBytecode.length - 2) / 2}`);
    check(`${role}: the code hash is the one the manifest records`, eq(entry.codeHash, hash), hash);
    // where it came from: the transaction the manifest names created this contract, in the block the
    // manifest names, which is in the chain and not after the block of this check
    const rc = /^0x[0-9a-fA-F]{64}$/.test(entry.deployTx ?? "") ? await ctx.provider.getTransactionReceipt(entry.deployTx).catch(() => null) : null;
    const inChain = rc && rc.blockNumber <= pin.number ? (await ctx.provider.getBlock(rc.blockNumber).catch(() => null))?.hash === rc.blockHash : false;
    check(`${role}: its deployment transaction created it in the block the manifest names, in the chain at or before this block`,
      Boolean(rc) && rc.status === 1 && eq(rc.contractAddress, address) && rc.blockNumber === entry.block && inChain,
      rc ? `transaction ${entry.deployTx}: status ${rc.status}, contract ${rc.contractAddress}, block ${rc.blockNumber}${inChain ? "" : ", not in the chain up to this block"}`
        : `no receipt at this endpoint for ${entry.deployTx}`);
  }
  const missing = ROLES.filter((role) => !m.contracts?.[role] || !m.code?.[role]?.codeHash);
  check("the manifest names every contract of the deployment and records its code", missing.length === 0, missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`);

  // the logs. The block each contract was deployed in is exact, and held above to its transaction; a
  // log may be read from that block or from an earlier one, which only costs time, but never from a
  // later one, which would leave out its start, and never from a block after this one
  const s = logStarts(m);
  const policyBlock = m.code?.GenesisPolicyV2?.block;
  const ledgerBlock = m.code?.GenesisLedgerV2?.block;
  const block = (b) => Number.isInteger(b) && b >= 0 && b <= pin.number;
  check("the manifest names where each log starts: at or before the block its contract was deployed in, and not after this block",
    [s.deployBlock, s.policy, s.ledger, s.tender].every(block) && Number.isInteger(policyBlock) && Number.isInteger(ledgerBlock)
      && s.deployBlock <= policyBlock && s.policy <= policyBlock && s.ledger <= ledgerBlock,
    `deployBlock ${s.deployBlock}, policy ${s.policy} (deployed in ${policyBlock}), ledger ${s.ledger} (deployed in ${ledgerBlock}), tender ${s.tender}; this block ${pin.number}`);
  check("the tenders' log starts where the manifest says the ERC-8414 contract was deployed",
    m.external?.taskToken8414?.deployBlock !== undefined && s.tender === m.external.taskToken8414.deployBlock,
    `tenderDeployBlock ${s.tender}, external.taskToken8414.deployBlock ${m.external?.taskToken8414?.deployBlock}`);
  // that the two agree shows only that the manifest is consistent: the start is held to the chain
  const tenderHistory = m.external?.taskToken8414?.address && Number.isInteger(s.tender) && s.tender <= pin.number
    ? await historyCovered(ctx.provider, m.external.taskToken8414.address, s.tender, m.external.taskToken8414.deployTx ?? null)
    : { ok: false, verified: false, detail: "the manifest names no ERC-8414 contract or no start" };
  check("the tenders' log holds the ERC-8414 contract's whole history: it starts no later than the contract's first block", tenderHistory.ok, tenderHistory.detail);

  const ledgerAddress = ctx.ledger.target;
  check("the ledger is the manifest's GenesisLedgerV2", eq(m.contracts?.GenesisLedgerV2, ledgerAddress), ledgerAddress);
  check("the ledger's policy is the manifest's GenesisPolicyV2", eq(m.contracts?.GenesisPolicyV2, ctx.policy.target), ctx.policy.target);
  check("the ledger's seed source is the manifest's SeedSource", eq(m.contracts?.SeedSource, ctx.seedSource), ctx.seedSource);
  check("the ledger answers at this block as it did when the connection was made",
    eq(await read("the ledger's policy", (o) => ctx.ledger.policy(o)), ctx.policy.target) && eq(await read("the ledger's seed source", (o) => ctx.ledger.seedSource(o)), ctx.seedSource)
      && (await read("the ledger's domain", (o) => ctx.ledger.domain(o))) === ctx.domain);
  check("the policy's clock is the manifest's", m.clock !== undefined && BigInt(m.clock.genesisTime) === ctx.genesisTime && BigInt(m.clock.epochDuration) === ctx.epochDuration,
    `genesis ${ctx.genesisTime}, epochs of ${ctx.epochDuration} s`);
  if (m.contracts?.AuditV1) {
    const fn = new ethers.Contract(m.contracts.AuditV1, g.abi.audit, ctx.provider);
    check("the audit function reads this ledger", eq(await read("the audit function's ledger", (o) => fn.ledger(o)), ledgerAddress));
    check("the audit function is audit-v1", (await read("the audit function's id", (o) => fn.functionId(o))) === g.AUDIT_V1_FUNCTION_ID);
  }
  if (m.contracts?.TenderAdapter8414V2) {
    const adapter = new ethers.Contract(m.contracts.TenderAdapter8414V2, v2.abi.adapter, ctx.provider);
    const reads = await read("the adapter's tender contract", (o) => adapter.taskToken(o));
    check("the adapter reports to this ledger", eq(await read("the adapter's ledger", (o) => adapter.ledger(o)), ledgerAddress));
    check("the adapter reads the manifest's ERC-8414 contract", eq(reads, m.external?.taskToken8414?.address), reads ?? "no answer");
    check("the adapter records under g1.tender", (await read("the adapter's profile", (o) => adapter.profileKey(o))) === g.profileKey(g.PROFILE_G1_TENDER));
  }
  const external = m.external?.taskToken8414;
  if (check("the manifest records the ERC-8414 contract's code", Boolean(external?.address) && Boolean(external?.codeHash))) {
    const hash = ethers.keccak256(await codeAt(external.address));
    check("the ERC-8414 contract's code is what it was when the adapter was pointed at it", eq(hash, external.codeHash), hash);
  }

  // the profiles in force (for the epoch of the block, or for epoch 0 before the start) name these modules
  const started = pin.timestamp >= ctx.genesisTime;
  const epoch = started ? (pin.timestamp - ctx.genesisTime) / ctx.epochDuration : 0n;
  const moduleOf = async (name) => (await read(`the ${name} profile`, (o) => ctx.policy.activeProfile(g.profileKey(name), epoch, o)))?.module ?? null;
  const g0Module = await moduleOf(g.PROFILE_G0_REF);
  check(`epoch ${epoch}: the g0.ref profile's function is the manifest's AuditV1`, g0Module && eq(g0Module, m.contracts?.AuditV1), g0Module ?? "no profile in force");
  const g1Module = await moduleOf(g.PROFILE_G1_TENDER);
  check(`epoch ${epoch}: the g1.tender profile's adapter is the manifest's TenderAdapter8414V2`, g1Module && eq(g1Module, m.contracts?.TenderAdapter8414V2), g1Module ?? "no profile in force");

  // the guards: each binding the manifest records was made as it records it - by the policy's own
  // event, with the guard's code hash at the time - the guard's code is still that code, and the
  // binding in force for the epoch is still this one
  const bound = await g.logs(ctx, ctx.policy, "GuardBound", [], s.policy, pin.number);
  const recorded = new Set(Object.keys(m.guards ?? {}).map((a) => (ethers.isAddress(a) ? ethers.getAddress(a) : a)));
  // every account the policy bound a guard to is in the manifest: leaving one out does not take it out of the check
  const unrecorded = [...new Set(bound.map((ev) => ev.args.account))].filter((a) => !recorded.has(a));
  check("the manifest records the guard of every account the policy bound one to", unrecorded.length === 0,
    unrecorded.length === 0 ? `${recorded.size} account(s)` : `not recorded: ${unrecorded.join(", ")}`);
  for (const [account, rec] of Object.entries(m.guards ?? {})) {
    const events = bound.filter((ev) => ethers.isAddress(account) && ev.args.account === ethers.getAddress(account));
    const made = events.find((ev) => BigInt(ev.args.version) === BigInt(rec.bindingVersion));
    check(`${account}: the policy bound guard ${rec.guard} as binding ${rec.bindingVersion} from epoch ${rec.fromEpoch}, with the code hash the manifest records`,
      Boolean(made) && eq(made.args.guard, rec.guard) && BigInt(made.args.fromEpoch) === BigInt(rec.fromEpoch) && eq(made.args.codeHash, rec.codeHash),
      made ? `${made.args.guard} from epoch ${made.args.fromEpoch}, code hash ${made.args.codeHash}` : "no such binding in the policy's log");
    const hash = ethers.keccak256(await codeAt(rec.guard));
    check(`${account}: the guard's code is the code it had when it was bound`, eq(hash, rec.codeHash), hash);
    if (rec.contract !== undefined) check(`${account}: the guard is the manifest's ${rec.contract}`, GUARDS.includes(rec.contract) && eq(m.contracts?.[rec.contract], rec.guard));
    const inForce = [...events].reverse().find((ev) => BigInt(ev.args.fromEpoch) <= epoch);
    check(`${account}: the binding in force for epoch ${epoch} is the manifest's`, Boolean(inForce) && BigInt(inForce.args.version) === BigInt(rec.bindingVersion),
      inForce ? `binding ${inForce.args.version} (${inForce.args.guard})` : "no binding in force");
  }

  // the deployment it supersedes: on the same chain, and there - nothing of it is read or changed
  if (m.supersedes !== undefined) {
    const sup = m.supersedes;
    const there = sup.ledger ? await codeAt(sup.ledger) : "0x";
    check(`it supersedes ${sup.name}: a ledger on the same chain, which is another ledger and has its code`,
      Number(sup.chainId) === Number(m.chainId) && Boolean(sup.ledger) && !eq(sup.ledger, ledgerAddress) && there !== "0x" && /^[0-9a-f]{64}$/.test(sup.manifestSha256 ?? ""),
      `${sup.ledger} on chain ${sup.chainId}; the SHA-256 of its manifest is a commitment, not checked against that file here`);
  }

  const info = { steward: await read("the steward", (o) => ctx.policy.steward(o)), paused: await read("the pause", (o) => ctx.policy.paused(o)) };
  await g.recheck(ctx.provider, pin);
  return { ok: checks.every((x) => x.ok), checks, code, epoch, started, info, pin };
}

/// What the guard of a contract account would answer now for each of the two delegated operations,
/// and why, read from the account's public views as FogaCellGuard reads them. Read-only.
async function cellGuardReading(provider, account, { blockTag = "latest", pin = null } = {}) {
  const views = new ethers.Contract(account, [
    "function ACCOUNT_VERSION() view returns (uint8)",
    "function presentedBindings() view returns (bytes32[])",
    "function status() view returns (uint8 verdict, uint8[] reasons, uint8[] restrictions)",
    "function aid() view returns (address)",
    "function requirement() view returns ((uint8 combinator, uint16 k, (address specRegistry, bytes32 specId, uint32[] versions, address adopter, bytes32 subjectKey, bytes32 scopeKey, uint16 enforcement, (address account, uint8 rights)[] interveners)[] clauses))",
  ], provider);
  // given a pinned block (genesis.js pinBlock), every call is made at it, and a call the endpoint
  // could not serve stops the reading with StateUnavailable; a contract's own answer is a reading
  const served = (what, call) => (pin ? g.stateRead(pin, what, call) : call());
  const attempt = async (what, call) => {
    try { return { value: await served(what, call) }; } catch (e) { if (e instanceof g.StateUnavailable) throw e; return { error: e.shortMessage ?? e.message }; }
  };
  const o = { blockTag: pin ? pin.number : blockTag };
  const out = { account, code: (await served(`the code at ${account}`, () => provider.getCode(account, o.blockTag))) !== "0x" };
  const version = await attempt(`the account version of ${account}`, () => views.ACCOUNT_VERSION(o));
  const bindings = await attempt(`the bindings ${account} presents`, () => views.presentedBindings(o));
  const requirement = await attempt(`the requirement of ${account}`, () => views.requirement(o));
  const status = await attempt(`the registry status of ${account}`, () => views.status(o));
  const aid = await attempt(`the AID registry ${account} names`, () => views.aid(o));
  out.accountVersion = version.value === undefined ? null : Number(version.value);
  out.presentedBindings = bindings.value === undefined ? null : bindings.value.length;
  out.clauses = requirement.value === undefined ? null : requirement.value.clauses.length;
  out.verdict = status.value === undefined ? null : Number(status.value.verdict);
  out.aid = aid.value === undefined ? null : aid.value;
  out.aidReadable = aid.value !== undefined;
  out.aidState = null;
  if (out.aid && out.aid !== ethers.ZeroAddress) {
    const registry = new ethers.Contract(out.aid, ["function state(address) view returns (uint8)"], provider);
    const st = await attempt(`the state of ${account} in its AID registry`, () => registry.state(account, o));
    out.aidState = st.value === undefined ? null : Number(st.value);
  }
  const why = [];
  if (!out.code) why.push("the address has no code");
  if (out.accountVersion !== 3) why.push(`account revision ${out.accountVersion ?? "unreadable"}, the guard is written for 3`);
  if (out.presentedBindings === null || out.clauses === null || out.presentedBindings !== out.clauses) why.push(`${out.presentedBindings ?? "unreadable"} bindings presented for ${out.clauses ?? "unreadable"} clauses`);
  if (out.verdict !== 1) why.push(`the registry's verdict is ${["unknown", "satisfied", "not satisfied"][out.verdict] ?? "unreadable"}`);
  // an account that does not answer which AID registry it names is not one that names none: the guard
  // asks the same question, and a call that fails is a refusal
  if (!out.aidReadable) why.push(`the AID registry it names could not be read (${aid.error})`);
  if (out.aid && out.aid !== ethers.ZeroAddress && out.aidState !== 1) why.push(`the anchor is ${["dormant", "active", "stale", "retired"][out.aidState] ?? "unreadable"} in its AID registry`);
  out.allows = why.length === 0;
  out.reasons = why;
  return out;
}

module.exports = { MANIFEST_SCHEMA, ROLES, SEED_SOURCES, GUARDS, loadBuild, guardAbi, logStarts, historyCovered, verifyDeployment, cellGuardReading };
