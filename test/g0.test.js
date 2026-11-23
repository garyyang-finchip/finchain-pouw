"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

const KEY = g.profileKey(g.PROFILE_G0_REF);

describe("G0: protocol work on per-worker instances", () => {
  it("captures the epoch's seed on first use and derives it from the deployment, the epoch and the source (N0)", async () => {
    const d = await h.deploy();
    expect(await d.ledger.seedOf(0)).to.equal(ethers.ZeroHash);
    const tx = await d.ledger.openEpoch();
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => d.ledger.interface.parseLog(l)).find((p) => p.name === "EpochOpened");
    expect(ev.args.epoch).to.equal(0n);
    expect(ev.args.seed).to.equal(g.epochSeed(d.ctx.domain, 0, ev.args.seedMaterial));
    expect(await d.ledger.seedOf(0)).to.equal(ev.args.seed);
    expect(ev.args.paramsVersion).to.equal(1n);
    // a second call changes nothing
    await (await d.ledger.openEpoch()).wait();
    expect(await d.ledger.seedOf(0)).to.equal(ev.args.seed);
    expect((await d.ledger.epochSummary(0)).opened).to.equal(true);
  });

  it("does not claim an unpredictable seed: the material is public before capture and whoever opens picks the moment (X9)", async () => {
    const [, , , opener] = await ethers.getSigners();
    const d = await h.deploy({ seed: "fixed" });
    // anyone can compute the seed an opening would produce, before sending it
    const material = await d.seedSource.seedMaterial();
    const predicted = g.epochSeed(d.ctx.domain, 0, material);
    // and can wait for other material instead
    await (await d.seedSource.set(ethers.id("material the opener prefers"))).wait();
    const chosen = g.epochSeed(d.ctx.domain, 0, await d.seedSource.seedMaterial());
    expect(chosen).to.not.equal(predicted);
    await (await d.ledger.connect(opener).openEpoch()).wait();
    expect(await d.ledger.seedOf(0)).to.equal(chosen);
    // what the seed does give: instances that differ per worker and per epoch
    const [, a, b] = await ethers.getSigners();
    expect(g.g0Instance(chosen, g.AUDIT_V1_FUNCTION_ID, 0, a.address)).to.not.equal(g.g0Instance(chosen, g.AUDIT_V1_FUNCTION_ID, 0, b.address));
  });

  it("reads OP Stack seed material from the L1Block predeploy: the latest L1 origin, nothing more", async () => {
    const predeploy = "0x4200000000000000000000000000000000000015";
    const Mock = await ethers.getContractFactory("MockL1Block");
    const mock = await Mock.deploy();
    await h.network.provider.send("hardhat_setCode", [predeploy, await ethers.provider.getCode(await mock.getAddress())]);
    const l1 = await ethers.getContractAt("MockL1Block", predeploy);
    const Source = await ethers.getContractFactory("L1BlockSeedSource");
    const source = await Source.deploy();
    const material = (number, hash) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint64", "bytes32"], [number, hash]));

    await (await l1.set(7000001, ethers.id("l1 block 7000001"))).wait();
    expect(await source.seedMaterial()).to.equal(material(7000001, ethers.id("l1 block 7000001")));
    // the material follows the L1 origin: it changes when the chain moves to the next L1 block, and only then
    expect(await source.seedMaterial()).to.equal(material(7000001, ethers.id("l1 block 7000001")));
    await (await l1.set(7000002, ethers.id("l1 block 7000002"))).wait();
    expect(await source.seedMaterial()).to.equal(material(7000002, ethers.id("l1 block 7000002")));

    // a ledger on this source captures it like any other
    const [steward] = await ethers.getSigners();
    const Policy = await ethers.getContractFactory("GenesisPolicy");
    const genesis = (await h.now()) + 100n;
    const policy = await Policy.deploy(steward.address, genesis, 3600, h.DEFAULT_PARAMS);
    const Ledger = await ethers.getContractFactory("GenesisLedger");
    const ledger = await Ledger.deploy(await policy.getAddress(), await source.getAddress());
    await h.setTime(genesis);
    await (await ledger.openEpoch()).wait();
    const domain = g.ledgerDomain(31337n, await ledger.getAddress());
    expect(await ledger.seedOf(0)).to.equal(g.epochSeed(domain, 0, material(7000002, ethers.id("l1 block 7000002"))));
    await h.network.provider.send("hardhat_setCode", [predeploy, "0x"]);
  });

  it("accepts each admitted worker's own instance and measures it (N1)", async () => {
    const [, a, b] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b] });
    const idA = await h.submitAudit(d, a);
    const idB = await h.submitAudit(d, b);
    const rA = await d.ledger.receipt(idA);
    const rB = await d.ledger.receipt(idB);
    expect(rA.ref).to.not.equal(rB.ref); // different instances of the same job
    expect(rA.worker).to.equal(a.address);
    expect(rA.pool).to.equal(BigInt(g.POOL_G0));
    expect(rA.epoch).to.equal(0n);
    expect(rA.counterparty).to.equal(ethers.ZeroAddress);
    expect(rA.contributionId).to.equal(g.g0ContributionId(d.ctx.domain, g.AUDIT_V1_FUNCTION_ID, 0, 0, a.address));
    for (const id of [idA, idB]) {
      const st = await d.ledger.status(id);
      expect(st.verdict).to.equal(BigInt(g.VERDICT.ACCEPTED));
      expect(st.ineligible).to.equal(0n);
      expect(st.gmuMeasured).to.equal(10n);
      expect(st.gmuSubsidized).to.equal(10n);
      expect(st.verifier).to.equal(await d.audit.getAddress());
    }
    const s = await d.ledger.epochSummary(0);
    expect(s.receiptCount).to.equal(2n);
    expect(s.measuredG0).to.equal(20n);
    expect(s.subsidizedG0).to.equal(20n);
    expect(await d.ledger.subsidizedOf(0, g.POOL_G0, a.address)).to.equal(10n);
  });

  it("rejects an output copied from another worker, and the attempt is spent (D4)", async () => {
    const [, a, b] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b] });
    const outA = await h.auditOutputFor(d, a);
    await (await d.ledger.connect(a).submitG0(KEY, 0, 0, outA)).wait();
    await (await d.ledger.connect(b).submitG0(KEY, 0, 0, outA)).wait(); // A's answer is not B's
    const id = await d.ledger.receiptCount();
    const st = await d.ledger.status(id);
    expect(st.verdict).to.equal(BigInt(g.VERDICT.REJECTED));
    expect(st.ineligible).to.equal(BigInt(g.INELIGIBLE.REJECTED));
    expect(st.gmuMeasured).to.equal(0n);
    // the rejected receipt stays on record, and B cannot try the instance again
    expect((await d.ledger.receipt(id)).outputHash).to.equal(outA);
    await h.revertsWith(d.ledger.connect(b).submitG0(KEY, 0, 0, await h.auditOutputFor(d, b)), "AlreadySubmitted");
    expect((await d.ledger.epochSummary(0)).subsidizedG0).to.equal(10n);
  });

  it("takes one receipt per instance (D1)", async () => {
    const [, a] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a] });
    await h.submitAudit(d, a);
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 0, 0, await h.auditOutputFor(d, a)), "AlreadySubmitted");
    expect(await d.ledger.receiptCount()).to.equal(1n);
  });

  it("bounds the jobs: by the profile's count and by what the function defines", async () => {
    const [, a] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a] });
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 0, 1, ethers.ZeroHash), "JobIndexOutOfRange");
    // even if a profile version asked for more audits per epoch, the function has one job
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await d.audit.getAddress(), 10, 30, 3, 1)).wait();
    await h.toEpoch(d, 1);
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 1, 1, ethers.ZeroHash), "UndefinedJob");
    await h.submitAudit(d, a);
  });

  it("records the work of an address that is not admitted, measures it, and subsidizes nothing (T3)", async () => {
    const [, a, stranger] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a] });
    const id = await h.submitAudit(d, stranger);
    const st = await d.ledger.status(id);
    expect(st.verdict).to.equal(BigInt(g.VERDICT.ACCEPTED));
    expect(st.ineligible).to.equal(BigInt(g.INELIGIBLE.NOT_ADMITTED));
    expect(st.gmuMeasured).to.equal(10n);
    expect(st.gmuSubsidized).to.equal(0n);
    const s = await d.ledger.epochSummary(0);
    expect(s.measuredG0).to.equal(10n);
    expect(s.subsidizedG0).to.equal(0n);
    // admitted during epoch 0: counted from epoch 1
    await (await d.policy.setAdmission(stranger.address, true)).wait();
    await h.toEpoch(d, 1);
    const id1 = await h.submitAudit(d, stranger);
    expect((await d.ledger.status(id1)).gmuSubsidized).to.equal(10n);
  });

  it("makes the audit of epoch N commit to epoch N-1 as the ledger closed it; a late or stale output earns nothing (R10)", async () => {
    const [, a, b] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b] });
    // epoch 0: the subject is the deployment's configuration
    expect(await d.audit.subjectOf(0)).to.equal(await d.ledger.configHash());
    expect(await d.ledger.configHash()).to.equal(
      g.configHash(d.ctx.domain, await d.policy.getAddress(), await d.seedSource.getAddress(), d.genesisTime, d.duration));
    await h.submitAudit(d, a);
    await h.submitAudit(d, b);
    const staleOutput = await h.auditOutputFor(d, a);

    await h.toEpoch(d, 1);
    const subject0 = await d.ledger.auditSubject(0);
    expect(await d.audit.subjectOf(1)).to.equal(subject0);
    // a submission for epoch 0 that lands in epoch 1 is refused and spends nothing
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 0, 0, staleOutput), "WrongEpoch");
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 2, 0, staleOutput), "WrongEpoch");
    expect((await d.ledger.epochSummary(1)).receiptCount).to.equal(0n);
    // and an output computed in epoch 0 is not an answer in epoch 1
    await (await d.ledger.connect(a).submitG0(KEY, 1, 0, staleOutput)).wait();
    expect((await d.ledger.status(await d.ledger.receiptCount())).verdict).to.equal(BigInt(g.VERDICT.REJECTED));
    // the subject of epoch 0 did not move while epoch 1 took receipts
    const idB = await h.submitAudit(d, b);
    expect((await d.ledger.status(idB)).verdict).to.equal(BigInt(g.VERDICT.ACCEPTED));
    expect(await d.ledger.auditSubject(0)).to.equal(subject0);
    expect((await d.ledger.receipt(idB)).inputHash).to.equal(g.auditInputHash(1, subject0));
  });

  it("refuses a G0 submission under a G1 profile, and any submission while paused (X5)", async () => {
    const [, a] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a] });
    await h.revertsWith(d.ledger.connect(a).submitG0(g.profileKey(g.PROFILE_G1_TENDER), 0, 0, ethers.ZeroHash), "WrongPool");
    await h.revertsWith(d.ledger.connect(a).submitG0(g.profileKey("unknown"), 0, 0, ethers.ZeroHash), "NoActiveProfile");
    await (await d.policy.setPaused(true)).wait();
    await h.revertsWith(d.ledger.connect(a).submitG0(KEY, 0, 0, ethers.ZeroHash), "Paused");
    await (await d.policy.setPaused(false)).wait();
    await h.submitAudit(d, a);
  });
});
