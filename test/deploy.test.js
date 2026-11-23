"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;
const d = require("../scripts/lib/deploy");
const c = require("../scripts/lib/common");

const baseConfig = (taskToken, over = {}) => ({
  schema: d.CONFIG_SCHEMA,
  name: "test",
  environment: "local-devnet",
  labels: ["controlled-self-test"],
  chainId: 31337,
  epochDuration: 3600,
  seedSource: "PrevBlockSeedSource",
  taskToken8414: { address: taskToken, deployBlock: 0 },
  params: [
    { activeFromEpoch: 0, budgetPoints: "1000", halvingInterval: 8, splitG0Bps: 1000, workerCapBps: 2500, minBountyEth: "0.0001",
      maxSubsidizedPerDemander: 3, maxSubsidizedPerPair: 1, subsidizeDeclaredRelated: true },
    { activeFromEpoch: 1, budgetPoints: "1000", halvingInterval: 8, splitG0Bps: 1000, workerCapBps: 2500, minBountyEth: "0.0001",
      maxSubsidizedPerDemander: 3, maxSubsidizedPerPair: 1, subsidizeDeclaredRelated: false },
  ],
  profiles: [
    { name: "g0.ref", pool: "g0", baseGmu: 10, maxGmuPerWorkerPerEpoch: 10, jobsPerEpoch: 1 },
    { name: "g1.tender", pool: "g1", baseGmu: 50, maxGmuPerWorkerPerEpoch: 200 },
  ],
  ...over,
});

async function world() {
  const [steward, w1, w2, outsider] = await ethers.getSigners();
  const TaskToken = await ethers.getContractFactory("TaskToken");
  const taskToken = await TaskToken.deploy("Task Tenders", "TASK");
  return { steward, w1, w2, outsider, taskToken, tokenAddress: await taskToken.getAddress() };
}

