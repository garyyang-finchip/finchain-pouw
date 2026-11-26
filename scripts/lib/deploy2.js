// Deploying ledger v2: one sequence for every chain, driven by a configuration file and done from
// the committed builds of build/v2, so that a host needs no compiler (docs/ledger-v2.md 1 and 16).
// The rehearsal on a development network and a public deployment go through this same code. The
// kernel's deployment (deploy.js) is not changed by it, and a v2 deployment changes nothing of the
// deployment it supersedes: it names it.
"use strict";

const { ethers } = require("ethers");
const g = require("../../client/lib/genesis");
const v2 = require("../../client/lib/ledger2");
const a2 = require("../../client/lib/audit2");
const m2 = require("../../client/lib/manifest2");
const c = require("./common");

const CONFIG_SCHEMA = "finchain-pouw.deploy-config/2";
const RECORD_SCHEMA = "finchain-pouw.deployment-record/2";
const L1_BLOCK_PREDEPLOY = "0x4200000000000000000000000000000000000015";
// the modules this version deploys, by the profile each one serves
const MODULES = { [g.PROFILE_G0_REF]: "AuditV1", [g.PROFILE_G1_TENDER]: "TenderAdapter8414V2" };
const POOLS = { g0: v2.POOL_G0, g1: v2.POOL_G1 };
const NONE = ethers.ZeroHash;
// gas, as measured on a development network (test/v2.deploy.test.js holds the measurement to these)
const GAS = { contracts: 9_600_000n, guard: 620_000n, profile: 220_000n, params: 100_000n, party: 55_000n, binding: 110_000n, transfer: 25_000n };

/// A parameter version of the configuration as the contract takes it.
function paramsStruct(p) {
  return {
    activeFromEpoch: p.activeFromEpoch,
    budgetBase: ethers.parseUnits(String(p.budgetPoints), 18),
    halvingInterval: p.halvingInterval,
    splitG0Bps: p.splitG0Bps,
    workerCapBps: p.workerCapBps,
    operatorCapBps: p.operatorCapBps,
    minBountyWei: ethers.parseEther(String(p.minBountyEth)),
    maxSubsidizedPerDemander: p.maxSubsidizedPerDemander,
    maxSubsidizedPerPair: p.maxSubsidizedPerPair,
    subsidizeDeclaredRelated: Boolean(p.subsidizeDeclaredRelated),
  };
}

const modeOf = (p) => (p.subsidizeDeclaredRelated ? "controlled-self-test" : "standard");

// What the built-in modules can do, which a configuration cannot change: AuditV1 is a G0 function
// with one job, job 0; the tender adapter reports to G1 and shows no task unit. Both profiles are of
// the role the frozen types give the two profiles of 0.1.3, unclassified.
const BUILT_IN = {
  [g.PROFILE_G0_REF]: { pool: v2.POOL_G0, jobsPerEpoch: 1, what: "AuditV1 is a G0 function with one job" },
  [g.PROFILE_G1_TENDER]: { pool: v2.POOL_G1, jobsPerEpoch: 0, what: "the tender adapter reports to G1 and has no jobs" },
};
const PARAM_FIELDS = ["activeFromEpoch", "budgetPoints", "halvingInterval", "splitG0Bps", "workerCapBps", "operatorCapBps", "minBountyEth",
  "maxSubsidizedPerDemander", "maxSubsidizedPerPair", "subsidizeDeclaredRelated"];
const PROFILE_FIELDS = ["name", "pool", "baseGmu", "maxGmuPerWorkerPerEpoch", "jobsPerEpoch", "activeFromEpoch", "role", "countsUnits", "unitSetRoot", "issuerSetRoot"];
const isUint = (x, bits) => Number.isSafeInteger(x) && x >= 0 && BigInt(x) < (1n << BigInt(bits));
const isDecimal = (x) => (typeof x === "string" && /^\d+(\.\d+)?$/.test(x)) || (typeof x === "number" && Number.isFinite(x) && x >= 0);

