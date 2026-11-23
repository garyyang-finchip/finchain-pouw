"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;
const { stageTender, TENDER_ABI } = require("../scripts/lib/tender");

const REWARD = ethers.parseEther("0.0005");

/// A run that stops after the step named: the next step's transaction is never sent.
const stopAfter = (name) => (step) => { if (step === name) throw new Error(`stopped after ${name}`); };

describe("An operator's round: a test tender that can be interrupted and carried on", () => {
  it("stages a tender in four transactions and confirms it; the kernel is not involved until the bridge", async () => {
    const [, a, b] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b], params: { minBountyWei: ethers.parseEther("0.0001") } });
    const tenderAddress = await d.taskToken.getAddress();
    const before = await d.ledger.receiptCount();
    const paid = await ethers.provider.getBalance(b.address);
    const state = {};
    const t = await stageTender({ tenderAddress, demander: a, worker: b, reward: REWARD, label: "test:0:a:b", state });
    expect(t.steps.map((s) => s.step)).to.deep.equal(["mint", "fund", "deliver", "accept"]);
    expect(state).to.deep.equal({ tokenId: t.tokenId.toString(), submissionId: t.submissionId.toString() });
    expect(await d.taskToken.ownerOf(t.tokenId)).to.equal(a.address);
    expect(await d.taskToken.acceptanceAuthorityOf(t.tokenId)).to.equal(a.address);
    const sub = await d.taskToken.submissionOf(t.tokenId, t.submissionId);
    expect(sub.fulfiller).to.equal(b.address);
    expect(Number(sub.status)).to.equal(1);
    expect((await d.taskToken.tenderTermsOf(t.tokenId)).maxCompletions).to.equal(1n);
    expect(await d.ledger.receiptCount()).to.equal(before); // settled, and nothing recorded yet
    expect((await ethers.provider.getBalance(b.address)) > paid).to.equal(true); // the bounty reached the worker, less its gas

    const r = await g.bridgeTender(d.ctx, a, { tokenId: t.tokenId, submissionId: t.submissionId });
    expect(r.demander).to.equal(a.address);
    expect(r.worker).to.equal(b.address);
    expect(r.status.gmuSubsidized).to.equal(50n);
    // staged again from the same state, nothing is sent
    const again = await stageTender({ tenderAddress, demander: a, worker: b, reward: REWARD, label: "test:0:a:b", state });
    expect(again.steps).to.deep.equal([]);
    expect(again.tokenId).to.equal(t.tokenId);
  });

  it("carries on from wherever a run stopped, and does no step twice (R1, R3)", async () => {
    const [, a, b] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b] });
    const tenderAddress = await d.taskToken.getAddress();
    const token = new ethers.Contract(tenderAddress, TENDER_ABI, ethers.provider);
    const first = await d.taskToken.nextId();

    for (const [stop, rest] of [["mint", ["fund", "deliver", "accept"]], ["fund", ["deliver", "accept"]], ["deliver", ["accept"]], ["accept", []]]) {
      const state = {};
      const args = { tenderAddress, demander: a, worker: b, reward: REWARD, label: `test:stop-after-${stop}`, state };
      let error = null;
      try { await stageTender({ ...args, log: stopAfter(stop) }); } catch (e) { error = e; }
      expect(String(error?.message)).to.equal(`stopped after ${stop}`);
      // the token's id is known from the moment it is minted: that is what lets the run be carried on
      expect(state.tokenId, stop).to.not.equal(undefined);
      const done = await stageTender(args);
      expect(done.steps.map((s) => s.step), `after a stop at ${stop}`).to.deep.equal(rest);
      expect(done.tokenId.toString()).to.equal(state.tokenId);
      expect(await token.submissionCountOf(done.tokenId)).to.equal(1n);
      expect(Number((await token.submissionOf(done.tokenId, done.submissionId)).status)).to.equal(1);
      expect(await token.escrowBalanceOf(done.tokenId)).to.equal(0n); // funded once, paid once
    }
    // four tenders for four runs: an interruption never minted a second one
    expect(await d.taskToken.nextId()).to.equal(first + 4n);
  });

  it("accepts the worker's own delivery only, and refuses a state that names somebody else's tender", async () => {
    const [, a, b, stranger] = await ethers.getSigners();
    const d = await h.deploy({ admit: [a, b] });
    const tenderAddress = await d.taskToken.getAddress();
    const token = new ethers.Contract(tenderAddress, TENDER_ABI, ethers.provider);

    // a stranger delivers first and takes the tender's one place: the worker's own delivery is then
    // refused by the tender, and the stranger's is not accepted in its stead
    const state = {};
    const args = { tenderAddress, demander: a, worker: b, reward: REWARD, label: "test:stranger", state };
    try { await stageTender({ ...args, log: stopAfter("fund") }); } catch { /* stopped on purpose */ }
    await (await token.connect(stranger).submitFulfillment(BigInt(state.tokenId), ethers.id("somebody else's result"), "urn:test")).wait();
    await h.revertsWith(stageTender(args), "completions exhausted");
    expect(Number((await token.submissionOf(BigInt(state.tokenId), 1n)).status)).to.equal(0); // still pending: never accepted

    // a state file that points at a tender the demander does not own is not acted on
    const theirs = await h.tender(d, { owner: stranger, worker: b, settle: false });
    await h.revertsWith(stageTender({ ...args, state: { tokenId: theirs.tokenId.toString() } }), "is owned by");
  });
});
