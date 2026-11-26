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
const bps = (x) => Number.isInteger(x) && x > 0 && x <= 10000;

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
  if (!(Number.isInteger(config.epochDuration) && config.epochDuration > 0)) fail("epochDuration must be a positive number of seconds");

  const params = config.params ?? [];
  if (params.length === 0 || params[0].activeFromEpoch !== 0) fail("the first parameter version must apply from epoch 0");
  for (let i = 1; i < params.length; i++) if (!(params[i].activeFromEpoch > params[i - 1].activeFromEpoch)) fail("parameter versions must apply from increasing epochs");
  for (const p of params) {
    if (!(Number.isInteger(p.splitG0Bps) && p.splitG0Bps >= 0 && p.splitG0Bps <= 10000) || !bps(p.workerCapBps) || !bps(p.operatorCapBps)) {
      fail("splitG0Bps, workerCapBps and operatorCapBps must be basis points");
    }
    paramsStruct(p);
  }

  const profiles = (config.profiles ?? []).map((p) => ({
    ...p, pool: POOLS[p.pool] ?? p.pool, jobsPerEpoch: p.jobsPerEpoch ?? 0, activeFromEpoch: p.activeFromEpoch ?? 0,
    role: p.role ?? 0, countsUnits: Boolean(p.countsUnits), unitSetRoot: p.unitSetRoot ?? NONE, issuerSetRoot: p.issuerSetRoot ?? NONE,
  }));
  for (const name of Object.keys(MODULES)) if (!profiles.some((p) => p.name === name)) fail(`the configuration has no ${name} profile`);
  const names = new Set();
  for (const p of profiles) {
    if (!MODULES[p.name]) fail(`this version deploys the modules of ${Object.keys(MODULES).join(" and ")} only; ${p.name} is neither`);
    if (names.has(p.name)) fail(`the profile ${p.name} is listed twice`);
    names.add(p.name);
    if (p.pool !== v2.POOL_G0 && p.pool !== v2.POOL_G1) fail(`the pool of ${p.name} must be g0 or g1`);
    if (!(p.baseGmu > 0) || !(p.maxGmuPerWorkerPerEpoch >= p.baseGmu)) fail(`${p.name}: baseGmu must be positive and the per-worker cap at least one unit`);
    if (p.activeFromEpoch !== 0) fail(`${p.name}: a profile of a new deployment applies from epoch 0`);
  }

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
    const p = { ...q, address: ethers.getAddress(q.address), admitted: Boolean(q.admitted), operator: q.operator ?? 0, guard: q.guard ?? null };
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

/// Deploy, register, read back. Returns the manifest and the deployment record. When something
/// fails on the way, the error carries what had been sent (`e.partial`).
async function deployV2({ config, steward, genesisTime, parties, supersedes = null, log = () => {}, minLeadSeconds = 600, rpc = "" }) {
  const provider = steward.provider;
  const stewardAddress = await steward.getAddress();
  const p = await plan({ config, provider, stewardAddress, genesisTime, parties, supersedes, minLeadSeconds });
  const transactions = [];
  try {
    const done = async (step, txPromise) => {
      const rc = await (await txPromise).wait();
      transactions.push({ step, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed });
      log(step);
      return rc;
    };
    const deployed = {};
    const deploy = async (role, buildName, args) => {
      const build = m2.loadBuild(buildName);
      const contract = await new ethers.ContractFactory(build.abi, build.bytecode, steward).deploy(...args);
      const rc = await contract.deploymentTransaction().wait();
      const address = await contract.getAddress();
      transactions.push({ step: `deploy ${buildName}`, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, address });
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
      throw new Error(`the registrations ended at ${c.iso(after.timestamp)}, after genesis ${c.iso(p.genesisTime)}: this deployment does not run as planned; deploy again with a later genesis`);
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
    e.partial = g.jsonable({ deployment: config.name, chainId: p.chainId, steward: stewardAddress, failedAt: new Date().toISOString(), transactions });
    throw e;
  }
}

module.exports = { CONFIG_SCHEMA, RECORD_SCHEMA, L1_BLOCK_PREDEPLOY, MODULES, GAS, paramsStruct, profileSpec, modeOf, plan, planText, deployV2 };
