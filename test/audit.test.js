"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

const P = h.POINTS;
const I = g.INELIGIBLE;
const KEY = g.profileKey(g.PROFILE_G0_REF);

/// A view of a contract with some members replaced: what an auditor would see if the ledger's
/// answers, or its log, differed from what the chain's rules produce.
function tampered(contract, overrides) {
  return new Proxy(contract, {
    get: (target, key) => {
      if (key in overrides) return overrides[key];
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

const show = (report) => JSON.stringify(g.jsonable(report.findings), null, 2);

/// One epoch with every kind of receipt in it.
async function mixedEpoch(options = {}) {
  const [, w1, w2, w3, d1, d2, stranger, fresh] = await ethers.getSigners();
  const d = await h.deploy({
    admit: [w1, w2, w3, d1, d2], operators: { [w3.address]: 7, [d2.address]: 7 }, ...options,
  });
  const Token = await ethers.getContractFactory("TestToken");
  const token = await Token.deploy();

  // G0: two admitted workers, one address that is not admitted, one wrong output
  await h.submitAudit(d, w1);
  await h.submitAudit(d, w2);
  await h.submitAudit(d, stranger);
  await (await d.ledger.connect(w3).submitG0(KEY, 0, 0, ethers.id("not the answer"))).wait();

  // G1: one of each outcome
  const tenders = {};
  tenders.eligible = await h.tender(d, { owner: d1, worker: w1 });
  tenders.pairCap = await h.tender(d, { owner: d1, worker: w1 });
  tenders.selfDealing = await h.tender(d, { owner: w1, worker: w1 });
  tenders.related = await h.tender(d, { owner: d2, worker: w3 });
  tenders.erc20 = await h.tender(d, { owner: d1, worker: w2, asset: await token.getAddress(), reward: ethers.parseEther("3") });
  tenders.cheap = await h.tender(d, { owner: d1, worker: w2, reward: ethers.parseEther("0.0001") });
  tenders.notAdmitted = await h.tender(d, { owner: d1, worker: stranger });
  tenders.freshDemander = await h.tender(d, { owner: fresh, worker: w3 });
  tenders.byDefault = await h.tender(d, { owner: d1, worker: w2, settle: false, judgmentWindow: 600 });
  await h.setTime((await h.now()) + 601n);
  await (await d.taskToken.connect(w2).claimUnjudged(tenders.byDefault.tokenId, tenders.byDefault.submissionId)).wait();
  const out = {};
  for (const [name, t] of Object.entries(tenders)) out[name] = await h.bridge(d, t);
  return { d, w1, w2, w3, d1, d2, stranger, fresh, tenders, out, token };
}

describe("The reference client: a worker's audit job and the independent audit of an epoch", () => {
  it("does the audit job: recomputes the previous epoch from the log and submits its own instance (N1)", async () => {
    const [, w1, w2] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2] });
    const first = await g.workAudit(d.ctx, w1);
    expect(first.epoch).to.equal(0n);
    expect(first.audited).to.equal(null); // epoch 0 audits the deployment's configuration
    expect(first.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(first.status.gmuSubsidized).to.equal(10n);
    await g.workAudit(d.ctx, w2);

    await h.toEpoch(d, 1);
    const second = await g.workAudit(d.ctx, w2);
    expect(second.epoch).to.equal(1n);
    expect(second.audited).to.equal(0n);
    expect(second.receiptsAudited).to.equal(2);
    expect(second.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    // the same worker cannot do the job twice
    await h.revertsWith(g.workAudit(d.ctx, w2), "AlreadySubmitted");
  });

  it("recomputes a mixed epoch from primary data and agrees with the ledger on every figure (N5, T5)", async () => {
    const { d, w1, w2, w3, stranger, out } = await mixedEpoch();
    expect(out.eligible.status.ineligible).to.equal(I.NONE);
    expect(out.pairCap.status.ineligible).to.equal(I.PAIR_CAP);
    expect(out.selfDealing.status.ineligible).to.equal(I.SELF_DEALING);
    expect(out.related.status.ineligible).to.equal(I.RELATION);
    expect(out.erc20.status.ineligible).to.equal(I.ASSET);
    expect(out.cheap.status.ineligible).to.equal(I.BOUNTY);
    expect(out.notAdmitted.status.ineligible).to.equal(I.NOT_ADMITTED);
    expect(out.freshDemander.status.ineligible).to.equal(I.DEMANDER_NOT_ADMITTED);
    expect(out.byDefault.status.ineligible).to.equal(I.NONE);

    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, show(report)).to.equal(true);
    expect(report.findings).to.deep.equal([]);
    expect(report.mode).to.equal("standard");
    expect(report.receiptCount).to.equal(13n);
    expect(report.totals.measured).to.deep.equal([30n, 450n]);
    expect(report.totals.subsidized).to.deep.equal([20n, 100n]);
    expect(report.budget).to.equal(1000n * P);

    // the table: the same figures as the ledger's view, for every address that has a receipt
    const byWorker = new Map(report.table.map((row) => [row.worker, row]));
    for (const w of [w1, w2, w3, stranger]) {
      expect(byWorker.get(w.address).allocation).to.equal(await d.ledger.allocation(0, w.address));
    }
    expect(byWorker.get(w1.address).allocation).to.equal(175n * P + 75n * P); // capped in both pools
    expect(byWorker.get(w2.address).allocation).to.equal(175n * P + 75n * P);
    expect(byWorker.get(w3.address).allocation).to.equal(0n);
    expect(byWorker.get(stranger.address).allocation).to.equal(0n);
    expect(byWorker.get(stranger.address).measured).to.deep.equal([10n, 50n]); // measured, not subsidized
    expect(report.allocated).to.equal(500n * P);
    expect(report.unallocated).to.equal(500n * P);
    expect(report.tableHash).to.equal(g.tableHashOf(report.table));

    // what the figures alone do not say
    expect(report.g1.receipts).to.equal(9);
    expect(report.g1.subsidized).to.equal(2);
    expect(report.g1.bySettlement).to.deep.equal({ judged: 8, default: 1 });
    expect(report.g1.subsidizedBySettlement).to.deep.equal({ judged: 1, default: 1 });
    expect(report.g1.byRelation).to.deep.equal({ "none-found": 8, "declared-related": 1 });
    expect(report.g1.subsidizedByRelation).to.deep.equal({ "none-found": 2 });
    // a second, independent run gives the same table
    const again = await g.auditEpoch(await g.connect(d.manifest, ethers.provider, { tag: "latest", logChunk: 3 }), 0);
    expect(again.ok).to.equal(true);
    expect(again.tableHash).to.equal(report.tableHash);
    expect(again.subject).to.equal(report.subject);
  });

  it("reads the tender's history from its log: later changes of owner, judge and task do not change an audit", async () => {
    const { d, w1, d1, d2, tenders } = await mixedEpoch();
    const t = tenders.eligible;
    // after the bridge the tender moves on: new owner, new judge, new task version
    await (await d.taskToken.connect(d1).setAcceptanceAuthority(t.tokenId, w1.address)).wait();
    await (await d.taskToken.connect(d1).updateTask(t.tokenId, ethers.id("td v2"), ethers.id("task v2"))).wait();
    await (await d.taskToken.connect(d1).transferFrom(d1.address, w1.address, t.tokenId)).wait();
    expect(await d.taskToken.ownerOf(t.tokenId)).to.equal(w1.address); // the state now reads as self-dealing
    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, show(report)).to.equal(true);
    const item = report.receipts.find((it) => it.tender && it.tender.tokenId === t.tokenId && it.tender.submissionId === t.submissionId);
    expect(item.tender.demander).to.equal(d1.address);
    expect(item.tender.judge).to.equal(d1.address);
    expect(item.status.ineligible).to.equal(I.NONE);
    expect(d2.address).to.not.equal(d1.address);
  });

  it("reads the log in ranges as small as an endpoint allows, with the same result (R3)", async () => {
    const { d, tenders } = await mixedEpoch();
    await h.toEpoch(d, 1);
    const whole = await g.auditEpoch(d.ctx, 0);
    expect(whole.ok, show(whole)).to.equal(true);
    for (const logChunk of [1, 7, 1000]) {
      const inRanges = await g.auditEpoch({ ...d.ctx, logChunk }, 0);
      expect(inRanges.ok, show(inRanges)).to.equal(true);
      expect(inRanges.tableHash).to.equal(whole.tableHash);
      expect(inRanges.subject).to.equal(whole.subject);
      expect(g.jsonable(inRanges.receipts)).to.deep.equal(g.jsonable(whole.receipts));
    }
    // a tender's history is read from its mint on, wherever the tender contract itself began
    const head = (await ethers.provider.getBlock("latest")).number;
    const mint = (await d.taskToken.queryFilter(d.taskToken.filters.Transfer(ethers.ZeroAddress, null, tenders.eligible.tokenId)))[0].blockNumber;
    expect(await g.mintBlockOf({ ...d.ctx, logChunk: 3 }, d.taskToken, tenders.eligible.tokenId, head)).to.equal(mint);
    expect(await g.mintBlockOf(d.ctx, d.taskToken, tenders.eligible.tokenId, head)).to.equal(mint);
    // the manifest can carry the range its chain's endpoint serves; an explicit choice comes first
    expect((await g.connect({ ...d.manifest, logChunk: 5000 }, ethers.provider)).logChunk).to.equal(5000);
    expect((await g.connect({ ...d.manifest, logChunk: 5000 }, ethers.provider, { logChunk: 0 })).logChunk).to.equal(0);
    expect((await g.connect(d.manifest, ethers.provider)).logChunk).to.equal(0);
  });

  it("reports what a tender's log shows and the ledger's rules cannot read: who owned and judged it when it settled (D11, D17)", async () => {
    const [, a, b, c] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, c], params: { maxSubsidizedPerPair: 5, maxSubsidizedPerDemander: 5 } });
    const plain = await h.bridge(d, await h.tender(d, { owner: c, worker: a }));               // nothing to note
    const selfJudged = await h.tender(d, { owner: c, judge: a, worker: a });                  // bridged as it settled
    const kept = await h.bridge(d, selfJudged);
    const moved = await h.tender(d, { owner: c, judge: a, worker: a });                       // judgment handed on, then bridged
    await (await d.taskToken.connect(a).setAcceptanceAuthority(moved.tokenId, b.address)).wait();
    const handedOn = await h.bridge(d, moved);
    const pushed = await h.tender(d, { owner: a, worker: a });                                // settled by the worker alone,
    await (await d.taskToken.connect(a).setAcceptanceAuthority(pushed.tokenId, c.address)).wait();
    await (await d.taskToken.connect(a).transferFrom(a.address, c.address, pushed.tokenId)).wait(); // then handed to c, who confirms it
    const confirmed = await h.bridge(d, { ...pushed, owner: c });
    expect(kept.status.ineligible).to.equal(I.SELF_DEALING);
    expect(handedOn.status.ineligible).to.equal(I.NONE);  // the rules read the tender as it stands at the bridge
    expect(confirmed.status.ineligible).to.equal(I.NONE); // and an owner who confirms what was handed to it makes it count

    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, show(report)).to.equal(true); // the ledger applied its rules; these are not differences
    expect(report.observations).to.deep.equal([
      { receiptId: kept.id, worker: a.address, subsidized: false, noted: ["worker-judged-its-own-delivery"] },
      { receiptId: handedOn.id, worker: a.address, subsidized: true, noted: ["worker-judged-its-own-delivery", "judge-changed-between-settlement-and-bridge"] },
      { receiptId: confirmed.id, worker: a.address, subsidized: true, noted: [
        "worker-judged-its-own-delivery", "worker-owned-the-tender-when-it-settled", "judge-changed-between-settlement-and-bridge",
        "owner-changed-between-settlement-and-bridge"] },
    ]);
    const item = report.receipts.find((it) => it.id === handedOn.id);
    expect(item.tender.judgeAtSettlement).to.equal(a.address);
    expect(item.tender.judge).to.equal(b.address);
    expect(report.receipts.find((it) => it.id === plain.id).tender.judgeAtSettlement).to.equal(c.address);
  });

  it("labels an epoch that subsidizes declared-related parties as a controlled self-test (D10)", async () => {
    const [, og, cellB] = await ethers.getSigners();
    const d = await h.deploy({
      admit: [og, cellB], operators: { [og.address]: 1, [cellB.address]: 1 }, params: { subsidizeDeclaredRelated: true },
    });
    await h.submitAudit(d, og);
    await h.submitAudit(d, cellB);
    await h.bridge(d, await h.tender(d, { owner: og, worker: cellB }));
    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, show(report)).to.equal(true);
    expect(report.mode).to.equal("controlled-self-test");
    expect(report.g1.subsidizedByRelation).to.deep.equal({ "declared-related": 1 });
    // one operator, two addresses: the report adds them up
    expect(report.operators.length).to.equal(1);
    expect(report.operators[0].operator).to.equal(1);
    expect(report.operators[0].addresses.length).to.equal(2);
    expect(report.operators[0].allocation).to.equal(report.allocated);
    expect(report.undeclaredAddresses).to.equal(0);
  });

  it("shows a declared operator's addresses together; an undeclared split stays invisible (D6)", async () => {
    const [, honest, c1, c2, c3, c4] = await ethers.getSigners();
    const run = async (operators) => {
      const d = await h.deploy({ admit: [honest, c1, c2, c3, c4], operators });
      for (const w of [honest, c1, c2, c3, c4]) await h.submitAudit(d, w);
      await h.toEpoch(d, 1);
      const report = await g.auditEpoch(d.ctx, 0);
      expect(report.ok, show(report)).to.equal(true);
      return report;
    };
    const declared = await run({ [c1.address]: 5, [c2.address]: 5, [c3.address]: 5, [c4.address]: 5 });
    expect(declared.operators).to.deep.equal([{
      operator: 5, addresses: [c1, c2, c3, c4].map((s) => s.address).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)),
      allocation: 560n * P,
    }]);
    expect(declared.undeclaredAddresses).to.equal(1);
    const hidden = await run({});
    expect(hidden.operators).to.deep.equal([]);   // same figures, nothing to see
    expect(hidden.undeclaredAddresses).to.equal(5);
    expect(hidden.tableHash).to.equal(declared.tableHash);
  });

  it("audits old epochs under the versions that applied to them (V3, V6)", async () => {
    const [, w1, w2, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, d1] });
    await h.submitAudit(d, w1);
    await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    const left = await h.tender(d, { owner: d1, worker: w2 });
    // from epoch 2: new parameters, a new G0 base, a new adapter, w1 no longer admitted, w2 declared
    const Adapter = await ethers.getContractFactory("TenderAdapter8414");
    const adapter2 = await Adapter.deploy(await d.ledger.getAddress(), await d.taskToken.getAddress(), g.PROFILE_G1_TENDER);
    await (await d.policy.registerProfile(g.PROFILE_G1_TENDER, g.POOL_G1, await adapter2.getAddress(), 80, 200, 0, 2)).wait();
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await d.audit.getAddress(), 30, 30, 1, 2)).wait();
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 2, budgetBase: 600n * P, workerCapBps: 10000 })).wait();
    await h.toEpoch(d, 1);
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await (await d.policy.setAdmission(w1.address, false)).wait();
    await (await d.policy.declareOperator(w2.address, 4)).wait();
    await h.toEpoch(d, 2);
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await h.bridge(d, left, d1, adapter2);
    await h.toEpoch(d, 3);

    const reports = [];
    for (const e of [0, 1, 2]) {
      const report = await g.auditEpoch(d.ctx, e);
      expect(report.ok, `epoch ${e}: ${show(report)}`).to.equal(true);
      reports.push(report);
    }
    expect(reports.map((r) => r.paramsVersion)).to.deep.equal([1, 1, 2]);
    expect(reports[0].totals.measured).to.deep.equal([10n, 50n]);
    expect(reports[1].totals.subsidized).to.deep.equal([20n, 0n]);
    expect(reports[2].totals.measured).to.deep.equal([60n, 80n]);   // the new bases
    expect(reports[2].totals.subsidized).to.deep.equal([30n, 80n]); // w1 no longer admitted
    expect(reports[2].budget).to.equal(600n * P);
    expect(reports[2].table.find((row) => row.worker === w2.address).operator).to.equal(4);
    expect(reports[0].table.find((row) => row.worker === w1.address).admitted).to.equal(true);
    expect(reports[2].table.find((row) => row.worker === w1.address).admitted).to.equal(false);
  });

  it("replays the policy as the contract applied it: replaced versions, retirements, changes made twice", async () => {
    const [, w1, w2] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2] });
    const audit = await d.audit.getAddress();
    await h.submitAudit(d, w1);
    // for epoch 1: a parameter set and a profile version, each registered and then corrected;
    // an admission withdrawn and restored inside one epoch; a second profile, registered and retired
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 1, budgetBase: 1n })).wait();
    await (await d.policy.registerParams({ ...h.DEFAULT_PARAMS, activeFromEpoch: 1, budgetBase: 800n * P, workerCapBps: 5000 })).wait();
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 99, 99, 1, 1)).wait();
    await (await d.policy.retireProfile(KEY, 1)).wait();
    await (await d.policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, audit, 40, 40, 1, 1)).wait();
    await (await d.policy.setAdmission(w2.address, false)).wait();
    await (await d.policy.setAdmission(w2.address, true)).wait();
    await (await d.policy.setAdmission(w1.address, false)).wait();
    await h.toEpoch(d, 1);
    await h.submitAudit(d, w1);
    await h.submitAudit(d, w2);
    await (await d.policy.retireProfile(KEY, 2)).wait();
    await h.toEpoch(d, 2);
    for (const e of [0, 1]) {
      const report = await g.auditEpoch(d.ctx, e);
      expect(report.ok, `epoch ${e}: ${show(report)}`).to.equal(true);
      if (e === 1) {
        expect(report.paramsVersion).to.equal(2);
        expect(report.budget).to.equal(800n * P);
        expect(report.totals.measured).to.deep.equal([80n, 0n]);
        expect(report.totals.subsidized).to.deep.equal([40n, 0n]);
        expect(report.table.find((row) => row.worker === w2.address).allocation).to.equal(280n * P); // 50% of 560
      }
    }
  });

  it("waits for the settled block to pass the epoch's end (R4)", async () => {
    const [, w1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    await h.submitAudit(d, w1);
    const inside = (await ethers.provider.getBlock("latest")).number; // a block inside epoch 0
    await h.toEpoch(d, 1);

    // an endpoint whose settled block is still inside epoch 0: no audit, and no audit job on top of it
    const early = await g.connect(d.manifest, ethers.provider, { tag: inside });
    let error = null;
    try { await g.auditEpoch(early, 0); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.NotFinalYet);
    error = null;
    try { await g.workAudit(early, w1); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.NotFinalYet);
    expect((await d.ledger.epochSummary(1)).receiptCount).to.equal(0n); // nothing was submitted

    // once the settled block is past the end, both go through
    expect((await g.auditEpoch(d.ctx, 0)).ok).to.equal(true);
    expect((await g.workAudit(d.ctx, w1)).status.verdict).to.equal(g.VERDICT.ACCEPTED);
  });

  it("reports every figure of the ledger that differs from the recomputation", async () => {
    const { d, w1 } = await mixedEpoch();
    await h.toEpoch(d, 1);
    const clean = await g.auditEpoch(d.ctx, 0);
    expect(clean.ok, show(clean)).to.equal(true);

    // a ledger that answers one worker's allocation one unit too high
    const realAllocation = d.ctx.ledger.allocation.bind(d.ctx.ledger);
    const a = await g.auditEpoch({
      ...d.ctx,
      ledger: tampered(d.ctx.ledger, { allocation: async (e, w) => (await realAllocation(e, w)) + (w === w1.address ? 1n : 0n) }),
    }, 0);
    expect(a.ok).to.equal(false);
    expect(a.findings.map((f) => f.what)).to.deep.equal([`allocation of ${w1.address}`]);

    // a ledger whose stored totals are not the sum of its receipts
    const realSummary = d.ctx.ledger.epochSummary.bind(d.ctx.ledger);
    const b = await g.auditEpoch({
      ...d.ctx,
      ledger: tampered(d.ctx.ledger, {
        epochSummary: async (e) => {
          const s = (await realSummary(e)).toObject();
          return { ...s, subsidizedG1: s.subsidizedG1 + 50n };
        },
      }),
    }, 0);
    expect(b.ok).to.equal(false);
    expect(b.findings.map((f) => f.what)).to.deep.equal(["subsidized G1"]);

    // a ledger that recorded a rejected output as accepted and subsidized
    const realQuery = d.ctx.ledger.queryFilter.bind(d.ctx.ledger);
    const rejected = clean.receipts.find((it) => it.status.verdict === g.VERDICT.REJECTED);
    const c = await g.auditEpoch({
      ...d.ctx,
      ledger: tampered(d.ctx.ledger, {
        queryFilter: async (filter, from, to) => {
          const events = await realQuery(filter, from, to);
          return events.map((ev) => {
            if (ev.fragment.name !== "ReceiptStatus" || ev.args.id !== rejected.id) return ev;
            const st = g.plainStatus(ev.args.status);
            return { blockNumber: ev.blockNumber, index: ev.index, transactionHash: ev.transactionHash,
              args: { id: ev.args.id, status: { ...st, verdict: g.VERDICT.ACCEPTED, ineligible: 0, gmuMeasured: 10n, gmuSubsidized: 10n } } };
          });
        },
      }),
    }, 0);
    expect(c.ok).to.equal(false);
    expect(c.findings.map((f) => f.what)).to.deep.equal([
      `receipt ${rejected.id}: verdict`, `receipt ${rejected.id}: ineligible`, `receipt ${rejected.id}: gmuMeasured`,
      `receipt ${rejected.id}: gmuSubsidized`,
    ]);
  });

  it("does not submit the audit job over a recomputation that differs from the ledger", async () => {
    const [, w1, w2] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2] });
    await h.submitAudit(d, w1);
    await h.toEpoch(d, 1);
    // a ledger whose stored total for epoch 0 is not what its receipts add up to
    const realSummary = d.ctx.ledger.epochSummary.bind(d.ctx.ledger);
    const wrong = { ...d.ctx, ledger: tampered(d.ctx.ledger, {
      epochSummary: async (e) => { const s = (await realSummary(e)).toObject(); return { ...s, subsidizedG0: s.subsidizedG0 + 1n }; },
    }) };
    let error = null;
    try { await g.workAudit(wrong, w2); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.AuditMismatch);
    expect(error.report.findings.map((f) => f.what)).to.deep.equal(["subsidized G0"]);
    expect((await d.ledger.epochSummary(1)).opened).to.equal(false); // not even the epoch was opened
    // against the ledger as it is, the same worker's job is accepted
    const done = await g.workAudit(d.ctx, w2);
    expect(done.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(done.auditedTableHash).to.equal((await g.auditEpoch(d.ctx, 0)).tableHash);
  });

  it("agrees with the ledger on epochs built at random: parties, relations, parameters, work and tenders", async () => {
    // a fixed generator, so that a failure can be reproduced
    let state = 0x9e3779b9;
    const rnd = () => { state |= 0; state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const all = (await ethers.getSigners()).slice(1, 11);
    let receipts = 0; let subsidized = 0; let refused = 0;
    for (let round = 0; round < 5; round++) {
      const admit = all.filter(() => rnd() < 0.7);
      const operators = Object.fromEntries(all.map((s) => [s.address, Math.floor(rnd() * 4)]).filter(([, op]) => op !== 0));
      const d = await h.deploy({
        admit, operators, g1Cap: pick([60n, 100n, 200n]),
        params: {
          workerCapBps: 500 + Math.floor(rnd() * 9501), splitG0Bps: Math.floor(rnd() * 10001),
          minBountyWei: ethers.parseEther(pick(["0.001", "0.002"])), maxSubsidizedPerDemander: 1 + Math.floor(rnd() * 4),
          maxSubsidizedPerPair: 1 + Math.floor(rnd() * 2), subsidizeDeclaredRelated: rnd() < 0.3,
        },
      });
      const left = [];
      for (const epoch of [0, 1]) {
        if (epoch) await h.toEpoch(d, epoch);
        for (const w of all) {
          const r = rnd();
          if (r < 0.55) await h.submitAudit(d, w);
          else if (r < 0.65) await (await d.ledger.connect(w).submitG0(KEY, epoch, 0, ethers.id(`wrong ${round} ${epoch}`))).wait();
        }
        for (const t of left.splice(0)) await h.bridge(d, t); // settled in the epoch before, bridged now
        for (let i = 0; i < 8; i++) {
          const owner = pick(all);
          const t = await h.tender(d, {
            owner, worker: pick(all), judge: rnd() < 0.3 ? pick(all) : undefined,
            reward: ethers.parseEther(pick(["0.0005", "0.001", "0.003"])),
          });
          if (rnd() < 0.8) await h.bridge(d, t); else if (epoch === 0) left.push(t);
        }
      }
      await h.toEpoch(d, 2);
      for (const epoch of [0, 1]) {
        const report = await g.auditEpoch(d.ctx, epoch);
        expect(report.ok, `round ${round} epoch ${epoch}: ${show(report)}`).to.equal(true);
        expect(report.allocated <= report.budget).to.equal(true);
        receipts += report.receipts.length;
        subsidized += report.receipts.filter((it) => it.status.gmuSubsidized > 0n).length;
        refused += report.receipts.filter((it) => it.status.ineligible !== I.NONE).length;
      }
    }
    // the generator must have produced both kinds, or the test says nothing
    expect(receipts).to.be.greaterThan(100);
    expect(subsidized).to.be.greaterThan(20);
    expect(refused).to.be.greaterThan(20);
  });

  it("refuses a manifest that does not describe the chain or the contracts it is pointed at", async () => {
    const d = await h.deploy();
    const other = await h.deploy();
    const fails = async (manifest, text) => {
      let error = null;
      try { await g.connect(manifest, ethers.provider); } catch (e) { error = e; }
      expect(error, text).to.not.equal(null);
      expect(String(error.message)).to.contain(text);
    };
    await fails({ ...d.manifest, chainId: 85422 }, "the manifest is for chain 85422");
    await fails({ ...d.manifest, contracts: { ...d.manifest.contracts, GenesisPolicy: await other.policy.getAddress() } }, "GenesisPolicy");
    await fails({ ...d.manifest, contracts: { ...d.manifest.contracts, SeedSource: await other.seedSource.getAddress() } }, "SeedSource");
    const ok = await g.connect({ ...d.manifest, chainId: 31337, contracts: { ...d.manifest.contracts, GenesisPolicy: await d.policy.getAddress() } }, ethers.provider);
    expect(ok.domain).to.equal(d.ctx.domain);
  });
});
