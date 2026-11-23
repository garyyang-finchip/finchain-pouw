// Deploying the kernel: one sequence for every chain, driven by a configuration file and done from
// the committed builds (build/*.json), so that a host needs no compiler. The rehearsal on a
// development network and a public deployment go through this same code.
"use strict";

const path = require("path");
const { ethers } = require("ethers");
const g = require("../../client/lib/genesis");
const c = require("./common");

const CONFIG_SCHEMA = "finchain-pouw.deploy-config/1";
const RECORD_SCHEMA = "finchain-pouw.deployment-record/1";
const L1_BLOCK_PREDEPLOY = "0x4200000000000000000000000000000000000015";
// the modules this version knows how to deploy, by the profile each one serves
const MODULES = { [g.PROFILE_G0_REF]: "AuditV1", [g.PROFILE_G1_TENDER]: "TenderAdapter8414" };
const POOLS = { g0: g.POOL_G0, g1: g.POOL_G1 };

const loadBuild = (name) => c.readJson(path.join(c.root, "build", `${name}.json`));

/// A parameter version of the configuration as the contract takes it.
function paramsStruct(p) {
  return {
    activeFromEpoch: p.activeFromEpoch,
    budgetBase: ethers.parseUnits(String(p.budgetPoints), 18),
    halvingInterval: p.halvingInterval,
    splitG0Bps: p.splitG0Bps,
    workerCapBps: p.workerCapBps,
    minBountyWei: ethers.parseEther(String(p.minBountyEth)),
    maxSubsidizedPerDemander: p.maxSubsidizedPerDemander,
    maxSubsidizedPerPair: p.maxSubsidizedPerPair,
    subsidizeDeclaredRelated: Boolean(p.subsidizeDeclaredRelated),
  };
}

const modeOf = (p) => (p.subsidizeDeclaredRelated ? "controlled-self-test" : "standard");

