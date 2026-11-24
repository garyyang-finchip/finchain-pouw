"use strict";

const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, g, v2, PROFILE, key, ZERO, NONE } = t;

const I = v2.INELIGIBLE;
const deployed = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);

describe("Ledger v2: participant, sender and origin", () => {
  it("records a delegated G0 submission in the account's name: its instance, its contribution, the delegate as sender (L18)", async () => {
    const [, w, delegate] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w], operators: { [w.address]: 42 } });
    const p = await t.signed(d, w, w.address, { delegate: delegate.address });
    const done = await t.submitDelegated(d, delegate, p, w.address);

    const r = done.receipt;
    expect([r.worker, r.sender, r.authorization, r.counterparty]).to.deep.equal([w.address, delegate.address, p.digest, ZERO]);
    // the instance is the account's - the delegate's own would be another
    expect(r.workId).to.equal(done.instance);
    expect(r.workId).to.equal(v2.g0Instance(await d.ledger.seedOf(0), g.AUDIT_V1_FUNCTION_ID, 0, w.address));
    expect(r.workId).to.not.equal(v2.g0Instance(await d.ledger.seedOf(0), g.AUDIT_V1_FUNCTION_ID, 0, delegate.address));
    expect(r.contributionId).to.equal(v2.g0ContributionId(d.domain, g.AUDIT_V1_FUNCTION_ID, 0n, 0, w.address));
    expect([r.role, r.unit, r.parent, r.envelopeHash, r.contentKey]).to.deep.equal([0, 0, NONE, NONE, NONE]);
    expect([done.status.verdict, done.status.ineligible, done.status.gmuMeasured, done.status.gmuSubsidized, done.status.duplicateOf])
      .to.deep.equal([1, I.NONE, 10n, 10n, 0n]);

    // the event carries the top-level sender and the attribution; neither authorizes anything
    const ev = h.eventsOf(done.rc, d.ledger, "ReceiptRecorded")[0].args;
    expect([ev.worker, ev.origin, ev.operator]).to.deep.equal([w.address, delegate.address, 42n]);
    expect(await d.ledger.operatorAt(0, w.address)).to.deep.equal([true, 42n]);
    expect(await d.ledger.operatorAt(0, delegate.address)).to.deep.equal([false, 0n]);
    // the GMU is the account's; the delegate has none
    expect(await d.ledger.subsidizedOf(0, 0, w.address)).to.equal(10n);
    expect(await d.ledger.subsidizedOf(0, 0, delegate.address)).to.equal(0n);

    // the direct entry records the participant as its own sender, with no authorization
    await h.toEpoch(d, 1);
    const direct = await t.submitDirect(d, w);
    expect([direct.receipt.worker, direct.receipt.sender, direct.receipt.authorization]).to.deep.equal([w.address, w.address, NONE]);
    // a contract in between: the origin is the key that sent, the sender is the contract
    const account = await deployed("TestAccount", w.address);
    const o = await t.g0Output(d, account.target);
    const rc = await (await account.connect(w).execute(d.ledgerAddress, 0, d.ledger.interface.encodeFunctionData("submitG0", [key(PROFILE.G0), o.epoch, 0, o.output]))).wait();
    const viaAccount = h.eventsOf(rc, d.ledger, "ReceiptRecorded")[0].args;
    expect([viaAccount.worker, viaAccount.receipt.sender, viaAccount.origin]).to.deep.equal([account.target, account.target, w.address]);
  });

  it("has one contribution per instance whoever sends it, and as many instances as the profile has jobs (L19)", async () => {
    const [, w, delegate] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const p = await t.signed(d, w, w.address, { delegate: delegate.address });

    // direct first, then the same instance through the delegate
    const first = await t.submitDirect(d, w);
    expect(await t.refuses((await t.delegatedCall(d, delegate, p, w.address))(), "AlreadySubmitted")).to.deep.equal([first.id]);
    // delegated first, then the same instance directly
    const second = await t.submitDelegated(d, delegate, p, w.address, { profile: PROFILE.ECHO, jobIndex: 0 });
    const again = await t.g0Output(d, w.address, { profile: PROFILE.ECHO, jobIndex: 0 });
    expect(await t.refuses(d.ledger.connect(w).submitG0(key(PROFILE.ECHO), 0, 0, again.output), "AlreadySubmitted")).to.deep.equal([second.id]);
    // the second job index is another instance, and another receipt
    const third = await t.submitDelegated(d, delegate, p, w.address, { profile: PROFILE.ECHO, jobIndex: 1 });
    expect(third.receipt.workId).to.not.equal(second.receipt.workId);
    expect(third.receipt.contributionId).to.equal(v2.g0ContributionId(d.domain, t.ECHO_FUNCTION_ID, 0n, 1, w.address));
    await t.refuses((await t.delegatedCall(d, delegate, p, w.address, { profile: PROFILE.ECHO, jobIndex: 2 }))(), "JobIndexOutOfRange");
    expect(await d.ledger.receiptCount()).to.equal(3n);
    expect(await d.ledger.subsidizedOf(0, 0, w.address)).to.equal(30n);
    // a wrong output is one attempt, recorded as rejected, as in 0.1.3
    await h.toEpoch(d, 1);
    const o = await t.g0Output(d, w.address);
    await (await d.ledger.connect(delegate).submitG0For(p.tuple, p.signature, key(PROFILE.G0), o.epoch, 0, ethers.id("not the answer"))).wait();
    const wrong = await t.lastReceipt(d);
    expect([wrong.status.verdict, wrong.status.ineligible, wrong.status.gmuMeasured]).to.deep.equal([2, I.REJECTED, 0n]);
    // and a submission that names another epoch is refused before anything is checked or spent
    await t.refuses(d.ledger.connect(delegate).submitG0For(p.tuple, p.signature, key(PROFILE.ECHO), 0, 0, o.output), "WrongEpoch");
  });

  it("records a tender's confirmation through the owner's delegate in the owner's name, and refuses a permit of anybody else (L20)", async () => {
    const [, demander, worker, delegate, other] = await ethers.getSigners();
    const d = await t.deploy({ admit: [demander, worker, other] });
    const tender = await h.tender(d, { owner: demander, worker });
    const p = await t.signed(d, demander, demander.address, { delegate: delegate.address, scope: 2 });

    // a valid permit of an account that does not own the tender
    const foreign = await t.signed(d, other, other.address, { delegate: delegate.address, scope: 2 });
    expect(await t.refuses(d.adapter.connect(delegate).confirmFor(foreign.tuple, foreign.signature, tender.tokenId, tender.submissionId), "NotOwnersPermit"))
      .to.deep.equal([other.address, demander.address]);
    // the delegate without a permit is nobody to the tender
    await t.refuses(d.adapter.connect(delegate).confirm(tender.tokenId, tender.submissionId), "NotDemander");

    const rc = await (await d.adapter.connect(delegate).confirmFor(p.tuple, p.signature, tender.tokenId, tender.submissionId)).wait();
    const done = await t.lastReceipt(d);
    const source = d.taskToken.target;
    expect([done.receipt.worker, done.receipt.counterparty, done.receipt.sender, done.receipt.authorization])
      .to.deep.equal([worker.address, demander.address, delegate.address, p.digest]);
    expect(done.receipt.workId).to.equal(v2.g1WorkId(d.chainId, source, tender.tokenId, tender.submissionId));
    expect(done.receipt.contributionId).to.equal(v2.g1ContributionId(d.domain, source, tender.tokenId, tender.submissionId));
    expect([done.status.ineligible, done.status.gmuSubsidized, done.status.verifier]).to.deep.equal([I.NONE, 50n, d.adapter.target]);
    const ev = h.eventsOf(rc, d.adapter, "TenderConfirmed")[0].args;
    expect([ev.receiptId, ev.sender, ev.authorization]).to.deep.equal([done.id, delegate.address, p.digest]);

    // the owner's own call has the same outcome for another tender: a delegate is not another demander
    const second = await h.tender(d, { owner: demander, worker: other });
    await (await d.adapter.connect(demander).confirm(second.tokenId, second.submissionId)).wait();
    const direct = await t.lastReceipt(d);
    expect([direct.receipt.counterparty, direct.receipt.sender, direct.receipt.authorization, direct.status.ineligible])
      .to.deep.equal([demander.address, demander.address, NONE, I.NONE]);
    // a submission that has not settled is confirmed by nobody
    const open = await h.tender(d, { owner: demander, worker, settle: false });
    await t.refuses(d.adapter.connect(demander).confirm(open.tokenId, open.submissionId), "NotSettled");
    await t.refuses(d.adapter.connect(delegate).confirmFor(p.tuple, p.signature, open.tokenId, open.submissionId), "NotSettled");
  });
});

