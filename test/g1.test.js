"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

const KEY = g.profileKey(g.PROFILE_G1_TENDER);
const I = g.INELIGIBLE;

describe("G1: real demand through ERC-8414, settlement apart from subsidy", () => {
  it("records a settled tender between two admitted parties and subsidizes it; the bounty is the tender's own payment (N2)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const reward = ethers.parseEther("0.002");
    const t = await h.tender(d, { owner: d1, worker: w1, reward, settle: false });

    // the bounty moves when the tender settles, from the tender's vault, and nowhere else
    const before = await ethers.provider.getBalance(w1.address);
    await (await d.taskToken.connect(d1).acceptFulfillment(t.tokenId, t.submissionId)).wait();
    expect((await ethers.provider.getBalance(w1.address)) - before).to.equal(reward);

    const { id, status, receipt } = await h.bridge(d, t);
    const source = await d.taskToken.getAddress();
    expect(receipt.epoch).to.equal(0n);
    expect(receipt.pool).to.equal(g.POOL_G1);
    expect(receipt.worker).to.equal(w1.address);
    expect(receipt.counterparty).to.equal(d1.address);
    expect(receipt.ref).to.equal(g.g1Ref(source, t.tokenId, t.submissionId));
    expect(receipt.contributionId).to.equal(g.g1ContributionId(d.ctx.domain, source, t.tokenId, t.submissionId));
    expect(receipt.inputHash).to.equal((await d.taskToken.taskOf(t.tokenId)).taskHash);
    expect(receipt.outputHash).to.equal((await d.taskToken.submissionOf(t.tokenId, t.submissionId)).resultHash);
    expect(status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(status.ineligible).to.equal(I.NONE);
    expect(status.relation).to.equal(g.RELATION.NONE_FOUND);
    expect(status.gmuMeasured).to.equal(50n);
    expect(status.gmuSubsidized).to.equal(50n);
    expect(status.verifier).to.equal(await d.adapter.getAddress());

    // bridging pays nothing and holds nothing
    expect((await ethers.provider.getBalance(w1.address)) - before).to.equal(reward);
    for (const c of [d.ledger, d.adapter, d.policy]) expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(0n);
    const s = await d.ledger.epochSummary(0);
    expect(s.measuredG1).to.equal(50n);
    expect(s.subsidizedG1).to.equal(50n);
    expect(s.measuredG0).to.equal(0n);
    expect(id).to.equal(1n);
  });

  it("bridges only what the tender has settled", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const pending = await h.tender(d, { owner: d1, worker: w1, settle: false });
    await h.revertsWith(d.adapter.connect(d1).bridge(pending.tokenId, pending.submissionId), "NotSettled");
    await (await d.taskToken.connect(d1).rejectFulfillment(pending.tokenId, pending.submissionId)).wait();
    await h.revertsWith(d.adapter.connect(d1).bridge(pending.tokenId, pending.submissionId), "NotSettled");
    expect(await d.ledger.receiptCount()).to.equal(0n);
  });

  it("records one receipt per settled submission however often it is bridged (D2)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const t = await h.tender(d, { owner: d1, worker: w1 });
    const first = await h.bridge(d, t);
    const subject = await d.ledger.auditSubject(0);
    const again = await h.bridge(d, t);
    expect(again.id).to.equal(first.id);
    expect(await d.ledger.receiptCount()).to.equal(1n);
    expect(await d.ledger.auditSubject(0)).to.equal(subject);
    expect((await d.ledger.epochSummary(0)).subsidizedG1).to.equal(50n);
    // a repeat in a later epoch is the same receipt of the same epoch
    await h.toEpoch(d, 1);
    const later = await h.bridge(d, t);
    expect(later.id).to.equal(first.id);
    expect(later.receipt.epoch).to.equal(0n);
    expect((await d.ledger.epochSummary(1)).receiptCount).to.equal(0n);
  });

  it("takes G1 records from the profile's adapter only", async () => {
    const [, w1, d1, x] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const facts = {
      source: await d.taskToken.getAddress(), tokenId: 1, submissionId: 1, worker: w1.address, demander: d1.address,
      judge: d1.address, inputHash: ethers.ZeroHash, outputHash: ethers.id("claimed"), asset: ethers.ZeroAddress,
      reward: ethers.parseEther("1"), deliveredAt: d.genesisTime + 1n,
    };
    await h.revertsWith(d.ledger.connect(x).recordG1(KEY, facts), "NotAdapter");
    await h.revertsWith(d.ledger.connect(w1).recordG1(KEY, facts), "NotAdapter");
    await h.revertsWith(d.ledger.connect(d.steward).recordG1(KEY, facts), "NotAdapter");
    await h.revertsWith(d.ledger.connect(x).recordG1(g.profileKey(g.PROFILE_G0_REF), facts), "WrongPool");
    expect(await d.ledger.receiptCount()).to.equal(0n);
  });

  it("lets only the tender's owner bridge: demand cannot be pushed onto another party (D11)", async () => {
    const [, w1, d1, x] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    // an honest tender: neither the worker nor a bystander can bridge it
    const honest = await h.tender(d, { owner: d1, worker: w1 });
    await h.revertsWith(d.adapter.connect(w1).bridge(honest.tokenId, honest.submissionId), "NotDemander");
    await h.revertsWith(d.adapter.connect(x).bridge(honest.tokenId, honest.submissionId), "NotDemander");

    // the forgery: w1 tenders to itself, settles, then hands the tender and its judgment to d1
    const own = await h.tender(d, { owner: w1, worker: w1 });
    await (await d.taskToken.connect(w1).setAcceptanceAuthority(own.tokenId, d1.address)).wait();
    await (await d.taskToken.connect(w1).transferFrom(w1.address, d1.address, own.tokenId)).wait();
    expect(await d.taskToken.ownerOf(own.tokenId)).to.equal(d1.address);
    expect(await d.taskToken.acceptanceAuthorityOf(own.tokenId)).to.equal(d1.address);
    // on chain it now reads as d1's tender, accepted, fulfilled by w1 - and w1 cannot make it count
    await h.revertsWith(d.adapter.connect(w1).bridge(own.tokenId, own.submissionId), "NotDemander");
    await h.revertsWith(d.adapter.connect(x).bridge(own.tokenId, own.submissionId), "NotDemander");
    expect(await d.ledger.receiptCount()).to.equal(0n);

    // what is not detected: if d1 itself confirms it, it counts. The owner's call is the statement.
    const confirmed = await h.bridge(d, { ...own, owner: d1 });
    expect(confirmed.status.ineligible).to.equal(I.NONE);
  });

  it("records self-dealing as the tender stands when it is bridged, and does not subsidize it (D5)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    // the worker is the tender's owner
    const a = await h.bridge(d, await h.tender(d, { owner: w1, worker: w1 }));
    expect(a.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(a.status.ineligible).to.equal(I.SELF_DEALING);
    expect(a.status.gmuMeasured).to.equal(50n);
    expect(a.status.gmuSubsidized).to.equal(0n);
    // the worker is the tender's judge
    const b = await h.bridge(d, await h.tender(d, { owner: d1, judge: w1, worker: w1 }));
    expect(b.status.ineligible).to.equal(I.SELF_DEALING);
    const s = await d.ledger.epochSummary(0);
    expect(s.measuredG1).to.equal(100n);
    expect(s.subsidizedG1).to.equal(0n);
    expect(await d.ledger.provisionalAllocation(0, w1.address)).to.equal(0n);
  });

  it("reads the judge as of the bridge: a worker that judged its own delivery and then handed the judgment on is not caught (D17)", async () => {
    const [, a, b, c] = await ethers.getSigners(); // a the worker, c the tender's owner, b a third address
    const d = await h.deploy({ admit: [a, c] });
    // the control: bridged while the worker is still the judge, the receipt is refused as self-dealing
    const kept = await h.tender(d, { owner: c, judge: a, worker: a });
    expect((await h.bridge(d, kept)).status.ineligible).to.equal(I.SELF_DEALING);

    // the same settlement - the worker accepted its own delivery - but the judgment is handed to
    // somebody else before the owner bridges. ERC-8414 lets the acceptance authority move at any time
    // and keeps no record of who held it when the submission settled.
    const moved = await h.tender(d, { owner: c, judge: a, worker: a });
    await (await d.taskToken.connect(a).setAcceptanceAuthority(moved.tokenId, b.address)).wait();
    expect(await d.taskToken.acceptanceAuthorityOf(moved.tokenId)).to.equal(b.address);
    const out = await h.bridge(d, moved);
    // the rule reads the judge of record at the bridge, finds a third address, and subsidizes
    expect(out.status.ineligible).to.equal(I.NONE);
    expect(out.status.gmuSubsidized).to.equal(50n);
    // what bounds it is what bounds any two parties who agree to pretend: the owner had to name the
    // worker as judge and had to bridge, both are admitted, and the caps apply
    const again = await h.tender(d, { owner: c, judge: a, worker: a });
    await (await d.taskToken.connect(a).setAcceptanceAuthority(again.tokenId, b.address)).wait();
    expect((await h.bridge(d, again)).status.ineligible).to.equal(I.PAIR_CAP);
  });

  it("subsidizes admitted parties only: the worker and the demander (T3, D12)", async () => {
    const [, w1, d1, stranger, freshDemander] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const a = await h.bridge(d, await h.tender(d, { owner: d1, worker: stranger }));
    expect(a.status.ineligible).to.equal(I.NOT_ADMITTED);
    expect(a.status.gmuMeasured).to.equal(50n);
    // a fresh address as the demander: the cheapest way to manufacture demand
    const b = await h.bridge(d, await h.tender(d, { owner: freshDemander, worker: w1 }));
    expect(b.status.ineligible).to.equal(I.DEMANDER_NOT_ADMITTED);
    expect(b.status.gmuMeasured).to.equal(50n);
    expect(b.status.gmuSubsidized).to.equal(0n);
    expect((await d.ledger.epochSummary(0)).subsidizedG1).to.equal(0n);
  });

  it("classes declared relations and withholds the subsidy from declared-related parties (D9)", async () => {
    const [, w1, d1, d2, judge] = await ethers.getSigners();
    const d = await h.deploy({
      admit: [w1, d1, d2],
      operators: { [w1.address]: 7, [d1.address]: 7, [judge.address]: 7, [d2.address]: 8 },
    });
    // demander and worker under one declared operator
    const a = await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    expect(a.status.relation).to.equal(g.RELATION.DECLARED_RELATED);
    expect(a.status.ineligible).to.equal(I.RELATION);
    expect(a.status.gmuMeasured).to.equal(50n);
    expect(a.status.gmuSubsidized).to.equal(0n);
    // another operator's tender judged by an address of the worker's operator
    const b = await h.bridge(d, await h.tender(d, { owner: d2, judge, worker: w1 }));
    expect(b.status.relation).to.equal(g.RELATION.DECLARED_RELATED);
    expect(b.status.ineligible).to.equal(I.RELATION);
    // different declared operators: no relation found - which is not a finding of independence
    const c = await h.bridge(d, await h.tender(d, { owner: d2, worker: w1 }));
    expect(c.status.relation).to.equal(g.RELATION.NONE_FOUND);
    expect(c.status.ineligible).to.equal(I.NONE);
  });

  it("does not read two undeclared addresses as related", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] }); // both operator 0: nothing declared
    const a = await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    expect(a.status.relation).to.equal(g.RELATION.NONE_FOUND);
    expect(a.status.ineligible).to.equal(I.NONE);
  });

  it("subsidizes declared-related parties only in an epoch whose parameters say so, and keeps the label (D10)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({
      admit: [w1, d1], operators: { [w1.address]: 7, [d1.address]: 7 }, params: { subsidizeDeclaredRelated: true },
    });
    const a = await h.bridge(d, await h.tender(d, { owner: d1, worker: w1 }));
    expect(a.status.relation).to.equal(g.RELATION.DECLARED_RELATED); // the class stays on the receipt
    expect(a.status.ineligible).to.equal(I.NONE);
    expect(a.status.gmuSubsidized).to.equal(50n);
    // self-dealing is refused even then
    const b = await h.bridge(d, await h.tender(d, { owner: w1, worker: w1 }));
    expect(b.status.ineligible).to.equal(I.SELF_DEALING);
  });

  it("subsidizes native bounties at or above the epoch's minimum only (D13)", async () => {
    const [, w1, w2, w3, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, w3, d1] });
    const Token = await ethers.getContractFactory("TestToken");
    const token = await Token.deploy();
    const a = await h.bridge(d, await h.tender(d, { owner: d1, worker: w1, asset: await token.getAddress(), reward: ethers.parseEther("5") }));
    expect(a.status.ineligible).to.equal(I.ASSET);
    const b = await h.bridge(d, await h.tender(d, { owner: d1, worker: w2, reward: ethers.parseEther("0.0009") }));
    expect(b.status.ineligible).to.equal(I.BOUNTY);
    const c = await h.bridge(d, await h.tender(d, { owner: d1, worker: w3, reward: ethers.parseEther("0.001") }));
    expect(c.status.ineligible).to.equal(I.NONE);
    for (const r of [a, b]) {
      expect(r.status.gmuMeasured).to.equal(50n);
      expect(r.status.gmuSubsidized).to.equal(0n);
    }
  });

  it("stops wash tenders at the per-pair and per-demander caps; what is refused uses up nothing (D8)", async () => {
    const [, w1, w2, w3, w4, d1, d2] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, w2, w3, w4, d1, d2] });
    const run = async (owner, worker) => (await h.bridge(d, await h.tender(d, { owner, worker }))).status.ineligible;
    expect(await run(d1, w1)).to.equal(I.NONE);
    expect(await run(d1, w1)).to.equal(I.PAIR_CAP);      // the pair's one subsidized tender is used
    expect(await run(d1, w1)).to.equal(I.PAIR_CAP);
    expect(await run(d1, w2)).to.equal(I.NONE);
    expect(await run(d1, w3)).to.equal(I.NONE);
    expect(await run(d1, w4)).to.equal(I.DEMANDER_CAP);  // the demander's three are used
    expect(await run(d2, w4)).to.equal(I.NONE);          // another demander's tender still counts
    const s = await d.ledger.epochSummary(0);
    expect(s.receiptCount).to.equal(7n);
    expect(s.measuredG1).to.equal(350n);
    expect(s.subsidizedG1).to.equal(200n);
    // the caps are per epoch
    await h.toEpoch(d, 1);
    expect(await run(d1, w1)).to.equal(I.NONE);
  });

  it("caps a worker's subsidized GMU under the profile; the last unit is counted in part (D14)", async () => {
    const [, w1, d1, d2, d3, d4] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1, d2, d3, d4], g1Cap: 120n });
    const run = async (owner) => (await h.bridge(d, await h.tender(d, { owner, worker: w1 }))).status;
    expect((await run(d1)).gmuSubsidized).to.equal(50n);
    expect((await run(d2)).gmuSubsidized).to.equal(50n);
    const third = await run(d3);
    expect(third.ineligible).to.equal(I.NONE);
    expect(third.gmuMeasured).to.equal(50n);
    expect(third.gmuSubsidized).to.equal(20n);
    const fourth = await run(d4);
    expect(fourth.ineligible).to.equal(I.WORKER_CAP);
    expect(fourth.gmuSubsidized).to.equal(0n);
    expect(await d.ledger.subsidizedOf(0, g.POOL_G1, w1.address)).to.equal(120n);
    expect(await d.ledger.measuredOf(0, g.POOL_G1, w1.address)).to.equal(200n);
  });

  it("does not subsidize work delivered before this deployment's first epoch (D15)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1], start: false });
    const t = await h.tender(d, { owner: d1, worker: w1, settle: false }); // delivered before genesis
    await h.setTime(d.genesisTime);
    await (await d.taskToken.connect(d1).acceptFulfillment(t.tokenId, t.submissionId)).wait();
    const a = await h.bridge(d, t);
    expect(a.status.ineligible).to.equal(I.BEFORE_GENESIS);
    expect(a.status.gmuMeasured).to.equal(50n);
    expect(a.status.gmuSubsidized).to.equal(0n);
  });

  it("counts a default settlement only once the demander confirms it (D16)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const t = await h.tender(d, { owner: d1, worker: w1, settle: false, judgmentWindow: 600 });
    await h.setTime((await h.now()) + 601n); // the judge said nothing
    await (await d.taskToken.connect(w1).claimUnjudged(t.tokenId, t.submissionId)).wait();
    expect((await d.taskToken.submissionOf(t.tokenId, t.submissionId)).status).to.equal(1n); // settled, and paid
    // the worker holds the bounty; it cannot turn the default into a subsidized receipt by itself
    await h.revertsWith(d.adapter.connect(w1).bridge(t.tokenId, t.submissionId), "NotDemander");
    expect(await d.ledger.receiptCount()).to.equal(0n);
    const a = await h.bridge(d, t);
    expect(a.status.ineligible).to.equal(I.NONE);
    expect(a.status.gmuSubsidized).to.equal(50n);
  });

  it("refuses bridging while paused, and takes it afterwards (X5)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const t = await h.tender(d, { owner: d1, worker: w1 });
    await (await d.policy.setPaused(true)).wait();
    await h.revertsWith(d.adapter.connect(d1).bridge(t.tokenId, t.submissionId), "Paused");
    await (await d.policy.setPaused(false)).wait();
    expect((await h.bridge(d, t)).status.ineligible).to.equal(I.NONE);
  });
});
