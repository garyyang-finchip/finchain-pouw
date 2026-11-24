"use strict";

const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;

const I = g.INELIGIBLE;
const REWARD = ethers.parseEther("0.002");

/// An agent whose on-chain identity is a contract account: a key drives it, the account acts.
async function agent(key) {
  const Account = await ethers.getContractFactory("TestAccount");
  const account = await Account.deploy(key.address);
  const address = await account.getAddress();
  await (await key.sendTransaction({ to: address, value: ethers.parseEther("0.1") })).wait(); // the account holds its own funds
  const act = async (target, data, value = 0n) => (await account.connect(key).execute(await target.getAddress(), value, data)).wait();
  return { key, account, address, act };
}

/// One tender the way an agent node makes it: every ERC-8414 call is the account's, through execute.
async function tenderBetween(d, demander, worker) {
  const t = d.taskToken;
  const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: REWARD, maxCompletions: 1, submitBy: 0, settleBy: 0, epochLength: 0,
    maxCompletionsPerEpoch: 0, judgmentWindow: 3600 };
  const tokenId = await t.nextId();
  await demander.act(t, t.interface.encodeFunctionData("mintTask", [demander.address, demander.address, demander.address,
    ethers.id("td by an account"), ethers.id(`task ${tokenId}`), "data:,task", terms]));
  await demander.act(t, t.interface.encodeFunctionData("fundTask", [tokenId, REWARD]), REWARD);
  await worker.act(t, t.interface.encodeFunctionData("submitFulfillment", [tokenId, ethers.id(`result ${tokenId}`), "data:,result"]));
  const submissionId = await t.submissionCountOf(tokenId);
  await demander.act(t, t.interface.encodeFunctionData("acceptFulfillment", [tokenId, submissionId]));
  return { tokenId, submissionId };
}

describe("Contract accounts: the account is the identity, not the key that drives it", () => {
  it("records the account as the worker of the audit job; the key by itself is somebody else (T6)", async () => {
    const [, keyX, keyY] = await ethers.getSigners();
    const x = await agent(keyX);
    const y = await agent(keyY);
    const d = await h.deploy({ admit: [x.address, y.address] });

    const done = await g.workAudit(d.ctx, keyX, { account: x.address });
    expect(done.worker).to.equal(x.address);
    expect(done.key).to.equal(keyX.address);
    expect((await d.ledger.receipt(done.receiptId)).worker).to.equal(x.address);
    expect(done.status.verdict).to.equal(g.VERDICT.ACCEPTED);
    expect(done.status.gmuSubsidized).to.equal(10n);

    // the same key, sending by itself: another worker with another instance - and not an admitted one
    const direct = await g.workAudit(d.ctx, keyX);
    expect(direct.worker).to.equal(keyX.address);
    expect(direct.instance).to.not.equal(done.instance);
    expect(direct.status.ineligible).to.equal(I.NOT_ADMITTED);
    expect(direct.status.gmuSubsidized).to.equal(0n);

    // a key the account does not obey is refused before anything is sent
    let error = null;
    try { await g.workAudit(d.ctx, keyY, { account: x.address }); } catch (e) { error = e; }
    expect(String(error?.message)).to.contain("neither the owner nor the operator");
    // and an address that is no contract is not an account
    error = null;
    try { await g.workAudit(d.ctx, keyY, { account: keyX.address }); } catch (e) { error = e; }
    expect(String(error?.message)).to.contain("not a contract account");

    // a second job through the account: the client finds the account's receipt and sends nothing
    const again = await g.workAudit(d.ctx, keyX, { account: x.address });
    expect([again.alreadyRecorded, again.receiptId, again.worker]).to.deep.equal([true, done.receiptId, x.address]);
    // sent all the same, it is refused by the ledger, and the client names the cause although the
    // account wrapped it
    error = null;
    try { await x.act(d.ledger, d.ledger.interface.encodeFunctionData("submitG0", [g.profileKey(g.PROFILE_G0_REF), 0, 0, done.output])); } catch (e) { error = e; }
    expect(g.refusal(error)?.name).to.equal("AlreadySubmitted");
    expect(await d.ledger.subsidizedOf(0, g.POOL_G0, x.address)).to.equal(10n);
  });

  it("lets the account that owns a tender bridge it, and nobody else - its own key included (T6, D11)", async () => {
    const [, keyX, keyY, stranger] = await ethers.getSigners();
    const x = await agent(keyX);
    const y = await agent(keyY);
    const d = await h.deploy({ admit: [x.address, y.address] });
    const t = await tenderBetween(d, x, y);
    expect(await d.taskToken.ownerOf(t.tokenId)).to.equal(x.address);
    expect((await d.taskToken.submissionOf(t.tokenId, t.submissionId)).fulfiller).to.equal(y.address);

    // the key that drives the owning account is not the owner
    await h.revertsWith(d.adapter.connect(keyX).bridge(t.tokenId, t.submissionId), "NotDemander");
    await h.revertsWith(d.adapter.connect(stranger).bridge(t.tokenId, t.submissionId), "NotDemander");
    let error = null;
    try { await g.bridgeTender(d.ctx, keyX, t); } catch (e) { error = e; }
    expect(g.refusal(error)?.name).to.equal("NotDemander");
    expect(await d.ledger.receiptCount()).to.equal(0n);

    // through the account, it is
    const out = await g.bridgeTender(d.ctx, keyX, { ...t, account: x.address });
    expect(out.demander).to.equal(x.address);
    expect(out.worker).to.equal(y.address);
    expect(out.epoch).to.equal(0n);
    expect(out.status.ineligible).to.equal(I.NONE);
    expect(out.status.gmuSubsidized).to.equal(50n);
    const receipt = await d.ledger.receipt(out.receiptId);
    expect(receipt.worker).to.equal(y.address);
    expect(receipt.counterparty).to.equal(x.address);

    // G0 and G1 name the same worker when both go through the account
    const job = await g.workAudit(d.ctx, keyY, { account: y.address });
    expect(job.worker).to.equal(receipt.worker);

    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, JSON.stringify(g.jsonable(report.findings))).to.equal(true);
    const row = report.table.find((r) => r.worker === y.address);
    expect(row.receipts).to.equal(2);
    expect(row.subsidized).to.deep.equal([10n, 50n]);
    expect(report.observations).to.deep.equal([]);
  });

  it("classes two accounts of one declared operator as related, whichever keys drive them (D9)", async () => {
    const [, keyX, keyY] = await ethers.getSigners();
    const x = await agent(keyX);
    const y = await agent(keyY);
    const d = await h.deploy({ admit: [x.address, y.address], operators: { [x.address]: 1, [y.address]: 1 } });
    const out = await g.bridgeTender(d.ctx, keyX, { ...(await tenderBetween(d, x, y)), account: x.address });
    expect(out.status.relation).to.equal(g.RELATION.DECLARED_RELATED);
    expect(out.status.ineligible).to.equal(I.RELATION);
    expect(out.status.gmuMeasured).to.equal(50n);
  });
});
