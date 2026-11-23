"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

describe("GenesisPolicy", () => {
  it("runs a fixed clock from genesis", async () => {
    const d = await h.deploy({ start: false, duration: 3600n });
    expect(await d.policy.started()).to.equal(false);
    expect(await d.policy.nextEpoch()).to.equal(0n);
    await h.revertsWith(d.policy.currentEpoch(), "NotStarted");
    await h.setTime(d.genesisTime);
    expect(await d.policy.currentEpoch()).to.equal(0n);
    expect(await d.policy.nextEpoch()).to.equal(1n);
    await h.setTime(d.genesisTime + 3599n);
    expect(await d.policy.currentEpoch()).to.equal(0n);
    await h.setTime(d.genesisTime + 3600n);
    expect(await d.policy.currentEpoch()).to.equal(1n);
    expect(await d.policy.epochStart(5)).to.equal(d.genesisTime + 5n * 3600n);
    expect(await d.policy.epochEnd(5)).to.equal(d.genesisTime + 6n * 3600n);
  });

  it("refuses a genesis in the past, a zero duration and impossible parameters", async () => {
    const [steward] = await ethers.getSigners();
    const Policy = await ethers.getContractFactory("GenesisPolicy");
    const t = await h.now();
    await h.revertsWith(Policy.deploy(steward.address, t - 10n, 3600, h.DEFAULT_PARAMS), "BadParams");
    await h.revertsWith(Policy.deploy(steward.address, t + 1000n, 0, h.DEFAULT_PARAMS), "BadParams");
    await h.revertsWith(Policy.deploy(ethers.ZeroAddress, t + 1000n, 3600, h.DEFAULT_PARAMS), "BadParams");
    await h.revertsWith(Policy.deploy(steward.address, t + 1000n, 3600, { ...h.DEFAULT_PARAMS, splitG0Bps: 10001 }), "BadParams");
    await h.revertsWith(Policy.deploy(steward.address, t + 1000n, 3600, { ...h.DEFAULT_PARAMS, workerCapBps: 0 }), "BadParams");
  });

  it("applies a new parameter version from a later epoch only (V1)", async () => {
    const d = await h.deploy();
    const [v1, p1] = await d.policy.paramsFor(0);
    expect(v1).to.equal(1n);
    expect(p1.workerCapBps).to.equal(2500n);

    // not for the running epoch, not out of order
    await h.revertsWith(d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 0, workerCapBps: 5000 }), "BadActivation");
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, workerCapBps: 5000 })).wait();
    await h.revertsWith(d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 1, workerCapBps: 6000 }), "BadActivation");

    expect((await d.policy.paramsFor(0))[1].workerCapBps).to.equal(2500n);
    expect((await d.policy.paramsFor(1))[1].workerCapBps).to.equal(2500n);
    const [v2, p2] = await d.policy.paramsFor(2);
    expect(v2).to.equal(2n);
    expect(p2.workerCapBps).to.equal(5000n);
    expect((await d.policy.paramsFor(99))[0]).to.equal(2n);
    expect(await d.policy.paramsCount()).to.equal(2n);
  });

  it("lets a version that is still ahead be replaced, and never one whose epoch has begun", async () => {
    const d = await h.deploy();
    const key = g.profileKey(g.PROFILE_G0_REF);
    const audit = await d.audit.getAddress();
    // parameters for epoch 2, corrected while epoch 2 is still ahead: one version, the later content
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, workerCapBps: 5000 })).wait();
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, workerCapBps: 6000 })).wait();
    expect(await d.policy.paramsCount()).to.equal(2n);
    expect((await d.policy.paramsFor(2))[1].workerCapBps).to.equal(6000n);
    // a profile version for epoch 2, retired, then registered again: the replacement is not retired
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 20, 20, 1, 2)).wait();
    await (await d.policy.retireProfile(key, 4)).wait();
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 25, 50, 1, 2)).wait();
    expect((await d.policy.profileVersions(key)).length).to.equal(2);
    const v2 = await d.policy.activeProfile(key, 9);
    expect(v2.version).to.equal(2n);
    expect(v2.baseGmu).to.equal(25n);
    expect((await d.policy.activeProfile(key, 1)).version).to.equal(1n);

    // a first version that is still ahead can be corrected in every respect, its pool included;
    // once a version stands, the name's pool is fixed
    await (await d.policy.registerProfile("g1.other", g.POOL_G0, audit, 10, 10, 1, 1)).wait();
    await (await d.policy.registerProfile("g1.other", g.POOL_G1, audit, 10, 10, 0, 1)).wait();
    expect((await d.policy.activeProfile(g.profileKey("g1.other"), 1)).pool).to.equal(1n);
    expect((await d.policy.profileVersions(g.profileKey("g1.other"))).length).to.equal(1);
    await h.revertsWith(d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G1, audit, 25, 50, 0, 2), "BadActivation");

    // epoch 2 begins: both are now fixed; only a later epoch can be given a new version
    await h.toEpoch(d, 2);
    await h.revertsWith(d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, workerCapBps: 7000 }), "BadActivation");
    await h.revertsWith(d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 30, 30, 1, 2), "BadActivation");
    expect((await d.policy.paramsFor(2))[1].workerCapBps).to.equal(6000n);
    expect((await d.policy.activeProfile(key, 2)).baseGmu).to.equal(25n);
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 3, workerCapBps: 7000 })).wait();
    expect(await d.policy.paramsCount()).to.equal(3n);
  });

  it("halves the budget on the version's schedule", async () => {
    const d = await h.deploy();
    expect(await d.policy.budgetFor(0)).to.equal(1000n * h.POINTS);
    expect(await d.policy.budgetFor(7)).to.equal(1000n * h.POINTS);
    expect(await d.policy.budgetFor(8)).to.equal(500n * h.POINTS);
    expect(await d.policy.budgetFor(16)).to.equal(250n * h.POINTS);
    expect(await d.policy.budgetFor(8 * 200)).to.equal(0n);
    // a later version restarts the schedule from its own first epoch; a zero interval is a constant budget
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 10, budgetBase: 64n * h.POINTS, halvingInterval: 0 })).wait();
    expect(await d.policy.budgetFor(9)).to.equal(500n * h.POINTS);
    expect(await d.policy.budgetFor(10)).to.equal(64n * h.POINTS);
    expect(await d.policy.budgetFor(1000)).to.equal(64n * h.POINTS);
  });

  it("versions profiles: a new version takes over from its epoch, the old one serves until then (V3)", async () => {
    const d = await h.deploy();
    const key = g.profileKey(g.PROFILE_G0_REF);
    const v1 = await d.policy.activeProfile(key, 0);
    expect(v1.version).to.equal(1n);
    expect(v1.baseGmu).to.equal(10n);
    expect(v1.id).to.equal(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint32"], [key, 1])));

    const audit = await d.audit.getAddress();
    await h.revertsWith(d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 20, 20, 1, 0), "BadActivation");
    await h.revertsWith(d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G1, audit, 20, 20, 0, 3), "BadActivation"); // the pool of a name is fixed
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 20, 20, 1, 3)).wait();

    expect((await d.policy.activeProfile(key, 2)).version).to.equal(1n);
    const v2 = await d.policy.activeProfile(key, 3);
    expect(v2.version).to.equal(2n);
    expect(v2.baseGmu).to.equal(20n);
    expect((await d.policy.profileVersions(key)).length).to.equal(2);
  });

  it("refuses malformed profiles", async () => {
    const d = await h.deploy();
    const audit = await d.audit.getAddress();
    await h.revertsWith(d.policy.registerProfile("", g.POOL_G0, audit, 10, 10, 1, 5), "BadProfile");
    await h.revertsWith(d.policy.registerProfile("x", 2, audit, 10, 10, 1, 5), "BadProfile");
    await h.revertsWith(d.policy.registerProfile("x", g.POOL_G0, ethers.ZeroAddress, 10, 10, 1, 5), "BadProfile");
    await h.revertsWith(d.policy.registerProfile("x", g.POOL_G0, audit, 0, 10, 1, 5), "BadProfile");
    await h.revertsWith(d.policy.registerProfile("x", g.POOL_G0, audit, 10, 9, 1, 5), "BadProfile");
    await h.revertsWith(d.policy.registerProfile("x", g.POOL_G0, audit, 10, 10, 0, 5), "BadProfile"); // G0 needs jobs
    await h.revertsWith(d.policy.registerProfile("x", g.POOL_G1, audit, 10, 10, 1, 5), "BadProfile"); // G1 has none
  });

  it("retires a profile from a later epoch; a retirement in force is final (V2)", async () => {
    const d = await h.deploy();
    const key = g.profileKey(g.PROFILE_G0_REF);
    await h.revertsWith(d.policy.retireProfile(key, 0), "BadActivation");
    await (await d.policy.retireProfile(key, 2)).wait();
    expect((await d.policy.activeProfile(key, 1)).version).to.equal(1n);
    await h.revertsWith(d.policy.activeProfile(key, 2), "NoActiveProfile");
    // still pending: it can be moved
    await (await d.policy.retireProfile(key, 3)).wait();
    expect((await d.policy.activeProfile(key, 2)).version).to.equal(1n);
    await h.toEpoch(d, 3);
    await h.revertsWith(d.policy.retireProfile(key, 9), "BadActivation");
    // work of that kind resumes with a new version
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await d.audit.getAddress(), 10, 10, 1, 5)).wait();
    await h.revertsWith(d.policy.activeProfile(key, 4), "NoActiveProfile");
    expect((await d.policy.activeProfile(key, 5)).version).to.equal(2n);
  });

  it("locks admissions and operator declarations before the epoch they apply to", async () => {
    const [, a] = await ethers.getSigners();
    const d = await h.deploy();
    expect(await d.policy.isAdmitted(a.address)).to.equal(false);
    await (await d.policy.setAdmission(a.address, true)).wait();
    await (await d.policy.declareOperator(a.address, 7)).wait();
    // decided during epoch 0: not in force in epoch 0
    expect(await d.policy.isAdmitted(a.address)).to.equal(false);
    expect(await d.policy.operatorOf(a.address)).to.equal(0n);
    await h.toEpoch(d, 1);
    expect(await d.policy.isAdmitted(a.address)).to.equal(true);
    expect(await d.policy.operatorOf(a.address)).to.equal(7n);
    // a withdrawal follows the same rule, and a second change before it applies replaces the first
    await (await d.policy.setAdmission(a.address, false)).wait();
    await (await d.policy.declareOperator(a.address, 8)).wait();
    await (await d.policy.declareOperator(a.address, 9)).wait();
    expect(await d.policy.isAdmitted(a.address)).to.equal(true);
    expect(await d.policy.operatorOf(a.address)).to.equal(7n);
    await h.toEpoch(d, 2);
    expect(await d.policy.isAdmitted(a.address)).to.equal(false);
    expect(await d.policy.operatorOf(a.address)).to.equal(9n);
    await h.toEpoch(d, 5);
    expect(await d.policy.operatorOf(a.address)).to.equal(9n);
  });

  it("reserves policy changes to the steward and hands stewardship over in two steps", async () => {
    const [steward, a, b] = await ethers.getSigners();
    const d = await h.deploy();
    const p = d.policy.connect(a);
    await h.revertsWith(p.setAdmission(a.address, true), "NotSteward");
    await h.revertsWith(p.declareOperator(a.address, 1), "NotSteward");
    await h.revertsWith(p.setPaused(true), "NotSteward");
    await h.revertsWith(p.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 5 }), "NotSteward");
    await h.revertsWith(p.registerProfile("x", g.POOL_G0, a.address, 1, 1, 1, 5), "NotSteward");
    await h.revertsWith(p.retireProfile(g.profileKey(g.PROFILE_G0_REF), 5), "NotSteward");
    await h.revertsWith(p.transferStewardship(a.address), "NotSteward");

    await (await d.policy.transferStewardship(a.address)).wait();
    expect(await d.policy.steward()).to.equal(steward.address);
    await h.revertsWith(d.policy.connect(b).acceptStewardship(), "NotPendingSteward");
    await (await p.acceptStewardship()).wait();
    expect(await d.policy.steward()).to.equal(a.address);
    await h.revertsWith(d.policy.setPaused(true), "NotSteward");
    await (await p.setPaused(true)).wait();
    expect(await d.policy.paused()).to.equal(true);
  });
});