/// The parameter versions and the profiles of a configuration, each field held to its type, its width
/// and the policy's own rules, and the profiles to what the built-in modules can do - all before a
/// transaction is sent (GenesisPolicyV2: registerParams, registerProfile). Nothing is converted: a
/// boolean is true or false, never the string "false".
function checkConfiguration(config, fail) {
  if (typeof config.name !== "string" || config.name === "") fail("the configuration names no deployment");
  if (!isUint(config.epochDuration, 64) || config.epochDuration === 0) fail("epochDuration must be a positive whole number of seconds");
  const params = config.params ?? [];
  if (!Array.isArray(params) || params.length === 0) fail("the configuration has no parameter version");
  params.forEach((p, i) => {
    const at = `parameter version ${i + 1}`;
    if (p === null || typeof p !== "object" || Array.isArray(p)) fail(`${at} is not an object`);
    for (const k of Object.keys(p)) if (!PARAM_FIELDS.includes(k)) fail(`${at} has a field ${k} that a parameter version does not have`);
    for (const k of PARAM_FIELDS) if (p[k] === undefined) fail(`${at} lacks ${k}`);
    if (!isUint(p.activeFromEpoch, 64)) fail(`${at}: activeFromEpoch must be a whole epoch number`);
    if (!isDecimal(p.budgetPoints) || !isDecimal(p.minBountyEth)) fail(`${at}: budgetPoints and minBountyEth must be decimal amounts`);
    for (const [k, bits] of [["halvingInterval", 32], ["maxSubsidizedPerDemander", 32], ["maxSubsidizedPerPair", 32]]) {
      if (!isUint(p[k], bits)) fail(`${at}: ${k} must be a whole number below 2^${bits}`);
    }
    if (!isUint(p.splitG0Bps, 16) || p.splitG0Bps > 10000) fail(`${at}: splitG0Bps must be basis points, 0 to 10000`);
    for (const k of ["workerCapBps", "operatorCapBps"]) if (!isUint(p[k], 16) || p[k] === 0 || p[k] > 10000) fail(`${at}: ${k} must be basis points, 1 to 10000`);
    if (typeof p.subsidizeDeclaredRelated !== "boolean") fail(`${at}: subsidizeDeclaredRelated must be true or false, not ${JSON.stringify(p.subsidizeDeclaredRelated)}`);
    const q = paramsStruct(p);
    if (q.budgetBase >= 1n << 128n || q.minBountyWei >= 1n << 128n) fail(`${at}: an amount does not fit 128 bits`);
    if (i === 0 && p.activeFromEpoch !== 0) fail("the first parameter version must apply from epoch 0");
    if (i > 0 && !(p.activeFromEpoch > params[i - 1].activeFromEpoch)) fail("parameter versions must apply from increasing epochs");
  });

  const profiles = config.profiles ?? [];
  if (!Array.isArray(profiles)) fail("the profiles are not a list");
  const names = new Set();
  const out = profiles.map((f) => {
    if (f === null || typeof f !== "object" || Array.isArray(f)) fail("a profile is not an object");
    for (const k of Object.keys(f)) if (!PROFILE_FIELDS.includes(k)) fail(`the profile ${f.name} has a field ${k} that a profile does not have`);
    if (!MODULES[f.name]) fail(`this version deploys the modules of ${Object.keys(MODULES).join(" and ")} only; ${f.name} is neither`);
    if (names.has(f.name)) fail(`the profile ${f.name} is listed twice`);
    names.add(f.name);
    const p = {
      ...f, pool: POOLS[f.pool], jobsPerEpoch: f.jobsPerEpoch ?? 0, activeFromEpoch: f.activeFromEpoch ?? 0, role: f.role ?? v2.ROLE.UNCLASSIFIED,
      countsUnits: f.countsUnits ?? false, unitSetRoot: f.unitSetRoot ?? NONE, issuerSetRoot: f.issuerSetRoot ?? NONE,
    };
    if (p.pool === undefined) fail(`the pool of ${f.name} must be g0 or g1, not ${JSON.stringify(f.pool)}`);
    if (!isUint(p.baseGmu, 64) || p.baseGmu === 0 || !isUint(p.maxGmuPerWorkerPerEpoch, 64) || p.maxGmuPerWorkerPerEpoch < p.baseGmu) {
      fail(`${f.name}: baseGmu must be positive and the per-worker cap at least one unit, both whole numbers below 2^64`);
    }
    if (!isUint(p.jobsPerEpoch, 32)) fail(`${f.name}: jobsPerEpoch must be a whole number below 2^32`);
    if (p.activeFromEpoch !== 0) fail(`${f.name}: a profile of a new deployment applies from epoch 0`);
    if (typeof p.countsUnits !== "boolean") fail(`${f.name}: countsUnits must be true or false`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(p.unitSetRoot) || !/^0x[0-9a-fA-F]{64}$/.test(p.issuerSetRoot)) fail(`${f.name}: unitSetRoot and issuerSetRoot are 32-byte values`);
    const b = BUILT_IN[f.name];
    if (p.pool !== b.pool || p.jobsPerEpoch !== b.jobsPerEpoch) {
      fail(`${f.name}: ${b.what}; its profile must be of pool ${b.pool === v2.POOL_G0 ? "g0" : "g1"} with jobsPerEpoch ${b.jobsPerEpoch}, not pool ${f.pool} with ${p.jobsPerEpoch}`);
    }
    if (p.role !== v2.ROLE.UNCLASSIFIED) fail(`${f.name}: the built-in profiles are of role ${v2.ROLE.UNCLASSIFIED} (unclassified), not ${JSON.stringify(f.role)}`);
    if (p.countsUnits || p.unitSetRoot !== NONE || p.issuerSetRoot !== NONE) fail(`${f.name}: the built-in modules show no task unit; the profile counts none and commits to no set`);
    return p;
  });
  for (const name of Object.keys(MODULES)) if (!names.has(name)) fail(`the configuration has no ${name} profile`);

  // every parameter version and every profile as the policy will be sent them: what the ABI cannot
  // carry is found here, and not after the first transactions
  const policy = new ethers.Interface(m2.loadBuild("GenesisPolicyV2").abi);
  for (const [i, p] of params.entries()) {
    try { policy.encodeFunctionData("registerParams", [paramsStruct(p)]); } catch (e) { fail(`parameter version ${i + 1} cannot be encoded: ${e.shortMessage ?? e.message}`); }
  }
  for (const p of out) {
    try { policy.encodeFunctionData("registerProfile", [profileSpec(p, ethers.ZeroAddress.replace(/0$/, "1"))]); } catch (e) { fail(`the profile ${p.name} cannot be encoded: ${e.shortMessage ?? e.message}`); }
  }
  return { params, profiles: out };
}

