"use strict";

// The reference client's audit of an epoch of ledger v2 (client/lib/audit2.js): what it re-decides
// from the chain alone, what it holds against the ledger, and what it reports without deciding.
// One deployment carries two epochs with every kind of v2 receipt in them; the tests of that
// deployment only read it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");
const t = require("./v2.helpers");
const a2 = require("../client/lib/audit2");
const { auditRecord, SCHEMA } = require("../client/lib/report2");
const canonical = require("../client/lib/canonical");
const { ethers, h, g, v2, permit, PROFILE, key, ZERO, NONE } = t;

const P = t.POINTS;
const I = v2.INELIGIBLE;
const deployed = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);
const show = (report) => JSON.stringify(g.jsonable(report.findings), null, 2);
const whats = (report) => report.findings.map((f) => f.what);
const connect = (d, options = {}, runner = ethers.provider) => a2.connect({ ledger: d.ledgerAddress, chainId: d.chainId }, runner, { tag: "latest", ...options });

/// A view of a contract with some members replaced: what an auditor would see if the contract's
/// answers, or its log, differed from what the chain's rules produce.
function tampered(contract, overrides) {
  return new Proxy(contract, {
    get: (target, k) => {
      if (k in overrides) return overrides[k];
      const v = Reflect.get(target, k);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/// A contract whose log is seen through `change`: each event of the kind `name` is replaced by what
/// `change` returns for it, and `added` is appended to the events of that kind.
function withLog(contract, name, change = (ev) => ev, added = []) {
  const real = contract.queryFilter.bind(contract);
  return tampered(contract, {
    queryFilter: async (filter, from, to) => {
      const events = await real(filter, from, to);
      if (filter.fragment?.name !== name) return events;
      const plain = (ev) => ({ blockNumber: ev.blockNumber, index: ev.index, transactionHash: ev.transactionHash, fragment: ev.fragment, args: ev.args });
      return [...events.map((ev) => change(plain(ev), ev) ?? plain(ev)), ...added];
    },
  });
}

/// A provider that notes every read it is asked for.
function watched(provider) {
  const seen = { calls: [], codes: [], logs: [], blocks: [] };
  const proxy = new Proxy(provider, {
    get(target, prop) {
      if (prop === "provider") return proxy;
      if (prop === "call") return async (tx) => { seen.calls.push(tx.blockTag); return target.call(tx); };
      if (prop === "getCode") return async (address, tag) => { seen.codes.push(tag); return target.getCode(address, tag); };
      if (prop === "getLogs") return async (filter) => { seen.logs.push([filter.fromBlock, filter.toBlock]); return target.getLogs(filter); };
      if (prop === "getBlock") return async (tag) => { seen.blocks.push(tag); return target.getBlock(tag); };
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { proxy, seen };
}

const receiptOfTender = async (d, tn) => {
  const id = await d.ledger.receiptOfContribution(v2.g1ContributionId(d.domain, d.taskToken.target, tn.tokenId, tn.submissionId));
  return { id, receipt: v2.plainReceipt(await d.ledger.receipt(id)), status: v2.plainStatus(await d.ledger.status(id)) };
};
/// Confirm a settled submission as the tender's owner.
async function confirm(d, tn) {
  await (await d.adapter.connect(tn.owner).confirm(tn.tokenId, tn.submissionId)).wait();
  return receiptOfTender(d, tn);
}
/// Confirm a settled submission through `delegate` under the owner's permit `p`.
async function confirmFor(d, tn, delegate, p) {
  await (await d.adapter.connect(delegate).confirmFor(p.tuple, p.signature, tn.tokenId, tn.submissionId)).wait();
  return receiptOfTender(d, tn);
}
/// A permit as `scripts/sign-permit.js` writes it.
const recordOf = (p, signer) => ({
  schema: "finchain-pouw.signed-statement/1", kind: "Permit", typedData: permit.typedData(p.st), digest: p.digest, signer: signer.address, signature: p.signature,
});

/// Two epochs of one deployment. Epoch 0 has a receipt of every kind the client can re-decide: G0
/// entered directly and through a delegate, by a key and by a contract account behind a guard, and
/// once through a delegate that is itself a contract; G1 confirmed by the owner and through a
/// delegate, with one receipt for every reason of the order.
/// The policy changes during epoch 0, for epoch 1: an operator is declared, a worker changes its
/// operator, an address is admitted, the account's guard is replaced.
async function twoEpochs() {
  const [, w1, w2, w3, d1, d2, stranger, fresh, delegate, undeclared, a, elsewhere] = await ethers.getSigners();
  const d = await t.deploy({
    admit: [w1, w2, w3, d1, d2, undeclared], operators: { [w3.address]: 7, [d2.address]: 7, [undeclared.address]: 0 }, start: false, g1Cap: 100n,
  });
  const account = await deployed("OwnerOnlyAccount", a.address);
  const guardA = await deployed("SwitchGuard");
  const guardB = await deployed("SwitchGuard");
  const relay = await deployed("OwnerOnlyAccount", delegate.address); // a delegate that is a contract, moved by the delegate's key
  await d.policy.setAdmission(account.target, true);
  await d.policy.declareOperator(account.target, 9);
  await d.policy.bindGuard(account.target, guardA.target); // binding 1, from epoch 0
  const token = await deployed("TestToken");
  const tn = {};
  tn.early = await h.tender(d, { owner: d1, worker: w2 }); // delivered and settled before the genesis time
  await h.setTime(d.genesisTime);

  const permits = {
    w2: await t.signed(d, w2, w2.address, { delegate: delegate.address, scope: 1 }),
    account: await t.signed(d, a, account.target, { delegate: delegate.address, guard: guardA.target, guardBindingVersion: 1 }),
    d1: await t.signed(d, d1, d1.address, { delegate: delegate.address, scope: 2, nonce: 5 }),
    fresh: await t.signed(d, fresh, fresh.address, { delegate: relay.target, scope: 1 }),
  };

  // G0, the audit function
  const r = {};
  r.g0w1 = await t.submitDirect(d, w1);
  r.g0w2 = await t.submitDelegated(d, delegate, permits.w2, w2.address);
  r.g0account = await t.submitDelegated(d, delegate, permits.account, account.target);
  r.g0stranger = await t.submitDirect(d, stranger);
  r.g0undeclared = await t.submitDirect(d, undeclared);
  r.g0wrong = await t.submitDirect(d, w3, { output: ethers.id("not the answer") });
  // through the contract delegate: the ledger's entry is not the transaction's top-level call
  const o = await t.g0Output(d, fresh.address);
  const call = d.ledger.interface.encodeFunctionData("submitG0For", [permits.fresh.tuple, permits.fresh.signature, key(PROFILE.G0), o.epoch, 0, o.output]);
  await (await relay.connect(delegate).execute(d.ledgerAddress, 0, call)).wait();
  r.g0relayed = await t.lastReceipt(d);

  // G1: the tenders
  tn.eligible = await h.tender(d, { owner: d1, worker: w1 });
  tn.pairCap = await h.tender(d, { owner: d1, worker: w1 });
  tn.selfDealing = await h.tender(d, { owner: w1, worker: w1 });
  tn.judgedByWorker = await h.tender(d, { owner: d2, judge: w2, worker: w2 });
  tn.related = await h.tender(d, { owner: d2, worker: w3 });
  tn.erc20 = await h.tender(d, { owner: d1, worker: w2, asset: token.target, reward: ethers.parseEther("3") });
  tn.cheap = await h.tender(d, { owner: d1, worker: w2, reward: ethers.parseEther("0.0001") });
  tn.notAdmitted = await h.tender(d, { owner: d1, worker: stranger });
  tn.freshDemander = await h.tender(d, { owner: fresh, worker: w3 });
  tn.workerUndeclared = await h.tender(d, { owner: d1, worker: undeclared });
  tn.demanderUndeclared = await h.tender(d, { owner: undeclared, worker: w2 });
  tn.byDefault = await h.tender(d, { owner: d1, worker: w2, settle: false, judgmentWindow: 600 });
  await h.setTime((await h.now()) + 601n);
  await (await d.taskToken.connect(w2).claimUnjudged(tn.byDefault.tokenId, tn.byDefault.submissionId)).wait();
  tn.delegated = await h.tender(d, { owner: d1, worker: w3 });
  tn.demanderCap = await h.tender(d, { owner: d1, worker: w2 });
  // a tender that the contract account owns when it settles
  tn.account = await h.tender(d, { owner: d1, worker: w2, settle: false });
  await (await d.taskToken.connect(d1).transferFrom(d1.address, account.target, tn.account.tokenId)).wait();
  await (await d.taskToken.connect(d1).acceptFulfillment(tn.account.tokenId, tn.account.submissionId)).wait();
  tn.workerCap = await h.tender(d, { owner: d2, worker: w2 }); // confirmed last: by then w2 has its 100 GMU of the profile
  tn.factOnly = await h.tender(d, { owner: d2, worker: w1 });

  // a fact recorded by a third party before the owner confirms, and one that is never confirmed
  await (await d.adapter.connect(stranger).recordFact(tn.eligible.tokenId, tn.eligible.submissionId)).wait();
  await (await d.adapter.connect(stranger).recordFact(tn.factOnly.tokenId, tn.factOnly.submissionId)).wait();

  // G1: the confirmations, in the order the caps count them
  for (const name of ["early", "eligible", "pairCap", "selfDealing", "judgedByWorker", "related", "erc20", "cheap", "notAdmitted", "freshDemander",
    "workerUndeclared", "demanderUndeclared", "byDefault"]) r[name] = await confirm(d, tn[name]);
  r.delegated = await confirmFor(d, tn.delegated, delegate, permits.d1);
  r.demanderCap = await confirm(d, tn.demanderCap);
  r.account = await confirmFor(d, tn.account, delegate, permits.account);
  r.workerCap = await confirm(d, tn.workerCap);
  // a confirmation repeated: answered with the receipt there is, and a second record of the module
  await (await d.adapter.connect(d1).confirm(tn.eligible.tokenId, tn.eligible.submissionId)).wait();

  // after the receipts: permits end, and the policy changes for epoch 1
  await (await d.ledger.connect(w2).raiseMinNonce(2)).wait();
  await (await d.ledger.connect(d1).revokePermit(permits.d1.digest)).wait();
  await d.policy.declareOperator(undeclared.address, 12);
  await d.policy.declareOperator(w1.address, 7);
  await d.policy.setAdmission(stranger.address, true);
  await d.policy.bindGuard(account.target, guardB.target); // binding 2, from epoch 1

  await h.toEpoch(d, 1);
  const firstOfEpoch1 = await ethers.provider.getBlock("latest");
  permits.account2 = await t.signed(d, a, account.target, { delegate: delegate.address, guard: guardB.target, guardBindingVersion: 2, nonce: 2 });
  const s = {};
  s.w1 = await t.submitDirect(d, w1);
  s.undeclared = await t.submitDirect(d, undeclared);
  s.stranger = await t.submitDirect(d, stranger);
  s.account = await t.submitDelegated(d, delegate, permits.account2, account.target);
  s.w3 = await t.submitDirect(d, w3);
  await (await d.ledger.seal(0)).wait();
  await h.toEpoch(d, 2);

  return { d, w1, w2, w3, d1, d2, stranger, fresh, delegate, undeclared, a, elsewhere, account, guardA, guardB, relay, token, tn, permits, r, s, firstOfEpoch1 };
}

describe("The reference client: the audit of an epoch of ledger v2", () => {
  let w; // the two epochs, built once; the tests below only read
  let supplied; // the one permit of epoch 0 that no transaction shows, as a deployment would publish it
  before(async () => {
    w = await twoEpochs();
    supplied = [recordOf(w.permits.fresh, w.fresh)];
  });

  it("re-decides every receipt of a mixed epoch from the chain alone and agrees with the ledger in every figure (L36)", async () => {
    const { d, w1, w2, w3, d1, stranger, undeclared, fresh, account, r } = w;
    const ctx = await connect(d);
    const report = await a2.auditEpoch(ctx, 0);
    expect(report.ok, show(report)).to.equal(true);
    expect([report.agrees, report.complete, report.undecided]).to.deep.equal([true, true, []]);
    expect(report.receiptCount).to.equal(24n);
    expect(report.mode).to.equal("standard");

    // each receipt's status is the audit's own, and it is the ledger's
    const mine = (x) => report.receipts.find((it) => it.id === x.id).status;
    const expected = {
      g0w1: [I.NONE, 10n, 10n], g0w2: [I.NONE, 10n, 10n], g0account: [I.NONE, 10n, 10n], g0stranger: [I.NOT_ADMITTED, 10n, 0n],
      g0undeclared: [I.OPERATOR_NOT_DECLARED, 10n, 0n], g0wrong: [I.REJECTED, 0n, 0n], g0relayed: [I.NOT_ADMITTED, 10n, 0n],
      early: [I.BEFORE_GENESIS, 50n, 0n], eligible: [I.NONE, 50n, 50n], pairCap: [I.PAIR_CAP, 50n, 0n], selfDealing: [I.SELF_DEALING, 50n, 0n],
      judgedByWorker: [I.SELF_DEALING, 50n, 0n], related: [I.RELATION, 50n, 0n], erc20: [I.ASSET, 50n, 0n], cheap: [I.BOUNTY, 50n, 0n],
      notAdmitted: [I.NOT_ADMITTED, 50n, 0n], freshDemander: [I.DEMANDER_NOT_ADMITTED, 50n, 0n], workerUndeclared: [I.OPERATOR_NOT_DECLARED, 50n, 0n],
      demanderUndeclared: [I.DEMANDER_OPERATOR_NOT_DECLARED, 50n, 0n], byDefault: [I.NONE, 50n, 50n], delegated: [I.NONE, 50n, 50n],
      demanderCap: [I.DEMANDER_CAP, 50n, 0n], account: [I.NONE, 50n, 50n], workerCap: [I.WORKER_CAP, 50n, 0n],
    };
    // every reason of the two orders but those of task units (L43) and the worker's cap in G0 (L42)
    expect([...new Set(Object.values(expected).map(([reason]) => reason))].sort((x, y) => x - y)).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const [name, [reason, measured, subsidized]] of Object.entries(expected)) {
      const st = mine(r[name]);
      expect([st.ineligible, st.gmuMeasured, st.gmuSubsidized], name).to.deep.equal([reason, measured, subsidized]);
      expect([r[name].status.ineligible, r[name].status.gmuMeasured, r[name].status.gmuSubsidized], `${name}, on the ledger`).to.deep.equal([reason, measured, subsidized]);
    }
    expect(mine(r.related).relation).to.equal(g.RELATION.DECLARED_RELATED);
    expect(mine(r.eligible).relation).to.equal(g.RELATION.NONE_FOUND);
    expect(report.receipts.every((it) => it.facts === a2.FACTS_EVIDENCE.DERIVED)).to.equal(true);
    expect(report.facts).to.deep.equal({ recorded: 2, byEvidence: { [a2.FACTS_EVIDENCE.DERIVED]: 24 } });

    // the totals, the digest and the subject
    expect(report.totals).to.deep.equal({ measured: [60n, 850n], subsidized: [30n, 200n] });
    const summary = await d.ledger.epochSummary(0);
    expect([report.digest, report.subject]).to.deep.equal([summary.digest, await d.ledger.auditSubject(0)]);
    expect([report.budget, report.pools]).to.deep.equal([1000n * P, [700n * P, 300n * P]]);

    // the operators: each of the three with G0 work is held to the operator cap, and so is w2's in G1
    // (the fixture gives w1 and w2 the operators 101 and 102; w1 is moved to 7 for epoch 1 only)
    const row = (x) => report.operators.find((o) => o.addresses.includes(x.address ?? x.target));
    expect(report.operators.map((o) => o.operator)).to.deep.equal([0, 7, 9, 101, 102]);
    expect([row(w1).operator, row(w1).share, row(w1).capped]).to.deep.equal([101, [175n * P, 75n * P], [true, false]]); // a quarter of G1 exactly: its GMU set that share
    expect([row(w2).operator, row(w2).share, row(w2).capped]).to.deep.equal([102, [175n * P, 75n * P], [true, true]]);
    expect([row(account).operator, row(account).share]).to.deep.equal([9, [175n * P, 0n]]);
    expect([row(w3).operator, row(w3).share]).to.deep.equal([7, [0n, 75n * P]]);
    expect(report.operators.find((o) => o.operator === 0).addresses.sort()).to.deep.equal([stranger.address, undeclared.address, fresh.address].sort());
    expect(report.undeclaredAddresses).to.equal(3);

    // the table: what each address is allocated under the two caps, as the ledger computes it
    const allocation = Object.fromEntries(report.table.map((row_) => [row_.worker, row_.allocation]));
    expect(allocation).to.deep.equal({
      [w1.address]: 250n * P, [w2.address]: 250n * P, [w3.address]: 75n * P, [account.target]: 175n * P, [stranger.address]: 0n, [undeclared.address]: 0n,
      [fresh.address]: 0n,
    });
    for (const row_ of report.table) {
      expect(await d.ledger.allocation(0, row_.worker), row_.worker).to.equal(row_.allocation);
      expect(await t.allocationOf(d, 0, row_.worker), row_.worker).to.equal(row_.allocation);
    }
    expect([report.allocated, report.unallocated]).to.deep.equal([750n * P, 250n * P]);

    // the entries: who sent each receipt's transaction and under what
    const entry = (x) => report.receipts.find((it) => it.id === x.id).entry;
    expect(report.entries).to.include({ direct: 19, delegated: 5 });
    // four were sent by the delegate's key to the ledger or to the adapter: their permits are in their transactions
    expect(report.entries.byPermitEvidence).to.deep.equal({ [a2.PERMIT_EVIDENCE.IN_TRANSACTION]: 4, [a2.PERMIT_EVIDENCE.NOT_AVAILABLE]: 1 });
    expect(report.entries.bySignatureEvidence).to.deep.equal({ [a2.SIGNATURE_EVIDENCE.VERIFIED]: 2, [a2.SIGNATURE_EVIDENCE.CONTRACT]: 2 });
    // every transaction but the relay's is the entry's own call, held to its receipt in full
    expect(report.entries.byTransaction).to.deep.equal({ [a2.TRANSACTION.ENTRY]: 23, [a2.TRANSACTION.THROUGH_A_CONTRACT]: 1 });
    expect([entry(r.g0w1).kind, entry(r.g0w1).sender, entry(r.g0w1).authorization]).to.deep.equal([a2.ENTRY.DIRECT, w1.address, NONE]);
    expect([entry(r.g0account).kind, entry(r.g0account).participant, entry(r.g0account).sender, entry(r.g0account).origin, entry(r.g0account).authorization])
      .to.deep.equal([a2.ENTRY.DELEGATED, account.target, w.delegate.address, w.delegate.address, w.permits.account.digest]);
    expect([entry(r.delegated).participant, entry(r.delegated).sender, entry(r.delegated).authorization])
      .to.deep.equal([d1.address, w.delegate.address, w.permits.d1.digest]);
    expect([entry(r.account).participant, entry(r.account).accountHasCodeAtBlock, entry(r.account).guard.guard, entry(r.account).guard.version])
      .to.deep.equal([account.target, true, w.guardA.target, 1n]);
    expect([entry(r.g0w2).accountHasCodeAtBlock, entry(r.g0w2).guard]).to.deep.equal([false, null]);
    // the guard behind the account's two delegated receipts is the code that was bound
    expect(report.guards.map((x) => [x.account, x.guard, x.version, x.codeAtBlock === x.codeHash])).to.deep.equal([[account.target, w.guardA.target, 1n, true]]);

    // G1: what the tender's own log adds
    expect(report.g1).to.include({ receipts: 17, subsidized: 4, withFactRecorded: 1 });
    expect(report.g1.bySettlement).to.deep.equal({ judged: 16, default: 1 });
    expect(report.receipts.find((it) => it.id === r.eligible.id).tender.factRecorded).to.equal(true);
    expect(report.receipts.find((it) => it.id === r.account.id).tender).to.include({ demander: account.target, ownerAtSettlement: account.target });
    expect(report.observations.map((o) => [o.receiptId, o.noted])).to.deep.equal([
      [r.selfDealing.id, ["worker-judged-its-own-delivery", "worker-owned-the-tender-when-it-settled"]],
      [r.judgedByWorker.id, ["worker-judged-its-own-delivery"]],
    ]);

    // the close record of epoch 0, with the recomputed figures
    expect([report.isSealed, report.closeRecord.present]).to.deep.equal([true, true]);
    // the same audit when the log can be read only a few blocks at a time
    const chunked = await a2.auditEpoch(await connect(d, { logChunk: 7 }), 0);
    expect([chunked.ok, chunked.digest, chunked.tableHash]).to.deep.equal([true, report.digest, report.tableHash]);
  });

  it("audits the next epoch from the first one's subject and under the policy as it changed: operator, admission, guard (L37)", async () => {
    const { d, w1, w3, stranger, undeclared, account, s } = w;
    const ctx = await connect(d);
    expect((await a2.auditSubjectFor(ctx, 1)).subject).to.equal(await d.ledger.auditSubject(0));
    expect(await a2.auditSubjectFor(ctx, 0)).to.deep.equal({ audited: null, subject: await d.ledger.configHash(), receipts: 0 });

    const report = await a2.auditEpoch(ctx, 1, { permits: supplied });
    expect(report.ok, show(report)).to.equal(true);
    expect(report.receiptCount).to.equal(5n);
    const st = (x) => report.receipts.find((it) => it.id === x.id);
    // declared during epoch 0, in force from epoch 1: the address is subsidized now; the admitted stranger still has no operator
    expect([st(s.undeclared).status.ineligible, st(s.undeclared).operator]).to.deep.equal([I.NONE, 12]);
    expect([st(s.stranger).status.ineligible, st(s.stranger).operator]).to.deep.equal([I.OPERATOR_NOT_DECLARED, 0]);
    // w1 is of operator 7 from epoch 1, beside w3: the two share what the operator cap leaves
    expect([st(s.w1).operator, st(s.w3).operator]).to.deep.equal([7, 7]);
    const seven = report.operators.find((o) => o.operator === 7);
    expect([seven.addresses.sort(), seven.subsidized, seven.share, seven.capped]).to.deep.equal([[w1.address, w3.address].sort(), [20n, 0n], [175n * P, 0n], [true, false]]);
    const allocation = Object.fromEntries(report.table.map((row) => [row.worker, row.allocation]));
    expect(allocation).to.deep.equal({
      [w1.address]: (875n * P) / 10n, [w3.address]: (875n * P) / 10n, [undeclared.address]: 175n * P, [account.target]: 175n * P, [stranger.address]: 0n,
    });
    for (const row of report.table) expect(await d.ledger.allocation(1, row.worker), row.worker).to.equal(row.allocation);
    // the account's permit of epoch 1 names the second binding, and the audit holds it to that one
    const entry = st(s.account).entry;
    expect([entry.guard.guard, entry.guard.version, entry.permit.evidence, entry.permit.guardBindingVersion, entry.signature])
      .to.deep.equal([w.guardB.target, 2n, a2.PERMIT_EVIDENCE.IN_TRANSACTION, 2n, a2.SIGNATURE_EVIDENCE.CONTRACT]);
    expect(report.guards.map((x) => [x.guard, x.version])).to.deep.equal([[w.guardB.target, 2n]]);
    // the permit given for epoch 0 matches no receipt of epoch 1
    expect(report.permits.supplied.map((x) => x.usedBy)).to.deep.equal([[]]);

    // epoch 1 has no close record: reported, and a difference only when the run asks for one
    expect([report.isSealed, report.closeRecord.present]).to.deep.equal([false, false]);
    const strict = await a2.auditEpoch(ctx, 1, { requireSealed: true });
    expect(whats(strict)).to.deep.equal(["close record"]);

    // epoch 0, audited at the same block, is not moved by any of the changes made for epoch 1
    const zero = await a2.auditEpoch(ctx, 0);
    expect(zero.ok, show(zero)).to.equal(true);
    expect(zero.receipts.find((it) => it.id === w.r.g0w1.id).operator).to.not.equal(7);
  });

  it("reads a delegated receipt's permit from the delegate's own transaction, takes a published one where the transaction does not show it, and reports the digest alone otherwise (L38)", async () => {
    const { d, w2, d1, fresh, account, r, delegate, relay, elsewhere } = w;
    const ctx = await connect(d);
    const entry = (x, rep) => rep.receipts.find((it) => it.id === x.id).entry;

    // nothing given: four permits are in their transactions, and held; the fifth went through a contract
    const alone = await a2.auditEpoch(ctx, 0);
    expect(alone.ok, show(alone)).to.equal(true);
    expect(entry(r.g0w2, alone).permit).to.include({ evidence: a2.PERMIT_EVIDENCE.IN_TRANSACTION, account: w2.address, delegate: delegate.address, scope: 1n, nonce: 1n,
      accountAtUse: a2.ACCOUNT_AT_USE.NO_CODE });
    expect(entry(r.g0w2, alone).signature).to.equal(a2.SIGNATURE_EVIDENCE.VERIFIED);
    expect(entry(r.g0account, alone).permit).to.include({ evidence: a2.PERMIT_EVIDENCE.IN_TRANSACTION, account: account.target, guard: w.guardA.target,
      guardBindingVersion: 1n, accountAtUse: a2.ACCOUNT_AT_USE.CONTRACT });
    // a contract account was asked by the ledger at the time and is not asked again
    expect(entry(r.g0account, alone).signature).to.equal(a2.SIGNATURE_EVIDENCE.CONTRACT);
    expect(entry(r.delegated, alone).permit).to.include({ evidence: a2.PERMIT_EVIDENCE.IN_TRANSACTION, account: d1.address, scope: 2n, nonce: 5n });
    expect([entry(r.g0relayed, alone).sender, entry(r.g0relayed, alone).origin, entry(r.g0relayed, alone).permit])
      .to.deep.equal([relay.target, delegate.address, { evidence: a2.PERMIT_EVIDENCE.NOT_AVAILABLE }]);
    // a transaction that goes through another contract is not read for a permit, whatever its input looks like:
    // here the relay's transaction is shown with an input shaped like the adapter's own entry, carrying another account's permit
    const relayed = alone.receipts.find((it) => it.id === r.g0relayed.id).txHash;
    const shaped = d.adapter.interface.encodeFunctionData("confirmFor", [w.permits.d1.tuple, w.permits.d1.signature, 1n, 1n]);
    const through = tampered(ethers.provider, { getTransaction: async (hash) => {
      const tx = await ethers.provider.getTransaction(hash);
      return hash === relayed ? { blockNumber: tx.blockNumber, to: tx.to, from: tx.from, data: shaped } : tx;
    } });
    const passedOn = await a2.auditEpoch({ ...ctx, provider: through }, 0);
    expect([passedOn.ok, entry(r.g0relayed, passedOn).permit]).to.deep.equal([true, { evidence: a2.PERMIT_EVIDENCE.NOT_AVAILABLE }]);
    // w2 raised its minimum nonce and d1 revoked its permit after the receipts: neither reaches back
    expect(await d.ledger.minNonce(w2.address)).to.equal(2n);
    expect(await d.ledger.isRevoked(d1.address, w.permits.d1.digest)).to.equal(true);

    // the fifth permit, as its account's signing record: matched by its digest, held, its signature verified
    const report = await a2.auditEpoch(ctx, 0, { permits: supplied });
    expect(report.ok, show(report)).to.equal(true);
    expect(report.entries.byPermitEvidence).to.deep.equal({ [a2.PERMIT_EVIDENCE.IN_TRANSACTION]: 4, [a2.PERMIT_EVIDENCE.SUPPLIED]: 1 });
    expect(report.entries.bySignatureEvidence).to.deep.equal({ [a2.SIGNATURE_EVIDENCE.VERIFIED]: 3, [a2.SIGNATURE_EVIDENCE.CONTRACT]: 2 });
    expect(entry(r.g0relayed, report).permit).to.include({ evidence: a2.PERMIT_EVIDENCE.SUPPLIED, account: fresh.address, delegate: relay.target,
      accountAtUse: a2.ACCOUNT_AT_USE.NO_CODE });
    expect(report.permits.supplied.map((x) => [x.account, x.signature, x.usedBy])).to.deep.equal([[fresh.address, true, [r.g0relayed.id]]]);
    // a permit given for a receipt whose transaction shows it is not needed, and is not counted as used
    const spare = await a2.auditEpoch(ctx, 0, { permits: [recordOf(w.permits.w2, w2)] });
    expect([spare.ok, spare.permits.supplied.map((x) => x.usedBy), entry(r.g0w2, spare).permit.evidence]).to.deep.equal([true, [[]], a2.PERMIT_EVIDENCE.IN_TRANSACTION]);

    // the same permit as its bare message: matched by digest, and nothing said of a signature
    const bare = await a2.auditEpoch(ctx, 0, { permits: [w.permits.fresh.st.message] });
    expect(bare.ok, show(bare)).to.equal(true);
    expect(bare.entries.bySignatureEvidence).to.deep.equal({ [a2.SIGNATURE_EVIDENCE.VERIFIED]: 2, [a2.SIGNATURE_EVIDENCE.CONTRACT]: 2, [a2.SIGNATURE_EVIDENCE.NOT_SUPPLIED]: 1 });

    // a signature that is not the account's, under a permit that names no guard
    const forged = await permit.sign(elsewhere, w.permits.fresh.st);
    const wrong = await a2.auditEpoch(ctx, 0, { permits: [{ ...recordOf(w.permits.fresh, elsewhere), signature: forged }] });
    expect(whats(wrong)).to.deep.equal([`receipt ${r.g0relayed.id}: permit: signature`]);
    expect(entry(r.g0relayed, wrong).signature).to.equal(a2.SIGNATURE_EVIDENCE.NOT_THE_ACCOUNTS);
    // the forms of a signature the ledger refuses are refused here: the upper half of the curve, and a length other than 65
    const sig = ethers.Signature.from(w.permits.fresh.signature);
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const high = ethers.concat([sig.r, ethers.toBeHex(N - BigInt(sig.s), 32), sig.v === 27 ? "0x1c" : "0x1b"]);
    for (const signature of [high, sig.compactSerialized, "0x"]) {
      const refused = await a2.auditEpoch(ctx, 0, { permits: [{ ...recordOf(w.permits.fresh, fresh), signature }] });
      expect(whats(refused), signature).to.deep.equal([`receipt ${r.g0relayed.id}: permit: signature`]);
    }

    // a record made for another ledger, and two that are no permit: listed, and used for nothing
    const other = await t.signed(d, fresh, fresh.address, { delegate: relay.target, scope: 1 }, { ledger: elsewhere.address });
    const odd = await a2.auditEpoch(ctx, 0, { permits: [recordOf(other, fresh), { message: { account: fresh.address } }, { ...w.permits.fresh.st.message, scope: 8 }] });
    expect(odd.ok, show(odd)).to.equal(true);
    expect(odd.permits.supplied).to.deep.equal([]);
    expect(odd.permits.foreign.map((x) => [x.index, x.digest, x.domain.verifyingContract, x.domain.chainId])).to.deep.equal([[0, other.digest, elsewhere.address, String(d.chainId)]]);
    expect(odd.permits.unusable.map((x) => x.index)).to.deep.equal([1, 2]);
    expect(entry(r.g0relayed, odd).permit).to.deep.equal({ evidence: a2.PERMIT_EVIDENCE.NOT_AVAILABLE });
  });

  it("finds a permit the ledger's rules would have refused, an attribution and a guard that are not the policy's (L39)", async () => {
    const { d, w1, w2, account, r, elsewhere } = w;
    const base = await connect(d);
    const audit = (overrides, options = { permits: supplied }) => a2.auditEpoch({ ...base, ...overrides }, 0, options);
    const receiptLog = (id, change) => withLog(base.ledger, "ReceiptRecorded", (ev) => (ev.args.id === id ? change(ev) : ev));
    const withReceipt = (ev, fields) => ({ ...ev, args: { id: ev.args.id, origin: ev.args.origin, operator: ev.args.operator, ...fields.args,
      receipt: { ...v2.plainReceipt(ev.args.receipt), ...fields.receipt } } });

    // a receipt whose sender is not the one that sent the transaction, nor the permit's delegate; an origin that is not the transaction's
    const a = await audit({ ledger: receiptLog(r.g0w2.id, (ev) => withReceipt(ev, { receipt: { sender: elsewhere.address } })) });
    expect(whats(a)).to.deep.equal([`receipt ${r.g0w2.id}: sender, in the transaction`, `receipt ${r.g0w2.id}: permit: delegate`]);
    for (const x of [r.g0w2, r.g0w1, r.g0relayed, r.eligible]) { // whatever the entry: the origin is the transaction's sender
      const a1 = await audit({ ledger: receiptLog(x.id, (ev) => withReceipt(ev, { args: { origin: elsewhere.address } })) });
      expect(whats(a1)).to.deep.equal([`receipt ${x.id}: origin, in the transaction`]);
    }
    // a receipt whose digest is not that of the permit its transaction carries
    const a2_ = await audit({ ledger: receiptLog(r.g0w2.id, (ev) => withReceipt(ev, { receipt: { authorization: ethers.id("another permit") } })) });
    expect(whats(a2_)).to.deep.equal([`receipt ${r.g0w2.id}: authorization`]);
    // the receipt whose permit is a published one: a sender that is not its delegate, an epoch it does not include, an operation outside its scope
    const a3 = await audit({ ledger: receiptLog(r.g0relayed.id, (ev) => withReceipt(ev, { receipt: { sender: elsewhere.address } })) });
    expect(whats(a3)).to.deep.equal([`receipt ${r.g0relayed.id}: permit: delegate`]);
    const narrow = await t.signed(d, w.fresh, w.fresh.address, { delegate: w.relay.target, scope: 1, notBeforeEpoch: 1 });
    const b = await audit({ ledger: receiptLog(r.g0relayed.id, (ev) => withReceipt(ev, { receipt: { authorization: narrow.digest } })) }, { permits: [recordOf(narrow, w.fresh)] });
    expect(whats(b)).to.deep.equal([`receipt ${r.g0relayed.id}: permit: epochs`]);
    const confirmOnly = await t.signed(d, w.fresh, w.fresh.address, { delegate: w.relay.target, scope: 2 });
    const c = await audit({ ledger: receiptLog(r.g0relayed.id, (ev) => withReceipt(ev, { receipt: { authorization: confirmOnly.digest } })) }, { permits: [recordOf(confirmOnly, w.fresh)] });
    expect(whats(c)).to.deep.equal([`receipt ${r.g0relayed.id}: permit: scope`]);

    // a permit that was ended, or whose nonce was below the account's minimum, before the receipt it is named by
    const position = base.ledger.interface.getEvent("PermitEnded");
    const at = { blockNumber: 1, index: 0, transactionHash: NONE };
    const d_ = await audit({ ledger: withLog(base.ledger, "PermitEnded", undefined, [{ ...at, fragment: position, args: { account: w2.address, digest: w.permits.w2.digest, path: 1n, by: w2.address } }]) });
    expect(whats(d_)).to.deep.equal([`receipt ${r.g0w2.id}: permit`]);
    const e = await audit({ ledger: withLog(base.ledger, "MinNonceRaised", (ev) => ({ ...ev, ...at })) });
    expect(whats(e)).to.deep.equal([`receipt ${r.g0w2.id}: permit: nonce`]);

    // a permit for a contract account that names another binding than the one in force, and one that names a guard where none is bound
    const stale = await audit({ policy: withLog(base.policy, "GuardBound", (ev) => (ev.args.version === 1n ? { ...ev, args: { ...ev.args.toObject(), version: 3n } } : ev)) });
    expect(whats(stale)).to.deep.equal([`receipt ${r.g0account.id}: permit: guard`, `receipt ${r.account.id}: permit: guard`]);
    const unbound = await audit({ policy: withLog(base.policy, "GuardBound", (ev) => ({ ...ev, args: { ...ev.args.toObject(), fromEpoch: 9n } })) });
    expect(whats(unbound)).to.deep.equal([`receipt ${r.g0account.id}: permit: guard`, `receipt ${r.account.id}: permit: guard`]);
    // a guard whose code at the block is not the code the binding recorded
    const recoded = await audit({ policy: withLog(base.policy, "GuardBound", (ev) => ({ ...ev, args: { ...ev.args.toObject(), codeHash: ethers.id("other code") } })) });
    expect(whats(recoded)).to.deep.equal([`guard ${w.guardA.target} of ${account.target}: code`]);

    // a direct entry whose sender is not the participant
    const k = await audit({ ledger: receiptLog(r.g0w1.id, (ev) => withReceipt(ev, { receipt: { sender: elsewhere.address } })) });
    expect(whats(k)).to.deep.equal([`receipt ${r.g0w1.id}: sender, in the transaction`, `receipt ${r.g0w1.id}: sender of a direct entry`]);
    // a confirmation whose recorded sender is not the one that sent it to the adapter
    const k2 = await audit({ ledger: receiptLog(r.eligible.id, (ev) => withReceipt(ev, { receipt: { sender: elsewhere.address } })) });
    expect(whats(k2)).to.deep.equal([`receipt ${r.eligible.id}: sender, in the module's record`, `receipt ${r.eligible.id}: sender, in the transaction`,
      `receipt ${r.eligible.id}: sender of a direct entry`]);
    // a transaction the endpoint does not serve
    const k3 = await audit({ provider: tampered(ethers.provider, { getTransaction: async (hash) => (hash === k.receipts.find((it) => it.id === r.g0w1.id).txHash ? null : ethers.provider.getTransaction(hash)) }) });
    expect(whats(k3)).to.deep.equal([`receipt ${r.g0w1.id}: transaction`]);
    // a receipt attributed to an operator that the policy's log does not give its worker
    const f = await audit({ ledger: receiptLog(r.g0w1.id, (ev) => withReceipt(ev, { args: { operator: 7n } })) });
    expect(whats(f)).to.deep.equal([`receipt ${r.g0w1.id}: operator`]);
    // a ledger whose stored attribution, operator totals or operator shares are not what its receipts give
    const real = { operatorAt: base.ledger.operatorAt.bind(base.ledger), subsidizedOfOperator: base.ledger.subsidizedOfOperator.bind(base.ledger),
      operatorShare: base.ledger.operatorShare.bind(base.ledger), factCount: base.ledger.factCount.bind(base.ledger) };
    const g_ = await audit({ ledger: tampered(base.ledger, { operatorAt: async (ep, x, o) => (x === w1.address ? [true, 7n] : real.operatorAt(ep, x, o)) }) });
    expect(whats(g_)).to.deep.equal([`operator of ${w1.address}, as stored`]);
    const h_ = await audit({ ledger: tampered(base.ledger, { subsidizedOfOperator: async (ep, pool, op, o) => (await real.subsidizedOfOperator(ep, pool, op, o)) + (op === 9 && pool === 0 ? 1n : 0n) }) });
    expect(whats(h_)).to.deep.equal(["operator 9: subsidized G0"]);
    const i_ = await audit({ ledger: tampered(base.ledger, { operatorShare: async (ep, pool, op, o) => (await real.operatorShare(ep, pool, op, o)) + (op === 9 && pool === 0 ? 1n : 0n) }) });
    expect(whats(i_)).to.deep.equal(["operator 9: share of G0"]);
    const j_ = await audit({ ledger: tampered(base.ledger, { factCount: async (o) => (await real.factCount(o)) + 1n }) });
    expect(whats(j_)).to.deep.equal(["facts recorded"]);

    // a policy log that gives a worker another operator than the ledger used: the digest no longer follows
    const moved = await audit({ policy: withLog(base.policy, "OperatorDeclared", (ev) => (ev.args.party === w1.address ? { ...ev, args: { ...ev.args.toObject(), operator: 7n, fromEpoch: 0n } } : ev)) });
    expect(moved.ok).to.equal(false);
    expect(whats(moved)).to.include.members([`receipt ${r.g0w1.id}: operator`, "digest", "audit subject", `operator of ${w1.address}, as stored`]);
    // a recorded status that the rules do not give: an unsubsidized receipt recorded as subsidized
    const paid = await audit({ ledger: withLog(base.ledger, "ReceiptStatus", (ev) => (ev.args.id === r.g0undeclared.id
      ? { ...ev, args: { id: ev.args.id, status: { ...v2.plainStatus(ev.args.status), ineligible: 0, gmuSubsidized: 10n } } } : ev)) });
    expect(whats(paid)).to.deep.equal([`receipt ${r.g0undeclared.id}: ineligible`, `receipt ${r.g0undeclared.id}: gmuSubsidized`]);
  });

  it("reads everything at one block, with an endpoint and no key, also when the chain has gone on (L40)", async () => {
    const { d, firstOfEpoch1: block } = w;
    const { proxy, seen } = watched(ethers.provider);
    const pin = await g.pinBlock(proxy, block.number);
    const ctx = await connect(d, { tag: block.number, pin }, proxy);
    const report = await a2.auditEpoch(ctx, 0, { permits: supplied });
    expect(report.ok, show(report)).to.equal(true);
    expect([report.pin.number, report.pin.hash, report.receiptCount]).to.deep.equal([block.number, block.hash, 24n]);
    // every state read named the block; every log query ended at or before it; the hash was asked for again
    expect(seen.calls.length > 50).to.equal(true);
    expect(seen.calls.filter((tag) => tag !== block.number), "a view was read at another block").to.deep.equal([]);
    expect(seen.codes.length > 0).to.equal(true);
    expect(seen.codes.filter((tag) => tag !== block.number), "code was read at another block").to.deep.equal([]);
    expect(seen.logs.filter(([, to]) => !(Number(to) <= block.number)), "a log query went past the block").to.deep.equal([]);
    expect(seen.blocks.filter((tag) => tag === block.number).length).to.equal(2); // taken, and checked again at the end
    // at that block epoch 0 had no close record and epoch 1 had not ended
    expect(report.isSealed).to.equal(false);
    let error = null;
    try { await a2.auditEpoch(ctx, 1); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.NotFinalYet);
    // what was found is what the audit at the latest block finds, the close record apart
    const latest = await a2.auditEpoch(await connect(d), 0, { permits: supplied });
    expect([report.digest, report.subject, report.tableHash]).to.deep.equal([latest.digest, latest.subject, latest.tableHash]);

    // a ledger that is not a v2 ledger, a chain that is not the deployment's
    for (const [deployment, why] of [[{ ledger: d.policy.target }, /revert|could not decode|BAD_DATA|domain/i], [{ ledger: d.ledgerAddress, chainId: 1 }, /the deployment is on chain 1/]]) {
      let refused = null;
      try { await a2.connect(deployment, ethers.provider, { tag: "latest" }); } catch (e) { refused = e; }
      expect(String(refused?.message), JSON.stringify(deployment)).to.match(why);
    }
  });

  it("reads the policy's log from the policy's own start, and refuses a log that does not reach back to what it needs instead of auditing a shorter history (L44)", async () => {
    const [, w1, w2] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w1, w2] });
    const blockOf = async (c) => (await ethers.provider.getTransactionReceipt(c.deploymentTransaction().hash)).blockNumber;
    const policyBlock = await blockOf(d.policy); const ledgerBlock = await blockOf(d.ledger);
    expect(policyBlock).to.be.lessThan(ledgerBlock); // the policy is deployed first, and its first parameters with it
    const first = await t.submitDirect(d, w1);
    await ethers.provider.send("evm_mine", []);
    const second = await t.submitDirect(d, w2);
    await h.toEpoch(d, 1);
    const audit = (deployment, epoch = 0) => a2.connect({ ledger: d.ledgerAddress, ...deployment }, ethers.provider, { tag: "latest" }).then((ctx) => a2.auditEpoch(ctx, epoch));
    const refused = async (deployment, pattern, epoch = 0) => {
      let error = null;
      try { await audit(deployment, epoch); } catch (e) { error = e; }
      expect(error, JSON.stringify(deployment)).to.be.instanceOf(a2.HistoryIncomplete);
      expect(error.message).to.match(pattern);
    };
    // the deployment's first block, as the kernel's manifests have it; the starts named apart; and no start at all
    for (const deployment of [{ deployBlock: policyBlock }, { policyDeployBlock: policyBlock, ledgerDeployBlock: ledgerBlock }, {}, { deployBlock: ledgerBlock, policyDeployBlock: policyBlock }]) {
      const report = await audit(deployment);
      expect([report.ok, report.receiptCount], JSON.stringify(deployment)).to.deep.equal([true, 2n]);
    }
    // the ledger's block as the one start misses the policy's first parameters: refused, and named
    await refused({ deployBlock: ledgerBlock }, /policy's log from block \d+ to \d+ (holds no parameters|starts at parameters version \d+): .* too late a block \(policyDeployBlock or deployBlock\)/);
    // a policy start after a later change shows parameters that do not begin at version 1: refused
    // for an epoch those parameters are in force for too, where the audit would otherwise go on
    await d.policy.registerParams({ ...t.DEFAULT_PARAMS, activeFromEpoch: 3n });
    const changed = await ethers.provider.getBlockNumber();
    await h.toEpoch(d, 4);
    expect((await audit({ deployBlock: policyBlock }, 3)).paramsVersion).to.equal(2);
    await refused({ policyDeployBlock: changed }, /starts at parameters version 2/, 3);
    await refused({ policyDeployBlock: changed }, /starts at parameters version 2/);
    // a ledger start inside the epoch misses its first receipt: refused, not reported as a difference
    await refused({ policyDeployBlock: policyBlock, ledgerDeployBlock: second.rc.blockNumber }, /starts in the middle of the history: receipt 2 is the first .* receipt 1 is not in it/);
    // a ledger start after the epoch misses it whole: the ledger counts what the log does not show
    await refused({ policyDeployBlock: policyBlock, ledgerDeployBlock: second.rc.blockNumber + 1 }, /shows no receipt of epoch 0, and the ledger counts 2/);
    // a profile version shown without its predecessor; a version re-registered for another epoch; a
    // retirement of a version that is not the last: none is a transition the policy makes
    const ctx = await a2.connect({ ledger: d.ledgerAddress, deployBlock: policyBlock }, ethers.provider, { tag: "latest" });
    const g0 = (await ctx.policy.queryFilter(ctx.policy.filters.ProfileRegistered(key(PROFILE.G0))))[0];
    const plainEvent = { blockNumber: g0.blockNumber, index: g0.index + 1, transactionHash: g0.transactionHash };
    const refusedWith = async (policy, pattern) => {
      let error = null;
      try { await a2.auditEpoch({ ...ctx, policy }, 0); } catch (e) { error = e; }
      expect(error, String(pattern)).to.be.instanceOf(a2.HistoryIncomplete);
      expect(error.message).to.match(pattern);
    };
    await refusedWith(withLog(ctx.policy, "ProfileRegistered", (ev) => (ev.args.profile.version === 1n && ev.args.key === key(PROFILE.G0)
      ? { ...ev, args: { key: ev.args.key, id: ev.args.id, profile: { ...ev.args.profile.toObject(), version: 2n } } } : ev)), /shows version 2 of profile .* and no earlier one/);
    await refusedWith(withLog(ctx.policy, "ProfileRegistered", undefined, [{ ...plainEvent, fragment: g0.fragment,
      args: { key: g0.args.key, id: g0.args.id, profile: { ...g0.args.profile.toObject(), activeFromEpoch: 3n } } }]), /version 1 of profile .* after version 1 .* not a transition the policy makes/);
    await refusedWith(withLog(ctx.policy, "ProfileRetired", undefined, [{ ...plainEvent, fragment: ctx.policy.interface.getEvent("ProfileRetired"),
      args: { key: g0.args.key, id: ethers.id("not the last version"), retiredFromEpoch: 5n } }]), /retirement of version .* that is not its last registered version/);
    expect(first.id).to.equal(1n);
  });

  it("holds the entry's own call to the receipt in full, and never reads a given permit in place of an invalid one in that call (L45)", async () => {
    const { d, w1, d1, r, elsewhere, tn } = w;
    const base = await connect(d);
    const txOf = async (x) => ethers.provider.getTransaction((await a2.readEpochReceipts(base, 0, await ethers.provider.getBlockNumber())).find((it) => it.id === x.id).txHash);
    const shown = (hash, patch) => ({ ...base, provider: tampered(ethers.provider, { getTransaction: async (hsh) => {
      const tx = await ethers.provider.getTransaction(hsh);
      return hsh === hash ? { blockNumber: tx.blockNumber, to: tx.to, from: tx.from, data: tx.data, ...patch } : tx;
    } }) });
    const seen = async (x, patch, options = {}) => {
      const tx = await txOf(x);
      const report = await a2.auditEpoch(shown(tx.hash, patch), 0, options);
      const e = report.receipts.find((it) => it.id === x.id).entry;
      return { whats: whats(report), permit: e.permit?.evidence ?? null, transaction: e.transaction };
    };
    const face = d.ledger.interface; const aface = d.adapter.interface;
    const g0 = await txOf(r.g0w2); const g0call = face.parseTransaction({ data: g0.data }); const a = g0call.args; const tuple = a[0].toObject();
    const enc = (name, args) => face.encodeFunctionData(name, args);

    // the delegated G0 receipt, shown with an input that does not match it
    const cases = [
      ["a permit with a scope bit this version does not know", enc("submitG0For", [{ ...tuple, scope: 8n }, a[1], a[2], a[3], a[4], a[5]]), [`receipt ${r.g0w2.id}: entry, in the transaction`], a2.PERMIT_EVIDENCE.INVALID_IN_TRANSACTION],
      ["another outputHash", enc("submitG0For", [tuple, a[1], a[2], a[3], a[4], ethers.id("another output")]), [`receipt ${r.g0w2.id}: outputHash, in the transaction`], a2.PERMIT_EVIDENCE.IN_TRANSACTION],
      ["another profile", enc("submitG0For", [tuple, a[1], ethers.id("another profile"), a[3], a[4], a[5]]), [`receipt ${r.g0w2.id}: profile, in the transaction`], a2.PERMIT_EVIDENCE.IN_TRANSACTION],
      ["another epoch and job index", enc("submitG0For", [tuple, a[1], a[2], 7n, 3, a[5]]), [`receipt ${r.g0w2.id}: epoch, in the transaction`, `receipt ${r.g0w2.id}: jobIndex, in the transaction`], a2.PERMIT_EVIDENCE.IN_TRANSACTION],
      ["the direct entry instead of the delegated one", enc("submitG0", [a[2], a[3], a[4], a[5]]), [`receipt ${r.g0w2.id}: entry, in the transaction`], a2.PERMIT_EVIDENCE.INVALID_IN_TRANSACTION],
      ["another function of the ledger", enc("raiseMinNonce", [9n]), [`receipt ${r.g0w2.id}: entry, in the transaction`], a2.PERMIT_EVIDENCE.INVALID_IN_TRANSACTION],
      ["an input that decodes as nothing", "0x12345678deadbeef", [`receipt ${r.g0w2.id}: entry, in the transaction`], a2.PERMIT_EVIDENCE.INVALID_IN_TRANSACTION],
      ["another permit of the same account, under the first one's signature", enc("submitG0For", [{ ...tuple, nonce: 9n }, a[1], a[2], a[3], a[4], a[5]]),
        [`receipt ${r.g0w2.id}: authorization`, `receipt ${r.g0w2.id}: permit: signature`], a2.PERMIT_EVIDENCE.IN_TRANSACTION],
    ];
    for (const [name, data, expected, evidence] of cases) {
      const got = await seen(r.g0w2, { data });
      expect(got.whats, name).to.deep.equal(expected);
      expect([got.permit, got.transaction], name).to.deep.equal([evidence, a2.TRANSACTION.ENTRY]);
      // a permit given to the run does not stand in for the call's own: the call is the evidence
      const given = await seen(r.g0w2, { data }, { permits: [recordOf(w.permits.w2, w.w2)] });
      expect(given.permit, name).to.equal(evidence);
    }
    // the same call sent to the receipt's own module - the function contract - is no G0 entry; sent to another contract it is a relay's
    const sentToModule = await seen(r.g0w2, { to: d.audit.target });
    expect([sentToModule.whats, sentToModule.transaction]).to.deep.equal([[`receipt ${r.g0w2.id}: entry, in the transaction`], a2.TRANSACTION.ENTRY]);
    const sentElsewhere = await seen(r.g0w2, { to: d.adapter.target });
    expect([sentElsewhere.whats, sentElsewhere.permit, sentElsewhere.transaction]).to.deep.equal([[], a2.PERMIT_EVIDENCE.NOT_AVAILABLE, a2.TRANSACTION.THROUGH_A_CONTRACT]);
    // the direct G0 receipt shown as a delegated call, and with another output
    expect((await seen(r.g0w1, { data: g0.data })).whats).to.deep.equal([`receipt ${r.g0w1.id}: entry, in the transaction`]);
    const direct = await txOf(r.g0w1); const dc = face.parseTransaction({ data: direct.data });
    expect((await seen(r.g0w1, { data: enc("submitG0", [dc.args[0], dc.args[1], dc.args[2], ethers.id("other")]) })).whats).to.deep.equal([`receipt ${r.g0w1.id}: outputHash, in the transaction`]);

    // G1: the confirmation's tender and submission are the ones the module recorded
    const c = await txOf(r.eligible); const cc = aface.parseTransaction({ data: c.data });
    expect(cc.name).to.equal("confirm");
    const otherTender = await seen(r.eligible, { data: aface.encodeFunctionData("confirm", [tn.pairCap.tokenId, cc.args[1]]) });
    expect(otherTender.whats).to.deep.equal([`receipt ${r.eligible.id}: tokenId, in the transaction`]);
    const otherSubmission = await seen(r.eligible, { data: aface.encodeFunctionData("confirm", [cc.args[0], 77n]) });
    expect(otherSubmission.whats).to.deep.equal([`receipt ${r.eligible.id}: submissionId, in the transaction`]);
    const asDelegated = await seen(r.eligible, { data: aface.encodeFunctionData("confirmFor", [w.permits.d1.tuple, w.permits.d1.signature, cc.args[0], cc.args[1]]) });
    expect(asDelegated.whats).to.deep.equal([`receipt ${r.eligible.id}: entry, in the transaction`]);
    const toLedger = await seen(r.eligible, { to: d.ledgerAddress });
    expect(toLedger.whats).to.deep.equal([`receipt ${r.eligible.id}: entry, in the transaction`]);
    const dg = await txOf(r.delegated); const dgc = aface.parseTransaction({ data: dg.data });
    expect(dgc.name).to.equal("confirmFor");
    const asDirect = await seen(r.delegated, { data: aface.encodeFunctionData("confirm", [dgc.args[2], dgc.args[3]]) });
    expect([asDirect.whats, asDirect.permit]).to.deep.equal([[`receipt ${r.delegated.id}: entry, in the transaction`], a2.PERMIT_EVIDENCE.INVALID_IN_TRANSACTION]);

    // the relay's transaction is through a contract: its input is not read, whatever it looks like
    const relayed = await seen(r.g0relayed, { data: enc("submitG0For", [{ ...tuple, scope: 8n }, a[1], a[2], a[3], a[4], a[5]]) });
    expect([relayed.whats, relayed.permit, relayed.transaction]).to.deep.equal([[], a2.PERMIT_EVIDENCE.NOT_AVAILABLE, a2.TRANSACTION.THROUGH_A_CONTRACT]);
    // and a given permit still serves it
    const served = await seen(r.g0relayed, {}, { permits: supplied });
    expect([served.whats, served.permit]).to.deep.equal([[], a2.PERMIT_EVIDENCE.SUPPLIED]);
    expect([w1.address, d1.address, elsewhere.address].length).to.equal(3);
  });

  it("reads a signing record by its own domain and types: a record for another chain or ledger is foreign, one that contradicts itself is unusable, and neither is read in this domain instead (L46)", async () => {
    const { d, fresh, relay, r, elsewhere } = w;
    const ctx = await connect(d);
    const good = recordOf(w.permits.fresh, fresh);
    const copy = () => JSON.parse(JSON.stringify(good));
    const run = (permits) => a2.auditEpoch(ctx, 0, { permits });
    const sorted = (report) => ({ ok: report.ok, supplied: report.permits.supplied.length, foreign: report.permits.foreign.map((x) => x.index), unusable: report.permits.unusable.map((x) => [x.index, x.why]),
      evidence: report.receipts.find((it) => it.id === r.g0relayed.id).entry.permit.evidence });
    expect(sorted(await run([good]))).to.deep.equal({ ok: true, supplied: 1, foreign: [], unusable: [], evidence: a2.PERMIT_EVIDENCE.SUPPLIED });

    // the record's own domain says another chain, with the digest and the signature of this one: it contradicts itself
    const chain1 = copy(); chain1.typedData.domain.chainId = "1";
    let got = sorted(await run([chain1]));
    expect([got.ok, got.supplied, got.foreign, got.evidence]).to.deep.equal([true, 0, [], a2.PERMIT_EVIDENCE.NOT_AVAILABLE]);
    expect(got.unusable[0][1]).to.match(/stated digest .* is not the digest of its own typed data/);
    // the same with the digest removed: a consistent record for chain 1, which is foreign here
    const chain1bare = copy(); chain1bare.typedData.domain.chainId = "1"; delete chain1bare.digest;
    got = sorted(await run([chain1bare]));
    expect([got.supplied, got.foreign, got.unusable, got.evidence]).to.deep.equal([0, [0], [], a2.PERMIT_EVIDENCE.NOT_AVAILABLE]);
    // another ledger in the domain, made consistently by the signer: foreign
    const otherLedger = await t.signed(d, fresh, fresh.address, { delegate: relay.target, scope: 1 }, { ledger: elsewhere.address });
    got = sorted(await run([recordOf(otherLedger, fresh)]));
    expect([got.foreign, got.unusable]).to.deep.equal([[0], []]);
    // a type that is not the frozen one; a primary type that is not Permit; a domain type that is not the frozen one
    const otherType = copy(); otherType.typedData.types.Permit = otherType.typedData.types.Permit.slice(0, 7);
    const revoke = copy(); revoke.typedData.primaryType = "Revoke";
    const otherDomainType = copy(); otherDomainType.typedData.types.EIP712Domain = otherDomainType.typedData.types.EIP712Domain.slice(0, 3);
    const otherKind = copy(); otherKind.kind = "Revoke";
    const otherSchema = copy(); otherSchema.schema = "finchain-pouw.signed-statement/2";
    const noDomain = copy(); delete noDomain.typedData.domain.verifyingContract;
    got = sorted(await run([otherType, revoke, otherDomainType, otherKind, otherSchema, noDomain]));
    expect(got.unusable.map(([i, why]) => [i, why.replace(/:.*/, "")])).to.deep.equal([
      [0, "its Permit type is not the frozen one"], [1, "primary type Revoke is not Permit"], [2, "its domain type is not the frozen one"], [3, "a Revoke, not a Permit"],
      [4, "schema finchain-pouw.signed-statement/2 is not finchain-pouw.signed-statement/1"], [5, "its domain lacks verifyingContract"]]);
    expect([got.supplied, got.foreign, got.evidence]).to.deep.equal([0, [], a2.PERMIT_EVIDENCE.NOT_AVAILABLE]);

    // a full record is read as it is: nothing is filled in, converted or dropped for it. Each of these
    // would be another permit, or none, once repaired; each is unusable, and the receipt it was given
    // for keeps the digest alone
    const noPermitType = copy(); noPermitType.typedData.types = { Unrelated: [{ name: "x", type: "uint256" }] };
    const noGuardFields = copy(); delete noGuardFields.typedData.message.guard; delete noGuardFields.typedData.message.guardBindingVersion;
    const scopeByName = copy(); scopeByName.typedData.message.scope = "submit-g0";
    const salted = copy(); salted.typedData.domain.salt = ethers.id("explicit salt outside the frozen domain");
    const saltedNoDigest = copy(); saltedNoDigest.typedData.domain.salt = ethers.id("explicit salt outside the frozen domain"); delete saltedNoDigest.digest;
    const extraField = copy(); extraField.typedData.message.memo = "a field Permit does not have";
    const noTypes = copy(); delete noTypes.typedData.types;
    const fraction = copy(); fraction.typedData.message.nonce = "1.5";
    const wide = copy(); wide.typedData.message.scope = String(1n << 32n);
    const notAnAddress = copy(); notAnAddress.typedData.message.delegate = "relay";
    got = sorted(await run([noPermitType, noGuardFields, scopeByName, salted, saltedNoDigest, extraField, noTypes, fraction, wide, notAnAddress]));
    expect(got.unusable.map(([i, why]) => [i, why.replace(/: .*/, "")])).to.deep.equal([
      [0, "its types do not define Permit"], [1, "its message lacks guard"], [2, "message scope"], [3, "its domain has salt, which the frozen domain does not"],
      [4, "its domain has salt, which the frozen domain does not"], [5, "its message has memo, which Permit does not"], [6, "no types"], [7, "message nonce"],
      [8, "message scope"], [9, "message delegate"]]);
    expect(got.unusable[2][1]).to.contain("\"submit-g0\" is not a whole number for uint32");
    expect([got.ok, got.supplied, got.foreign, got.evidence]).to.deep.equal([true, 0, [], a2.PERMIT_EVIDENCE.NOT_AVAILABLE]);
    // the same shorthand in a bare message is read by agreement: the scope by its name, the guard fields left out
    const shorthand = { ...good.typedData.message, scope: "submit-g0" }; delete shorthand.guard; delete shorthand.guardBindingVersion;
    got = sorted(await run([{ message: shorthand, signature: good.signature }]));
    expect([got.ok, got.supplied, got.unusable, got.evidence]).to.deep.equal([true, 1, [], a2.PERMIT_EVIDENCE.SUPPLIED]);
    // another lawful spelling of the same typed values is the same record
    const spelled = copy(); spelled.typedData.message.scope = 1; spelled.typedData.message.nonce = "0x1"; spelled.typedData.domain.chainId = Number(d.chainId);
    got = sorted(await run([spelled]));
    expect([got.supplied, got.unusable, got.evidence]).to.deep.equal([1, [], a2.PERMIT_EVIDENCE.SUPPLIED]);

    // a full record never falls back to the bare reading, and every part of its typed data is its own:
    // the primary type and the domain type are not supplied for it, and a record that carries a mark
    // of a full record without its typed data is not read as a bare message - whatever domain it names
    const noPrimary = copy(); delete noPrimary.typedData.primaryType;
    const noDomainType = copy(); delete noDomainType.typedData.types.EIP712Domain;
    const thirdMember = copy(); thirdMember.typedData.types.Permit[0].note = "a member a field does not have";
    const noTypedData = copy(); noTypedData.message = noTypedData.typedData.message; delete noTypedData.typedData;
    const kindOnly = { kind: "Permit", message: good.typedData.message, signature: good.signature };
    const topDomain1 = { schema: good.schema, kind: "Permit", domain: { ...good.typedData.domain, chainId: "1" }, ...good.typedData.message };
    const domainAndFields = { domain: { ...good.typedData.domain, chainId: "1" }, ...good.typedData.message, signature: good.signature };
    got = sorted(await run([noPrimary, noDomainType, thirdMember, noTypedData, kindOnly, topDomain1, domainAndFields]));
    expect(got.unusable.map(([i, why]) => [i, why.replace(/: .*/, "")])).to.deep.equal([
      [0, "no primary type"], [1, "its types do not define EIP712Domain"], [2, "its Permit type is not the frozen one"],
      [3, "it carries schema and kind but no typed data"], [4, "it carries kind but no typed data"], [5, "no primary type"], [6, "no primary type"]]);
    expect([got.ok, got.supplied, got.foreign, got.evidence]).to.deep.equal([true, 0, [], a2.PERMIT_EVIDENCE.NOT_AVAILABLE]);
    // the members of a field in another order are the same field: the same record
    const reordered = copy(); reordered.typedData.types.Permit = reordered.typedData.types.Permit.map((f) => ({ type: f.type, name: f.name }));
    reordered.typedData.types.EIP712Domain = reordered.typedData.types.EIP712Domain.map((f) => ({ type: f.type, name: f.name }));
    got = sorted(await run([reordered]));
    expect([got.supplied, got.unusable, got.evidence]).to.deep.equal([1, [], a2.PERMIT_EVIDENCE.SUPPLIED]);
    // a stated digest that is not the record's own
    const wrongDigest = copy(); wrongDigest.digest = ethers.id("some other digest");
    got = sorted(await run([wrongDigest]));
    expect(got.unusable.length).to.equal(1);
    // the same record given as typed data without the signing script's wrapper, and as its bare message
    const typedOnly = { ...good.typedData, signature: good.signature };
    expect(sorted(await run([typedOnly])).evidence).to.equal(a2.PERMIT_EVIDENCE.SUPPLIED);
    expect(sorted(await run([good.typedData.message])).evidence).to.equal(a2.PERMIT_EVIDENCE.SUPPLIED);
    // a bare message with a stated digest of another domain: foreign, as before
    got = sorted(await run([{ message: good.typedData.message, digest: otherLedger.digest }]));
    expect([got.foreign, got.supplied]).to.deep.equal([[0], 0]);
    // the records a good run is given are not changed by a foreign one beside them
    got = sorted(await run([chain1bare, good]));
    expect([got.ok, got.supplied, got.foreign, got.evidence]).to.deep.equal([true, 1, [0], a2.PERMIT_EVIDENCE.SUPPLIED]);
  });

  it("replays a profile version that the policy replaced while it was still ahead - the same version with new values, its retirement cleared - as the policy does (L47)", async () => {
    const [, w1] = await ethers.getSigners();
    const audit = (d, epoch) => a2.connect({ ledger: d.ledgerAddress }, ethers.provider, { tag: "latest" }).then((ctx) => a2.auditEpoch(ctx, epoch));
    const spec = (d, gmu, fields = {}) => ({ ...d.spec(PROFILE.G0, 0, d.audit.target, gmu, gmu, 1), ...fields });

    // version 1 corrected before the genesis: the audit uses the corrected values
    const a = await t.deploy({ admit: [w1], start: false });
    await (await a.policy.registerProfile(spec(a, 11))).wait();
    expect((await a.policy.profileVersions(key(PROFILE.G0))).map((p) => [p.version, p.baseGmu])).to.deep.equal([[1n, 11n]]);
    await h.setTime(a.genesisTime);
    await t.submitDirect(a, w1);
    await h.toEpoch(a, 1);
    const ra = await audit(a, 0);
    expect([ra.ok, ra.totals.measured[0]], show(ra)).to.deep.equal([true, 11n]);

    // version 2 for epoch 1 registered twice during epoch 0: epoch 0 keeps version 1, epoch 1 has the second registration
    const b = await t.deploy({ admit: [w1] });
    await t.submitDirect(b, w1);
    await (await b.policy.registerProfile(spec(b, 11, { activeFromEpoch: 1 }))).wait();
    await (await b.policy.registerProfile(spec(b, 12, { activeFromEpoch: 1 }))).wait();
    expect((await b.policy.profileVersions(key(PROFILE.G0))).map((p) => [p.version, p.baseGmu])).to.deep.equal([[1n, 10n], [2n, 12n]]);
    await h.toEpoch(b, 1);
    const rb0 = await audit(b, 0);
    expect([rb0.ok, rb0.totals.measured[0]], show(rb0)).to.deep.equal([true, 10n]);
    await t.submitDirect(b, w1);
    await h.toEpoch(b, 2);
    const rb1 = await audit(b, 1);
    expect([rb1.ok, rb1.totals.measured[0]], show(rb1)).to.deep.equal([true, 12n]);

    // a future version registered, retired, then registered again: the retirement goes with the replaced entry
    const c = await t.deploy({ admit: [w1] });
    await (await c.policy.registerProfile(spec(c, 11, { activeFromEpoch: 1 }))).wait();
    await (await c.policy.retireProfile(key(PROFILE.G0), 1)).wait();
    await (await c.policy.registerProfile(spec(c, 12, { activeFromEpoch: 1 }))).wait();
    await h.toEpoch(c, 1);
    expect((await c.policy.activeProfile(key(PROFILE.G0), 1)).baseGmu).to.equal(12n);
    await t.submitDirect(c, w1);
    await h.toEpoch(c, 2);
    const rc = await audit(c, 1);
    expect([rc.ok, rc.totals.measured[0]], show(rc)).to.deep.equal([true, 12n]);

    // a retirement that stands is replayed too: the future version retired and not replaced leaves epoch 1 without the profile
    const e = await t.deploy({ admit: [w1] });
    await (await e.policy.registerProfile(spec(e, 11, { activeFromEpoch: 1 }))).wait();
    await (await e.policy.retireProfile(key(PROFILE.G0), 1)).wait();
    await h.toEpoch(e, 1);
    await t.refuses(e.ledger.connect(w1).submitG0(key(PROFILE.G0), 1, 0, ethers.id("anything")), "NoActiveProfile");
    await h.toEpoch(e, 2);
    const re = await audit(e, 1);
    expect([re.ok, re.receiptCount], show(re)).to.deep.equal([true, 0n]);
  });

  it("writes the audit as a record with a canonical form and two hashes, which a second program recomputes (L41)", async function () {
    const { d, firstOfEpoch1: block, r, account } = w;
    const pin = await g.pinBlock(ethers.provider, block.number);
    const ctx = await connect(d, { tag: block.number, pin });
    const deployment = { name: "fixture-v2", environment: "local-devnet", labels: ["controlled-self-test"] };
    const report = await a2.auditEpoch(ctx, 0, { permits: supplied });
    const record = auditRecord(ctx, report, { deployment, rpc: "https://user:secret@node.example:8545/v1/an-access-key", recordedAt: "2026-11-25T08:00:00.000Z" });
    expect([record.schema, record.deployment, record.environment, record.chainId, record.ledger, record.epoch]).to.deep.equal(
      [SCHEMA, "fixture-v2", "local-devnet", String(d.chainId), d.ledgerAddress, "0"]);
    expect([record.ok, record.agrees, record.complete, record.findings, record.undecided]).to.deep.equal([true, true, true, [], []]);
    expect(record.snapshot).to.deep.equal({ number: block.number, hash: block.hash, timestamp: String(block.timestamp) });
    expect(record.endpointHost).to.equal("node.example:8545"); // the host, and nothing a key could be in
    expect(JSON.stringify(record)).to.not.contain("secret").and.to.not.contain("an-access-key");
    // what the record adds to the kernel's: the entry of each receipt, the operators, the permits, the guards
    const receipt = (x) => record.receipts.find((it) => it.id === String(x.id));
    expect(receipt(r.g0account)).to.include({ pool: "g0", operator: 9, verdict: "accepted", eligibility: "eligible", role: "unclassified", unit: "none", duplicateOf: "0", facts: "derived-from-the-source" });
    expect(receipt(r.g0account).entry).to.deep.include({ kind: "delegated", participant: account.target, sender: w.delegate.address, authorization: w.permits.account.digest,
      accountHasCodeAtBlock: true, signature: "contract-account-not-asked-again", guard: { guard: w.guardA.target, version: "1", fromEpoch: "0" } });
    expect(receipt(r.g0account).entry.permit).to.include({ evidence: "permit-in-the-transaction", accountAtUse: "with-code", scope: "3", guardBindingVersion: "1" });
    expect(receipt(r.g0relayed).entry.permit).to.include({ evidence: "permit-supplied", accountAtUse: "without-code", delegate: w.relay.target });
    expect(receipt(r.demanderUndeclared)).to.include({ pool: "g1", eligibility: "demander-operator-not-declared", gmuMeasured: "50", gmuSubsidized: "0" });
    expect(receipt(r.account).tender).to.include({ demander: account.target, settlement: "judged", factRecorded: false });
    expect(record.operators.find((o) => o.operator === 9)).to.deep.include({ addresses: [account.target], subsidized: { g0: "10", g1: "0" },
      share: { g0: String(175n * P), g1: "0" }, capped: { g0: true, g1: false }, allocation: String(175n * P) });
    expect(record.permits.supplied).to.deep.equal([{ digest: w.permits.fresh.digest, account: w.fresh.address, delegate: w.relay.target, signature: true,
      usedBy: [String(r.g0relayed.id)] }]);
    expect(record.guards).to.deep.equal([{ account: account.target, guard: w.guardA.target, version: "1", fromEpoch: "0",
      codeHash: ethers.keccak256(await ethers.provider.getCode(w.guardA.target)), codeAtBlock: ethers.keccak256(await ethers.provider.getCode(w.guardA.target)) }]);
    expect(record.reading.some((line) => line.includes("controlled self-test"))).to.equal(true);

    // the hashes: over the canonical form; the result hash is shared by two runs at one block, the report hash is not
    expect(record.resultHash).to.equal(canonical.resultHash(record));
    expect(record.reportHash).to.equal(canonical.reportHash(record));
    const again = auditRecord(ctx, await a2.auditEpoch(await connect(d, { tag: block.number }), 0, { permits: supplied }), { deployment, rpc: "http://another.example" });
    expect([again.resultHash === record.resultHash, again.reportHash === record.reportHash]).to.deep.equal([true, false]);
    // the permits a run is given are part of what it found
    const fewer = auditRecord(ctx, await a2.auditEpoch(ctx, 0), { deployment });
    expect([fewer.ok, fewer.resultHash === record.resultHash]).to.deep.equal([true, false]);
    // a difference and an undecided receipt both show in the record
    const other = auditRecord(ctx, await a2.auditEpoch({ ...ctx, ledger: tampered(ctx.ledger, { factCount: async () => 9n }) }, 0, { permits: supplied }), { deployment });
    expect([other.ok, other.agrees, other.complete, other.findings]).to.deep.equal([false, false, true, [{ what: "facts recorded", recomputed: "2", ledger: "9" }]]);

    // the second program, in another language, from the file
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-record-"));
    try {
      const file = path.join(dir, "audit-epoch-0.json");
      fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
      let out = null;
      try { out = execFileSync("python3", [path.join(__dirname, "..", "scripts", "report-hash.py"), file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {
        if (e.code === "ENOENT") { this.skip(); return; } // no python3 on this machine: the hashes above stand
        throw e;
      }
      expect(out).to.contain(`${record.reportHash}  reportHash`);
      expect(out).to.contain(`${record.resultHash}  resultHash`);
      expect(out.match(/as stated/g).length).to.equal(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("The reference client: what the audit of ledger v2 reports and does not decide", () => {
  it("takes the verdict of a function it does not carry as recorded and re-decides what follows from it (L42)", async () => {
    const [, w1, w2, stranger] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w1, w2], echoCap: 15n });
    const echo = (jobIndex) => ({ profile: PROFILE.ECHO, jobIndex });
    const first = await t.submitDirect(d, w1, echo(0));
    const second = await t.submitDirect(d, w1, echo(1)); // 5 GMU are left under the worker's cap of the profile
    const wrong = await t.submitDirect(d, w2, { ...echo(0), output: ethers.id("no") });
    const outside = await t.submitDirect(d, stranger, echo(1));
    const known = await t.submitDirect(d, w2);
    await h.toEpoch(d, 1);

    const ctx = await connect(d);
    const report = await a2.auditEpoch(ctx, 0);
    // nothing differs; four receipts are of a function the client cannot evaluate again, and the report is not complete
    expect([report.ok, report.agrees, report.complete, whats(report)]).to.deep.equal([false, true, false, []]);
    expect(report.undecided.map((u) => [u.receiptId, u.what, u.module])).to.deep.equal([first, second, wrong, outside].map((x) => [x.id, "verdict", d.echo.target]));
    expect(report.facts.byEvidence).to.deep.equal({ [a2.FACTS_EVIDENCE.NOT_EVALUATED]: 4, [a2.FACTS_EVIDENCE.DERIVED]: 1 });
    const st = (x) => report.receipts.find((it) => it.id === x.id).status;
    expect([st(first).gmuSubsidized, st(second).gmuSubsidized, st(wrong).ineligible, st(outside).ineligible, st(known).gmuSubsidized])
      .to.deep.equal([10n, 5n, I.REJECTED, I.NOT_ADMITTED, 10n]);
    expect([report.digest, report.totals]).to.deep.equal([(await d.ledger.epochSummary(0)).digest, { measured: [40n, 0n], subsidized: [25n, 0n] }]);

    // a worker at the cap of the profile: accepted, measured, and not subsidized - the last reason of the G0 order
    const tight = await t.deploy({ admit: [w1], echoCap: 10n });
    await t.submitDirect(tight, w1, echo(0));
    const capped = await t.submitDirect(tight, w1, echo(1));
    expect(capped.status.ineligible).to.equal(I.WORKER_CAP);
    await h.toEpoch(tight, 1);
    const atCap = await a2.auditEpoch(await connect(tight), 0);
    expect([atCap.agrees, atCap.undecided.length, atCap.receipts[1].status.ineligible, atCap.receipts[1].status.gmuMeasured, atCap.totals.subsidized])
      .to.deep.equal([true, 2, I.WORKER_CAP, 10n, [10n, 0n]]);

    // given the recorded verdict, the rest is held: a second job recorded with more than the cap leaves
    const over = await a2.auditEpoch({ ...ctx, ledger: withLog(ctx.ledger, "ReceiptStatus", (ev) => (ev.args.id === second.id
      ? { ...ev, args: { id: ev.args.id, status: { ...v2.plainStatus(ev.args.status), gmuSubsidized: 10n } } } : ev)) }, 0);
    expect(whats(over)).to.deep.equal([`receipt ${second.id}: gmuSubsidized`]);
    // and a rejected output recorded as measured
    const measured = await a2.auditEpoch({ ...ctx, ledger: withLog(ctx.ledger, "ReceiptStatus", (ev) => (ev.args.id === wrong.id
      ? { ...ev, args: { id: ev.args.id, status: { ...v2.plainStatus(ev.args.status), gmuMeasured: 10n } } } : ev)) }, 0);
    expect(whats(measured)).to.deep.equal([`receipt ${wrong.id}: gmuMeasured`]);
  });

  it("does not derive the facts of a module it cannot read, and still holds its task units and content keys to the ledger's rules (L43)", async () => {
    const [, w1, w2, d1, d2] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w1, w2, d1, d2] });
    const K = ethers.id("content key K");
    const free = await t.record(d, PROFILE.FREE, t.facts(d, { worker: w1, demander: d1 }));
    const whole = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w1, demander: d2 }), { unit: v2.UNIT.WHOLE, contentKey: K });
    const again = await t.record(d, PROFILE.UNIT_B, t.facts(d, { worker: w2, demander: d2 }), { unit: v2.UNIT.WHOLE, contentKey: K });
    const part = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w2, demander: d1 }), { unit: v2.UNIT.PART, contentKey: ethers.id("another key") });
    expect([whole.status.ineligible, again.status.ineligible, again.status.duplicateOf, part.status.ineligible])
      .to.deep.equal([I.NONE, I.DUPLICATE_CONTRIBUTION, whole.id, I.NOT_A_TASK_UNIT]);
    await h.toEpoch(d, 1);

    const ctx = await connect(d);
    const report = await a2.auditEpoch(ctx, 0);
    expect([report.ok, report.agrees, report.complete, whats(report)]).to.deep.equal([false, true, false, []]);
    expect(report.undecided.map((u) => [u.receiptId, u.what, u.module])).to.deep.equal([free, whole, again, part].map((x) => [x.id, "facts", d.module.target]));
    expect(report.facts.byEvidence).to.deep.equal({ [a2.FACTS_EVIDENCE.NOT_READABLE]: 4 });
    // with the statuses as recorded, the digest, the totals, the operators' shares and the allocations are the ledger's
    expect([report.digest, report.totals]).to.deep.equal([(await d.ledger.epochSummary(0)).digest, { measured: [0n, 100n], subsidized: [0n, 100n] }]);
    for (const row of report.table) expect(await d.ledger.allocation(0, row.worker), row.worker).to.equal(row.allocation);
    expect(report.table.find((row) => row.worker === w1.address).allocation).to.equal(75n * P);

    const status = (id, fields) => withLog(ctx.ledger, "ReceiptStatus", (ev) => (ev.args.id === id
      ? { ...ev, args: { id: ev.args.id, status: { ...v2.plainStatus(ev.args.status), ...fields } } } : ev));
    // (a receipt that is not re-decided is replayed with its recorded status, so a status that is not
    // the ledger's moves the digest and the totals as well: the first differences are the rule's)
    const extra = whats;
    // a second delivery of a counted key recorded as counted; one that names the wrong first receipt
    const twice = await a2.auditEpoch({ ...ctx, ledger: status(again.id, { ineligible: 0, gmuMeasured: 50n, gmuSubsidized: 50n, duplicateOf: 0n }) }, 0);
    expect(extra(twice).slice(0, 3)).to.deep.equal([`receipt ${again.id}: ineligible`, `receipt ${again.id}: GMU`, `receipt ${again.id}: duplicateOf`]);
    const misnamed = await a2.auditEpoch({ ...ctx, ledger: status(again.id, { duplicateOf: free.id }) }, 0);
    expect(extra(misnamed).slice(0, 1)).to.deep.equal([`receipt ${again.id}: duplicateOf`]);
    // a part of a unit recorded as measured; a whole unit recorded as a duplicate of nothing
    const counted = await a2.auditEpoch({ ...ctx, ledger: status(part.id, { ineligible: 0, gmuMeasured: 50n }) }, 0);
    expect(extra(counted).slice(0, 2)).to.deep.equal([`receipt ${part.id}: ineligible`, `receipt ${part.id}: GMU`]);
    const refused = await a2.auditEpoch({ ...ctx, ledger: status(whole.id, { ineligible: I.DUPLICATE_CONTRIBUTION, gmuMeasured: 0n, gmuSubsidized: 0n }) }, 0);
    expect(extra(refused).slice(0, 2)).to.deep.equal([`receipt ${whole.id}: ineligible`, `receipt ${whole.id}: gmuMeasured`]);
    // a key that the log gives to another receipt than the first whole unit, or to none
    const taken = (change, added) => withLog(ctx.ledger, "ContentKeyTaken", change, added);
    const stolen = await a2.auditEpoch({ ...ctx, ledger: taken((ev) => ({ ...ev, args: { contentKey: ev.args.contentKey, receiptId: again.id } })) }, 0);
    expect(extra(stolen)).to.deep.equal([`receipt ${whole.id}: content key taken`, `receipt ${again.id}: content key taken`]);
    const none = await a2.auditEpoch({ ...ctx, ledger: taken((ev) => ({ ...ev, args: { contentKey: ethers.id("elsewhere"), receiptId: ev.args.receiptId } })) }, 0);
    expect(extra(none)).to.deep.equal([`receipt ${whole.id}: content key taken`, `receipt ${whole.id}: content key taken`]);
    const fragment = ctx.ledger.interface.getEvent("ContentKeyTaken");
    const double = await a2.auditEpoch({ ...ctx, ledger: taken(undefined, [{ blockNumber: 1, index: 0, transactionHash: NONE, fragment, args: { contentKey: K, receiptId: part.id } }]) }, 0);
    expect(extra(double)).to.deep.equal([`content key ${K}`]);
    // a ledger whose store names another receipt for the key than the one that took it
    const stored = await a2.auditEpoch({ ...ctx, ledger: tampered(ctx.ledger, { contentKeyOwner: async () => again.id }) }, 0);
    expect(extra(stored)).to.deep.equal([`content key ${K}, as stored`]);

    // a key stays taken across epochs: a delivery of epoch 1 with the key of epoch 0 names the receipt of epoch 0
    const later = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w1, demander: d1 }), { unit: v2.UNIT.WHOLE, contentKey: K });
    const fresh = await t.record(d, PROFILE.UNIT, t.facts(d, { worker: w2, demander: d2 }), { unit: v2.UNIT.WHOLE, contentKey: ethers.id("a new key") });
    expect([later.status.ineligible, later.status.duplicateOf, fresh.status.ineligible]).to.deep.equal([I.DUPLICATE_CONTRIBUTION, whole.id, I.NONE]);
    await h.toEpoch(d, 2);
    const next = await connect(d);
    const one = await a2.auditEpoch(next, 1);
    expect([one.agrees, one.complete, whats(one), one.undecided.length]).to.deep.equal([true, false, [], 2]);
    // without the record of the key's taking in epoch 0, the delivery of epoch 1 would have been the first
    const forgotten = await a2.auditEpoch({ ...next, ledger: withLog(next.ledger, "ContentKeyTaken", (ev) => (ev.args.contentKey === K
      ? { ...ev, args: { contentKey: ethers.id("elsewhere"), receiptId: ev.args.receiptId } } : ev)) }, 1);
    expect(whats(forgotten)).to.deep.equal([`receipt ${later.id}: ineligible`, `receipt ${later.id}: gmuMeasured`, `receipt ${later.id}: duplicateOf`,
      `receipt ${later.id}: content key taken`, `content key ${K}, as stored`]);
  });
});
