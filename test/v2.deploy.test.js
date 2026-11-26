"use strict";

// The deployment of ledger v2 from the committed builds of build/v2, with a manifest that names
// every contract and its code, where each log starts, the guards with their code hashes and the
// deployment it supersedes (docs/ledger-v2.md 1 and 16; docs/decisions.md A87).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, g, v2, PROFILE } = t;
const kernel = require("../scripts/lib/deploy");
const d2 = require("../scripts/lib/deploy2");
const m2 = require("../client/lib/manifest2");
const a2 = require("../client/lib/audit2");
const c = require("../scripts/lib/common");

const params = (over = {}) => ({
  activeFromEpoch: 0, budgetPoints: "1000", halvingInterval: 8, splitG0Bps: 1000, workerCapBps: 2500, operatorCapBps: 5000,
  minBountyEth: "0.0001", maxSubsidizedPerDemander: 3, maxSubsidizedPerPair: 1, subsidizeDeclaredRelated: false, ...over,
});
const config = (taskToken, over = {}) => ({
  schema: d2.CONFIG_SCHEMA,
  name: "v2-test",
  environment: "local-devnet",
  labels: ["cell-account-integration"],
  chainId: 31337,
  epochDuration: 3600,
  seedSource: "PrevBlockSeedSource",
  taskToken8414: { address: taskToken, deployBlock: 0 },
  params: [params({ subsidizeDeclaredRelated: true }), params({ activeFromEpoch: 1 })],
  profiles: [
    { name: "g0.ref", pool: "g0", baseGmu: 10, maxGmuPerWorkerPerEpoch: 10, jobsPerEpoch: 1 },
    { name: "g1.tender", pool: "g1", baseGmu: 50, maxGmuPerWorkerPerEpoch: 200 },
  ],
  ...over,
});

