"use strict";

const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, v2, PROFILE, key, ZERO } = t;

const MAGIC = "0x1626ba7e";
const deployed = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);

/// A deployment with one contract account that is admitted, has a declared operator and - unless
/// `bind` is false - a guard bound from epoch 0.
async function withAccount(make, { bind = true } = {}) {
  const d = await t.deploy({ start: false });
  const account = await make();
  const guard = await deployed("SwitchGuard");
  await d.policy.setAdmission(account.target, true);
  await d.policy.declareOperator(account.target, 7);
  if (bind) await d.policy.bindGuard(account.target, guard.target);
  await h.setTime(d.genesisTime);
  return { d, account, guard, bound: { guard: guard.target, guardBindingVersion: 1 } };
}

const echo = (jobIndex) => ({ profile: PROFILE.ECHO, jobIndex });

describe("Ledger v2: what a change of an account's keys does to a permit", () => {
  it("ends the former owner's permit at its next use when the account accepts its owner and nobody else (L9)", async () => {
    const [, a, b, delegate] = await ethers.getSigners();
    const { d, account, bound } = await withAccount(() => deployed("OwnerOnlyAccount", a.address));
    const old = await t.signed(d, a, account.target, { delegate: delegate.address, ...bound });
    await t.submitDelegated(d, delegate, old, account.target, echo(0));

    await (await account.connect(a).transferOwnership(b.address)).wait();
    // nothing was revoked and no nonce was raised: the account's own rule refuses the former owner
    expect(await d.ledger.isRevoked(account.target, old.digest)).to.equal(false);
    expect(await d.ledger.minNonce(account.target)).to.equal(0n);
    await t.refuses((await t.delegatedCall(d, delegate, old, account.target, echo(1)))(), "BadSignature");

    const fresh = await t.signed(d, b, account.target, { delegate: delegate.address, nonce: 2, ...bound });
    const done = await t.submitDelegated(d, delegate, fresh, account.target, echo(1));
    expect(done.receipt.authorization).to.equal(fresh.digest);
  });

  it("does not end it when the former owner stays a signing operator: only a revocation or the nonce does, and only removing the signing right stops new permits (L10)", async () => {
    const [, a, b, delegate, relayer] = await ethers.getSigners();
    // one key in both roles, and operator signing enabled
    const { d, account, bound } = await withAccount(async () => {
      const acc = await deployed("OperatorSlotAccount", a.address, a.address);
      await (await acc.connect(a).setOperatorMaySign(true)).wait();
      return acc;
    });
    const call = async (p, jobIndex = 1) => (await t.delegatedCall(d, delegate, p, account.target, echo(jobIndex)))();
    const old = await t.signed(d, a, account.target, { delegate: delegate.address, nonce: 1, ...bound });
    await t.submitDelegated(d, delegate, old, account.target, echo(0));

    await (await account.connect(a).transferOwnership(b.address)).wait();
    expect(await account.owner()).to.equal(b.address);
    expect(await account.operator()).to.equal(a.address);

    // first half: the old permit still verifies - the former owner is still a key the account accepts
    expect(await d.ledger.checkPermit(old.tuple, old.signature, delegate.address, 1)).to.equal(old.digest);

    // the new owner raises the minimum nonce, by a statement: the old generation of permits ends
    const raise = await t.signedStatement(d, b, "RaiseNonce", { account: account.target, minNonce: 2 });
    await (await d.ledger.connect(relayer).raiseMinNonceBySig(account.target, 2, raise.signature)).wait();
    expect(await t.refuses(call(old), "NonceBelowMinimum")).to.deep.equal([1n, 2n]);

    // control one: raising the nonce ended permits, not the key. The former owner, still a signing
    // operator, signs a new permit at the new minimum, and it is accepted
    const again = await t.signed(d, a, account.target, { delegate: delegate.address, nonce: 2, ...bound });
    expect(await d.ledger.checkPermit(again.tuple, again.signature, delegate.address, 1)).to.equal(again.digest);
    await (await call(again, 1)).wait();
    expect((await t.lastReceipt(d)).receipt.authorization).to.equal(again.digest);

    // control two: the new owner takes the signing right away, with the account's own means. The
    // permit just used is refused at its next use, and so is any permit the old key signs now
    await (await account.connect(b).setOperatorMaySign(false)).wait();
    await h.toEpoch(d, 1);
    await t.refuses(call(again, 0), "BadSignature");
    const later = await t.signed(d, a, account.target, { delegate: delegate.address, nonce: 3, ...bound });
    await t.refuses(call(later, 0), "BadSignature");
    // the old key's statements are refused with it
    const stale = await t.signedStatement(d, a, "RaiseNonce", { account: account.target, minNonce: 50 });
    await t.refuses(d.ledger.connect(relayer).raiseMinNonceBySig(account.target, 50, stale.signature), "BadSignature");
    // delegation goes on under a permit of the new owner
    const fresh = await t.signed(d, b, account.target, { delegate: delegate.address, nonce: 3, ...bound });
    expect((await t.submitDelegated(d, delegate, fresh, account.target, echo(0))).receipt.authorization).to.equal(fresh.digest);
  });

  it("verifies a statement that ends a permit each time it is sent: signing alone changes nothing, a repeat changes nothing while the account accepts the signature, and is refused once it does not", async () => {
    const [, a, b, delegate, relayer] = await ethers.getSigners();
    const { d, account, bound } = await withAccount(async () => {
      const acc = await deployed("OperatorSlotAccount", a.address, a.address);
      await (await acc.connect(a).setOperatorMaySign(true)).wait();
      return acc;
    });
    const p = await t.signed(d, a, account.target, { delegate: delegate.address, nonce: 1, ...bound });
    const revoke = await t.signedStatement(d, a, "Revoke", { account: account.target, permitDigest: p.digest });
    const raise = await t.signedStatement(d, a, "RaiseNonce", { account: account.target, minNonce: 5 });
    const state = async () => [await d.ledger.isRevoked(account.target, p.digest), await d.ledger.minNonce(account.target)];
    const sendRevoke = () => d.ledger.connect(relayer).revokePermitBySig(account.target, p.digest, revoke.signature);
    const sendRaise = () => d.ledger.connect(relayer).raiseMinNonceBySig(account.target, 5, raise.signature);
    const events = async (tx, name) => h.eventsOf(await (await tx).wait(), d.ledger, name).length;

    // signed and not sent: the ledger holds nothing of either statement, and the permit is used
    expect(await state()).to.deep.equal([false, 0n]);
    await t.submitDelegated(d, delegate, p, account.target, echo(0));

    // sent: the mark and the minimum change with the transaction that carries the statement
    expect(await events(sendRevoke(), "PermitEnded")).to.equal(1);
    expect(await events(sendRaise(), "MinNonceRaised")).to.equal(1);
    expect(await state()).to.deep.equal([true, 5n]);

    // sent again while the account still accepts the signature: verified, and nothing changes
    expect(await events(sendRevoke(), "PermitEnded")).to.equal(0);
    expect(await events(sendRaise(), "MinNonceRaised")).to.equal(0);
    expect(await state()).to.deep.equal([true, 5n]);

    // the signing right is taken away in the account. The same two statements are refused now:
    // the ledger does not pass over the check because the mark is there already
    await (await account.connect(a).transferOwnership(b.address)).wait();
    await (await account.connect(b).setOperatorMaySign(false)).wait();
    await t.refuses(sendRevoke(), "BadSignature");
    await t.refuses(sendRaise(), "BadSignature");
    // what was done stays done
    expect(await state()).to.deep.equal([true, 5n]);
    // a statement of the key the account accepts now, at a minimum already passed: verified, and nothing changes
    const lower = await t.signedStatement(d, b, "RaiseNonce", { account: account.target, minNonce: 3 });
    expect(await events(d.ledger.connect(relayer).raiseMinNonceBySig(account.target, 3, lower.signature), "MinNonceRaised")).to.equal(0);
    expect(await state()).to.deep.equal([true, 5n]);
  });

  it("ends the former owner's permit at once in the configuration with operator signing off (L10, the other configuration)", async () => {
    const [, a, b, delegate] = await ethers.getSigners();
    // one key in both roles, operator signing off: the configuration read on chain for both cells
    const { d, account, bound } = await withAccount(() => deployed("OperatorSlotAccount", a.address, a.address));
    expect(await account.operatorMaySign()).to.equal(false);
    const old = await t.signed(d, a, account.target, { delegate: delegate.address, ...bound });
    await t.submitDelegated(d, delegate, old, account.target, echo(0));
    await (await account.connect(a).transferOwnership(b.address)).wait();
    expect(await account.operator()).to.equal(a.address); // still in the slot, and not accepted as a signer
    await t.refuses((await t.delegatedCall(d, delegate, old, account.target, echo(1)))(), "BadSignature");
  });
});