/// Everything that can be found wrong before a transaction is sent. Returns the plan to carry out.
async function plan({ config, provider, stewardAddress, genesisTime, parties, minLeadSeconds = 600 }) {
  const fail = (m) => { throw new Error(`deployment refused: ${m}`); };
  if (config.schema !== CONFIG_SCHEMA) fail(`the configuration's schema is ${config.schema}, expected ${CONFIG_SCHEMA}`);
  const { chainId } = await provider.getNetwork();
  if (BigInt(config.chainId) !== chainId) fail(`the configuration is for chain ${config.chainId}; the endpoint answers for chain ${chainId}`);
  const latest = await provider.getBlock("latest");
  if (BigInt(genesisTime) < BigInt(latest.timestamp) + BigInt(minLeadSeconds)) {
    fail(`genesis ${c.iso(genesisTime)} is less than ${minLeadSeconds} s after the latest block (${c.iso(latest.timestamp)}): the profiles and the parties must be registered before it`);
  }
  if (!(Number(config.epochDuration) > 0)) fail("epochDuration must be positive");

  const params = config.params ?? [];
  if (params.length === 0 || params[0].activeFromEpoch !== 0) fail("the first parameter version must apply from epoch 0");
  for (let i = 1; i < params.length; i++) if (!(params[i].activeFromEpoch > params[i - 1].activeFromEpoch)) fail("parameter versions must apply from increasing epochs");
  for (const p of params) {
    if (!(p.splitG0Bps >= 0 && p.splitG0Bps <= 10000) || !(p.workerCapBps > 0 && p.workerCapBps <= 10000)) fail("splitG0Bps and workerCapBps must be basis points");
    paramsStruct(p);
  }
  const profiles = (config.profiles ?? []).map((p) => ({ ...p, pool: POOLS[p.pool] ?? p.pool, jobsPerEpoch: p.jobsPerEpoch ?? 0, activeFromEpoch: p.activeFromEpoch ?? 0 }));
  for (const name of Object.keys(MODULES)) if (!profiles.some((p) => p.name === name)) fail(`the configuration has no ${name} profile`);
  for (const p of profiles) {
    if (!MODULES[p.name]) fail(`this version deploys the modules of ${Object.keys(MODULES).join(" and ")} only; ${p.name} is neither`);
    if (p.pool !== g.POOL_G0 && p.pool !== g.POOL_G1) fail(`the pool of ${p.name} must be g0 or g1`);
    if (!(p.baseGmu > 0) || !(p.maxGmuPerWorkerPerEpoch >= p.baseGmu)) fail(`${p.name}: baseGmu must be positive and the per-worker cap at least one unit`);
  }
  if (!["L1BlockSeedSource", "PrevBlockSeedSource"].includes(config.seedSource)) fail(`unknown seed source ${config.seedSource}`);
  if (config.seedSource === "L1BlockSeedSource" && (await provider.getCode(L1_BLOCK_PREDEPLOY)) === "0x") {
    fail(`this chain has no L1Block predeploy at ${L1_BLOCK_PREDEPLOY}: it is not an OP Stack chain; use PrevBlockSeedSource`);
  }
  const taskToken = ethers.getAddress(config.taskToken8414.address);
  if ((await provider.getCode(taskToken)) === "0x") fail(`no contract at the ERC-8414 address ${taskToken}`);

  const seen = new Set();
  let funding = 0n;
  const list = parties.map((p) => ({ ...p, address: ethers.getAddress(p.address), admitted: Boolean(p.admitted), operator: p.operator ?? 0 }));
  for (const p of list) {
    if (seen.has(p.address)) fail(`${p.address} is listed twice`);
    seen.add(p.address);
    if (!(Number.isInteger(p.operator) && p.operator >= 0 && p.operator < 2 ** 32)) fail(`the operator of ${p.address} must be a 32-bit number`);
    if (p.fundEth) funding += ethers.parseEther(String(p.fundEth));
  }
  // gas: about 7.2 million for the five contracts and the two profiles (measured), and some for each
  // further registration; priced as the endpoint would price a transaction sent now
  const gas = 7_300_000n + 100_000n * BigInt(params.length - 1) + 110_000n * BigInt(list.length);
  const fees = await provider.getFeeData();
  const gasCost = gas * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n);
  const balance = await provider.getBalance(stewardAddress);
  if (balance < funding + gasCost) {
    fail(`the steward ${stewardAddress} holds ${ethers.formatEther(balance)}; the parties are to be sent ${ethers.formatEther(funding)} and the gas is about ${ethers.formatEther(gasCost)} at the endpoint's present price`);
  }

  // the first transaction of the sequence, estimated: a constructor that would revert is found here
  const policyBuild = loadBuild("GenesisPolicy");
  const creation = await new ethers.ContractFactory(policyBuild.abi, policyBuild.bytecode)
    .getDeployTransaction(stewardAddress, BigInt(genesisTime), BigInt(config.epochDuration), paramsStruct(params[0]));
  try { await provider.estimateGas({ ...creation, from: stewardAddress }); } catch (e) {
    fail(`the policy's constructor would revert with these values (${g.refusal(e)?.name ?? e.shortMessage ?? e.message})`);
  }
  return {
    chainId, steward: stewardAddress, stewardBalance: balance, genesisTime: BigInt(genesisTime), epochDuration: BigInt(config.epochDuration),
    latestBlock: { number: latest.number, timestamp: latest.timestamp }, params, profiles, parties: list, funding, taskToken, gas, gasCost,
    transactions: 5 + profiles.length + (params.length - 1) + list.filter((p) => p.admitted).length + list.filter((p) => p.operator).length
      + list.filter((p) => p.fundEth).length,
  };
}