describe("Ledger v2: one reason, in one order", () => {
  it("measures and does not subsidize work whose worker, or whose demander, has no declared operator (L25)", async () => {
    const [, declared, undeclared, demander, bareDemander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [declared, undeclared, demander, bareDemander], operators: { [undeclared.address]: 0, [bareDemander.address]: 0 } });
    expect(await d.policy.operatorOf(undeclared.address)).to.equal(0n);

    // G0: accepted and measured; no subsidized GMU and so no allocation
    const g0 = await t.submitDirect(d, undeclared);
    expect([g0.status.verdict, g0.status.ineligible, g0.status.gmuMeasured, g0.status.gmuSubsidized]).to.deep.equal([1, I.OPERATOR_NOT_DECLARED, 10n, 0n]);
    expect(await d.ledger.operatorAt(0, undeclared.address)).to.deep.equal([true, 0n]);
    // G1: the worker's operator is asked before the demander's
    const worker = await t.record(d, PROFILE.FREE, t.facts(d, { worker: undeclared, demander }));
    expect([worker.status.ineligible, worker.status.gmuMeasured, worker.status.gmuSubsidized]).to.deep.equal([I.OPERATOR_NOT_DECLARED, 50n, 0n]);
    const owner = await t.record(d, PROFILE.FREE, t.facts(d, { worker: declared, demander: bareDemander }));
    expect([owner.status.ineligible, owner.status.gmuMeasured, owner.status.gmuSubsidized]).to.deep.equal([I.DEMANDER_OPERATOR_NOT_DECLARED, 50n, 0n]);
    const both = await t.record(d, PROFILE.FREE, t.facts(d, { worker: undeclared, demander: bareDemander }));
    expect(both.status.ineligible).to.equal(I.OPERATOR_NOT_DECLARED);
    // no such condition is put on the judge
    const judged = await t.record(d, PROFILE.FREE, t.facts(d, { worker: declared, demander, judge: bareDemander }));
    expect([judged.status.ineligible, judged.status.gmuSubsidized]).to.deep.equal([I.NONE, 50n]);

    await h.toEpoch(d, 1);
    expect(await d.ledger.measuredOf(0, 0, undeclared.address)).to.equal(10n);
    expect(await d.ledger.measuredOf(0, 1, undeclared.address)).to.equal(100n);
    expect(await d.ledger.allocation(0, undeclared.address)).to.equal(0n);
    expect((await d.ledger.allocation(0, declared.address)) > 0n).to.equal(true);
  });

  it("gives a status the first reason that applies, in the order of the rules, for G0 and for G1 (L25)", async () => {
    const [, w, demander, stranger, relatedDemander, bare, bareDemander, pairWorker, capped] = await ethers.getSigners();
    const token = await deployed("TestToken");
    const d = await t.deploy({
      admit: [w, demander, relatedDemander, bare, bareDemander, pairWorker, capped],
      operators: { [w.address]: 5, [relatedDemander.address]: 5, [bare.address]: 0, [bareDemander.address]: 0 },
      params: { maxSubsidizedPerDemander: 2, maxSubsidizedPerPair: 1 }, g1Cap: 50n, echoCap: 10n,
    });
    const before = d.genesisTime - 5n;
    const cheap = ethers.parseEther("0.0001");
    const reason = async (fields, x) => (await t.record(d, PROFILE.FREE, t.facts(d, fields), x)).status.ineligible;

    // each line breaks the rule it is named for and every rule after it that can be broken with it
    // 3 self-dealing, before 4 before-genesis and everything else
    expect(await reason({ worker: stranger, demander: stranger, deliveredAt: before, asset: token.target, reward: cheap })).to.equal(I.SELF_DEALING);
    expect(await reason({ worker: stranger, demander: bareDemander, judge: stranger, deliveredAt: before })).to.equal(I.SELF_DEALING);
    // 4 before-genesis, before 2 worker-not-admitted
    expect(await reason({ worker: stranger, demander: bareDemander, deliveredAt: before, asset: token.target })).to.equal(I.BEFORE_GENESIS);
    // 2 worker-not-admitted, before 11 demander-not-admitted
    expect(await reason({ worker: stranger, demander: ethers.Wallet.createRandom().address, asset: token.target, reward: cheap })).to.equal(I.NOT_ADMITTED);
    // 11 demander-not-admitted, before 12 worker's operator
    expect(await reason({ worker: bare, demander: stranger, asset: token.target, reward: cheap })).to.equal(I.DEMANDER_NOT_ADMITTED);
    // 12 worker's operator, before 13 demander's operator
    expect(await reason({ worker: bare, demander: bareDemander, asset: token.target, reward: cheap })).to.equal(I.OPERATOR_NOT_DECLARED);
    // 13 demander's operator, before 6 asset
    expect(await reason({ worker: w, demander: bareDemander, asset: token.target, reward: cheap })).to.equal(I.DEMANDER_OPERATOR_NOT_DECLARED);
    // 13 demander's operator, before 5 relation: the worker and the judge are declared under one operator
    const judgedByRelated = await t.record(d, PROFILE.FREE, t.facts(d, { worker: w, demander: bareDemander, judge: relatedDemander }));
    expect([judgedByRelated.status.ineligible, judgedByRelated.status.relation]).to.deep.equal([I.DEMANDER_OPERATOR_NOT_DECLARED, 1]);
    // 5 relation, before 6 asset
    const related = await t.record(d, PROFILE.FREE, t.facts(d, { worker: w, demander: relatedDemander, asset: token.target, reward: cheap }));
    expect([related.status.ineligible, related.status.relation]).to.deep.equal([I.RELATION, 1]);
    // 6 asset, before 7 bounty
    expect(await reason({ worker: w, demander, asset: token.target, reward: cheap })).to.equal(I.ASSET);
    // 7 bounty, before the caps
    expect(await reason({ worker: w, demander, reward: cheap })).to.equal(I.BOUNTY);

    // the caps, each reached by eligible receipts: pair (one for a pair), demander (two for a demander), worker (50 GMU)
    expect(await reason({ worker: w, demander })).to.equal(I.NONE);
    expect(await reason({ worker: pairWorker, demander })).to.equal(I.NONE);
    // 8 demander cap, before 9 pair cap: this pair is used up as well
    expect(await reason({ worker: w, demander })).to.equal(I.DEMANDER_CAP);
    // 9 pair cap, before 10 worker cap: another demander, one receipt, then the same pair again
    expect(await reason({ worker: capped, demander: relatedDemander })).to.equal(I.NONE);
    expect(await reason({ worker: capped, demander: relatedDemander })).to.equal(I.PAIR_CAP);
    // 10 worker cap: the worker's 50 GMU under the profile are accrued; a fresh pair and demander do not help
    expect(await reason({ worker: capped, demander: pairWorker })).to.equal(I.WORKER_CAP);

    // G0: rejected, not admitted, operator not declared, worker cap
    const g0 = async (signer, options) => (await t.submitDirect(d, signer, options)).status.ineligible;
    expect(await g0(stranger, { output: ethers.id("wrong") })).to.equal(I.REJECTED);   // rejected before not admitted
    const [, , , , , , , , , notAdmittedNoOperator] = await ethers.getSigners();
    expect(await g0(notAdmittedNoOperator)).to.equal(I.NOT_ADMITTED);                  // not admitted before operator
    expect(await g0(bare, { profile: PROFILE.ECHO, jobIndex: 0 })).to.equal(I.OPERATOR_NOT_DECLARED);
    // here the echo profile's cap is 10 GMU: the first job of ten fills it, and the audit profile's cap is its own.
    // An undeclared worker accrues nothing, so "operator not declared" and "worker cap" never meet in one receipt
    expect(await g0(w, { profile: PROFILE.ECHO, jobIndex: 0 })).to.equal(I.NONE);
    expect(await g0(w, { profile: PROFILE.ECHO, jobIndex: 1 })).to.equal(I.WORKER_CAP);
    expect(await g0(w)).to.equal(I.NONE);

    // the order the client states is the order the contract applied
    expect(v2.REASON_ORDER.g1).to.deep.equal([15, 14, 3, 4, 2, 11, 12, 13, 5, 6, 7, 8, 9, 10]);
    expect(v2.REASON_ORDER.g0).to.deep.equal([1, 2, 12, 10]);
    expect(v2.INELIGIBLE_NAME.length).to.equal(16);
  });
});