/// A profile of the configuration as the policy takes it, once its module's address is known.
function profileSpec(f, module) {
  return {
    name: f.name, pool: f.pool, module, baseGmu: f.baseGmu, maxGmuPerWorkerPerEpoch: f.maxGmuPerWorkerPerEpoch, jobsPerEpoch: f.jobsPerEpoch,
    activeFromEpoch: f.activeFromEpoch, role: f.role, countsUnits: f.countsUnits, unitSetRoot: f.unitSetRoot, issuerSetRoot: f.issuerSetRoot,
  };
}

/// Everything that can be found wrong before a transaction is sent. Returns the plan to carry out.
///   supersedes - `{ manifest, sha256 }`: the manifest of the deployment this one supersedes, as read
///                from its file, and the SHA-256 of that file
async function plan({ config, provider, stewardAddress, genesisTime, parties, supersedes = null, minLeadSeconds = 600 }) {
  const fail = (m) => { throw new Error(`deployment refused: ${m}`); };
  if (config.schema !== CONFIG_SCHEMA) fail(`the configuration's schema is ${config.schema}, expected ${CONFIG_SCHEMA}`);
  const { chainId } = await provider.getNetwork();
  if (BigInt(config.chainId) !== chainId) fail(`the configuration is for chain ${config.chainId}; the endpoint answers for chain ${chainId}`);
  const latest = await provider.getBlock("latest");
  if (BigInt(genesisTime) < BigInt(latest.timestamp) + BigInt(minLeadSeconds)) {
    fail(`genesis ${c.iso(genesisTime)} is less than ${minLeadSeconds} s after the latest block (${c.iso(latest.timestamp)}): the profiles, the parties and the guards must be registered before it`);
  }
  const { params, profiles } = checkConfiguration(config, fail);

  if (!m2.SEED_SOURCES.includes(config.seedSource)) fail(`unknown seed source ${config.seedSource}`);
  if (config.seedSource === "L1BlockSeedSource" && (await provider.getCode(L1_BLOCK_PREDEPLOY)) === "0x") {
    fail(`this chain has no L1Block predeploy at ${L1_BLOCK_PREDEPLOY}: it is not an OP Stack chain; use PrevBlockSeedSource`);
  }
  const taskToken = ethers.getAddress(config.taskToken8414?.address ?? ethers.ZeroAddress);
  if ((await provider.getCode(taskToken)) === "0x") fail(`no contract at the ERC-8414 address ${taskToken}`);
  const tokenBlock = config.taskToken8414.deployBlock;
  if (!(Number.isInteger(tokenBlock) && tokenBlock >= 0 && tokenBlock <= latest.number)) {
    fail("taskToken8414.deployBlock must be the block the ERC-8414 contract was deployed in: the audit reads the tenders' log from it");
  }

  const seen = new Set();
  let funding = 0n;
  const list = [];
  for (const q of parties) {
    if (q.admitted !== undefined && typeof q.admitted !== "boolean") fail(`the admission of ${q.address} must be true or false, not ${JSON.stringify(q.admitted)}`);
    if (q.fundEth !== undefined && !isDecimal(q.fundEth)) fail(`the funds for ${q.address} must be a decimal amount`);
    const p = { ...q, address: ethers.getAddress(q.address), admitted: q.admitted === true, operator: q.operator ?? 0, guard: q.guard ?? null };
    if (seen.has(p.address)) fail(`${p.address} is listed twice`);
    seen.add(p.address);
    if (!(Number.isInteger(p.operator) && p.operator >= 0 && p.operator < 2 ** 32)) fail(`the operator of ${p.address} must be a 32-bit number`);
    p.hasCode = (await provider.getCode(p.address)) !== "0x";
    if (p.guard !== null) {
      if (!p.hasCode) fail(`${p.address} has no code: an account without code needs no guard, and a permit of it that names one is refused`);
      if (!m2.GUARDS.includes(p.guard)) {
        if (!ethers.isAddress(p.guard)) fail(`the guard of ${p.address} is ${p.guard}: name ${m2.GUARDS.join(" or ")}, or the address of a guard contract`);
        p.guard = ethers.getAddress(p.guard);
        if ((await provider.getCode(p.guard)) === "0x") fail(`no contract at the guard address ${p.guard}`);
      }
    }
    if (p.fundEth) funding += ethers.parseEther(String(p.fundEth));
    list.push(p);
  }
  const deploysGuard = list.some((p) => p.guard === "FogaCellGuard");
  // what the cell guard would answer now, for each account that is to be bound to it: a reading, not a condition
  const cells = [];
  for (const p of list.filter((q) => q.guard === "FogaCellGuard")) cells.push(await m2.cellGuardReading(provider, p.address));

  let superseded = null;
  if (supersedes !== null) {
    const m = supersedes.manifest;
    const ledger = m?.contracts?.GenesisLedgerV2 ?? m?.contracts?.GenesisLedger;
    if (!m || !ledger || !m.name) fail("the manifest of the deployment to supersede names no deployment and no ledger");
    if (BigInt(m.chainId) !== chainId) fail(`the deployment to supersede, ${m.name}, is on chain ${m.chainId}: a deployment supersedes one on its own chain`);
    if (m.name === config.name) fail(`the deployment to supersede has this deployment's name, ${m.name}`);
    if (!/^[0-9a-f]{64}$/.test(supersedes.sha256 ?? "")) fail("the SHA-256 of the superseded manifest's file is needed");
    if ((await provider.getCode(ledger)) === "0x") fail(`no contract at ${ledger}, the ledger of ${m.name}`);
    superseded = { name: m.name, chainId: Number(m.chainId), ledger: ethers.getAddress(ledger), manifestSha256: supersedes.sha256 };
  }

  const bindings = list.filter((p) => p.guard !== null).length;
  const gas = GAS.contracts + (deploysGuard ? GAS.guard : 0n) + GAS.profile * BigInt(profiles.length) + GAS.params * BigInt(params.length - 1)
    + GAS.party * BigInt(list.filter((p) => p.admitted).length + list.filter((p) => p.operator).length) + GAS.binding * BigInt(bindings)
    + GAS.transfer * BigInt(list.filter((p) => p.fundEth).length);
  const fees = await provider.getFeeData();
  const gasCost = gas * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n);
  const balance = await provider.getBalance(stewardAddress);
  if (balance < funding + gasCost) {
    fail(`the steward ${stewardAddress} holds ${ethers.formatEther(balance)}; the parties are to be sent ${ethers.formatEther(funding)} and the gas is about ${ethers.formatEther(gasCost)} at the endpoint's present price`);
  }

  // the first transaction of the sequence, estimated: a constructor that would revert is found here
  const policyBuild = m2.loadBuild("GenesisPolicyV2");
  const creation = await new ethers.ContractFactory(policyBuild.abi, policyBuild.bytecode)
    .getDeployTransaction(stewardAddress, BigInt(genesisTime), BigInt(config.epochDuration), paramsStruct(params[0]));
  try { await provider.estimateGas({ ...creation, from: stewardAddress }); } catch (e) {
    fail(`the policy's constructor would revert with these values (${g.refusal(e)?.name ?? e.shortMessage ?? e.message})`);
  }
  return {
    chainId, steward: stewardAddress, stewardBalance: balance, genesisTime: BigInt(genesisTime), epochDuration: BigInt(config.epochDuration),
    latestBlock: { number: latest.number, timestamp: latest.timestamp }, params, profiles, parties: list, funding, taskToken, tokenBlock,
    deploysGuard, cells, supersedes: superseded, gas, gasCost,
    transactions: 5 + (deploysGuard ? 1 : 0) + profiles.length + (params.length - 1) + list.filter((p) => p.admitted).length
      + list.filter((p) => p.operator).length + bindings + list.filter((p) => p.fundEth).length,
  };
}