/// The plan as text, for the person who is about to approve it.
function planText(config, p) {
  const lines = [
    `${config.name} (${[config.environment, ...(config.labels ?? [])].join(", ")}) on chain ${p.chainId}`,
    `  steward   ${p.steward}  balance ${ethers.formatEther(p.stewardBalance)}`,
    `  genesis   ${c.iso(p.genesisTime)}  (${p.genesisTime - BigInt(p.latestBlock.timestamp)} s after the latest block)`,
    `  epochs    ${p.epochDuration} s each: epoch 0 ends ${c.iso(p.genesisTime + p.epochDuration)}, epoch 1 ends ${c.iso(p.genesisTime + 2n * p.epochDuration)}`,
    `  seed      ${config.seedSource}`,
    `  tenders   ERC-8414 contract ${p.taskToken}`,
  ];
  for (const v of p.params) {
    lines.push(`  from epoch ${v.activeFromEpoch}: ${modeOf(v)}; budget ${v.budgetPoints} test points, G0 ${v.splitG0Bps / 100}% / G1 ${(10000 - v.splitG0Bps) / 100}%, `
      + `share cap ${v.workerCapBps / 100}% per address, least bounty ${v.minBountyEth}, at most ${v.maxSubsidizedPerDemander} per demander and ${v.maxSubsidizedPerPair} per pair`);
  }
  for (const f of p.profiles) lines.push(`  profile   ${f.name}: ${f.baseGmu} GMU a unit, at most ${f.maxGmuPerWorkerPerEpoch} GMU per worker and epoch`);
  for (const q of p.parties) {
    lines.push(`  party     ${q.address}${q.name ? ` (${q.name})` : ""}: ${q.admitted ? "admitted" : "not admitted"}, operator ${q.operator || "undeclared"}${q.fundEth ? `, funded with ${q.fundEth}` : ""}`);
  }
  lines.push(`  ${p.transactions} transactions; ${ethers.formatEther(p.funding)} goes to the parties; gas about ${p.gas}, which is at most ${ethers.formatEther(p.gasCost)} at the endpoint's present price`
    + " (a rollup's data fee comes on top)");
  return lines.join("\n");
}