describe("Ledger v2: the guard of a contract account", () => {
  it("refuses a delegated entry when the guard says no, fails, or is not the binding the permit was signed for (L13)", async () => {
    const [, a, delegate] = await ethers.getSigners();
    const { d, account, guard, bound } = await withAccount(() => deployed("OwnerOnlyAccount", a.address));
    const p = await t.signed(d, a, account.target, { delegate: delegate.address, ...bound });
    const check = (permit_, overrides = {}) => d.ledger.checkPermit.staticCall(permit_.tuple, permit_.signature, delegate.address, 1, overrides);

    // says no; reverts; answers with the number two; never returns; answers with nothing
    for (const mode of [1, 2, 3, 4, 5]) {
      await (await guard.setMode(mode)).wait();
      // within a fixed gas limit the outcome is the ledger's refusal, not an exhausted call
      expect(await t.refuses(check(p, { gasLimit: 1_500_000n }), "GuardRefused")).to.deep.equal([guard.target]);
      await t.refuses((await t.delegatedCall(d, delegate, p, account.target, echo(0)))(), "GuardRefused");
    }
    expect(await d.ledger.GUARD_GAS()).to.equal(500_000n);
    // a guard that never returns is given that much gas and no more, whatever the transaction brought
    await (await guard.setMode(4)).wait();
    const o = await t.g0Output(d, account.target, echo(0));
    const used = await t.gasOfRefused(() => d.ledger.connect(delegate).submitG0For(p.tuple, p.signature, key(PROFILE.ECHO), o.epoch, 0, o.output, { gasLimit: 5_000_000n }));
    expect(used > 500_000n && used < 700_000n, `a refused guard check used ${used} gas`).to.equal(true);
    await (await guard.setMode(0)).wait();
    expect(await check(p)).to.equal(p.digest);

    // the permit names another guard, or another version of the binding
    const other = await deployed("SwitchGuard");
    const wrongGuard = await t.signed(d, a, account.target, { delegate: delegate.address, guard: other.target, guardBindingVersion: 1 });
    expect(await t.refuses(check(wrongGuard), "GuardMismatch")).to.deep.equal([guard.target, 1n]);
    const wrongVersion = await t.signed(d, a, account.target, { delegate: delegate.address, guard: guard.target, guardBindingVersion: 2 });
    await t.refuses(check(wrongVersion), "GuardMismatch");
    const noGuard = await t.signed(d, a, account.target, { delegate: delegate.address });
    await t.refuses(check(noGuard), "GuardMismatch");

    // only the steward binds, and only a contract
    await t.refuses(d.policy.connect(a).bindGuard(account.target, other.target), "NotSteward");
    await t.refuses(d.policy.bindGuard(account.target, delegate.address), "BadGuard");
  });

  it("is default deny: a contract account without a bound guard has the direct entry and no delegated one (L13)", async () => {
    const [, a, delegate] = await ethers.getSigners();
    const { d, account, guard } = await withAccount(() => deployed("OwnerOnlyAccount", a.address), { bind: false });
    for (const fields of [{}, { guard: guard.target, guardBindingVersion: 1 }, { guard: guard.target }]) {
      const p = await t.signed(d, a, account.target, { delegate: delegate.address, ...fields });
      expect(await t.refuses((await t.delegatedCall(d, delegate, p, account.target))(), "NoGuardBound")).to.deep.equal([account.target]);
    }
    // the direct entry: the account sends its own work through its own execution function
    const o = await t.g0Output(d, account.target);
    await (await account.connect(a).execute(d.ledgerAddress, 0, d.ledger.interface.encodeFunctionData("submitG0", [key(PROFILE.G0), o.epoch, 0, o.output]))).wait();
    const direct = await t.lastReceipt(d);
    expect([direct.receipt.worker, direct.receipt.sender, direct.receipt.authorization]).to.deep.equal([account.target, account.target, ethers.ZeroHash]);
    expect(direct.status.gmuSubsidized).to.equal(10n);

    // a guard that was bound and then unbound leaves the account where it was: no delegated entry
    await (await d.policy.bindGuard(account.target, guard.target)).wait();
    await (await d.policy.bindGuard(account.target, ZERO)).wait();
    await h.toEpoch(d, 1);
    expect(await d.policy.guardOf(account.target)).to.deep.equal([ZERO, 2n]);
    const p = await t.signed(d, a, account.target, { delegate: delegate.address, guard: ZERO, guardBindingVersion: 2 });
    await t.refuses((await t.delegatedCall(d, delegate, p, account.target))(), "NoGuardBound");
  });

  it("numbers every binding once: a permit signed for a guard is not revived when that guard is bound again (L14)", async () => {
    const [, a, delegate] = await ethers.getSigners();
    const d = await t.deploy({ start: false });
    const account = await deployed("OwnerOnlyAccount", a.address);
    const guardA = await deployed("SwitchGuard");
    const guardB = await deployed("SwitchGuard");
    await d.policy.setAdmission(account.target, true);
    await d.policy.declareOperator(account.target, 7);
    const events = [];
    const bind = async (guard) => {
      const rc = await (await d.policy.bindGuard(account.target, guard.target ?? guard)).wait();
      const ev = h.eventsOf(rc, d.policy, "GuardBound")[0].args;
      events.push({ guard: ev.guard, version: ev.version, fromEpoch: ev.fromEpoch });
      return ev;
    };
    const permitFor = (guard, version, nonce) => t.signed(d, a, account.target, { delegate: delegate.address, nonce, guard: guard.target, guardBindingVersion: version });
    const call = async (p, jobIndex) => (await t.delegatedCall(d, delegate, p, account.target, echo(jobIndex)))();

    const first = await bind(guardA); // version 1, from epoch 0
    expect(first.codeHash).to.equal(ethers.keccak256(await ethers.provider.getCode(guardA.target)));
    await h.setTime(d.genesisTime);
    const forFirstA = await permitFor(guardA, 1, 1);
    await (await call(forFirstA, 0)).wait();

    // epoch 0: a change scheduled for epoch 1 does not replace the binding in force
    await bind(guardB);                 // version 2, from epoch 1
    expect(await d.policy.guardOf(account.target)).to.deep.equal([guardA.target, 1n]);
    let view = await d.policy.guardBindingOf(account.target);
    expect([view.inForce.guard, view.inForce.version, view.hasPending, view.pending.guard, view.pending.version, view.pending.fromEpoch])
      .to.deep.equal([guardA.target, 1n, true, guardB.target, 2n, 1n]);
    await (await call(forFirstA, 1)).wait(); // still the binding of this epoch
    // changed twice more for the same epoch: each takes a new number, and the numbers replaced are gone
    await bind(guardA);                 // version 3, replaces version 2 before it began
    await bind(guardB);                 // version 4
    view = await d.policy.guardBindingOf(account.target);
    expect([view.inForce.version, view.pending.guard, view.pending.version]).to.deep.equal([1n, guardB.target, 4n]);

    await h.toEpoch(d, 1);
    expect(await d.policy.guardOf(account.target)).to.deep.equal([guardB.target, 4n]);
    expect((await d.policy.guardBindingOf(account.target)).hasPending).to.equal(false);
    expect(await t.refuses(call(forFirstA, 0), "GuardMismatch")).to.deep.equal([guardB.target, 4n]);
    // a permit signed for a number that never came into force is a permit for nothing
    await t.refuses(call(await permitFor(guardB, 2, 2), 0), "GuardMismatch");
    await t.refuses(call(await permitFor(guardA, 3, 2), 0), "GuardMismatch");
    await (await call(await permitFor(guardB, 4, 2), 0)).wait();

    await bind(guardA);                 // version 5, from epoch 2: the first guard again
    await h.toEpoch(d, 2);
    expect(await d.policy.guardOf(account.target)).to.deep.equal([guardA.target, 5n]);
    // the same guard as at the start, and the permit signed for the first binding stays refused
    expect(await t.refuses(call(forFirstA, 0), "GuardMismatch")).to.deep.equal([guardA.target, 5n]);
    await (await call(await permitFor(guardA, 5, 3), 0)).wait();

    expect(events.map((e) => e.version)).to.deep.equal([1n, 2n, 3n, 4n, 5n]);
    expect(events.map((e) => e.fromEpoch)).to.deep.equal([0n, 1n, 1n, 1n, 2n]);
  });

  it("leaves the ways of ending a permit open while the account is suspended; a direct call is the account's own gate's matter (L15)", async () => {
    const [, a, operatorKey, delegate, relayer] = await ethers.getSigners();
    const { d, account, guard, bound } = await withAccount(async () => {
      const acc = await deployed("OperatorSlotAccount", a.address, operatorKey.address);
      await (await acc.connect(a).setOperatorMaySign(true)).wait();
      return acc;
    });
    const permits = [];
    for (const nonce of [1, 2, 3, 4]) permits.push(await t.signed(d, a, account.target, { delegate: delegate.address, nonce, ...bound }));
    const [byStatement, givenUp, byCall, kept] = permits;
    const viaAccount = (key_, data) => account.connect(key_).execute(d.ledgerAddress, 0, data);
    const revokeData = (digest) => d.ledger.interface.encodeFunctionData("revokePermit", [digest]);

    // suspended: the account's own gate refuses its calls, and its guard refuses the delegated entry
    await (await account.connect(a).setSuspended(true)).wait();
    await (await guard.setMode(1)).wait();
    await t.refuses((await t.delegatedCall(d, delegate, kept, account.target, echo(0)))(), "GuardRefused");

    // a `Revoke` statement of the owner, relayed by a third party: the ledger asks no guard
    const revoke = await t.signedStatement(d, a, "Revoke", { account: account.target, permitDigest: byStatement.digest });
    expect((await account.isValidSignature(revoke.digest, revoke.signature))).to.equal(MAGIC);
    await (await d.ledger.connect(relayer).revokePermitBySig(account.target, byStatement.digest, revoke.signature)).wait();
    expect(await d.ledger.isRevoked(account.target, byStatement.digest)).to.equal(true);
    // the delegate gives a permit up
    await (await d.ledger.connect(delegate).renounce(givenUp.tuple)).wait();
    expect(await d.ledger.isRevoked(account.target, givenUp.digest)).to.equal(true);

    // The signed path is open only as far as the account accepts the signature in that state. This
    // account takes its owner's at all times and its operator's only while it is not suspended:
    const byOperator = await t.signedStatement(d, operatorKey, "Revoke", { account: account.target, permitDigest: byCall.digest });
    await t.refuses(d.ledger.connect(relayer).revokePermitBySig(account.target, byCall.digest, byOperator.signature), "BadSignature");

    // A direct revocation through the account is not expected to work while its gate refuses the
    // call: that the ledger asks no guard does not make the account send.
    await t.refuses(viaAccount(a, revokeData(byCall.digest)), "Suspended");
    expect(await d.ledger.isRevoked(account.target, byCall.digest)).to.equal(false);
    // Nor is it certain to fail: an account may let named calls through under a suspension, and this
    // one does once its owner has marked the call. Which calls pass is the account's rule, not the ledger's.
    await (await account.connect(a).setAllowedWhileSuspended(d.ledgerAddress, d.ledger.interface.getFunction("revokePermit").selector, true)).wait();
    await (await viaAccount(a, revokeData(byCall.digest))).wait();
    expect(await d.ledger.isRevoked(account.target, byCall.digest)).to.equal(true);
    await t.refuses(viaAccount(a, d.ledger.interface.encodeFunctionData("raiseMinNonce", [3])), "Suspended");

    // a `RaiseNonce` statement of the owner, relayed
    const raise = await t.signedStatement(d, a, "RaiseNonce", { account: account.target, minNonce: 4 });
    await (await d.ledger.connect(relayer).raiseMinNonceBySig(account.target, 4, raise.signature)).wait();
    expect(await d.ledger.minNonce(account.target)).to.equal(4n);

    // the suspension lifted: the permit that was not ended is usable again
    await (await account.connect(a).setSuspended(false)).wait();
    await (await guard.setMode(0)).wait();
    expect((await t.submitDelegated(d, delegate, kept, account.target, echo(0))).receipt.authorization).to.equal(kept.digest);
    for (const p of [byStatement, givenUp, byCall]) await t.refuses((await t.delegatedCall(d, delegate, p, account.target, echo(1)))(), "NonceBelowMinimum");
  });
});