/// The plan as text, for the person who is about to approve it.
function planText(config, p) {
  const lines = [
    `${config.name} (${[config.environment, ...(config.labels ?? [])].join(", ")}) on chain ${p.chainId}: ledger v2, from build/v2`,
    `  steward   ${p.steward}  balance ${ethers.formatEther(p.stewardBalance)}`,
    `  genesis   ${c.iso(p.genesisTime)}  (${p.genesisTime - BigInt(p.latestBlock.timestamp)} s after the latest block)`,
    `  epochs    ${p.epochDuration} s each: epoch 0 ends ${c.iso(p.genesisTime + p.epochDuration)}, epoch 1 ends ${c.iso(p.genesisTime + 2n * p.epochDuration)}`,
    `  seed      ${config.seedSource} (v2's own copy)`,
    `  tenders   ERC-8414 contract ${p.taskToken}, its log read from block ${p.tokenBlock}`,
    p.supersedes ? `  replaces  ${p.supersedes.name}, ledger ${p.supersedes.ledger}: named in the manifest, nothing of it is read or changed`
      : "  replaces  nothing: the manifest names no deployment it supersedes",
  ];
  for (const v of p.params) {
    lines.push(`  from epoch ${v.activeFromEpoch}: ${modeOf(v)}; budget ${v.budgetPoints} test points, G0 ${v.splitG0Bps / 100}% / G1 ${(10000 - v.splitG0Bps) / 100}%, `
      + `share cap ${v.workerCapBps / 100}% per address and ${v.operatorCapBps / 100}% per operator, least bounty ${v.minBountyEth}, `
      + `at most ${v.maxSubsidizedPerDemander} per demander and ${v.maxSubsidizedPerPair} per pair`);
  }
  for (const f of p.profiles) lines.push(`  profile   ${f.name}: ${f.baseGmu} GMU a unit, at most ${f.maxGmuPerWorkerPerEpoch} GMU per worker and epoch (${MODULES[f.name]})`);
  for (const q of p.parties) {
    const guard = q.guard === null ? (q.hasCode ? ", contract account without a guard: no delegated entry" : "") : `, guard ${q.guard}`;
    lines.push(`  party     ${q.address}${q.name ? ` (${q.name})` : ""}: ${q.admitted ? "admitted" : "not admitted"}, operator ${q.operator || "undeclared"}${guard}${q.fundEth ? `, funded with ${q.fundEth}` : ""}`);
  }
  for (const cell of p.cells) {
    lines.push(`  cell      ${cell.account}: the cell guard would ${cell.allows ? "allow it now" : `refuse it now (${cell.reasons.join("; ")})`}`);
  }
  lines.push(`  ${p.transactions} transactions; ${ethers.formatEther(p.funding)} goes to the parties; gas about ${p.gas}, which is at most ${ethers.formatEther(p.gasCost)} at the endpoint's present price`
    + " (a rollup's data fee comes on top)");
  return lines.join("\n");
}