/// Deploy, register, read back. Returns the manifest and the deployment record. When something
/// fails on the way, the error carries what had been sent (`e.partial`).
async function deployKernel({ config, steward, genesisTime, parties, log = () => {}, minLeadSeconds = 600, rpc = "" }) {
  const provider = steward.provider;
  const stewardAddress = await steward.getAddress();
  const p = await plan({ config, provider, stewardAddress, genesisTime, parties, minLeadSeconds });
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
      const build = loadBuild(buildName);
      const contract = await new ethers.ContractFactory(build.abi, build.bytecode, steward).deploy(...args);
      const rc = await contract.deploymentTransaction().wait();
      const address = await contract.getAddress();
      transactions.push({ step: `deploy ${buildName}`, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed, address });
      deployed[role] = { contract: buildName, address, deployTx: rc.hash, block: rc.blockNumber, codeHash: await g.codeHashOf(provider, address) };
      log(`deployed ${buildName} at ${address}`);
      return contract;
    };

    const policy = await deploy("GenesisPolicy", "GenesisPolicy", [stewardAddress, p.genesisTime, p.epochDuration, paramsStruct(p.params[0])]);
    await deploy("SeedSource", config.seedSource, []);
    await deploy("GenesisLedger", "GenesisLedger", [deployed.GenesisPolicy.address, deployed.SeedSource.address]);
    await deploy("AuditV1", "AuditV1", [deployed.GenesisLedger.address]);
    await deploy("TenderAdapter8414", "TenderAdapter8414", [deployed.GenesisLedger.address, p.taskToken, g.PROFILE_G1_TENDER]);

    for (const f of p.profiles) {
      await done(`profile ${f.name}: ${f.baseGmu} GMU a unit, at most ${f.maxGmuPerWorkerPerEpoch} per worker and epoch, from epoch ${f.activeFromEpoch}`,
        policy.registerProfile(f.name, f.pool, deployed[MODULES[f.name]].address, f.baseGmu, f.maxGmuPerWorkerPerEpoch, f.jobsPerEpoch, f.activeFromEpoch));
    }
    for (const v of p.params.slice(1)) await done(`parameters from epoch ${v.activeFromEpoch}: ${modeOf(v)}`, policy.registerParams(paramsStruct(v)));
    for (const q of p.parties) {
      if (q.admitted) await done(`admit ${q.address}`, policy.setAdmission(q.address, true));
      if (q.operator) await done(`declare ${q.address} under operator ${q.operator}`, policy.declareOperator(q.address, q.operator));
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
      schema: g.MANIFEST_SCHEMA,
      name: config.name,
      environment: config.environment,
      ...(config.labels ? { labels: config.labels } : {}),
      chainId: Number(p.chainId),
      ...(config.rpc ? { rpc: config.rpc } : {}),
      ...(config.logChunk ? { logChunk: config.logChunk } : {}),
      deployBlock: deployed.GenesisPolicy.block,
      protocol: c.version(),
      contracts: Object.fromEntries(Object.entries(deployed).map(([role, d]) => [role, d.address])),
      code: Object.fromEntries(Object.entries(deployed).map(([role, d]) => [role, { contract: d.contract, codeHash: d.codeHash, deployTx: d.deployTx, block: d.block }])),
      external: { taskToken8414: { address: p.taskToken, deployBlock: config.taskToken8414.deployBlock ?? 0, codeHash: await g.codeHashOf(provider, p.taskToken) } },
      clock: { genesisTime: Number(p.genesisTime), epochDuration: Number(p.epochDuration) },
    };

    // read back: the code against the builds, the wiring, and the policy as an auditor will replay it
    const ctx = await g.connect(manifest, provider, { tag: "latest" });
    const check = await g.verifyDeployment(ctx, loadBuild);
    const head = (await provider.getBlock("latest")).number;
    const readBack = [];
    for (const v of p.params) {
      const pol = await g.policyAt(ctx, v.activeFromEpoch, head);
      const want = g.plainParams(paramsStruct(v));
      readBack.push({ what: `the parameters of epoch ${v.activeFromEpoch} are the configuration's (${modeOf(v)})`,
        ok: Boolean(pol.params) && Object.keys(want).every((k) => pol.params[k] === want[k]) });
    }
    const pol0 = await g.policyAt(ctx, 0, head);
    for (const f of p.profiles) {
      const got = pol0.profiles.get(g.profileKey(f.name));
      readBack.push({ what: `the ${f.name} profile of epoch 0 is the configuration's`,
        ok: Boolean(got) && got.pool === f.pool && got.baseGmu === BigInt(f.baseGmu) && got.maxGmuPerWorkerPerEpoch === BigInt(f.maxGmuPerWorkerPerEpoch)
          && got.jobsPerEpoch === f.jobsPerEpoch && got.module === deployed[MODULES[f.name]].address });
    }
    for (const q of p.parties) {
      readBack.push({ what: `${q.address}: ${q.admitted ? "admitted" : "not admitted"}, operator ${q.operator || "undeclared"}, from epoch 0`,
        ok: pol0.isAdmitted(q.address) === q.admitted && pol0.operatorOf(q.address) === q.operator });
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
      builds: Object.fromEntries(builds.map((n) => [`build/${n}.json`, c.sha256File(`build/${n}.json`)])),
      clock: { genesisTime: p.genesisTime, genesis: c.iso(p.genesisTime), epochDuration: p.epochDuration },
      parameters: p.params.map((v) => ({ ...v, mode: modeOf(v) })),
      profiles: p.profiles.map((f) => ({ ...f, module: deployed[MODULES[f.name]].address })),
      parties: p.parties,
      transactions,
      gasUsed: transactions.reduce((a, t) => a + t.gasUsed, 0n),
      verification: { code: check.checks, policy: readBack },
      manifest,
      ...(config.notes ? { notes: config.notes } : {}),
    });
    return { manifest, record, ok };
  } catch (e) {
    e.partial = g.jsonable({ deployment: config.name, chainId: p.chainId, steward: stewardAddress, failedAt: new Date().toISOString(), transactions });
    throw e;
  }
}

module.exports = { CONFIG_SCHEMA, RECORD_SCHEMA, L1_BLOCK_PREDEPLOY, MODULES, loadBuild, paramsStruct, modeOf, plan, planText, deployKernel };
