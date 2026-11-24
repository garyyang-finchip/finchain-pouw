"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, v2, permit, PROFILE, key, ZERO } = t;

const root = path.join(__dirname, "..");
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "vectors", "permit-v2.json"), "utf8"));
const ONE = `0x${"0".repeat(63)}1`; // the test key of the vectors: the number one
const coder = ethers.AbiCoder.defaultAbiCoder();
const text = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

/// The digest of a vector with every encoding written out: no typed-data library.
function byHand(v) {
  const fields = {
    Permit: [["address", "address", "uint32", "uint64", "uint64", "uint64", "address", "uint64"],
      (m) => [m.account, m.delegate, m.scope, m.notBeforeEpoch, m.notAfterEpoch, m.nonce, m.guard, m.guardBindingVersion]],
    Revoke: [["address", "bytes32"], (m) => [m.account, m.permitDigest]],
    RaiseNonce: [["address", "uint64"], (m) => [m.account, m.minNonce]],
  }[v.kind];
  const typeHash = text(vectors.types[v.kind]);
  const structHash = ethers.keccak256(coder.encode(["bytes32", ...fields[0]], [typeHash, ...fields[1](v.message)]));
  const domainSeparator = ethers.keccak256(coder.encode(["bytes32", "bytes32", "bytes32", "uint256", "address"],
    [text(vectors.types.domain), text(vectors.domain.name), text(vectors.domain.version), v.chainId, v.ledger]));
  return { typeHash, structHash, domainSeparator, digest: ethers.keccak256(ethers.concat(["0x1901", domainSeparator, structHash])) };
}