describe("Ledger v2: work facts apart from receipts", () => {
  it("lets anyone record a settlement as a fact, which counts nothing and stands in nobody's way (L26)", async () => {
    const [, demander, worker, bystander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [demander, worker] });
    const tender = await h.tender(d, { owner: demander, worker });
    const source = d.taskToken.target;
    const untouched = async () => [await d.ledger.receiptCount(), (await d.ledger.epochSummary(0)).digest, await d.ledger.measuredOf(0, 1, worker.address),
      await d.ledger.receiptOfContribution(v2.g1ContributionId(d.domain, source, tender.tokenId, tender.submissionId))];

    // a third party records the fact first
    const rc = await (await d.adapter.connect(bystander).recordFact(tender.tokenId, tender.submissionId)).wait();
    const factId = v2.factId(v2.factDomain(d.chainId, d.ledgerAddress), source, tender.tokenId, tender.submissionId);
    expect(await d.ledger.factDomain()).to.equal(v2.factDomain(d.chainId, d.ledgerAddress));
    expect(await d.ledger.factId(source, tender.tokenId, tender.submissionId)).to.equal(factId);
    expect(h.eventsOf(rc, d.adapter, "TenderFact")[0].args.factId).to.equal(factId);
    const fact = await d.ledger.factOf(factId);
    expect([fact.data.source, fact.data.tokenId, fact.data.submissionId, fact.data.fulfiller, fact.data.owner, fact.data.judge, fact.data.recorder])
      .to.deep.equal([source, tender.tokenId, tender.submissionId, worker.address, demander.address, demander.address, bystander.address]);
    expect([fact.data.asset, fact.data.reward]).to.deep.equal([ZERO, ethers.parseEther("0.002")]);
    expect(fact.profileId).to.equal((await d.policy.activeProfile(key(PROFILE.TENDER), 0)).id);
    // nothing of an epoch moved: no receipt, no contribution id, no GMU, and the epoch is not even opened
    expect(await untouched()).to.deep.equal([0n, NONE, 0n, 0n]);
    expect((await d.ledger.epochSummary(0)).opened).to.equal(false);
    // a fact's id is not a contribution id
    expect(factId).to.not.equal(v2.g1ContributionId(d.domain, source, tender.tokenId, tender.submissionId));

    // recorded again, by anyone: the fact that exists, unchanged
    const twice = await (await d.adapter.connect(demander).recordFact(tender.tokenId, tender.submissionId)).wait();
    expect(h.eventsOf(twice, d.ledger, "FactRecorded").length).to.equal(0);
    expect(await d.ledger.factCount()).to.equal(1n);
    expect((await d.ledger.factOf(factId)).data.recorder).to.equal(bystander.address);

    // the owner confirms: the receipt is what it would have been without any fact
    await (await d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId)).wait();
    const done = await t.lastReceipt(d);
    expect([done.id, done.status.ineligible, done.status.gmuMeasured, done.status.gmuSubsidized]).to.deep.equal([1n, I.NONE, 50n, 50n]);
    // confirmed again: the receipt that exists, and nothing new
    const repeat = await (await d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId)).wait();
    expect(h.eventsOf(repeat, d.ledger, "ReceiptRecorded").length).to.equal(0);
    expect(h.eventsOf(repeat, d.adapter, "TenderConfirmed")[0].args.receiptId).to.equal(1n);
    expect(await d.ledger.receiptCount()).to.equal(1n);
    expect(await d.ledger.subsidizedOf(0, 1, worker.address)).to.equal(50n);

    // a confirmation needs no fact, and a fact can follow a receipt; an unsettled submission is no fact
    const second = await h.tender(d, { owner: demander, worker: bystander });
    await (await d.adapter.connect(demander).confirm(second.tokenId, second.submissionId)).wait();
    await (await d.adapter.connect(worker).recordFact(second.tokenId, second.submissionId)).wait();
    expect(await d.ledger.factCount()).to.equal(2n);
    const open = await h.tender(d, { owner: demander, worker, settle: false });
    await t.refuses(d.adapter.connect(bystander).recordFact(open.tokenId, open.submissionId), "NotSettled");
    // work whose demander never confirms has a public fact and is in no epoch's GMU
    const never = await h.tender(d, { owner: bystander, worker });
    await (await d.adapter.connect(worker).recordFact(never.tokenId, never.submissionId)).wait();
    await h.toEpoch(d, 1);
    expect((await d.ledger.epochSummary(0)).receiptCount).to.equal(2n);
    expect(await d.ledger.factRecorded(await d.ledger.factId(source, never.tokenId, never.submissionId))).to.equal(true);
    await t.refuses(d.ledger.factOf(ethers.id("no such fact")), "UnknownFact");
  });
});