/// Deploy, register, read back. Returns the manifest and the deployment record. Every transaction is
/// written down the moment the endpoint has taken it - what it is for, its hash, sender and nonce -
/// and its outcome after it: confirmed, failed, or unknown when the answer was lost. `journal(event)`
/// is told each of these as it happens, so that a caller can keep them where a crash does not reach.
/// When something fails on the way, the error carries every transaction with its state (`e.partial`).
async function deployV2({ config, steward, genesisTime, parties, supersedes = null, log = () => {}, journal = () => {}, minLeadSeconds = 600, rpc = "" }) {
  const provider = steward.provider;
  const stewardAddress = await steward.getAddress();
  const p = await plan({ config, provider, stewardAddress, genesisTime, parties, supersedes, minLeadSeconds });
  const transactions = [];
  try {
    const track = async (step, tx, extra = {}) => {
      const entry = { step, txHash: tx.hash, from: tx.from, nonce: tx.nonce, status: "submitted", ...extra };
      transactions.push(entry);
      journal({ event: "submitted", ...entry });
      let rc;
      try { rc = await tx.wait(); } catch (e) {
        if (e.receipt) Object.assign(entry, { status: "failed", block: e.receipt.blockNumber, gasUsed: e.receipt.gasUsed });
        else Object.assign(entry, { status: "unknown", error: e.shortMessage ?? e.message });
        journal({ event: entry.status, ...entry });
        throw e;
      }
      Object.assign(entry, { status: "confirmed", block: rc.blockNumber, gasUsed: rc.gasUsed });
      journal({ event: "confirmed", ...entry });
      log(step);
      return rc;
    };
    const done = async (step, txPromise) => track(step, await txPromise);
    const deployed = {};
    const deploy = async (role, buildName, args) => {
      const build = m2.loadBuild(buildName);
      const contract = await new ethers.ContractFactory(build.abi, build.bytecode, steward).deploy(...args);
      const address = await contract.getAddress();
      const rc = await track(`deploy ${buildName}`, contract.deploymentTransaction(), { address });
      deployed[role] = { contract: buildName, address, deployTx: rc.hash, block: rc.blockNumber, codeHash: await g.codeHashOf(provider, address) };
      log(`deployed ${buildName} at ${address}`);
      return contract;
    };

    const policy = await deploy("GenesisPolicyV2", "GenesisPolicyV2", [stewardAddress, p.genesisTime, p.epochDuration, paramsStruct(p.params[0])]);
    await deploy("SeedSource", config.seedSource, []);
    await deploy("GenesisLedgerV2", "GenesisLedgerV2", [deployed.GenesisPolicyV2.address, deployed.SeedSource.address]);
    await deploy("AuditV1", "AuditV1", [deployed.GenesisLedgerV2.address]);
    await deploy("TenderAdapter8414V2", "TenderAdapter8414V2", [deployed.GenesisLedgerV2.address, p.taskToken, g.PROFILE_G1_TENDER]);
    if (p.deploysGuard) await deploy("FogaCellGuard", "FogaCellGuard", []);

    for (const f of p.profiles) {
      await done(`profile ${f.name}: ${f.baseGmu} GMU a unit, at most ${f.maxGmuPerWorkerPerEpoch} per worker and epoch, from epoch ${f.activeFromEpoch}`,
        policy.registerProfile(profileSpec(f, deployed[MODULES[f.name]].address)));
    }
    for (const v of p.params.slice(1)) await done(`parameters from epoch ${v.activeFromEpoch}: ${modeOf(v)}`, policy.registerParams(paramsStruct(v)));
    const guards = {};
    for (const q of p.parties) {
      if (q.admitted) await done(`admit ${q.address}`, policy.setAdmission(q.address, true));
      if (q.operator) await done(`declare ${q.address} under operator ${q.operator}`, policy.declareOperator(q.address, q.operator));
      if (q.guard !== null) {
        const guard = q.guard === "FogaCellGuard" ? deployed.FogaCellGuard.address : q.guard;
        const rc = await done(`bind guard ${q.guard} to ${q.address}`, policy.bindGuard(q.address, guard));
        const ev = rc.logs.map((l) => { try { return policy.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "GuardBound");
        guards[q.address] = { guard: ev.args.guard, ...(q.guard === "FogaCellGuard" ? { contract: "FogaCellGuard" } : {}),
          codeHash: ev.args.codeHash, bindingVersion: Number(ev.args.version), fromEpoch: Number(ev.args.fromEpoch) };
      }
    }
    for (const q of p.parties) {
      if (q.fundEth) await done(`fund ${q.address} with ${q.fundEth}`, steward.sendTransaction({ to: q.address, value: ethers.parseEther(String(q.fundEth)) }));
    }

    // everything had to land before genesis, or it does not apply to epoch 0
    const after = await provider.getBlock("latest");
    if (BigInt(after.timestamp) >= p.genesisTime) {
      throw new Error(`the registrations ended at ${c.iso(after.timestamp)}, after genesis ${c.iso(p.genesisTime)}: this deployment does not run as planned. Every transaction is confirmed and listed; a new deployment needs a later genesis, and a configuration that does not fund again the parties funded here`);
    }

    const manifest = {
      schema: m2.MANIFEST_SCHEMA,
      name: config.name,
      environment: config.environment,
      ...(config.labels ? { labels: config.labels } : {}),
      chainId: Number(p.chainId),
      ...(config.rpc ? { rpc: config.rpc } : {}),
      ...(config.logChunk ? { logChunk: config.logChunk } : {}),
      deployBlock: deployed.GenesisPolicyV2.block,
      policyDeployBlock: deployed.GenesisPolicyV2.block,
      ledgerDeployBlock: deployed.GenesisLedgerV2.block,
      tenderDeployBlock: p.tokenBlock,
      protocol: c.version(),
      contracts: Object.fromEntries(Object.entries(deployed).map(([role, d]) => [role, d.address])),
      code: Object.fromEntries(Object.entries(deployed).map(([role, d]) => [role, { contract: d.contract, codeHash: d.codeHash, deployTx: d.deployTx, block: d.block }])),
      external: { taskToken8414: { address: p.taskToken, deployBlock: p.tokenBlock, codeHash: await g.codeHashOf(provider, p.taskToken) } },
      guards,
      ...(p.supersedes ? { supersedes: p.supersedes } : {}),
      clock: { genesisTime: Number(p.genesisTime), epochDuration: Number(p.epochDuration) },
    };

    // read back: the code against the builds, the wiring, the guards, and the policy as an auditor will replay it
    const ctx = await a2.connect(manifest, provider, { tag: "latest" });
    const check = await m2.verifyDeployment(ctx);
    const head = (await provider.getBlock("latest")).number;
    const readBack = [];
    for (const v of p.params) {
      const pol = await a2.policyAt(ctx, v.activeFromEpoch, head);
      const want = a2.plainParams(paramsStruct(v));
      readBack.push({ what: `the parameters of epoch ${v.activeFromEpoch} are the configuration's (${modeOf(v)})`,
        ok: Boolean(pol.params) && Object.keys(want).every((k) => pol.params[k] === want[k]) });
    }
    const pol0 = await a2.policyAt(ctx, 0, head);
    for (const f of p.profiles) {
      const got = pol0.profiles.get(g.profileKey(f.name));
      readBack.push({ what: `the ${f.name} profile of epoch 0 is the configuration's`,
        ok: Boolean(got) && got.pool === f.pool && got.baseGmu === BigInt(f.baseGmu) && got.maxGmuPerWorkerPerEpoch === BigInt(f.maxGmuPerWorkerPerEpoch)
          && got.jobsPerEpoch === f.jobsPerEpoch && got.module === deployed[MODULES[f.name]].address && got.role === f.role
          && got.countsUnits === f.countsUnits && got.unitSetRoot === f.unitSetRoot && got.issuerSetRoot === f.issuerSetRoot });
    }
    for (const q of p.parties) {
      const bound = pol0.guardOf(q.address);
      const want = guards[q.address];
      readBack.push({ what: `${q.address}: ${q.admitted ? "admitted" : "not admitted"}, operator ${q.operator || "undeclared"}, ${want ? `guard ${want.guard}` : "no guard"}, from epoch 0`,
        ok: pol0.isAdmitted(q.address) === q.admitted && pol0.operatorOf(q.address) === q.operator
          && (want ? Boolean(bound) && bound.guard === want.guard && bound.version === BigInt(want.bindingVersion) && bound.codeHash === want.codeHash : bound === null) });
    }
    const ok = check.ok && readBack.every((r) => r.ok);
    log(`read back: ${ok ? "everything is as configured" : "DIFFERENCES - see the record"}`);

    const builds = [...new Set(Object.values(deployed).map((d) => d.contract))].sort();
    const record = g.jsonable({
      schema: RECORD_SCHEMA,
      environment: config.environment,
      labels: config.labels ?? [],
      deployment: config.name,
      chainId: p.chainId,
      endpointHost: c.endpointHost(rpc),
      recordedAt: new Date().toISOString(),
      ok,
      steward: stewardAddress,
      client: { name: "finchain-pouw", version: c.version() },
      host: c.hostInfo(),
      builds: Object.fromEntries([...builds.map((n) => `build/v2/${n}.json`), "build/v2/build-record.json"].map((f) => [f, c.sha256File(f)])),
      clock: { genesisTime: p.genesisTime, genesis: c.iso(p.genesisTime), epochDuration: p.epochDuration },
      parameters: p.params.map((v) => ({ ...v, mode: modeOf(v) })),
      profiles: p.profiles.map((f) => ({ ...f, module: deployed[MODULES[f.name]].address })),
      parties: p.parties.map(({ hasCode, ...q }) => ({ ...q, contractAccount: hasCode })),
      cells: p.cells,
      ...(p.supersedes ? { supersedes: p.supersedes } : {}),
      transactions,
      gasUsed: transactions.reduce((a, t) => a + t.gasUsed, 0n),
      verification: { deployment: check.checks, policy: readBack },
      manifest,
      ...(config.notes ? { notes: config.notes } : {}),
    });
    return { manifest, record, ok };
  } catch (e) {
    const by = (state) => transactions.filter((t) => t.status === state).length;
    e.partial = g.jsonable({
      deployment: config.name, chainId: p.chainId, steward: stewardAddress, failedAt: new Date().toISOString(), error: e.shortMessage ?? e.message,
      counts: { confirmed: by("confirmed"), failed: by("failed"), unknown: by("unknown"), submitted: by("submitted") }, transactions,
    });
    throw e;
  }
}

module.exports = { CONFIG_SCHEMA, RECORD_SCHEMA, L1_BLOCK_PREDEPLOY, MODULES, GAS, paramsStruct, profileSpec, modeOf, plan, planText, deployV2 };
