"use strict";

// The read-only probe of contract accounts before a round on ledger v2 (docs/ledger-v2.md 11.7):
// what the cell guard would answer, and the gas of the guard and of the signature check against the
// account as deployed, measured by eth_call alone.

const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h } = t;
const cp = require("../scripts/lib/cellprobe");
const m2 = require("../client/lib/manifest2");

const deployed = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);

describe("Ledger v2: the probe of contract accounts before a round", () => {
  it("reads what the cell guard would answer, and measures the guard and the signature check against the bounds, sending nothing (L51)", async () => {
    const [chain, owner, someone] = await ethers.getSigners();
    const nonce = await ethers.provider.getTransactionCount(chain.address);
    const satisfied = await deployed("MockFogaCell", owner.address);
    const unsatisfied = await deployed("MockFogaCell", owner.address);
    await (await unsatisfied.setVerdict(2)).wait();
    const failing = await deployed("MockFogaCell", owner.address);
    await (await failing.setStatusFails(true)).wait();
    const anchored = await deployed("MockFogaCell", owner.address);
    const registry = await deployed("MockAidRegistry");
    await (await anchored.setAid(registry.target)).wait();
    await (await registry.setState(anchored.target, 2)).wait();
    const before = await ethers.provider.getTransactionCount(chain.address);

    const record = await cp.probe(ethers.provider, [
      { name: "satisfied", account: satisfied.target }, { name: "unsatisfied", account: unsatisfied.target },
      { name: "registry down", account: failing.target }, { name: "stale anchor", account: anchored.target }, { name: "a key", account: someone.address },
    ], { blockTag: "latest" });
    expect(await ethers.provider.getTransactionCount(chain.address)).to.equal(before);
    expect(before - nonce).to.equal(9);
    const by = Object.fromEntries(record.parties.map((p) => [p.name, p]));

    expect([by.satisfied.reading.allows, by.satisfied.guard.submitG0.allows, by.satisfied.guard.confirmTender.allows]).to.deep.equal([true, true, true]);
    expect(by.unsatisfied.reading.reasons).to.deep.equal(["the registry's verdict is not satisfied"]);
    expect(by["registry down"].reading.reasons).to.deep.equal(["the registry's verdict is unreadable"]);
    expect(by["stale anchor"].reading.reasons).to.deep.equal(["the anchor is stale in its AID registry"]);
    expect(by["a key"].reading.reasons[0]).to.equal("the address has no code");
    for (const name of ["unsatisfied", "registry down", "stale anchor", "a key"]) {
      expect([by[name].reading.allows, by[name].guard.submitG0.allows, by[name].guard.confirmTender.allows], name).to.deep.equal([false, false, false]);
    }
    // the guard and the reading of the views agree for every account
    expect(record.parties.every((p) => p.readingAgreesWithGuard)).to.equal(true);
    // a guard that reverts has not answered, and says so; one that refuses has answered
    const call = (x) => [x.succeededWithTheBound, x.answerValid, x.failure];
    expect(call(by["registry down"].guard.submitG0)).to.deep.equal([false, false, "reverted"]);
    expect(call(by.unsatisfied.guard.submitG0)).to.deep.equal([true, true, null]);
    expect(call(by["a key"].guard.submitG0)).to.deep.equal([false, false, "reverted"]);
    // the signature check: the stand-in answers that a foreign signature is not its owner's; a key does not answer
    expect([by.satisfied.signature.answerValid, by.satisfied.signature.answer, by.satisfied.signature.acceptedTheForeignSignature]).to.deep.equal([true, "0x00000000", false]);
    expect([by["a key"].signature.succeededWithTheBound, by["a key"].signature.answerValid]).to.deep.equal([true, false]);
    for (const p of record.parties.filter((q) => q.name !== "a key")) {
      expect(p.guard.submitG0.callerGas > 5_000n, p.name).to.equal(true);
      expect([p.signature.callerGas > 3_000n, p.signature.succeededWithTheBound], p.name).to.deep.equal([true, true]);
    }
    // the block: taken once, every read at its number, its hash asked for again at the end
    expect([record.block.asked, record.block.hashRechecked, record.block.hash]).to.deep.equal(["latest", true, (await ethers.provider.getBlock(record.block.number)).hash]);
    expect(record.bounds).to.deep.equal({ guard: 500_000n, signature: 200_000n });
    expect(record.guardBuild.runtimeCodeHash).to.equal(ethers.keccak256(m2.loadBuild("FogaCellGuard").deployedBytecode));

    // the meter measures what a transaction pays for the same call, plus the access of the callee and its setup
    const guard = await deployed("FogaCellGuard");
    const data = guard.interface.encodeFunctionData("allows", [satisfied.target, 1]);
    const rc = await (await someone.sendTransaction({ to: guard.target, data, gasLimit: 1_000_000 })).wait();
    const intrinsic = 21_000n + [...ethers.getBytes(data)].reduce((a, b) => a + (b === 0 ? 4n : 16n), 0n);
    const measured = await cp.metered(ethers.provider, "latest", guard.target, cp.GUARD_GAS, data);
    const over = measured.gasUsed - (rc.gasUsed - intrinsic);
    expect(over >= 2_600n && over <= 2_700n, `the meter reads ${measured.gasUsed}, the transaction's execution ${rc.gasUsed - intrinsic}`).to.equal(true);
    // a call that needs more than its bound runs out inside it, and the meter says so
    const starved = await cp.metered(ethers.provider, "latest", guard.target, 2_000n, data);
    expect([starved.success, starved.gasUsed > 2_000n]).to.deep.equal([false, true]);
  });

  it("reads an account that cannot say which AID registry it names as refused, a call that used all its bound as succeeded, and a block that changed as nothing (L51)", async () => {
    const [, owner] = await ethers.getSigners();
    const cell = await deployed("MockFogaCell", owner.address);
    await (await cell.setAidFails(true)).wait();
    const record = await cp.probe(ethers.provider, [{ name: "aid unreadable", account: cell.target }], { blockTag: "latest" });
    const p = record.parties[0];
    expect([p.reading.aidReadable, p.reading.allows, p.reading.reasons]).to.deep.equal([false, false, [p.reading.reasons[0]]]);
    expect(p.reading.reasons[0]).to.match(/^the AID registry it names could not be read/);
    expect([p.guard.submitG0.allows, p.guard.submitG0.failure, p.readingAgreesWithGuard]).to.deep.equal([false, "reverted", true]);
    await (await cell.setAidFails(false)).wait();
    // a call given its bound that uses nearly all of it and answers: the bound held, whatever the caller's figure
    const burner = await deployed("GasBurner");
    const r = await cp.metered(ethers.provider, "latest", burner.target, cp.GUARD_GAS, burner.interface.encodeFunctionData("read"));
    const c = cp.callOf(r, cp.GUARD_GAS, r.answerBytes === 32);
    expect([r.gasUsed > cp.GUARD_GAS, c.succeededWithTheBound, c.answerValid, c.failure, BigInt(r.word)]).to.deep.equal([true, true, true, null, 1n]);
    // and one given less than it needs: it fails, having used what it was given
    const guard = await deployed("FogaCellGuard");
    const starved = cp.callOf(await cp.metered(ethers.provider, "latest", guard.target, 2_000n, guard.interface.encodeFunctionData("allows", [cell.target, 1])), 2_000n, false);
    expect([starved.succeededWithTheBound, starved.failure]).to.deep.equal([false, "used at least the gas it was given"]);
    // a block replaced after it was taken: the probe reads the replacement, finds the hash changed, and returns nothing
    const snap = await h.network.provider.send("evm_snapshot", []);
    await (await cell.setVerdict(1)).wait();
    let first = true;
    const provider = new Proxy(ethers.provider, { get(target, key) {
      if (key === "getBlock") {
        return async (tag) => {
          const b = await target.getBlock(tag);
          if (first) { first = false; await h.network.provider.send("evm_revert", [snap]); await (await cell.setVerdict(2)).wait(); }
          return b;
        };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    let error = null;
    try { await cp.probe(provider, [{ name: "cell", account: cell.target }], { blockTag: "latest" }); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(t.g.SnapshotMoved);
  });

  it("assembles its meter from the listing, and does not place it where a contract is", async () => {
    // PUSH1 0x34 CALLDATASIZE SUB DUP1 PUSH1 0x34 PUSH1 0x80 CALLDATACOPY GAS PUSH1 0x40 MSTORE PUSH1 0x20 PUSH1 0x20 DUP3
    // PUSH1 0x80 PUSH1 0x00 CALLDATALOAD PUSH1 0x60 SHR PUSH1 0x14 CALLDATALOAD STATICCALL GAS PUSH1 0x40 MLOAD SUB PUSH1 0x40
    // MSTORE PUSH1 0x00 MSTORE POP RETURNDATASIZE PUSH1 0x60 MSTORE PUSH1 0x80 PUSH1 0x00 RETURN
    expect(cp.assemble(cp.METER_PROGRAM)).to.equal(cp.METER_CODE);
    expect(cp.METER_CODE).to.equal("0x603436038060346080375a6040526020602082608060003560601c601435fa5a60405103604052600052503d60605260806000f3");
    const [, owner] = await ethers.getSigners();
    const cell = await deployed("MockFogaCell", owner.address);
    for (const at of [cp.METER_AT, cp.GUARD_AT]) {
      await h.network.provider.send("hardhat_setCode", [at, "0x00"]);
      let error = null;
      try { await cp.probe(ethers.provider, [{ name: "cell", account: cell.target }], { blockTag: "latest" }); } catch (e) { error = e; }
      expect(String(error?.message)).to.contain(`there is code at ${at} on this chain`);
      await h.network.provider.send("hardhat_setCode", [at, "0x"]);
    }
    expect((await cp.probe(ethers.provider, [{ name: "cell", account: cell.target }], { blockTag: "latest" })).parties[0].reading.allows).to.equal(true);
  });
});