describe("Ledger v2: a task unit is counted once", () => {
  const K = ethers.id("task: fixture 1");

  it("gives the counting of a content key to the first measured receipt, across sources, profiles and epochs (L27)", async () => {
    const [, w1, w2, w3, demander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w1, w2, w3, demander], params: { maxSubsidizedPerDemander: 10 } });
    const unit = { contentKey: K, unit: v2.UNIT.WHOLE, envelopeHash: ethers.id("envelope 1") };

    const first = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w1, demander }), unit);
    expect([first.status.ineligible, first.status.gmuMeasured, first.status.gmuSubsidized, first.status.duplicateOf]).to.deep.equal([I.NONE, 50n, 50n, 0n]);
    expect([first.receipt.contentKey, first.receipt.unit, first.receipt.role, first.receipt.envelopeHash])
      .to.deep.equal([K, v2.UNIT.WHOLE, v2.ROLE.INTELLIGENCE_PRODUCTION, ethers.id("envelope 1")]);
    expect(await d.ledger.contentKeyOwner(K)).to.equal(first.id);
    expect(h.eventsOf(first.rc, d.ledger, "ContentKeyTaken")[0].args.receiptId).to.equal(first.id);

    // another source with the same key: another worker, another tender
    const second = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w2, demander }), unit);
    expect([second.status.verdict, second.status.ineligible, second.status.gmuMeasured, second.status.gmuSubsidized, second.status.duplicateOf])
      .to.deep.equal([1, I.DUPLICATE_CONTRIBUTION, 0n, 0n, first.id]);
    // under another profile that counts units: the occupancy is the ledger's, not a profile's
    const third = await t.record(d, PROFILE.UNIT_B, t.facts(d, { worker: w3, demander }), unit);
    expect([third.status.ineligible, third.status.duplicateOf]).to.deep.equal([I.DUPLICATE_CONTRIBUTION, first.id]);
    // in a later epoch
    await h.toEpoch(d, 1);
    const fourth = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w2, demander }), unit);
    expect([fourth.receipt.epoch, fourth.status.ineligible, fourth.status.duplicateOf]).to.deep.equal([1n, I.DUPLICATE_CONTRIBUTION, first.id]);
    expect(await d.ledger.contentKeyOwner(K)).to.equal(first.id);

    // a duplicate adds GMU of neither kind, and uses up no counter of the demander or the pair
    expect(await d.ledger.measuredOf(0, 1, w2.address)).to.equal(0n);
    expect((await d.ledger.epochSummary(0)).measuredG1).to.equal(50n);
    expect((await d.ledger.epochSummary(1)).measuredG1).to.equal(0n);
    // another key is another task
    const other = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w2, demander }), { ...unit, contentKey: ethers.id("task: fixture 2") });
    expect([other.status.ineligible, other.status.gmuSubsidized]).to.deep.equal([I.NONE, 50n]);
    // the same source again returns the receipt that exists
    const f = t.facts(d, { worker: w3, demander });
    const once = await t.record(d, PROFILE.UNIT, f, { ...unit, contentKey: ethers.id("task: fixture 3") });
    const twice = await t.record(d, PROFILE.UNIT, f, { ...unit, contentKey: ethers.id("task: fixture 3") });
    expect(twice.id).to.equal(once.id);
    expect(h.eventsOf(twice.rc, d.ledger, "ReceiptRecorded").length).to.equal(0);
  });

  it("is taken by a receipt that is measured and not subsidized: taking the counting is measurement (L28)", async () => {
    const [, admitted, stranger, demander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [admitted, demander] });
    const unit = { contentKey: K, unit: v2.UNIT.WHOLE };
    // the first rightful delivery is by a worker that is not admitted: measured, no subsidy
    const first = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: stranger, demander }), unit);
    expect([first.status.ineligible, first.status.gmuMeasured, first.status.gmuSubsidized]).to.deep.equal([I.NOT_ADMITTED, 50n, 0n]);
    expect(await d.ledger.contentKeyOwner(K)).to.equal(first.id);
    // the counting is not given back because the receipt was not subsidized
    const second = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: admitted, demander }), unit);
    expect([second.status.ineligible, second.status.gmuMeasured, second.status.duplicateOf]).to.deep.equal([I.DUPLICATE_CONTRIBUTION, 0n, first.id]);
    // so too for a self-dealing one: it is measured, and the key is counted
    const k2 = ethers.id("task: fixture 2");
    const self = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: demander, demander }), { contentKey: k2, unit: v2.UNIT.WHOLE });
    expect([self.status.ineligible, self.status.gmuMeasured]).to.deep.equal([I.SELF_DEALING, 50n]);
    expect(await d.ledger.contentKeyOwner(k2)).to.equal(self.id);
  });

  it("is not taken by what is no task unit, by a part, by a wrong demander's order or by a fact (L29)", async () => {
    const [, w1, w2, demander, bystander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w1, w2, demander] });

    for (const unit of [v2.UNIT.NOT_MEMBER, v2.UNIT.PART, v2.UNIT.WRONG_ISSUER]) {
      const r = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w1, demander }), { contentKey: K, unit });
      expect([r.status.verdict, r.status.ineligible, r.status.gmuMeasured, r.status.gmuSubsidized, r.status.duplicateOf], `unit ${unit}`)
        .to.deep.equal([1, I.NOT_A_TASK_UNIT, 0n, 0n, 0n]);
      expect([r.receipt.unit, r.receipt.contentKey]).to.deep.equal([unit, K]);
      expect(await d.ledger.contentKeyOwner(K), `unit ${unit} took the key`).to.equal(0n);
      expect(h.eventsOf(r.rc, d.ledger, "ContentKeyTaken").length).to.equal(0);
    }
    // a fact of a settlement, recorded by a bystander, names no key at all
    const tender = await h.tender(d, { owner: demander, worker: w1 });
    await (await d.adapter.connect(bystander).recordFact(tender.tokenId, tender.submissionId)).wait();
    expect(await d.ledger.contentKeyOwner(K)).to.equal(0n);
    expect(await d.ledger.measuredOf(0, 1, w1.address)).to.equal(0n);

    // and a fact of the very delivery that is about to be confirmed, recorded first, by a bystander,
    // under the profile that counts units: it takes neither the contribution id nor the key
    const due = t.facts(d, { worker: w2, demander });
    await (await d.module.fact(key(PROFILE.UNIT), {
      source: due.source, tokenId: due.tokenId, submissionId: due.submissionId, fulfiller: w2.address, owner: demander.address,
      judge: demander.address, taskHash: due.inputHash, resultHash: due.outputHash, asset: ZERO, reward: due.reward,
      deliveredAt: due.deliveredAt, recorder: bystander.address,
    })).wait();
    expect(await d.ledger.factRecorded(await d.ledger.factId(due.source, due.tokenId, due.submissionId))).to.equal(true);
    expect(await d.ledger.receiptOfContribution(v2.g1ContributionId(d.domain, due.source, due.tokenId, due.submissionId))).to.equal(0n);
    expect(await d.ledger.contentKeyOwner(K)).to.equal(0n);

    // the rightful confirmation comes after all of them, and counts as if none of them existed
    const rightful = await t.record(d, PROFILE.UNIT, due, { contentKey: K, unit: v2.UNIT.WHOLE });
    expect([rightful.status.ineligible, rightful.status.gmuMeasured, rightful.status.gmuSubsidized, rightful.status.duplicateOf]).to.deep.equal([I.NONE, 50n, 50n, 0n]);
    expect(await d.ledger.contentKeyOwner(K)).to.equal(rightful.id);

    // what a module may state: a unit and a key under a version that counts units, neither under one that does not
    const f = () => t.facts(d, { worker: w1, demander });
    await t.refuses(d.module.record(key(PROFILE.UNIT), f(), t.extra({ contentKey: K, unit: 0 }), { sender: ZERO, authorization: NONE }), "BadExtra");
    await t.refuses(d.module.record(key(PROFILE.UNIT), f(), t.extra({ contentKey: K, unit: 5 }), { sender: ZERO, authorization: NONE }), "BadExtra");
    await t.refuses(d.module.record(key(PROFILE.UNIT), f(), t.extra({ unit: v2.UNIT.WHOLE }), { sender: ZERO, authorization: NONE }), "BadExtra");
    await t.refuses(d.module.record(key(PROFILE.FREE), f(), t.extra({ contentKey: K }), { sender: ZERO, authorization: NONE }), "BadExtra");
    await t.refuses(d.module.record(key(PROFILE.FREE), f(), t.extra({ unit: v2.UNIT.WHOLE }), { sender: ZERO, authorization: NONE }), "BadExtra");
    // and only the profile's own module states anything: the module of g1.tender is the adapter
    await t.refuses(d.module.record(key(PROFILE.TENDER), f(), t.extra(), { sender: ZERO, authorization: NONE }), "NotModule");
    await t.refuses(d.ledger.recordG1(key(PROFILE.UNIT), f(), t.extra({ contentKey: K, unit: 1 }), { sender: ZERO, authorization: NONE }), "NotModule");
    await t.refuses(d.module.record(key(PROFILE.G0), f(), t.extra(), { sender: ZERO, authorization: NONE }), "WrongPool");
    // a version that counts units commits to what they are, and only a G1 version can
    const bad = (extra_) => d.policy.registerProfile(d.spec("g1.bad", 1, d.module.target, 50, 50, 0, { activeFromEpoch: 5, ...extra_ }));
    await t.refuses(bad({ countsUnits: true }), "BadProfile");
    await t.refuses(bad({ countsUnits: true, unitSetRoot: K }), "BadProfile");
    await t.refuses(bad({ unitSetRoot: K }), "BadProfile");
    await t.refuses(bad({ role: 5 }), "BadProfile");
    await t.refuses(d.policy.registerProfile(d.spec("g0.bad", 0, d.echo.target, 10, 10, 1, { activeFromEpoch: 5, countsUnits: true, unitSetRoot: K, issuerSetRoot: K })), "BadProfile");
  });

  it("counts a confirmation in the epoch in which it is recorded, whenever the work was delivered (L30)", async () => {
    const [, demander, worker] = await ethers.getSigners();
    const d = await t.deploy({ admit: [demander, worker] });
    await t.submitDirect(d, worker);
    const tender = await h.tender(d, { owner: demander, worker }); // delivered and settled in epoch 0
    await h.toEpoch(d, 1);
    await d.ledger.seal(0);
    const frozen = [await d.ledger.auditSubject(0), await d.ledger.allocation(0, worker.address), (await d.ledger.epochSummary(0)).receiptCount];

    await h.toEpoch(d, 2);
    await (await d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId)).wait();
    const done = await t.lastReceipt(d);
    expect([done.receipt.epoch, done.status.ineligible, done.status.gmuSubsidized]).to.deep.equal([2n, I.NONE, 50n]);
    expect(await d.ledger.subsidizedOf(2, 1, worker.address)).to.equal(50n);
    expect(await d.ledger.subsidizedOf(0, 1, worker.address)).to.equal(0n);
    expect(await d.ledger.operatorAt(2, worker.address)).to.deep.equal([true, await d.policy.operatorOf(worker.address)]);
    // the epoch of the delivery, and the one in between, did not move
    expect([await d.ledger.auditSubject(0), await d.ledger.allocation(0, worker.address), (await d.ledger.epochSummary(0)).receiptCount]).to.deep.equal(frozen);
    expect((await d.ledger.epochSummary(1)).receiptCount).to.equal(0n);
  });
});