describe("Deployment: made from the committed builds and checked against them", () => {
  it("deploys what the configuration says, reads it back, and the deployment works (M1)", async () => {
    const { steward, w1, w2, tokenAddress } = await world();
    const before = await ethers.provider.getBalance(w1.address);
    const genesisTime = (await h.now()) + 1000n;
    const { manifest, record, ok } = await d.deployKernel({
      config: baseConfig(tokenAddress), steward, genesisTime,
      parties: [{ name: "w1", address: w1.address, admitted: true, operator: 1, fundEth: "0.01" }, { address: w2.address, admitted: true, operator: 1 }],
    });
    expect(ok).to.equal(true);
    expect(record.ok).to.equal(true);
    expect(record.verification.code.every((x) => x.ok) && record.verification.policy.every((x) => x.ok)).to.equal(true);
    expect(record.labels).to.deep.equal(["controlled-self-test"]);
    expect(Object.keys(manifest.code)).to.deep.equal(["GenesisPolicy", "SeedSource", "GenesisLedger", "AuditV1", "TenderAdapter8414"]);
    expect(manifest.schema).to.equal(g.MANIFEST_SCHEMA);
    expect(manifest.clock).to.deep.equal({ genesisTime: Number(genesisTime), epochDuration: 3600 });
    expect(await ethers.provider.getBalance(w1.address)).to.equal(before + ethers.parseEther("0.01"));
    // the record names the builds it deployed, by hash, and every transaction it sent
    for (const [file, sum] of Object.entries(record.builds)) expect(sum).to.equal(c.sha256File(file));
    expect(record.transactions.length).to.equal(13);
    for (const [role, entry] of Object.entries(manifest.code)) {
      expect(entry.codeHash, role).to.equal(ethers.keccak256(await ethers.provider.getCode(manifest.contracts[role])));
      expect((await ethers.provider.getTransactionReceipt(entry.deployTx)).contractAddress, role).to.equal(manifest.contracts[role]);
    }

    // the same check from the outside, as `pouw verify` makes it
    const ctx = await g.connect(manifest, ethers.provider, { tag: "latest" });
    const check = await g.verifyDeployment(ctx, d.loadBuild);
    expect(check.ok, JSON.stringify(check.checks.filter((x) => !x.ok))).to.equal(true);
    expect(check.started).to.equal(false);

    // and it runs: epoch 0 is the controlled self-test the configuration asked for, epoch 1 is standard
    await h.setTime(genesisTime);
    const done = await g.workAudit(ctx, w1);
    expect(done.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(done.status.gmuSubsidized).to.equal(10n);
    expect((await ctx.policy.paramsFor(0))[1].subsidizeDeclaredRelated).to.equal(true);
    expect((await ctx.policy.paramsFor(1))[1].subsidizeDeclaredRelated).to.equal(false);
    expect(await ctx.policy.operatorOf(w2.address)).to.equal(1n);
    expect((await g.verifyDeployment(ctx, d.loadBuild)).ok).to.equal(true); // also once started
  });

  it("tells a deployment that is not this repository's build, or not what its manifest says (M2)", async () => {
    const { steward, w1, outsider, tokenAddress } = await world();
    const { manifest } = await d.deployKernel({ config: baseConfig(tokenAddress), steward, genesisTime: (await h.now()) + 1000n,
      parties: [{ address: w1.address, admitted: true }] });
    const failing = async (m) => {
      const ctx = await g.connect(m, ethers.provider, { tag: "latest" });
      const check = await g.verifyDeployment(ctx, d.loadBuild);
      expect(check.ok).to.equal(false);
      return check.checks.filter((x) => !x.ok).map((x) => x.what);
    };
    const withCode = (role, entry) => ({ ...manifest, code: { ...manifest.code, [role]: { ...manifest.code[role], ...entry } } });

    // another code hash on record
    expect(await failing(withCode("GenesisLedger", { codeHash: ethers.id("other") }))).to.deep.equal(["GenesisLedger: the code hash is the one the manifest records"]);
    // another contract behind a role: the adapter's address given as the audit function
    const swapped = { ...manifest, contracts: { ...manifest.contracts, AuditV1: manifest.contracts.TenderAdapter8414 } };
    expect((await failing(swapped)).some((w) => w.includes("the code on chain is this repository's build of AuditV1"))).to.equal(true);
    // no contract at all
    const empty = { ...manifest, contracts: { ...manifest.contracts, AuditV1: outsider.address } };
    expect((await failing(empty)).some((w) => w.includes("this repository's build of AuditV1"))).to.equal(true);
    // the same build deployed for another ledger: its code is ours, its wiring is not
    const Audit = new ethers.ContractFactory(d.loadBuild("AuditV1").abi, d.loadBuild("AuditV1").bytecode, steward);
    const stray = await Audit.deploy(outsider.address);
    await stray.deploymentTransaction().wait();
    const strayAddress = await stray.getAddress();
    const rewired = { ...manifest, contracts: { ...manifest.contracts, AuditV1: strayAddress },
      code: { ...manifest.code, AuditV1: { ...manifest.code.AuditV1, codeHash: ethers.keccak256(await ethers.provider.getCode(strayAddress)) } } };
    const found = await failing(rewired);
    expect(found).to.include("the audit function reads this ledger");
    expect(found.some((w) => w.includes("this repository's build"))).to.equal(false);
    // another clock, another ERC-8414 contract, an ERC-8414 contract whose code has changed
    expect(await failing({ ...manifest, clock: { ...manifest.clock, epochDuration: 7200 } })).to.deep.equal(["the policy's clock is the manifest's"]);
    expect(await failing({ ...manifest, external: { taskToken8414: { ...manifest.external.taskToken8414, address: outsider.address, codeHash: undefined } } }))
      .to.deep.equal(["the adapter reads the manifest's ERC-8414 contract"]);
    expect(await failing({ ...manifest, external: { taskToken8414: { ...manifest.external.taskToken8414, codeHash: ethers.id("other") } } }))
      .to.deep.equal(["the ERC-8414 contract's code is what it was when the adapter was pointed at it"]);
    // a manifest without code hashes proves nothing about the code - and neither does one that leaves a module out
    const { code, ...bare } = manifest;
    expect(await failing(bare)).to.deep.equal(["the manifest names every contract of the deployment and records its code"]);
    const { AuditV1, ...fourOfFive } = manifest.code;
    expect(await failing({ ...manifest, code: fourOfFive })).to.deep.equal(["the manifest names every contract of the deployment and records its code"]);
    const { TenderAdapter8414, ...unnamed } = manifest.contracts;
    expect(await failing({ ...manifest, contracts: unnamed })).to.include("epoch 0: the g1.tender profile's adapter is the manifest's TenderAdapter8414");
    // who can change the policy is reported, not judged
    const ctx = await g.connect(manifest, ethers.provider, { tag: "latest" });
    expect((await g.verifyDeployment(ctx, d.loadBuild)).info).to.deep.equal({ steward: steward.address, paused: false });
  });

  it("refuses, before anything is sent, a plan that cannot run as written", async () => {
    const { steward, w1, outsider, tokenAddress } = await world();
    const nonce = await ethers.provider.getTransactionCount(steward.address);
    const soon = (await h.now()) + 1000n;
    const plan = (config, over = {}) => d.plan({ config, provider: ethers.provider, stewardAddress: steward.address, genesisTime: soon,
      parties: [{ address: w1.address, admitted: true, operator: 1 }], ...over });
    const refused = async (promise, why) => {
      let error = null;
      try { await promise; } catch (e) { error = e; }
      expect(String(error?.message), why).to.contain("deployment refused");
      expect(String(error?.message), why).to.contain(why);
    };
    const good = baseConfig(tokenAddress);
    expect((await plan(good)).transactions).to.equal(10);
    await refused(plan({ ...good, chainId: 85422 }), "chain 85422");
    await refused(plan({ ...good, schema: "something/1" }), "schema");
    await refused(plan(good, { genesisTime: (await h.now()) + 60n }), "less than 600 s");
    await refused(plan({ ...good, params: [{ ...good.params[0], activeFromEpoch: 1 }] }), "from epoch 0");
    await refused(plan({ ...good, params: [good.params[0], { ...good.params[1], activeFromEpoch: 0 }] }), "increasing epochs");
    await refused(plan({ ...good, params: [{ ...good.params[0], workerCapBps: 0 }] }), "basis points");
    await refused(plan({ ...good, profiles: [good.profiles[0]] }), "no g1.tender profile");
    await refused(plan({ ...good, profiles: [...good.profiles, { name: "g0.cal", pool: "g0", baseGmu: 1, maxGmuPerWorkerPerEpoch: 1, jobsPerEpoch: 1 }] }), "g0.cal is neither");
    await refused(plan({ ...good, seedSource: "Dice" }), "unknown seed source");
    await refused(plan({ ...good, seedSource: "L1BlockSeedSource" }), "not an OP Stack chain");
    await refused(plan({ ...good, taskToken8414: { address: outsider.address } }), "no contract at the ERC-8414 address");
    await refused(plan(good, { parties: [{ address: w1.address }, { address: w1.address }] }), "listed twice");
    await refused(plan(good, { parties: [{ address: w1.address, operator: -1 }] }), "32-bit number");
    await refused(plan(good, { parties: [{ address: w1.address, fundEth: "1000000" }] }), "the parties are to be sent 1000000.0");
    await refused(plan({ ...good, epochDuration: 0 }), "epochDuration");
    expect(await ethers.provider.getTransactionCount(steward.address)).to.equal(nonce);
  });

  it("reads times with their zone, and keys only from files that are their owner's alone", () => {
    expect(c.parseTime("+15m", 1000)).to.equal(1900n);
    expect(c.parseTime("+90s", 1000)).to.equal(1090n);
    expect(c.parseTime("+2h", 0)).to.equal(7200n);
    expect(c.parseTime("1795485600", 0)).to.equal(1795485600n);
    expect(c.parseTime("2026-11-24T10:00:00+08:00", 0)).to.equal(1795485600n);
    expect(c.parseTime("2026-11-24T02:00:00Z", 0)).to.equal(1795485600n);
    expect(() => c.parseTime("2026-11-24T10:00:00", 0)).to.throw("names no zone");
    expect(c.iso(1795485600n)).to.equal("2026-11-24T02:00:00Z");
    expect(c.endpointHost("https://rpc.example.org/v2/a-secret-key?x=1")).to.equal("rpc.example.org");
    expect(c.inRepository(path.join(c.root, "out", "keys"))).to.equal(true);
    expect(c.inRepository(c.root)).to.equal(true);
    expect(c.inRepository(path.join(c.root, "..", "elsewhere"))).to.equal(false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-test-"));
    try {
      const file = path.join(dir, "a.key");
      fs.writeFileSync(file, `${ethers.id("a test key")}\n`, { mode: 0o600 });
      expect(c.readKeyFile(file)).to.equal(ethers.id("a test key"));
      fs.chmodSync(file, 0o640);
      expect(() => c.readKeyFile(file)).to.throw("can be read by others");
      expect(() => c.addressOf(dir, "a")).to.throw("make the key with scripts/keys.js");
      // a place for the records is checked before the transactions they would record are sent
      expect(c.writableDir(path.join(dir, "records", "deep"))).to.equal(path.join(dir, "records", "deep"));
      expect(fs.readdirSync(path.join(dir, "records", "deep"))).to.deep.equal([]);
      expect(() => c.writableDir(path.join(file, "below-a-file"))).to.throw("cannot write records to");
      expect(path.basename(c.freshPath(dir, "round"))).to.match(/^round-\d{8}T\d{6}Z\.json$/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