async function world() {
  const [steward, w1, w2, cellOwner, delegate, outsider] = await ethers.getSigners();
  const taskToken = await (await ethers.getContractFactory("TaskToken")).deploy("Task Tenders", "TASK");
  const cell = await (await ethers.getContractFactory("MockFogaCell")).deploy(cellOwner.address);
  // a kernel deployment on the same chain, for the v2 deployment to supersede
  const old = await kernel.deployKernel({
    config: { ...config(taskToken.target), schema: kernel.CONFIG_SCHEMA, name: "kernel-test", params: [{ ...params(), operatorCapBps: undefined }] },
    steward, genesisTime: (await h.now()) + 1000n, parties: [{ address: w1.address, admitted: true, operator: 1 }],
  });
  const bytes = Buffer.from(JSON.stringify(old.manifest));
  const supersedes = { manifest: old.manifest, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  return { steward, w1, w2, cellOwner, delegate, outsider, taskToken, cell, old, supersedes };
}

const partiesOf = (w) => [
  { name: "w1", address: w.w1.address, admitted: true, operator: 1, fundEth: "0.01" },
  { address: w.w2.address, admitted: true, operator: 2 },
  { name: "cell", address: w.cell.target, admitted: true, operator: 7, guard: "FogaCellGuard" },
  { name: "delegate", address: w.delegate.address, fundEth: "0.01" },
];

/// The deployment as the v2 test helpers address one, made from its manifest alone.
async function fromManifest(manifest, runner) {
  const ledger = new ethers.Contract(manifest.contracts.GenesisLedgerV2, v2.abi.ledger, runner);
  return {
    policy: new ethers.Contract(manifest.contracts.GenesisPolicyV2, v2.abi.policy, runner), ledger, ledgerAddress: ledger.target,
    chainId: BigInt(manifest.chainId), domain: await ledger.domain(), genesisTime: BigInt(manifest.clock.genesisTime), duration: BigInt(manifest.clock.epochDuration),
  };
}

describe("Ledger v2: the deployment, made from build/v2 and checked against its manifest", () => {
  it("deploys what the configuration says, reads it back, and the deployment is worked and audited from its manifest alone (L48)", async () => {
    const w = await world();
    const before = await ethers.provider.getBalance(w.delegate.address);
    const oldLedgerCode = await ethers.provider.getCode(w.old.manifest.contracts.GenesisLedger);
    const genesisTime = (await h.now()) + 1000n;
    const planned = await d2.plan({ config: config(w.taskToken.target), provider: ethers.provider, stewardAddress: w.steward.address, genesisTime,
      parties: partiesOf(w), supersedes: w.supersedes });
    const { manifest, record, ok } = await d2.deployV2({ config: config(w.taskToken.target), steward: w.steward, genesisTime, parties: partiesOf(w), supersedes: w.supersedes });
    expect(ok, JSON.stringify([...record.verification.deployment, ...record.verification.policy].filter((x) => !x.ok))).to.equal(true);

    // the manifest: every contract with its code, from the v2 builds; the log starts; the guard; what it supersedes
    expect(manifest.schema).to.equal(m2.MANIFEST_SCHEMA);
    expect(Object.keys(manifest.code)).to.deep.equal(["GenesisPolicyV2", "SeedSource", "GenesisLedgerV2", "AuditV1", "TenderAdapter8414V2", "FogaCellGuard"]);
    expect(manifest.code.SeedSource.contract).to.equal("PrevBlockSeedSource");
    for (const [role, entry] of Object.entries(manifest.code)) {
      expect(entry.codeHash, role).to.equal(ethers.keccak256(await ethers.provider.getCode(manifest.contracts[role])));
      expect((await ethers.provider.getTransactionReceipt(entry.deployTx)).contractAddress, role).to.equal(manifest.contracts[role]);
    }
    expect([manifest.deployBlock, manifest.policyDeployBlock, manifest.ledgerDeployBlock, manifest.tenderDeployBlock])
      .to.deep.equal([manifest.code.GenesisPolicyV2.block, manifest.code.GenesisPolicyV2.block, manifest.code.GenesisLedgerV2.block, 0]);
    expect(manifest.code.GenesisLedgerV2.block > manifest.code.GenesisPolicyV2.block).to.equal(true);
    expect(manifest.guards).to.deep.equal({ [w.cell.target]: { guard: manifest.contracts.FogaCellGuard, contract: "FogaCellGuard",
      codeHash: manifest.code.FogaCellGuard.codeHash, bindingVersion: 1, fromEpoch: 0 } });
    expect(manifest.supersedes).to.deep.equal({ name: "kernel-test", chainId: 31337, ledger: w.old.manifest.contracts.GenesisLedger, manifestSha256: w.supersedes.sha256 });
    expect(manifest.clock).to.deep.equal({ genesisTime: Number(genesisTime), epochDuration: 3600 });

    // the record: the builds by hash, every transaction, the reading of the cell; the plan's count and gas held
    expect(Object.keys(record.builds)).to.deep.equal(["build/v2/AuditV1.json", "build/v2/FogaCellGuard.json", "build/v2/GenesisLedgerV2.json",
      "build/v2/GenesisPolicyV2.json", "build/v2/PrevBlockSeedSource.json", "build/v2/TenderAdapter8414V2.json", "build/v2/build-record.json"]);
    for (const [file, sum] of Object.entries(record.builds)) expect(sum).to.equal(c.sha256File(file));
    expect(record.transactions.length).to.equal(planned.transactions);
    expect(record.transactions.length).to.equal(18);
    expect(record.cells).to.deep.equal([{ account: w.cell.target, code: true, accountVersion: 3, presentedBindings: 1, clauses: 1, verdict: 1,
      aid: ethers.ZeroAddress, aidReadable: true, aidState: null, allows: true, reasons: [] }]);
    if (process.env.POUW_SHOW_GAS) console.log(record.transactions.map((x) => `${x.gasUsed} ${x.step}`).join("\n"));
    const gasOf = (prefix) => record.transactions.filter((x) => x.step.startsWith(prefix)).map((x) => BigInt(x.gasUsed));
    const sum = (xs) => xs.reduce((a, b) => a + b, 0n);
    const contracts = sum(record.transactions.filter((x) => x.step.startsWith("deploy ") && x.step !== "deploy FogaCellGuard").map((x) => BigInt(x.gasUsed)));
    expect(contracts <= d2.GAS.contracts, `the five contracts took ${contracts}`).to.equal(true);
    expect(contracts > d2.GAS.contracts - 1_000_000n, `the five contracts took ${contracts}`).to.equal(true);
    for (const [prefix, bound] of [["deploy FogaCellGuard", d2.GAS.guard], ["profile ", d2.GAS.profile], ["parameters ", d2.GAS.params], ["admit ", d2.GAS.party],
      ["declare ", d2.GAS.party], ["bind guard ", d2.GAS.binding], ["fund ", d2.GAS.transfer]]) {
      for (const used of gasOf(prefix)) expect(used <= bound, `${prefix}: ${used} gas, ${bound} planned`).to.equal(true);
    }
    expect(BigInt(record.gasUsed) <= planned.gas).to.equal(true);
    expect(await ethers.provider.getBalance(w.delegate.address)).to.equal(before + ethers.parseEther("0.01"));

    // the same check from the outside, with nothing but the manifest and an endpoint
    const ctx = await a2.connect(manifest, ethers.provider, { tag: "latest" });
    const check = await m2.verifyDeployment(ctx);
    expect(check.ok, JSON.stringify(check.checks.filter((x) => !x.ok))).to.equal(true);
    expect([check.started, check.info]).to.deep.equal([false, { steward: w.steward.address, paused: false }]);
    // the superseded deployment is named and left as it was
    expect(await ethers.provider.getCode(w.old.manifest.contracts.GenesisLedger)).to.equal(oldLedgerCode);

    // it runs: a key's own work, and the cell's work through its delegate and the cell guard
    await h.setTime(genesisTime);
    const d = await fromManifest(manifest, w.steward);
    const direct = await t.submitDirect(d, w.w1);
    expect(direct.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    const p = await t.signed(d, w.cellOwner, w.cell.target, { delegate: w.delegate.address, guard: manifest.contracts.FogaCellGuard, guardBindingVersion: 1 });
    const delegated = await t.submitDelegated(d, w.delegate, p, w.cell.target);
    expect([delegated.status.verdict, delegated.receipt.worker]).to.deep.equal([g.VERDICT.ACCEPTED, w.cell.target]);
    // and the audit of the epoch reads its logs from where the manifest says they start
    await h.setTime(genesisTime + 3600n + 10n);
    const report = await a2.auditEpoch(await a2.connect(manifest, ethers.provider, { tag: "latest" }), 0);
    expect([report.ok, report.agrees, report.complete, report.findings.length]).to.deep.equal([true, true, true, 0]);
    expect((await m2.verifyDeployment(await a2.connect(manifest, ethers.provider, { tag: "latest" }))).ok).to.equal(true); // also once started
  });

  it("tells a deployment that is not this repository's v2 build, or not what its manifest says (L49)", async () => {
    const w = await world();
    const { manifest } = await d2.deployV2({ config: config(w.taskToken.target), steward: w.steward, genesisTime: (await h.now()) + 1000n,
      parties: partiesOf(w), supersedes: w.supersedes });
    const failing = async (m) => {
      const check = await m2.verifyDeployment(await a2.connect(m, ethers.provider, { tag: "latest" }));
      expect(check.ok).to.equal(false);
      return check.checks.filter((x) => !x.ok).map((x) => x.what);
    };
    const withCode = (role, entry) => ({ ...manifest, code: { ...manifest.code, [role]: { ...manifest.code[role], ...entry } } });
    const account = w.cell.target;
    const withGuard = (entry) => ({ ...manifest, guards: { [account]: { ...manifest.guards[account], ...entry } } });

    expect(await failing({ ...manifest, schema: "finchain-pouw.deployment/1" })).to.deep.equal(["the manifest is of schema finchain-pouw.deployment/2"]);
    expect(await failing(withCode("GenesisLedgerV2", { codeHash: ethers.id("other") }))).to.deep.equal(["GenesisLedgerV2: the code hash is the one the manifest records"]);
    // the kernel's build of a contract is not v2's, though it bears the same name
    const kernelAudit = await (await ethers.getContractFactory("contracts/functions/AuditV1.sol:AuditV1")).deploy(manifest.contracts.GenesisLedgerV2);
    const kernelHash = ethers.keccak256(await ethers.provider.getCode(kernelAudit.target));
    expect((await failing({ ...withCode("AuditV1", { codeHash: kernelHash }), contracts: { ...manifest.contracts, AuditV1: kernelAudit.target } })).slice(0, 1))
      .to.deep.equal([`AuditV1 at ${kernelAudit.target}: the code on chain is this repository's build of AuditV1 (build/v2)`]);
    // a role filled by a build of another role, and a role this version does not know
    expect(await failing(withCode("SeedSource", { contract: "AuditV1" }))).to.include("SeedSource: a role of a v2 deployment, filled by the build it names");
    expect(await failing({ ...manifest, code: { ...manifest.code, Extra: { contract: "AuditV1", codeHash: manifest.code.AuditV1.codeHash } },
      contracts: { ...manifest.contracts, Extra: manifest.contracts.AuditV1 } })).to.deep.equal(["Extra: a role of a v2 deployment, filled by the build it names"]);
    const { AuditV1, ...withoutAudit } = manifest.code;
    expect(await failing({ ...manifest, code: withoutAudit })).to.deep.equal(["the manifest names every contract of the deployment and records its code"]);
    // log starts: at or before the block their contract was deployed in, and not after the block of the check
    const starts = "the manifest names where each log starts: at or before the block its contract was deployed in, and not after this block";
    expect(await failing({ ...manifest, policyDeployBlock: manifest.policyDeployBlock + 1 })).to.deep.equal([starts]);
    expect(await failing({ ...manifest, ledgerDeployBlock: manifest.ledgerDeployBlock + 1 })).to.deep.equal([starts]);
    expect(await failing({ ...manifest, deployBlock: manifest.deployBlock + 1 })).to.deep.equal([starts]);
    const head = await ethers.provider.getBlockNumber();
    expect(await failing({ ...manifest, tenderDeployBlock: head + 1000, external: { taskToken8414: { ...manifest.external.taskToken8414, deployBlock: head + 1000 } } }))
      .to.deep.equal([starts]);
    // earlier starts only cost time: a log read from before its contract is still the whole log
    const early = await m2.verifyDeployment(await a2.connect({ ...manifest, ledgerDeployBlock: manifest.policyDeployBlock - 1, policyDeployBlock: 0, deployBlock: 0 }, ethers.provider, { tag: "latest" }));
    expect(early.ok, JSON.stringify(early.checks.filter((x) => !x.ok))).to.equal(true);
    // the two blocks of the tender contract say the same thing
    expect(await failing({ ...manifest, tenderDeployBlock: 1 })).to.deep.equal(["the tenders' log starts where the manifest says the ERC-8414 contract was deployed"]);
    // where the contracts came from: a transaction that does not exist, one that created another contract, another block
    const provenance = (role) => `${role}: its deployment transaction created it in the block the manifest names, in the chain at or before this block`;
    expect(await failing(withCode("GenesisLedgerV2", { deployTx: ethers.ZeroHash }))).to.deep.equal([provenance("GenesisLedgerV2")]);
    expect(await failing(withCode("AuditV1", { deployTx: manifest.code.GenesisLedgerV2.deployTx }))).to.deep.equal([provenance("AuditV1")]);
    // a block that is not the transaction's: with the log start and the code entry moved together, both are found
    const moved = { ...withCode("GenesisPolicyV2", { block: 999999 }), deployBlock: 999999, policyDeployBlock: 999999 };
    // (the policy's log is then read from a block past this one, so the guard's binding is not found in it either)
    expect((await failing(moved)).slice(0, 2)).to.deep.equal([provenance("GenesisPolicyV2"), starts]);
    // a guard binding that is not the one the policy made, a guard whose code is not the one bound
    const made = `${account}: the policy bound guard ${manifest.guards[account].guard} as binding 1 from epoch 0, with the code hash the manifest records`;
    expect(await failing(withGuard({ codeHash: ethers.id("other") }))).to.deep.equal([made, `${account}: the guard's code is the code it had when it was bound`]);
    expect((await failing(withGuard({ bindingVersion: 2 })))[0]).to.contain(`${account}: the policy bound guard`);
    expect(await failing(withGuard({ contract: "SwitchGuard" }))).to.deep.equal([`${account}: the guard is the manifest's SwitchGuard`]);
    const unbound = { ...manifest, guards: { ...manifest.guards, [w.w1.address]: manifest.guards[account] } };
    expect((await failing(unbound)).every((x) => x.startsWith(w.w1.address))).to.equal(true);
    // a binding the policy made and the manifest leaves out is found, not passed over
    expect(await failing({ ...manifest, guards: {} })).to.deep.equal(["the manifest records the guard of every account the policy bound one to"]);
    // a rebinding after the deployment leaves the manifest behind, and leaving the account out does not hide it
    const other = await (await ethers.getContractFactory("SwitchGuard")).deploy();
    const policy = new ethers.Contract(manifest.contracts.GenesisPolicyV2, v2.abi.policy, w.steward);
    await (await policy.bindGuard(account, other.target)).wait();
    expect(await failing(manifest)).to.deep.equal([`${account}: the binding in force for epoch 0 is the manifest's`]);
    expect(await failing({ ...manifest, guards: {} })).to.deep.equal(["the manifest records the guard of every account the policy bound one to"]);
    // what it supersedes: on another chain, without code, the ledger itself
    const sup = (entry) => ({ ...withoutRebind(manifest), supersedes: { ...manifest.supersedes, ...entry } });
    // the cases below concern other parts of the manifest: the rebinding's finding is kept out of their lists
    const rebound = { guard: other.target, codeHash: ethers.keccak256(await ethers.provider.getCode(other.target)), bindingVersion: 2, fromEpoch: 0 };
    const withoutRebind = (m) => ({ ...m, guards: { [account]: rebound } });
    const supersedes = `it supersedes kernel-test: a ledger on the same chain, which is another ledger and has its code`;
    expect(await failing(sup({ chainId: 85422 }))).to.deep.equal([supersedes]);
    expect(await failing(sup({ ledger: w.outsider.address }))).to.deep.equal([supersedes]);
    expect(await failing(sup({ ledger: manifest.contracts.GenesisLedgerV2 }))).to.deep.equal([supersedes]);
    expect(await failing(sup({ manifestSha256: "not a hash" }))).to.deep.equal([supersedes]);
    // the clock and the ERC-8414 contract
    expect(await failing({ ...withoutRebind(manifest), clock: { ...manifest.clock, epochDuration: 7200 } })).to.deep.equal(["the policy's clock is the manifest's"]);
    expect(await failing({ ...withoutRebind(manifest), external: { taskToken8414: { ...manifest.external.taskToken8414, codeHash: ethers.id("other") } } }))
      .to.deep.equal(["the ERC-8414 contract's code is what it was when the adapter was pointed at it"]);
    expect(await failing({ ...withoutRebind(manifest), external: {} })).to.deep.equal(["the tenders' log starts where the manifest says the ERC-8414 contract was deployed",
      "the adapter reads the manifest's ERC-8414 contract", "the manifest records the ERC-8414 contract's code"]);
  });

  it("refuses, before anything is sent, a plan that cannot run as written (L50)", async () => {
    const w = await world();
    const nonce = await ethers.provider.getTransactionCount(w.steward.address);
    const soon = (await h.now()) + 1000n;
    const good = config(w.taskToken.target);
    const plan = (cfg, over = {}) => d2.plan({ config: cfg, provider: ethers.provider, stewardAddress: w.steward.address, genesisTime: soon,
      parties: partiesOf(w), supersedes: w.supersedes, ...over });
    const refused = async (promise, why) => {
      let error = null;
      try { await promise; } catch (e) { error = e; }
      expect(String(error?.message), why).to.contain("deployment refused");
      expect(String(error?.message), why).to.contain(why);
    };
    const planned = await plan(good);
    expect([planned.transactions, planned.deploysGuard, planned.cells.map((x) => x.allows)]).to.deep.equal([18, true, [true]]);
    expect(d2.planText(good, planned)).to.contain(`replaces  kernel-test, ledger ${w.old.manifest.contracts.GenesisLedger}`);
    expect(d2.planText(good, planned)).to.contain(`cell      ${w.cell.target}: the cell guard would allow it now`);
    expect((await plan(good, { supersedes: null })).supersedes).to.equal(null);
    // a cell the guard would refuse now is planned all the same, and the plan says so
    await (await w.cell.connect(w.outsider).setVerdict(2)).wait();
    expect(d2.planText(good, await plan(good))).to.contain("refuse it now (the registry's verdict is not satisfied)");
    await (await w.cell.connect(w.outsider).setVerdict(1)).wait();

    await refused(plan({ ...good, schema: kernel.CONFIG_SCHEMA }), "schema");
    await refused(plan({ ...good, chainId: 85422 }), "chain 85422");
    await refused(plan(good, { genesisTime: (await h.now()) + 60n }), "less than 600 s");
    await refused(plan({ ...good, epochDuration: 0 }), "epochDuration");
    await refused(plan({ ...good, params: [params({ activeFromEpoch: 1 })] }), "from epoch 0");
    await refused(plan({ ...good, params: [params(), params()] }), "increasing epochs");
    await refused(plan({ ...good, params: [params({ operatorCapBps: undefined })] }), "parameter version 1 lacks operatorCapBps");
    await refused(plan({ ...good, params: [params({ operatorCapBps: 0 })] }), "basis points");
    // every parameter version is held to the types and widths the policy takes, not the first alone
    await refused(plan({ ...good, params: [params(), params({ activeFromEpoch: 1, maxSubsidizedPerPair: -1 })] }), "parameter version 2: maxSubsidizedPerPair must be a whole number below 2^32");
    await refused(plan({ ...good, params: [params(), params({ activeFromEpoch: 1, halvingInterval: 2 ** 32 })] }), "parameter version 2: halvingInterval");
    await refused(plan({ ...good, params: [params({ subsidizeDeclaredRelated: "false" })] }), "subsidizeDeclaredRelated must be true or false, not \"false\"");
    await refused(plan({ ...good, params: [params({ budgetPoints: "1e3" })] }), "decimal amounts");
    await refused(plan({ ...good, params: [{ ...params(), splitBps: 10 }] }), "a field splitBps that a parameter version does not have");
    // the profiles are held to what the built-in modules can do
    await refused(plan({ ...good, profiles: [{ ...good.profiles[0], jobsPerEpoch: 0 }, good.profiles[1]] }), "g0.ref: AuditV1 is a G0 function with one job");
    await refused(plan({ ...good, profiles: [{ ...good.profiles[0], pool: "g1", jobsPerEpoch: 0 }, { ...good.profiles[1], pool: "g0", jobsPerEpoch: 1 }] }), "not pool g1 with 0");
    await refused(plan({ ...good, profiles: [good.profiles[0], { ...good.profiles[1], jobsPerEpoch: 1 }] }), "g1.tender: the tender adapter reports to G1 and has no jobs");
    await refused(plan({ ...good, profiles: [good.profiles[0], { ...good.profiles[1], role: 2 }] }), "the built-in profiles are of role 0");
    await refused(plan({ ...good, profiles: [good.profiles[0], { ...good.profiles[1], countsUnits: true }] }), "show no task unit");
    await refused(plan({ ...good, profiles: [good.profiles[0], { ...good.profiles[1], counts: 1 }] }), "a field counts that a profile does not have");
    await refused(plan(good, { parties: [{ address: w.w1.address, admitted: "yes" }] }), "must be true or false, not \"yes\"");
    await refused(plan(good, { parties: [{ address: w.w1.address, fundEth: "some" }] }), "must be a decimal amount");
    await refused(plan({ ...good, profiles: [good.profiles[0]] }), "no g1.tender profile");
    await refused(plan({ ...good, profiles: [...good.profiles, good.profiles[0]] }), "listed twice");
    await refused(plan({ ...good, profiles: [...good.profiles, { name: "g1.unit", pool: "g1", baseGmu: 1, maxGmuPerWorkerPerEpoch: 1 }] }), "g1.unit is neither");
    await refused(plan({ ...good, profiles: [good.profiles[0], { ...good.profiles[1], activeFromEpoch: 1 }] }), "applies from epoch 0");
    await refused(plan({ ...good, seedSource: "Dice" }), "unknown seed source");
    // a chain without the L1Block predeploy (an earlier test may have put a stand-in there: it is taken away and put back)
    const kept = await ethers.provider.getCode(d2.L1_BLOCK_PREDEPLOY);
    await h.network.provider.send("hardhat_setCode", [d2.L1_BLOCK_PREDEPLOY, "0x"]);
    await refused(plan({ ...good, seedSource: "L1BlockSeedSource" }), "not an OP Stack chain");
    await h.network.provider.send("hardhat_setCode", [d2.L1_BLOCK_PREDEPLOY, kept]);
    await refused(plan({ ...good, taskToken8414: { address: w.outsider.address, deployBlock: 0 } }), "no contract at the ERC-8414 address");
    await refused(plan({ ...good, taskToken8414: { address: w.taskToken.target } }), "taskToken8414.deployBlock");
    await refused(plan(good, { parties: [{ address: w.w1.address }, { address: w.w1.address }] }), "listed twice");
    await refused(plan(good, { parties: [{ address: w.w1.address, operator: 2 ** 32 }] }), "32-bit number");
    await refused(plan(good, { parties: [{ address: w.w1.address, guard: "FogaCellGuard" }] }), "has no code: an account without code needs no guard");
    await refused(plan(good, { parties: [{ address: w.cell.target, guard: "SwitchGuard" }] }), "name FogaCellGuard, or the address of a guard contract");
    await refused(plan(good, { parties: [{ address: w.cell.target, guard: w.outsider.address }] }), "no contract at the guard address");
    await refused(plan(good, { parties: [{ address: w.w1.address, fundEth: "1000000" }] }), "the parties are to be sent 1000000.0");
    await refused(plan(good, { supersedes: { ...w.supersedes, manifest: { ...w.supersedes.manifest, chainId: 85422 } } }), "a deployment supersedes one on its own chain");
    await refused(plan(good, { supersedes: { ...w.supersedes, manifest: { ...w.supersedes.manifest, name: "v2-test" } } }), "has this deployment's name");
    await refused(plan(good, { supersedes: { ...w.supersedes, manifest: { ...w.supersedes.manifest, contracts: { GenesisLedger: w.outsider.address } } } }), `no contract at ${w.outsider.address}`);
    await refused(plan(good, { supersedes: { ...w.supersedes, manifest: { name: "x", chainId: 31337 } } }), "names no deployment and no ledger");
    await refused(plan(good, { supersedes: { manifest: w.supersedes.manifest } }), "SHA-256 of the superseded manifest");
    expect(await ethers.provider.getTransactionCount(w.steward.address)).to.equal(nonce);
  });

  it("writes every transaction down when it is taken, keeps one whose answer was lost, and takes its output place before sending (L55)", async () => {
    const w = await world();
    const events = [];
    // a funding transfer is taken and mined, and the answer to it is lost on the way back
    let lost = null;
    const steward = Object.create(w.steward);
    steward.sendTransaction = async (request) => {
      const tx = await w.steward.sendTransaction(request);
      if (!request.value || String(request.to).toLowerCase() !== w.delegate.address.toLowerCase()) return tx;
      lost = tx; await tx.wait();
      const response = Object.create(tx);
      response.wait = async () => { throw new Error("the endpoint went away before it answered"); };
      return response;
    };
    const before = await ethers.provider.getBalance(w.delegate.address);
    let error = null;
    try {
      await d2.deployV2({ config: config(w.taskToken.target), steward, genesisTime: (await h.now()) + 1000n, parties: partiesOf(w), journal: (e) => events.push(e) });
    } catch (e) { error = e; }
    expect(String(error?.message)).to.contain("the endpoint went away");
    const partial = error.partial;
    const entry = partial.transactions.find((t) => t.txHash === lost.hash);
    expect([entry.status, entry.step, entry.nonce, entry.from]).to.deep.equal(["unknown", `fund ${w.delegate.address} with 0.01`, lost.nonce, w.steward.address]);
    expect(partial.counts).to.deep.equal({ confirmed: partial.transactions.length - 1, failed: 0, unknown: 1, submitted: 0 });
    // the transfer did arrive: what is unknown is looked up, never sent again on a guess
    expect(await ethers.provider.getBalance(w.delegate.address)).to.equal(before + ethers.parseEther("0.01"));
    expect((await ethers.provider.getTransactionReceipt(lost.hash)).status).to.equal(1);
    // every transaction was written down when it was taken, before its outcome
    const of = (hash) => events.filter((e) => e.txHash === hash).map((e) => e.event);
    for (const t of partial.transactions) expect(of(t.txHash), t.step).to.deep.equal(t.status === "unknown" ? ["submitted", "unknown"] : ["submitted", "confirmed"]);

    // the command takes its output place before anything is sent: a name that is taken - here by a link to
    // nothing, which a test for existence would pass over - is refused before a key or an endpoint is used
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-out-"));
    try {
      const out = path.join(dir, "out"); fs.mkdirSync(out);
      fs.symlinkSync(path.join(dir, "nothing.json"), path.join(out, "manifest.json"));
      const cfg = path.join(dir, "config.json"); fs.writeFileSync(cfg, JSON.stringify(config(w.taskToken.target)));
      const r = require("child_process").spawnSync(process.execPath, [path.join(c.root, "scripts", "deploy-v2.js"), "--config", cfg, "--keys", path.join(dir, "keys"),
        "--genesis", "+15m", "--out", out, "--rpc", "http://127.0.0.1:9", "--yes"], { encoding: "utf8", timeout: 20000 });
      expect([r.status, r.stderr.includes("exists: a deployment named v2-test was made from here, or the name is taken")]).to.deep.equal([1, true]);
      expect(fs.readdirSync(out)).to.deep.equal(["manifest.json"]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("creates its records and never replaces one (P68)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-"));
    try {
      const file = path.join(dir, "deep", "manifest.json");
      expect(c.createJson(file, { a: 1 })).to.equal(file);
      expect(fs.readFileSync(file, "utf8")).to.equal('{\n  "a": 1\n}\n');
      expect(() => c.createJson(file, { a: 2 })).to.throw("exists already: nothing is overwritten");
      expect(fs.readFileSync(file, "utf8")).to.equal('{\n  "a": 1\n}\n');
      // a link at the path is a path that exists: nothing is written through it
      const target = path.join(dir, "target.json");
      fs.writeFileSync(target, "kept\n");
      fs.symlinkSync(target, path.join(dir, "link.json"));
      expect(() => c.createJson(path.join(dir, "link.json"), { a: 3 })).to.throw("exists already");
      expect(fs.readFileSync(target, "utf8")).to.equal("kept\n");
      // the command refuses a directory that holds a manifest before it reads a key or an endpoint
      const text = fs.readFileSync(path.join(c.root, "scripts", "deploy-v2.js"), "utf8");
      const before = (a, b) => text.indexOf(a) >= 0 && text.indexOf(a) < text.indexOf(b);
      expect(before("taken(manifestPath)", "c.walletOf(")).to.equal(true);
      expect(before("fs.writeFileSync(journalPath, \"\", { flag: \"wx\" })", "d.deployV2(")).to.equal(true);
      expect(text.includes("deploy again")).to.equal(false);
      expect(text.includes("c.writeJson(")).to.equal(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