describe("Ledger v2: the three signed statements", () => {
  it("have fixed vectors on which the typed-data encoder, the encodings written out by hand and the contract agree", async () => {
    const d = await t.deploy();
    // the ledger's own code at the address the vectors name, so that the contract answers for that address
    const FIXED = "0x1111111111111111111111111111111111111111";
    await ethers.provider.send("hardhat_setCode", [FIXED, await ethers.provider.getCode(d.ledgerAddress)]);
    const fixed = d.ledger.attach(FIXED);
    const wallet = new ethers.Wallet(ONE);
    expect(wallet.address).to.equal(vectors.signer);
    expect(vectors.vectors.map((v) => v.kind).sort()).to.deep.equal(["Permit", "Permit", "Permit", "Permit", "RaiseNonce", "Revoke"]);

    for (const v of vectors.vectors) {
      const st = permit.statement(v.kind, v.chainId, v.ledger, v.message);
      const hand = byHand(v);
      for (const k of ["typeHash", "structHash", "domainSeparator", "digest"]) expect(hand[k], `${v.name}: ${k} by hand`).to.equal(v[k]);
      expect(permit.digestOf(st), `${v.name}: the typed-data encoder`).to.equal(v.digest);
      expect(ethers.recoverAddress(v.digest, v.signature), `${v.name}: signer`).to.equal(vectors.signer);
      expect(await permit.sign(wallet, st), `${v.name}: signature`).to.equal(v.signature);
      if (v.chainId !== "31337" || v.ledger !== FIXED) continue;
      expect(await fixed.domainSeparator(), `${v.name}: the contract's domain`).to.equal(v.domainSeparator);
      const onChain = v.kind === "Permit" ? await fixed.permitDigest(permit.permitTuple(st))
        : v.kind === "Revoke" ? await fixed.revokeDigest(v.message.account, v.message.permitDigest)
          : await fixed.raiseNonceDigest(v.message.account, v.message.minNonce);
      expect(onChain, `${v.name}: the contract's digest`).to.equal(v.digest);
    }
    // the same statement on another chain, or against another ledger, has another digest
    const [first, , , , otherChain, otherLedger] = vectors.vectors;
    expect(new Set([first.digest, otherChain.digest, otherLedger.digest]).size).to.equal(3);
    // the type hashes the contract was built with are those of the vectors
    expect(await d.ledger.PERMIT_TYPEHASH()).to.equal(text(vectors.types.Permit));
    expect(await d.ledger.REVOKE_TYPEHASH()).to.equal(text(vectors.types.Revoke));
    expect(await d.ledger.RAISE_NONCE_TYPEHASH()).to.equal(text(vectors.types.RaiseNonce));
    expect(await d.ledger.EIP712_DOMAIN_TYPEHASH()).to.equal(text(vectors.types.domain));
  });

  it("are signed by a script that reads a key file, prints public material only and opens no connection", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-sign-"));
    const keyFile = path.join(dir, "test.key");
    fs.writeFileSync(keyFile, `${ONE}\n`, { mode: 0o600 });
    const run = (args) => execFileSync(process.execPath, [path.join(root, "scripts", "sign-permit.js"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const flags = {
      Permit: (m) => ["permit", "--account", m.account, "--delegate", m.delegate, "--scope", m.scope, "--not-before-epoch", m.notBeforeEpoch,
        "--not-after-epoch", m.notAfterEpoch, "--nonce", m.nonce, ...(m.guard === ZERO ? [] : ["--guard", m.guard, "--guard-binding-version", m.guardBindingVersion])],
      Revoke: (m) => ["revoke", "--account", m.account, "--permit-digest", m.permitDigest],
      RaiseNonce: (m) => ["raise-nonce", "--account", m.account, "--min-nonce", m.minNonce],
    };
    try {
      for (const v of vectors.vectors) {
        const common = [...flags[v.kind](v.message), "--chain-id", v.chainId, "--ledger", v.ledger, "--json"];
        const signedRecord = JSON.parse(run([...common, "--key-file", keyFile]));
        expect(signedRecord.digest, v.name).to.equal(v.digest);
        expect(signedRecord.signature, v.name).to.equal(v.signature);
        expect(signedRecord.signer).to.equal(vectors.signer);
        expect(signedRecord.typedData.primaryType).to.equal(v.kind);
        // without a key: the statement and its digest, for review, and no signature
        const unsigned = JSON.parse(run(common));
        expect(unsigned.digest).to.equal(v.digest);
        expect(unsigned.signature).to.equal(null);
        // the key itself is in nothing the script prints
        expect(JSON.stringify(signedRecord).includes(ONE.slice(2))).to.equal(false);
      }
      // the readable form names what is being signed
      const first = vectors.vectors[0];
      const readable = run([...flags.Permit(first.message), "--chain-id", first.chainId, "--ledger", first.ledger]);
      expect(readable).to.contain("submit-g0, confirm-tender");
      expect(readable).to.contain(first.digest);
      expect(readable).to.contain("not signed");
      // a key file that others can read is refused; so are a field of another statement and a missing field
      const refused = (args, why) => {
        let message = null;
        try { run(args); } catch (e) { message = String(e.stderr); }
        expect(message, why).to.be.a("string");
        return message;
      };
      if (process.platform !== "win32") {
        fs.chmodSync(keyFile, 0o644);
        expect(refused([...flags.Permit(first.message), "--chain-id", "1", "--ledger", first.ledger, "--key-file", keyFile], "an open key file")).to.contain("can be read by others");
        fs.chmodSync(keyFile, 0o600);
      }
      expect(refused(["revoke", "--account", first.message.account, "--permit-digest", first.digest, "--nonce", "1", "--chain-id", "1", "--ledger", first.ledger], "a foreign field")).to.contain("--nonce is not a field");
      expect(refused(["permit", "--account", first.message.account, "--chain-id", "1", "--ledger", first.ledger], "a missing field")).to.contain("is required");
      expect(refused([...flags.Permit({ ...first.message, scope: "4" }), "--chain-id", "1", "--ledger", first.ledger], "an unknown scope bit")).to.contain("scope 4");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    // neither the script nor the encoding library can reach a network or takes a key from elsewhere
    for (const file of ["scripts/sign-permit.js", "client/lib/permit.js"]) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(/JsonRpcProvider|WebSocketProvider|getDefaultProvider|fetch\(|require\("(http|https|net|tls|dgram|dns)"\)/.test(source), `${file} can reach a network`).to.equal(false);
      expect(/process\.env/.test(source), `${file} reads the environment`).to.equal(false);
    }
  });
});

describe("Ledger v2: a permit is checked at each use", () => {
  it("is bound to its chain and its ledger: used elsewhere, the signature does not verify (L1)", async () => {
    const [, w, delegate] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const other = await t.deploy({ admit: [w] });
    expect(other.ledgerAddress).to.not.equal(d.ledgerAddress);

    // the same fields signed for another chain id
    const wrongChain = await t.signed(d, w, w.address, { delegate: delegate.address }, { chainId: 1n });
    await t.refuses((await t.delegatedCall(d, delegate, wrongChain, w.address))(), "BadSignature");
    // signed for another deployment of the ledger: refused here, good there
    const elsewhere = await t.signed(other, w, w.address, { delegate: delegate.address });
    await t.refuses((await t.delegatedCall(d, delegate, elsewhere, w.address))(), "BadSignature");
    const there = await t.submitDelegated(other, delegate, elsewhere, w.address);
    expect(there.receipt.worker).to.equal(w.address);
    // signed for this chain and this ledger
    const here = await t.signed(d, w, w.address, { delegate: delegate.address });
    expect(here.digest).to.not.equal(elsewhere.digest);
    expect(here.digest).to.not.equal(wrongChain.digest);
    expect((await t.submitDelegated(d, delegate, here, w.address)).status.gmuSubsidized).to.equal(10n);
  });

  it("names its account inside the signed message: a permit of one account is not a permit of another of the same owner (L2)", async () => {
    const [, ownerKey, delegate] = await ethers.getSigners();
    const d = await t.deploy({ start: false });
    const Account = await ethers.getContractFactory("OwnerOnlyAccount");
    const x = await Account.deploy(ownerKey.address);
    const y = await Account.deploy(ownerKey.address);
    const guard = await (await ethers.getContractFactory("SwitchGuard")).deploy();
    for (const a of [x, y]) {
      await d.policy.setAdmission(a.target, true);
      await d.policy.declareOperator(a.target, 7);
      await d.policy.bindGuard(a.target, guard.target);
    }
    await h.setTime(d.genesisTime);

    const forX = await t.signed(d, ownerKey, x.target, { delegate: delegate.address, guard: guard.target, guardBindingVersion: 1 });
    // the same signature with the account field changed to the owner's other account
    const asY = { ...forX, tuple: [y.target, ...forX.tuple.slice(1)] };
    await t.refuses((await t.delegatedCall(d, delegate, asY, y.target))(), "BadSignature");
    // and the permit as it was signed records for X, never for Y
    const done = await t.submitDelegated(d, delegate, forX, x.target);
    expect(done.receipt.worker).to.equal(x.target);
    expect(await d.ledger.measuredOf(0, 0, y.target)).to.equal(0n);
  });

  it("can be used by its delegate only, and no caller can state another sender (L3)", async () => {
    const [, w, delegate, stranger, worker] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w, worker] });
    const p = await t.signed(d, w, w.address, { delegate: delegate.address });
    const args = await t.refuses((await t.delegatedCall(d, stranger, p, w.address))(), "NotDelegate");
    expect(args[0]).to.equal(stranger.address);
    expect(args[1]).to.equal(delegate.address);
    // the participant itself is not the delegate of its own permit either: it has the direct entry
    await t.refuses((await t.delegatedCall(d, w, p, w.address))(), "NotDelegate");

    // G1: the adapter reads its own caller
    const tender = await h.tender(d, { owner: w, worker });
    await t.refuses(d.adapter.connect(stranger).confirmFor(p.tuple, p.signature, tender.tokenId, tender.submissionId), "NotDelegate");
    await (await d.adapter.connect(delegate).confirmFor(p.tuple, p.signature, tender.tokenId, tender.submissionId)).wait();
    expect((await t.lastReceipt(d)).receipt.sender).to.equal(delegate.address);

    // neither delegated entry has a parameter in which a sender could be stated
    const inputs = (abi, name) => abi.find((f) => f.type === "function" && f.name === name).inputs.map((i) => i.name);
    expect(inputs(v2.abi.ledger, "submitG0For")).to.deep.equal(["p", "signature", "profileKey", "epoch", "jobIndex", "outputHash"]);
    expect(inputs(v2.abi.adapter, "confirmFor")).to.deep.equal(["permit", "signature", "tokenId", "submissionId"]);
    expect(inputs(v2.abi.adapter, "confirm")).to.deep.equal(["tokenId", "submissionId"]);
  });

  it("covers the operations in its scope and no other, and is invalid with a bit this version does not know (L4)", async () => {
    const [, w, delegate, worker] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w, worker] });
    const sign = async (scope) => {
      // the library refuses to build a statement with an unknown bit; the contract must refuse one all the same
      const st = { kind: "Permit", domain: permit.domainOf(d.chainId, d.ledgerAddress), types: { Permit: permit.TYPES.Permit },
        message: { account: w.address, delegate: delegate.address, scope: BigInt(scope), notBeforeEpoch: 0n, notAfterEpoch: 100n, nonce: 1n, guard: ZERO, guardBindingVersion: 0n } };
      return { st, tuple: permit.permitTuple(st), digest: permit.digestOf(st), signature: await permit.sign(w, st) };
    };
    const tender = await h.tender(d, { owner: w, worker });

    const confirmOnly = await sign(2);
    expect(await t.refuses((await t.delegatedCall(d, delegate, confirmOnly, w.address))(), "OutOfScope")).to.deep.equal([2n, 1n]);
    const g0Only = await sign(1);
    await t.refuses(d.adapter.connect(delegate).confirmFor(g0Only.tuple, g0Only.signature, tender.tokenId, tender.submissionId), "OutOfScope");
    for (const scope of [4, 5, 7, 0x80000001]) {
      await t.refuses((await t.delegatedCall(d, delegate, await sign(scope), w.address))(), "UnknownScope");
    }
    await t.refuses((await t.delegatedCall(d, delegate, await sign(0), w.address))(), "OutOfScope");
    expect(() => permit.statement("Permit", 1, d.ledgerAddress, { account: w.address, delegate: delegate.address, scope: 4, notBeforeEpoch: 0, notAfterEpoch: 1, nonce: 0 })).to.throw("scope 4");

    // each scope does what it names
    await t.submitDelegated(d, delegate, g0Only, w.address);
    await (await d.adapter.connect(delegate).confirmFor(confirmOnly.tuple, confirmOnly.signature, tender.tokenId, tender.submissionId)).wait();
    expect(await d.ledger.receiptCount()).to.equal(2n);
    // and the check names an operation: one bit, of those this version has
    await t.refuses(d.ledger.checkPermit(g0Only.tuple, g0Only.signature, delegate.address, 3), "UnknownOperation");
    await t.refuses(d.ledger.checkPermit(g0Only.tuple, g0Only.signature, delegate.address, 4), "UnknownOperation");
  });

  it("is usable from its first epoch to its last, both included (L5)", async () => {
    const [, w, delegate] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const p = await t.signed(d, w, w.address, { delegate: delegate.address, notBeforeEpoch: 1, notAfterEpoch: 2 });
    expect(await t.refuses((await t.delegatedCall(d, delegate, p, w.address))(), "PermitNotYetValid")).to.deep.equal([0n, 1n]);
    await h.toEpoch(d, 1);
    await t.submitDelegated(d, delegate, p, w.address);
    await h.toEpoch(d, 2);
    await t.submitDelegated(d, delegate, p, w.address);
    await h.toEpoch(d, 3);
    expect(await t.refuses((await t.delegatedCall(d, delegate, p, w.address))(), "PermitExpired")).to.deep.equal([3n, 2n]);
    expect(await d.ledger.receiptCount()).to.equal(2n);
  });

  it("ends when the account raises its minimum nonce above it, by a call or by a statement; the minimum never falls (L6)", async () => {
    const [, w, delegate, relayer, w2] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w, w2] });
    const five = await t.signed(d, w, w.address, { delegate: delegate.address, nonce: 5 });
    const six = await t.signed(d, w, w.address, { delegate: delegate.address, nonce: 6 });
    await t.submitDelegated(d, delegate, five, w.address, { profile: PROFILE.ECHO, jobIndex: 0 });

    // by the account's own call
    const rc = await (await d.ledger.connect(w).raiseMinNonce(6)).wait();
    expect(h.eventsOf(rc, d.ledger, "MinNonceRaised")[0].args.path).to.equal(BigInt(v2.PATH.ACCOUNT));
    expect(await t.refuses((await t.delegatedCall(d, delegate, five, w.address, { profile: PROFILE.ECHO, jobIndex: 1 }))(), "NonceBelowMinimum")).to.deep.equal([5n, 6n]);
    // a nonce at the minimum is not below it
    await t.submitDelegated(d, delegate, six, w.address, { profile: PROFILE.ECHO, jobIndex: 1 });

    // a lower value, or the same, changes nothing
    for (const n of [3, 6]) expect(h.eventsOf(await (await d.ledger.connect(w).raiseMinNonce(n)).wait(), d.ledger, "MinNonceRaised").length).to.equal(0);
    expect(await d.ledger.minNonce(w.address)).to.equal(6n);

    // by a statement that anyone relays
    const statement = await t.signedStatement(d, w, "RaiseNonce", { account: w.address, minNonce: 9 });
    const relayed = await (await d.ledger.connect(relayer).raiseMinNonceBySig(w.address, 9, statement.signature)).wait();
    const ev = h.eventsOf(relayed, d.ledger, "MinNonceRaised")[0].args;
    expect([ev.account, ev.minNonce, ev.path, ev.by]).to.deep.equal([w.address, 9n, BigInt(v2.PATH.STATEMENT), relayer.address]);
    await t.refuses((await t.delegatedCall(d, delegate, six, w.address))(), "NonceBelowMinimum");
    // replayed, the statement changes nothing; a statement for a lower value does not lower the minimum
    expect(h.eventsOf(await (await d.ledger.connect(relayer).raiseMinNonceBySig(w.address, 9, statement.signature)).wait(), d.ledger, "MinNonceRaised").length).to.equal(0);
    const lower = await t.signedStatement(d, w, "RaiseNonce", { account: w.address, minNonce: 2 });
    await (await d.ledger.connect(relayer).raiseMinNonceBySig(w.address, 2, lower.signature)).wait();
    expect(await d.ledger.minNonce(w.address)).to.equal(9n);
    // the statement is the account's alone: it does not move another account's minimum, and another value is not what was signed
    await t.refuses(d.ledger.connect(relayer).raiseMinNonceBySig(w2.address, 9, statement.signature), "BadSignature");
    await t.refuses(d.ledger.connect(relayer).raiseMinNonceBySig(w.address, 10, statement.signature), "BadSignature");
    expect(await d.ledger.minNonce(w2.address)).to.equal(0n);
  });

  it("ends for good when the account revokes it, by a call or by a statement, or when the delegate gives it up (L7)", async () => {
    const [, w, delegate, relayer] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const permits = [];
    for (const nonce of [1, 2, 3]) permits.push(await t.signed(d, w, w.address, { delegate: delegate.address, nonce }));
    const [byCall, byStatement, givenUp] = permits;
    for (const p of permits) expect(await d.ledger.checkPermit(p.tuple, p.signature, delegate.address, 1)).to.equal(p.digest);

    const first = await (await d.ledger.connect(w).revokePermit(byCall.digest)).wait();
    expect(h.eventsOf(first, d.ledger, "PermitEnded")[0].args.path).to.equal(BigInt(v2.PATH.ACCOUNT));

    const statement = await t.signedStatement(d, w, "Revoke", { account: w.address, permitDigest: byStatement.digest });
    const second = await (await d.ledger.connect(relayer).revokePermitBySig(w.address, byStatement.digest, statement.signature)).wait();
    const ev = h.eventsOf(second, d.ledger, "PermitEnded")[0].args;
    expect([ev.account, ev.digest, ev.path, ev.by]).to.deep.equal([w.address, byStatement.digest, BigInt(v2.PATH.STATEMENT), relayer.address]);

    const third = await (await d.ledger.connect(delegate).renounce(givenUp.tuple)).wait();
    expect(h.eventsOf(third, d.ledger, "PermitEnded")[0].args.path).to.equal(BigInt(v2.PATH.DELEGATE));

    for (const p of permits) {
      expect(await d.ledger.isRevoked(w.address, p.digest)).to.equal(true);
      // presented again, with the signature that was valid: refused, and there is nothing to register again
      expect(await t.refuses((await t.delegatedCall(d, delegate, p, w.address))(), "PermitRevoked")).to.deep.equal([w.address, p.digest]);
    }
    // each of the three done again changes nothing
    expect(h.eventsOf(await (await d.ledger.connect(w).revokePermit(byCall.digest)).wait(), d.ledger, "PermitEnded").length).to.equal(0);
    expect(h.eventsOf(await (await d.ledger.connect(relayer).revokePermitBySig(w.address, byStatement.digest, statement.signature)).wait(), d.ledger, "PermitEnded").length).to.equal(0);
    expect(h.eventsOf(await (await d.ledger.connect(delegate).renounce(givenUp.tuple)).wait(), d.ledger, "PermitEnded").length).to.equal(0);
    // a permit that was not ended still works
    const fresh = await t.signed(d, w, w.address, { delegate: delegate.address, nonce: 4 });
    await t.submitDelegated(d, delegate, fresh, w.address);
  });

  it("can be ended by its own account and its own delegate only, and a signature of one type is not one of another (L8)", async () => {
    const [, x, y, delegate, stranger] = await ethers.getSigners();
    const d = await t.deploy({ admit: [x, y] });
    const ofY = await t.signed(d, y, y.address, { delegate: delegate.address });

    // X marks the digest of Y's permit: the mark is X's own and does not touch Y
    await (await d.ledger.connect(x).revokePermit(ofY.digest)).wait();
    expect(await d.ledger.isRevoked(x.address, ofY.digest)).to.equal(true);
    expect(await d.ledger.isRevoked(y.address, ofY.digest)).to.equal(false);
    // X's statement about Y's permit is not Y's statement
    const forged = await t.signedStatement(d, x, "Revoke", { account: y.address, permitDigest: ofY.digest });
    await t.refuses(d.ledger.connect(stranger).revokePermitBySig(y.address, ofY.digest, forged.signature), "BadSignature");
    // a key that is not the delegate cannot give the permit up - not even the account, which has its own ways
    await t.refuses(d.ledger.connect(stranger).renounce(ofY.tuple), "NotDelegate");
    await t.refuses(d.ledger.connect(y).renounce(ofY.tuple), "NotDelegate");
    // the permit's own signature is not a revocation of it, and a revocation is not a raising of the nonce
    await t.refuses(d.ledger.connect(stranger).revokePermitBySig(y.address, ofY.digest, ofY.signature), "BadSignature");
    const revoke = await t.signedStatement(d, y, "Revoke", { account: y.address, permitDigest: ethers.zeroPadValue("0x05", 32) });
    await t.refuses(d.ledger.connect(stranger).raiseMinNonceBySig(y.address, 5, revoke.signature), "BadSignature");
    expect(await d.ledger.minNonce(y.address)).to.equal(0n);

    await t.submitDelegated(d, delegate, ofY, y.address);
    expect((await t.lastReceipt(d)).receipt.worker).to.equal(y.address);
  });

  it("needs the account's own signature over the typed digest, in the one accepted form (L11)", async () => {
    const [, w, delegate, other] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const good = await t.signed(d, w, w.address, { delegate: delegate.address });
    const call = async (signature) => (await t.delegatedCall(d, delegate, good, w.address, { signature }))();

    // another key's signature over the same statement
    await t.refuses(call((await t.signed(d, other, w.address, { delegate: delegate.address })).signature), "BadSignature");
    // the account's signature over the digest as a personal message
    await t.refuses(call(await w.signMessage(ethers.getBytes(good.digest))), "BadSignature");
    // the same signature in its other form (the upper half of the curve order), and malformed ones
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const sig = ethers.Signature.from(good.signature);
    const flipped = ethers.concat([sig.r, ethers.toBeHex(N - BigInt(sig.s), 32), sig.v === 27 ? "0x1c" : "0x1b"]);
    // the chain's own recovery takes the flipped form for a signature of the same key: only the ledger's rule refuses it
    const recovered = await ethers.provider.call({ to: ethers.zeroPadValue("0x01", 20),
      data: ethers.concat([good.digest, ethers.zeroPadValue(sig.v === 27 ? "0x1c" : "0x1b", 32), sig.r, ethers.toBeHex(N - BigInt(sig.s), 32)]) });
    expect(ethers.getAddress(ethers.dataSlice(recovered, 12))).to.equal(w.address);
    await t.refuses(call(flipped), "BadSignature");
    await t.refuses(call(ethers.dataSlice(good.signature, 0, 64)), "BadSignature");
    await t.refuses(call(ethers.concat([good.signature, "0x00"])), "BadSignature");
    await t.refuses(call(ethers.concat([ethers.dataSlice(good.signature, 0, 64), "0x00"])), "BadSignature");
    await t.refuses(call("0x"), "BadSignature");

    await (await call(good.signature)).wait();
    expect(await d.ledger.receiptCount()).to.equal(1n);
  });

  it("is refused when the account's signature check misbehaves, and the check cannot take the call with it (L12)", async () => {
    const [, delegate] = await ethers.getSigners();
    const d = await t.deploy({ start: false });
    const odd = await (await ethers.getContractFactory("OddSignatureAccount")).deploy();
    const guard = await (await ethers.getContractFactory("SwitchGuard")).deploy();
    await d.policy.setAdmission(odd.target, true);
    await d.policy.declareOperator(odd.target, 9);
    await d.policy.bindGuard(odd.target, guard.target);
    await h.setTime(d.genesisTime);
    // nobody's signature: the account decides, and its decision is what is tested
    const p = await t.signed(d, delegate, odd.target, { delegate: delegate.address, guard: guard.target, guardBindingVersion: 1 });
    const gasLimit = 1_000_000n;

    // reverts; returns nothing; returns four bytes; never returns; a stray bit; a hundred thousand bytes
    for (const mode of [0, 1, 2, 3, 4, 5]) {
      await (await odd.setMode(mode)).wait();
      // within a fixed gas limit the answer is the ledger's own refusal, not an exhausted call: the
      // account is given a bounded amount of gas and at most one word of its answer is read
      await t.refuses(d.ledger.checkPermit.staticCall(p.tuple, p.signature, delegate.address, 1, { gasLimit }), "BadSignature");
      await t.refuses(d.ledger.connect(delegate).revokePermitBySig.staticCall(odd.target, p.digest, p.signature, { gasLimit }), "BadSignature");
    }
    expect(await d.ledger.SIGNATURE_GAS()).to.equal(200_000n);
    // an account that never returns is given that much gas and no more, whatever the transaction brought
    await (await odd.setMode(3)).wait();
    const used = await t.gasOfRefused(() => d.ledger.connect(delegate).revokePermitBySig(odd.target, p.digest, p.signature, { gasLimit: 5_000_000n }));
    expect(used > 200_000n && used < 300_000n, `a refused check used ${used} gas`).to.equal(true);
    // the same account answering properly is accepted
    await (await odd.setMode(6)).wait();
    expect(await d.ledger.checkPermit(p.tuple, p.signature, delegate.address, 1)).to.equal(p.digest);
    expect((await t.submitDelegated(d, delegate, p, odd.target)).receipt.worker).to.equal(odd.target);
  });

  it("names no guard when its account has no code, and is refused if it names one (L16)", async () => {
    const [, w, delegate] = await ethers.getSigners();
    const d = await t.deploy({ start: false, admit: [w] });
    const guard = await (await ethers.getContractFactory("SwitchGuard")).deploy();
    // even a binding that the steward made for the address changes nothing: a key has no gate to go around
    await d.policy.bindGuard(w.address, guard.target);
    await h.setTime(d.genesisTime);

    for (const fields of [{ guard: guard.target, guardBindingVersion: 1 }, { guard: guard.target }, { guardBindingVersion: 1 }]) {
      const named = await t.signed(d, w, w.address, { delegate: delegate.address, ...fields });
      expect(await t.refuses((await t.delegatedCall(d, delegate, named, w.address))(), "GuardMismatch")).to.deep.equal([ZERO, 0n]);
    }
    const plain = await t.signed(d, w, w.address, { delegate: delegate.address });
    expect((await t.submitDelegated(d, delegate, plain, w.address)).receipt.authorization).to.equal(plain.digest);
  });

  it("gives a delegate two functions and nothing else: it cannot act as the account or authorize a further key (L17)", async () => {
    const [, w, delegate, second] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    // what takes a permit at all, by the compiled interfaces
    const taking = (abi) => abi.filter((f) => f.type === "function" && f.inputs.some((i) => i.internalType === "struct Permit")).map((f) => f.name).sort();
    expect(taking(v2.abi.ledger)).to.deep.equal(["checkPermit", "permitDigest", "renounce", "submitG0For"]);
    expect(taking(v2.abi.adapter)).to.deep.equal(["confirmFor"]);
    expect(taking(v2.abi.policy)).to.deep.equal([]);
    // of those, the ones that record anything in the account's name
    const stateChanging = (abi, names) => names.filter((n) => !["view", "pure"].includes(abi.find((f) => f.name === n).stateMutability));
    expect(stateChanging(v2.abi.ledger, taking(v2.abi.ledger))).to.deep.equal(["renounce", "submitG0For"]);
    // no function of the three contracts takes a target and call data, or any free bytes besides a signature
    for (const abi of [v2.abi.ledger, v2.abi.adapter, v2.abi.policy]) {
      for (const f of abi.filter((x) => x.type === "function")) {
        for (const i of f.inputs) if (i.type === "bytes") expect(i.name, `${f.name} takes bytes`).to.equal("signature");
        expect(f.stateMutability, `${f.name} takes value`).to.not.equal("payable");
      }
    }

    // the delegate signs, as if it were the account, a permit that names a second key
    const sub = await t.signed(d, delegate, w.address, { delegate: second.address, nonce: 2 });
    await t.refuses((await t.delegatedCall(d, second, sub, w.address))(), "BadSignature");
    // and its own valid permit moves nothing of the account's: it records, and that is all
    const p = await t.signed(d, w, w.address, { delegate: delegate.address });
    const before = await ethers.provider.getBalance(w.address);
    await t.submitDelegated(d, delegate, p, w.address);
    expect(await ethers.provider.getBalance(w.address)).to.equal(before); // the delegate paid its own gas
    expect(await ethers.provider.getBalance(d.ledgerAddress)).to.equal(0n);
  });
});