describe("Ledger v2: the ledger reads a tender as it stands when it is confirmed", () => {
  it("records a confirmation after the right to judge was handed on as it reads it then (L31, the ledger's part)", async () => {
    const [, demander, worker, successor] = await ethers.getSigners();
    const d = await t.deploy({ admit: [demander, worker] });
    // the worker judges its own delivery, then hands the right to judge on, then the owner confirms
    const tender = await h.tender(d, { owner: demander, judge: worker, worker });
    await (await d.taskToken.connect(worker).setAcceptanceAuthority(tender.tokenId, successor.address)).wait();
    await (await d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId)).wait();
    const done = await t.lastReceipt(d);
    // not caught by `worker == judge`: v2 does not bind the authority at settlement, and says so
    expect([done.status.ineligible, done.status.gmuSubsidized]).to.deep.equal([I.NONE, 50n]);
    // the same without the handing on is self-dealing
    const plain = await h.tender(d, { owner: demander, judge: worker, worker });
    await (await d.adapter.connect(demander).confirm(plain.tokenId, plain.submissionId)).wait();
    expect((await t.lastReceipt(d)).status.ineligible).to.equal(I.SELF_DEALING);
  });
});

describe("Ledger v2: what a pause stops, and the boundaries of the contracts", () => {
  it("stops recording and nothing else: permits can still be ended, epochs opened and sealed", async () => {
    const [, w, delegate, relayer, demander] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w, demander] });
    const p = await t.signed(d, w, w.address, { delegate: delegate.address });
    const q = await t.signed(d, w, w.address, { delegate: delegate.address, nonce: 2 });
    const tender = await h.tender(d, { owner: demander, worker: w });
    await h.toEpoch(d, 1);
    await (await d.policy.setPaused(true)).wait();

    const o = await t.g0Output(d, w.address); // opens epoch 1: opening is not recording
    expect((await d.ledger.epochSummary(1)).opened).to.equal(true);
    await t.refuses(d.ledger.connect(w).submitG0(key(PROFILE.G0), o.epoch, 0, o.output), "Paused");
    await t.refuses(d.ledger.connect(delegate).submitG0For(p.tuple, p.signature, key(PROFILE.G0), o.epoch, 0, o.output), "Paused");
    await t.refuses(d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId), "Paused");
    await t.refuses(d.adapter.connect(relayer).recordFact(tender.tokenId, tender.submissionId), "Paused");
    expect(await d.ledger.receiptCount()).to.equal(0n);

    // every way of ending a permit, and the close record of the epoch that ended
    await (await d.ledger.connect(w).revokePermit(p.digest)).wait();
    const revoke = await t.signedStatement(d, w, "Revoke", { account: w.address, permitDigest: q.digest });
    await (await d.ledger.connect(relayer).revokePermitBySig(w.address, q.digest, revoke.signature)).wait();
    const r = await t.signed(d, w, w.address, { delegate: delegate.address, nonce: 3 });
    await (await d.ledger.connect(delegate).renounce(r.tuple)).wait();
    await (await d.ledger.connect(w).raiseMinNonce(4)).wait();
    const raise = await t.signedStatement(d, w, "RaiseNonce", { account: w.address, minNonce: 5 });
    await (await d.ledger.connect(relayer).raiseMinNonceBySig(w.address, 5, raise.signature)).wait();
    expect([await d.ledger.isRevoked(w.address, p.digest), await d.ledger.isRevoked(w.address, q.digest), await d.ledger.isRevoked(w.address, r.digest),
      await d.ledger.minNonce(w.address)]).to.deep.equal([true, true, true, 5n]);
    await (await d.ledger.connect(relayer).seal(0)).wait();
    expect((await d.ledger.epochSummary(0)).isSealed).to.equal(true);

    await (await d.policy.setPaused(false)).wait();
    await (await d.adapter.connect(demander).confirm(tender.tokenId, tender.submissionId)).wait();
    expect(await d.ledger.receiptCount()).to.equal(1n);
  });

  it("changes state through these functions and no others, holds nothing and offers nothing to claim", async () => {
    const root = path.join(__dirname, "..");
    const artifact = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", rel), "utf8")).abi;
    const writers = (abi) => abi.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    const KERNEL = {
      GenesisLedgerV2: artifact("v2/GenesisLedgerV2.sol/GenesisLedgerV2.json"),
      GenesisPolicyV2: artifact("v2/GenesisPolicyV2.sol/GenesisPolicyV2.json"),
      TenderAdapter8414V2: artifact("v2/TenderAdapter8414V2.sol/TenderAdapter8414V2.json"),
      FogaCellGuard: artifact("v2/guards/FogaCellGuard.sol/FogaCellGuard.json"),
    };
    expect(writers(KERNEL.GenesisLedgerV2)).to.deep.equal([
      "openEpoch", "raiseMinNonce", "raiseMinNonceBySig", "recordFact", "recordG1", "renounce", "revokePermit", "revokePermitBySig", "seal",
      "submitG0", "submitG0For",
    ]);
    expect(writers(KERNEL.GenesisPolicyV2)).to.deep.equal([
      "acceptStewardship", "bindGuard", "declareOperator", "registerParams", "registerProfile", "retireProfile", "setAdmission", "setPaused",
      "transferStewardship",
    ]);
    expect(writers(KERNEL.TenderAdapter8414V2)).to.deep.equal(["confirm", "confirmFor", "recordFact"]);
    expect(writers(KERNEL.FogaCellGuard)).to.deep.equal([]);

    const tokenLike = /^(transfer|transferFrom|approve|allowance|balanceOf|totalSupply|(mint|burn|claim|redeem|withdraw|deposit|payout|distribute)\w*)$/i;
    for (const [name, abi] of Object.entries(KERNEL)) {
      for (const f of abi) {
        expect(f.type, `${name} has a ${f.type}`).to.not.be.oneOf(["receive", "fallback"]);
        if (f.type !== "function" && f.type !== "constructor") continue;
        expect(f.stateMutability, `${name}.${f.name ?? "constructor"} takes value`).to.not.equal("payable");
        if (f.type === "function") expect(tokenLike.test(f.name), `${name}.${f.name} looks like a balance or a payment`).to.equal(false);
      }
    }
    const [, w] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const guard = await deployed("FogaCellGuard");
    for (const c of [d.ledger, d.policy, d.adapter, guard]) {
      let refused = false;
      try { await (await w.sendTransaction({ to: c.target, value: 1n })).wait(); } catch { refused = true; }
      expect(refused).to.equal(true);
      expect(await ethers.provider.getBalance(c.target)).to.equal(0n);
    }
    // the guard for FOGA cells stays outside the kernel: nothing of the kernel imports it or names FOGA
    for (const file of ["GenesisLedgerV2.sol", "GenesisPolicyV2.sol", "TenderAdapter8414V2.sol", "TypesV2.sol", "interfaces/IGenesisLedgerV2.sol",
      "interfaces/IGenesisPolicyV2.sol", "interfaces/IParticipantGuard.sol"]) {
      const source = fs.readFileSync(path.join(root, "contracts", "v2", file), "utf8");
      expect(/foga|guards\//i.test(source), `contracts/v2/${file} names FOGA or imports its guard`).to.equal(false);
    }
    // the code of the ledger fits a chain's limit with room to spare, and the domains are the deployment's own
    const size = (await ethers.provider.getCode(d.ledgerAddress)).length / 2 - 1;
    expect(size <= 24576 - 1024, `the ledger's code is ${size} bytes`).to.equal(true);
    expect(await d.ledger.domain()).to.equal(v2.ledgerDomain(d.chainId, d.ledgerAddress));
    expect(await d.ledger.domain()).to.not.equal(g.ledgerDomain(d.chainId, d.ledgerAddress)); // not the domain of a 0.1.3 ledger at the same address
    expect(await d.ledger.configHash()).to.equal(v2.configHash(d.domain, d.policy.target, d.seedSource.target, d.genesisTime, d.duration));
  });
});