describe("Ledger v2: the guard for FOGA cells (an optional module, tested against a mock of the account's views)", () => {
  async function cellFixture() {
    const [, ownerKey, delegate, relayer] = await ethers.getSigners();
    const d = await t.deploy({ start: false });
    const cell = await deployed("MockFogaCell", ownerKey.address);
    const guard = await deployed("FogaCellGuard");
    const registry = await deployed("MockAidRegistry");
    await d.policy.setAdmission(cell.target, true);
    await d.policy.declareOperator(cell.target, 7);
    await d.policy.bindGuard(cell.target, guard.target);
    await h.setTime(d.genesisTime);
    return { d, cell, guard, registry, ownerKey, delegate, relayer, bound: { guard: guard.target, guardBindingVersion: 1 } };
  }

  it("allows both operations only for a cell of its revision with complete bindings, a satisfied verdict and, where a registry is named, an active anchor", async () => {
    const { cell, guard, registry } = await cellFixture();
    const allows = (operation = 1) => guard.allows(cell.target, operation);
    const fails = async (operation = 1) => { try { await allows(operation); } catch { return true; } return false; };

    expect([await allows(1), await allows(2)]).to.deep.equal([true, true]);
    expect([await allows(0), await allows(3), await allows(4)]).to.deep.equal([false, false, false]);

    // fewer or more bindings presented than the requirement has clauses
    for (const n of [0, 2]) { await cell.setBindingCount(n); expect(await allows(), `${n} bindings`).to.equal(false); }
    await cell.setBindingCount(3); await cell.setClauseCount(3);
    expect(await allows()).to.equal(true);
    await cell.setBindingCount(1); await cell.setClauseCount(1);

    // the registry's verdict: unknown, satisfied, not satisfied
    for (const [verdict, want] of [[0, false], [2, false], [1, true]]) { await cell.setVerdict(verdict); expect(await allows(), `verdict ${verdict}`).to.equal(want); }

    // a named AID registry: dormant, active, stale, retired
    await cell.setAid(registry.target);
    for (const [state, want] of [[0, false], [1, true], [2, false], [3, false]]) {
      await registry.setState(cell.target, state);
      expect([await allows(1), await allows(2)], `anchor state ${state}`).to.deep.equal([want, want]);
    }
    // a named registry that fails, or is not there, is not an answer
    await registry.setState(cell.target, 1);
    await registry.setFails(true);
    expect(await fails()).to.equal(true);
    await cell.setAid(ethers.Wallet.createRandom().address);
    expect(await fails()).to.equal(true);
    await cell.setAid(ZERO);
    expect(await allows()).to.equal(true);

    // a view of the account that fails; another revision of the account; an address that is no cell
    await cell.setStatusFails(true);
    expect(await fails()).to.equal(true);
    await cell.setStatusFails(false);
    await cell.setRevision(2);
    expect(await allows()).to.equal(false);
    await cell.setRevision(3);
    let refused = false;
    try { await guard.allows(ethers.Wallet.createRandom().address, 1); } catch { refused = true; }
    expect(refused).to.equal(true);
    expect(await guard.ACCOUNT_REVISION()).to.equal(3n);
  });

  it("stops a delegated entry that the owner's signature alone would let through, and stops no way of ending a permit", async () => {
    const { d, cell, registry, ownerKey, delegate, relayer, bound } = await cellFixture();
    const p = await t.signed(d, ownerKey, cell.target, { delegate: delegate.address, ...bound });
    const call = async (jobIndex) => (await t.delegatedCall(d, delegate, p, cell.target, echo(jobIndex)))();
    await (await call(0)).wait();
    expect((await t.lastReceipt(d)).receipt.worker).to.equal(cell.target);

    // the safety verdict turns: the owner's signature is as valid as before, and the entry is refused
    await cell.setVerdict(2);
    expect(await cell.isValidSignature(p.digest, p.signature)).to.equal(MAGIC);
    expect(await t.refuses(call(1), "GuardRefused")).to.deep.equal([bound.guard]);
    await cell.setVerdict(1);
    // the anchor leaves ACTIVE; the registry stops answering
    await cell.setAid(registry.target);
    await registry.setState(cell.target, 2);
    await t.refuses(call(1), "GuardRefused");
    await registry.setState(cell.target, 1);
    await registry.setFails(true);
    await t.refuses(call(1), "GuardRefused");
    // G1 through the same guard: the confirmation of a tender the cell owns
    const [, , , , worker, minter] = await ethers.getSigners();
    await d.policy.setAdmission(worker.address, true);
    const tender = await h.tender(d, { owner: minter, worker });
    await (await d.taskToken.connect(minter).transferFrom(minter.address, cell.target, tender.tokenId)).wait();
    await t.refuses(d.adapter.connect(delegate).confirmFor(p.tuple, p.signature, tender.tokenId, tender.submissionId), "GuardRefused");

    // while it is refused, a statement of the owner still ends the permit
    const revoke = await t.signedStatement(d, ownerKey, "Revoke", { account: cell.target, permitDigest: p.digest });
    await (await d.ledger.connect(relayer).revokePermitBySig(cell.target, p.digest, revoke.signature)).wait();
    await registry.setFails(false);
    await t.refuses(call(1), "PermitRevoked");
    // and a permit that was not ended is usable again once every condition holds
    const next = await t.signed(d, ownerKey, cell.target, { delegate: delegate.address, nonce: 2, ...bound });
    await (await (await t.delegatedCall(d, delegate, next, cell.target, echo(1)))()).wait();
    await (await d.adapter.connect(delegate).confirmFor(next.tuple, next.signature, tender.tokenId, tender.submissionId)).wait();
    const confirmed = await t.lastReceipt(d);
    expect([confirmed.receipt.counterparty, confirmed.receipt.sender, confirmed.receipt.authorization]).to.deep.equal([cell.target, delegate.address, next.digest]);
  });
});
