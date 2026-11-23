"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

const P = h.POINTS;
const G0 = g.profileKey(g.PROFILE_G0_REF);
const I = g.INELIGIBLE;

describe("Epochs: closed by time, allocated by a pure function", () => {
  it("allocates each pool in proportion to subsidized GMU, capped per address; the remainder goes to nobody (N3, N4)", async () => {
    const [, w1, w2, w3, w4, w5, d1, d2, third] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, w3, w4, w5, d1, d2], params: { workerCapBps: 6000 } });
    for (const w of [w1, w2, w3, w4, w5]) await h.submitAudit(d, w);
    await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    await h.bridge(d, await h.tender(d, { owner: d2, worker: w1 }));
    await h.bridge(d, await h.tender(d, { owner: d1, worker: w2 }));

    await h.toEpoch(d, 1);
    const s = await d.ledger.epochSummary(0);
    expect(s.ended).to.equal(true);
    expect(s.budget).to.equal(1000n * P);
    expect(s.budgetG0).to.equal(700n * P);
    expect(s.budgetG1).to.equal(300n * P);
    expect(s.subsidizedG0).to.equal(50n);
    expect(s.subsidizedG1).to.equal(150n);

    // G0: 700 x 10/50 = 140 each. G1: w1 300 x 100/150 = 200, capped at 60% of 300 = 180; w2 100.
    const want = new Map([[w1, 320n * P], [w2, 240n * P], [w3, 140n * P], [w4, 140n * P], [w5, 140n * P]]);
    const { pools } = g.poolBudgets(g.plainParams((await d.policy.paramsFor(0))[1]), 0);
    let sum = 0n;
    for (const [w, points] of want) {
      expect(await d.ledger.allocation(0, w.address)).to.equal(points);
      // the same figure from the stored contributions and the client's arithmetic
      const mine = g.share(pools[0], await d.ledger.subsidizedOf(0, 0, w.address), s.subsidizedG0, 6000)
        + g.share(pools[1], await d.ledger.subsidizedOf(0, 1, w.address), s.subsidizedG1, 6000);
      expect(mine).to.equal(points);
      sum += points;
    }
    expect(sum).to.equal(980n * P); // what the cap withheld from w1 is not handed to anyone
    expect(await d.ledger.allocation(0, d1.address)).to.equal(0n);

    // the close record: any account, no figures supplied, nothing changed by it
    const rc = await (await d.ledger.connect(third).seal(0)).wait();
    const [ev] = h.eventsOf(rc, d.ledger, "EpochSealed");
    expect(ev.args.epoch).to.equal(0n);
    expect(ev.args.digest).to.equal(s.digest);
    expect(ev.args.receiptCount).to.equal(8n);
    expect(ev.args.paramsVersion).to.equal(1n);
    expect(ev.args.budget).to.equal(1000n * P);
    expect(ev.args.measuredG0).to.equal(50n);
    expect(ev.args.measuredG1).to.equal(150n);
    expect(ev.args.subsidizedG0).to.equal(50n);
    expect(ev.args.subsidizedG1).to.equal(150n);
    for (const [w, points] of want) expect(await d.ledger.allocation(0, w.address)).to.equal(points);
  });

  it("leaves rounding dust and an empty pool's budget unallocated (X3, X4)", async () => {
    const [, w1, w2, w3] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, w3], params: { workerCapBps: 10000, splitG0Bps: 10000 } });
    for (const w of [w1, w2, w3]) await h.submitAudit(d, w);
    await h.toEpoch(d, 1);
    const each = (1000n * P) / 3n;
    for (const w of [w1, w2, w3]) expect(await d.ledger.allocation(0, w.address)).to.equal(each);
    expect(1000n * P - 3n * each).to.equal(1n); // one base unit belongs to nobody

    // default split: nobody worked in the G1 pool, so its 300 points are allocated to nobody
    const e = await h.deploy({ admit: [w1, w2, w3], params: { workerCapBps: 10000 } });
    for (const w of [w1, w2, w3]) await h.submitAudit(e, w);
    await h.toEpoch(e, 1);
    let sum = 0n;
    for (const w of [w1, w2, w3]) sum += await e.ledger.allocation(0, w.address);
    expect(sum).to.equal(3n * ((700n * P) / 3n));
    expect((await e.ledger.epochSummary(0)).subsidizedG1).to.equal(0n);
  });

  it("gives no final figure and no close record while the epoch runs (R7)", async () => {
    const [, w1, x] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    await h.submitAudit(d, w1);
    await h.revertsWith(d.ledger.allocation(0, w1.address), "EpochNotEnded");
    await h.revertsWith(d.ledger.connect(x).seal(0), "EpochNotEnded");
    await h.revertsWith(d.ledger.connect(x).seal(5), "EpochNotEnded");
    // the provisional figure is readable and says what it is
    expect(await d.ledger.provisionalAllocation(0, w1.address)).to.equal(175n * P);
    expect((await d.ledger.epochSummary(0)).ended).to.equal(false);
    await h.setTime(d.genesisTime + d.duration - 1n);
    await h.revertsWith(d.ledger.allocation(0, w1.address), "EpochNotEnded");
    await h.setTime(d.genesisTime + d.duration);
    expect(await d.ledger.allocation(0, w1.address)).to.equal(175n * P);
  });

  it("depends on nobody to close: the seal is a record, written once, by the next epoch's first use or by anyone (R2, R8)", async () => {
    const [, w1, x] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    await h.submitAudit(d, w1);
    await h.toEpoch(d, 1);
    // nobody has sealed: the figure is final all the same
    expect((await d.ledger.epochSummary(0)).isSealed).to.equal(false);
    expect(await d.ledger.allocation(0, w1.address)).to.equal(175n * P);

    // the first receipt of epoch 1 captures its seed and writes epoch 0's close record
    const out = await h.auditOutputForUnopened(d, w1);
    const rc = await (await d.ledger.connect(w1).submitG0(G0, 1, 0, out)).wait();
    expect(h.eventsOf(rc, d.ledger, "EpochOpened").length).to.equal(1);
    const sealed = h.eventsOf(rc, d.ledger, "EpochSealed");
    expect(sealed.length).to.equal(1);
    expect(sealed[0].args.epoch).to.equal(0n);
    expect((await d.ledger.epochSummary(0)).isSealed).to.equal(true);
    // sealing again writes nothing
    const again = await (await d.ledger.connect(x).seal(0)).wait();
    expect(h.eventsOf(again, d.ledger, "EpochSealed").length).to.equal(0);

    // epochs 2 and 3 pass with no transaction at all; work resumes in epoch 4
    await h.toEpoch(d, 4);
    const quiet = await d.ledger.epochSummary(2);
    expect(quiet.opened).to.equal(false);
    expect(quiet.ended).to.equal(true);
    expect(quiet.receiptCount).to.equal(0n);
    expect(await d.ledger.allocation(2, w1.address)).to.equal(0n);
    const rc4 = await (await d.ledger.openEpoch()).wait();
    expect(h.eventsOf(rc4, d.ledger, "EpochSealed").map((e) => e.args.epoch)).to.deep.equal([3n]); // the one before
    // the ones in between are sealed by whoever wants the record; their figures never needed it
    const rc2 = await (await d.ledger.connect(x).seal(2)).wait();
    const [ev2] = h.eventsOf(rc2, d.ledger, "EpochSealed");
    expect(ev2.args.receiptCount).to.equal(0n);
    expect(ev2.args.digest).to.equal(ethers.ZeroHash);
    expect((await d.ledger.epochSummary(1)).isSealed).to.equal(false);
    expect(await d.ledger.allocation(1, w1.address)).to.equal(175n * P);
  });

  it("freezes an ended epoch: later work, later policy and later admissions do not move it", async () => {
    const [, w1, w2, w3, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, d1] });
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await h.submitAudit(d, w3); // not admitted: measured only
    await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    const unbridged = await h.tender(d, { owner: d1, worker: w2 });
    await h.toEpoch(d, 1);
    const subject = await d.ledger.auditSubject(0);
    const table = [];
    for (const w of [w1, w2, w3]) table.push(await d.ledger.allocation(0, w.address));

    await (await d.policy.setAdmission(w3.address, true)).wait();
    await (await d.policy.setAdmission(w1.address, false)).wait();
    await (await d.policy.declareOperator(w1.address, 9)).wait();
    await (await d.policy.declareOperator(d1.address, 9)).wait();
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, workerCapBps: 100, budgetBase: 1n })).wait();
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await d.audit.getAddress(), 99, 99, 1, 2)).wait();
    for (const w of [w1, w2, w3]) await h.submitAudit(d, w);
    await h.bridge(d, unbridged); // settled in epoch 0, bridged in epoch 1: belongs to epoch 1
    await h.toEpoch(d, 3);
    for (const w of [w1, w2, w3]) await h.submitAudit(d, w);
    await (await d.ledger.seal(1)).wait();
    await (await d.ledger.seal(0)).wait();

    expect(await d.ledger.auditSubject(0)).to.equal(subject);
    expect((await d.ledger.epochSummary(0)).receiptCount).to.equal(4n);
    expect((await d.ledger.epochSummary(0)).budget).to.equal(1000n * P);
    const after = [];
    for (const w of [w1, w2, w3]) after.push(await d.ledger.allocation(0, w.address));
    expect(after).to.deep.equal(table);
  });

  it("gives one table whatever the order of reading and sealing (X10)", async () => {
    const [, w1, w2, w3, w4, w5, d1, x] = await ethers.getSigners();
    const workers = [w1, w2, w3, w4, w5];
    const run = async (order, sealFirst) => {
      const d = await h.deploy({ admit: [...workers, d1] });
      for (const w of workers) await h.submitAudit(d, w);
      await h.bridge(d, await h.tender(d, { owner: d1, worker: w2 }));
      await h.bridge(d, await h.tender(d, { owner: d1, worker: w4 }));
      await h.toEpoch(d, 2);
      if (sealFirst) { await (await d.ledger.connect(x).seal(1)).wait(); await (await d.ledger.connect(x).seal(0)).wait(); }
      const table = new Map();
      for (const i of order) table.set(i, await d.ledger.allocation(0, workers[i].address));
      if (!sealFirst) await (await d.ledger.connect(w3).seal(0)).wait();
      // read again, in pages of two, backwards
      for (const page of [[4, 3], [2, 1], [0]]) for (const i of page) expect(await d.ledger.allocation(0, workers[i].address)).to.equal(table.get(i));
      return [0, 1, 2, 3, 4].map((i) => table.get(i));
    };
    const a = await run([0, 1, 2, 3, 4], true);
    const b = await run([4, 2, 0, 3, 1], false);
    expect(a).to.deep.equal(b);
    expect(a.reduce((x1, y) => x1 + y, 0n) <= 1000n * P).to.equal(true);
    // w2 and w4 hold the G1 pool: 150 each, capped at 75; everyone holds 140 of G0
    expect(a).to.deep.equal([140n * P, 215n * P, 140n * P, 215n * P, 140n * P]);
  });

  it("applies a parameter change from the next epoch; the running epoch keeps the set it started with (V1)", async () => {
    const [, w1, w2] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2] });
    await h.submitAudit(d, w1);
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 1, budgetBase: 400n * P, splitG0Bps: 5000, workerCapBps: 5000 })).wait();
    await h.submitAudit(d, w2); // after the registration, still epoch 0: old parameters
    expect(await d.ledger.provisionalAllocation(0, w2.address)).to.equal(175n * P);
    await h.toEpoch(d, 1);
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await h.toEpoch(d, 2);
    expect((await d.ledger.epochSummary(0)).paramsVersion).to.equal(1n);
    expect((await d.ledger.epochSummary(1)).paramsVersion).to.equal(2n);
    expect(await d.ledger.allocation(0, w1.address)).to.equal(175n * P); // 25% of 700
    expect(await d.ledger.allocation(1, w1.address)).to.equal(100n * P); // 50% of 200
  });

  it("counts a late acceptance in the epoch it is recorded in, under that epoch's rules, and nowhere else (R9)", async () => {
    const [, w1, w2, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, d1] });
    const late = await h.tender(d, { owner: d1, worker: w1, settle: false, reward: ethers.parseEther("0.002") });   // delivered in epoch 0
    const cheap = await h.tender(d, { owner: d1, worker: w2, settle: false, reward: ethers.parseEther("0.001") });
    await h.submitAudit(d, w1);
    // from epoch 2 on the minimum bounty is 0.002
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, minBountyWei: ethers.parseEther("0.002") })).wait();
    await h.toEpoch(d, 1);
    for (const t of [late, cheap]) await (await d.taskToken.connect(d1).acceptFulfillment(t.tokenId, t.submissionId)).wait(); // accepted in epoch 1
    const subject0 = await d.ledger.auditSubject(0);
    const subject1 = await d.ledger.auditSubject(1);
    await h.toEpoch(d, 2);
    const a = await h.bridge(d, late);   // bridged in epoch 2
    const b = await h.bridge(d, cheap);
    expect(a.receipt.epoch).to.equal(2n);
    expect(a.status.ineligible).to.equal(I.NONE);
    expect(b.receipt.epoch).to.equal(2n);
    expect(b.status.ineligible).to.equal(I.BOUNTY); // eligible under epoch 0's rules, not under epoch 2's
    expect(await d.ledger.auditSubject(0)).to.equal(subject0);
    expect(await d.ledger.auditSubject(1)).to.equal(subject1);
    expect((await d.ledger.epochSummary(0)).measuredG1).to.equal(0n);
    expect((await d.ledger.epochSummary(1)).measuredG1).to.equal(0n);
    expect((await d.ledger.epochSummary(2)).measuredG1).to.equal(100n);
    expect((await d.ledger.epochSummary(2)).subsidizedG1).to.equal(50n);
  });

  it("does not stop one controller from splitting across addresses: the share cap binds an address, not a party (D6)", async () => {
    const [, honest, c1, c2, c3, c4] = await ethers.getSigners();
    const pool = 700n * P;
    // one address each: two workers, each capped at 25% of the pool
    const single = await h.deploy({ admit: [honest, c1] });
    for (const w of [honest, c1]) await h.submitAudit(single, w);
    await h.toEpoch(single, 1);
    expect(await single.ledger.allocation(0, c1.address)).to.equal(pool / 4n);

    // the same controller with four admitted addresses and nothing declared
    const split = await h.deploy({ admit: [honest, c1, c2, c3, c4] });
    for (const w of [honest, c1, c2, c3, c4]) await h.submitAudit(split, w);
    await h.toEpoch(split, 1);
    let controller = 0n;
    for (const w of [c1, c2, c3, c4]) controller += await split.ledger.allocation(0, w.address);
    expect(controller).to.equal((pool * 4n) / 5n);          // 80% of the pool, against a 25% cap
    expect(await split.ledger.allocation(0, honest.address)).to.equal(pool / 5n);

    // and alone, four addresses take the whole pool
    const alone = await h.deploy({ admit: [c1, c2, c3, c4] });
    for (const w of [c1, c2, c3, c4]) await h.submitAudit(alone, w);
    await h.toEpoch(alone, 1);
    let all = 0n;
    for (const w of [c1, c2, c3, c4]) all += await alone.ledger.allocation(0, w.address);
    expect(all).to.equal(pool);

    // declaring the four under one operator changes no figure in this version; it makes the
    // concentration visible in the audit report (test/audit.test.js), and admission is the control
    const declared = await h.deploy({
      admit: [honest, c1, c2, c3, c4],
      operators: { [c1.address]: 5, [c2.address]: 5, [c3.address]: 5, [c4.address]: 5 },
    });
    for (const w of [honest, c1, c2, c3, c4]) await h.submitAudit(declared, w);
    await h.toEpoch(declared, 1);
    let same = 0n;
    for (const w of [c1, c2, c3, c4]) same += await declared.ledger.allocation(0, w.address);
    expect(same).to.equal(controller);
  });

  it("carries a contribution across profile versions once: recorded under one version, it cannot be recorded under the next (V6)", async () => {
    const [, w1, w2, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, d1] });
    const t1 = await h.tender(d, { owner: d1, worker: w1 });
    const t2 = await h.tender(d, { owner: d1, worker: w2 }); // settled under version 1, not bridged
    const first = await h.bridge(d, t1);

    // version 2 of the G1 profile: a new adapter and a different base, from epoch 2
    const Adapter = await ethers.getContractFactory("TenderAdapter8414");
    const adapter2 = await Adapter.deploy(await d.ledger.getAddress(), await d.taskToken.getAddress(), g.PROFILE_G1_TENDER);
    await (await d.policy.registerProfile(g.PROFILE_G1_TENDER, g.POOL_G1, await adapter2.getAddress(), 80, 200, 0, 2)).wait();
    // until its epoch the new adapter is refused, the old one serves
    await h.revertsWith(adapter2.connect(d1).bridge(t2.tokenId, t2.submissionId), "NotAdapter");

    await h.toEpoch(d, 2);
    // the old adapter is no longer the profile's module, even for what it recorded itself
    await h.revertsWith(d.adapter.connect(d1).bridge(t2.tokenId, t2.submissionId), "NotAdapter");
    await h.revertsWith(d.adapter.connect(d1).bridge(t1.tokenId, t1.submissionId), "NotAdapter");
    // the recorded contribution is found, not recorded again
    const again = await h.bridge(d, t1, d1, adapter2);
    expect(again.id).to.equal(first.id);
    expect(again.receipt.epoch).to.equal(0n);
    expect(again.status.gmuMeasured).to.equal(50n);
    // the one that was left behind is recovered under the version now in force, once
    const recovered = await h.bridge(d, t2, d1, adapter2);
    expect(recovered.receipt.epoch).to.equal(2n);
    expect(recovered.status.gmuMeasured).to.equal(80n);
    expect(recovered.receipt.profileId).to.not.equal(first.receipt.profileId);
    expect((await h.bridge(d, t2, d1, adapter2)).id).to.equal(recovered.id);
    expect(await d.ledger.receiptCount()).to.equal(2n);
    expect((await d.ledger.epochSummary(0)).measuredG1).to.equal(50n);
    expect((await d.ledger.epochSummary(2)).measuredG1).to.equal(80n);
  });

  it("measures each receipt under the profile version of its epoch (V3)", async () => {
    const [, w1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await d.audit.getAddress(), 30, 30, 1, 2)).wait();
    const ids = [];
    for (const e of [0, 1, 2]) { if (e) await h.toEpoch(d, e); ids.push(await h.submitAudit(d, w1)); }
    const v1 = (await d.policy.activeProfile(G0, 0)).id;
    const v2 = (await d.policy.activeProfile(G0, 2)).id;
    expect((await d.ledger.receipt(ids[0])).profileId).to.equal(v1);
    expect((await d.ledger.receipt(ids[1])).profileId).to.equal(v1);
    expect((await d.ledger.receipt(ids[2])).profileId).to.equal(v2);
    expect((await d.ledger.status(ids[1])).gmuMeasured).to.equal(10n);
    expect((await d.ledger.status(ids[2])).gmuMeasured).to.equal(30n);
  });

  it("stops taking work under a retired profile and keeps what was recorded (V2)", async () => {
    const [, w1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    const id = await h.submitAudit(d, w1);
    await (await d.policy.retireProfile(G0, 1)).wait();
    await h.toEpoch(d, 1);
    await h.revertsWith(d.ledger.connect(w1).submitG0(G0, 1, 0, ethers.ZeroHash), "NoActiveProfile");
    expect((await d.ledger.status(id)).gmuSubsidized).to.equal(10n);
    expect(await d.ledger.allocation(0, w1.address)).to.equal(175n * P);
  });

  it("keeps running when a profile's module fails and when the steward is gone (R5, R6)", async () => {
    const [, w1, w2, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, d1] });
    // a second G0 profile whose module does not answer
    const Token = await ethers.getContractFactory("TestToken");
    const notAFunction = await Token.deploy();
    await (await d.policy.registerProfile("g0.broken", g.POOL_G0, await notAFunction.getAddress(), 10, 10, 1, 1)).wait();
    // from here on the steward does nothing
    await h.toEpoch(d, 1);
    let failed = false;
    try { await d.ledger.connect(w1).submitG0(g.profileKey("g0.broken"), 1, 0, ethers.ZeroHash); } catch { failed = true; }
    expect(failed).to.equal(true);
    expect((await d.ledger.epochSummary(1)).receiptCount).to.equal(0n);
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await h.bridge(d, await h.tender(d, { owner: d1, worker: w2 }));
    await h.toEpoch(d, 9); // the schedule registered at deployment runs on: one halving at epoch 8
    await h.submitAudit(d, w1);
    await h.toEpoch(d, 10);
    await (await d.ledger.connect(w2).seal(1)).wait();
    expect(await d.ledger.allocation(1, w1.address)).to.equal(175n * P);
    expect(await d.ledger.allocation(1, w2.address)).to.equal(175n * P + 75n * P);
    expect((await d.ledger.epochSummary(9)).budget).to.equal(500n * P);
    expect(await d.ledger.allocation(9, w1.address)).to.equal((350n * P) / 4n);
  });

  it("keeps deployments apart: receipts and outputs of one mean nothing to another (D3, V4)", async () => {
    const [, w1] = await ethers.getSigners();
    const a = await h.deploy({ admit: [w1], seed: "fixed" });
    const b = await h.deploy({ admit: [w1], seed: "fixed", start: false });
    await h.setTime(b.genesisTime);
    expect(a.ctx.domain).to.not.equal(b.ctx.domain);
    expect(a.ctx.domain).to.equal(g.ledgerDomain(31337n, await a.ledger.getAddress()));
    // the same worker, the same job, the same seed material: different instances, different answers
    const outA = await h.auditOutputFor(a, w1);
    const outB = await h.auditOutputFor(b, w1);
    expect(outA).to.not.equal(outB);
    await (await b.ledger.connect(w1).submitG0(G0, 0, 0, outA)).wait(); // a's answer replayed against b
    expect((await b.ledger.status(1)).verdict).to.equal(BigInt(g.VERDICT.REJECTED));
    expect(await a.ledger.receiptCount()).to.equal(0n);
    await h.revertsWith(a.ledger.receipt(1), "UnknownReceipt");
  });
});
