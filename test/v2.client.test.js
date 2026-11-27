"use strict";

// The client for a deployment of ledger v2 (docs/ledger-v2.md 2, 12, 13): the audit job and the
// confirmation of a tender, sent by the participant's own key or by a delegate under a permit that
// scripts/sign-permit.js signed where the participant's key is, with the run record and its label.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync, spawnSync, spawn } = require("child_process");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, g, v2, permit, PROFILE } = t;
const a2 = require("../client/lib/audit2");
const c2 = require("../client/lib/client2");
const canonical = require("../client/lib/canonical");

const root = path.join(__dirname, "..");
const deployed = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);

/// A key file of a key made for the test, funded for gas: the account whose key stays where it is.
function keyOf(dir, name) {
  const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  const file = path.join(dir, `${name}.key`);
  fs.writeFileSync(file, `${wallet.privateKey}\n`, { mode: 0o600 });
  return { wallet, file };
}

/// The record of scripts/sign-permit.js, made by running the script itself with the account's key file.
function signPermit(dir, out, d, keyFile, fields) {
  const args = ["scripts/sign-permit.js", "permit", "--chain-id", String(d.chainId), "--ledger", fields.ledger ?? d.ledgerAddress, "--account", fields.account,
    "--delegate", fields.delegate, "--scope", fields.scope, "--not-before-epoch", "0", "--not-after-epoch", String(fields.notAfterEpoch ?? 100),
    "--nonce", String(fields.nonce ?? 1), ...(fields.guard ? ["--guard", fields.guard, "--guard-binding-version", String(fields.guardBindingVersion)] : []),
    "--key-file", keyFile, "--out", path.join(dir, out)];
  execFileSync(process.execPath, args, { cwd: root, stdio: "pipe" });
  return path.join(dir, out);
}

async function world() {
  const [steward, w1, w2, delegate, other] = await ethers.getSigners();
  const d = await t.deploy({ start: false, admit: [w1, w2] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-client-"));
  const owner = keyOf(dir, "cell-owner");
  const cell = await deployed("MockFogaCell", owner.wallet.address);
  const guard = await deployed("FogaCellGuard");
  await d.policy.setAdmission(cell.target, true);
  await d.policy.declareOperator(cell.target, 7);
  await d.policy.bindGuard(cell.target, guard.target);
  const holder = keyOf(dir, "tender-owner"); // an account without code that owns tenders
  await (await steward.sendTransaction({ to: holder.wallet.address, value: ethers.parseEther("1") })).wait();
  await d.policy.setAdmission(holder.wallet.address, true);
  await d.policy.declareOperator(holder.wallet.address, 8);
  await h.setTime(d.genesisTime);
  const ctx = await a2.connect({ name: "fixture", environment: "local-devnet", labels: ["cell-account-integration"], ledger: d.ledgerAddress,
    policy: d.policy.target, deployBlock: 0, chainId: d.chainId }, ethers.provider, { tag: "latest" });
  return { d, ctx, dir, steward, w1, w2, delegate, other, owner, cell, guard, holder };
}

const refused = async (promise, text) => {
  let error = null;
  try { await promise; } catch (e) { error = e; }
  expect(String(error?.message), text).to.contain(text);
  return error;
};

describe("Ledger v2: the client, directly and through a delegate", () => {
  it("does a cell's audit job through its delegate under the cell's permit, refuses before sending what the ledger would refuse, and records the run (L52)", async () => {
    const w = await world();
    const { d, ctx, dir, delegate } = w;
    try {
      const cellPermit = signPermit(dir, "cell.json", d, w.owner.file,
        { account: w.cell.target, delegate: delegate.address, scope: "submit-g0", guard: w.guard.target, guardBindingVersion: 1 });
      const p = c2.readPermitFile(ctx, cellPermit);
      expect([p.message.account, p.message.delegate, p.signatureKey, p.declaredSigner]).to.deep.equal([w.cell.target, delegate.address, w.owner.wallet.address, w.owner.wallet.address]);

      // refused before anything is sent: nothing reaches the chain from the delegate's key
      const nonce = await ethers.provider.getTransactionCount(delegate.address);
      const count = await d.ledger.receiptCount();
      const write = (name, value) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(value)); return f; };
      const record = JSON.parse(fs.readFileSync(cellPermit, "utf8"));
      await refused(Promise.resolve().then(() => c2.readPermitFile(ctx, write("bare.json", { message: record.typedData.message, signature: record.signature }))),
        "a permit is given as the record that scripts/sign-permit.js writes");
      const elsewhere = signPermit(dir, "elsewhere.json", d, w.owner.file,
        { ledger: w.other.address, account: w.cell.target, delegate: delegate.address, scope: "submit-g0", guard: w.guard.target, guardBindingVersion: 1 });
      await refused(Promise.resolve().then(() => c2.readPermitFile(ctx, elsewhere)), `the permit is for the ledger ${w.other.address} on chain 31337, not for ${d.ledgerAddress}`);
      const unsigned = { ...record, signer: null, signature: null };
      await refused(Promise.resolve().then(() => c2.readPermitFile(ctx, write("unsigned.json", unsigned))), "the record holds no signature");
      const edited = JSON.parse(JSON.stringify(record)); delete edited.typedData.primaryType;
      await refused(Promise.resolve().then(() => c2.readPermitFile(ctx, write("edited.json", edited))), "the record is unusable: no primary type");
      await refused(c2.workG0(ctx, w.w2, { permit: p }), `the sending key ${w.w2.address} is not the permit's delegate ${delegate.address}`);
      const confirmOnly = c2.readPermitFile(ctx, signPermit(dir, "confirm-only.json", d, w.owner.file,
        { account: w.cell.target, delegate: delegate.address, scope: "confirm-tender", nonce: 2, guard: w.guard.target, guardBindingVersion: 1 }));
      await refused(c2.workG0(ctx, delegate, { permit: confirmOnly }), "the permit's scope (confirm-tender) does not include submit-g0");
      // the cell's own gate as the guard reads it: a verdict that is not satisfied
      await (await w.cell.setVerdict(2)).wait();
      await refused(c2.workG0(ctx, delegate, { permit: p }), "the ledger refuses the permit now: GuardRefused");
      await (await w.cell.setVerdict(1)).wait();
      // a permit the account revoked, by a statement its key signed
      const revoked = c2.readPermitFile(ctx, signPermit(dir, "revoked.json", d, w.owner.file,
        { account: w.cell.target, delegate: delegate.address, scope: "submit-g0", nonce: 3, guard: w.guard.target, guardBindingVersion: 1 }));
      const rv = permit.statement("Revoke", d.chainId, d.ledgerAddress, { account: w.cell.target, permitDigest: revoked.digest });
      await (await d.ledger.revokePermitBySig(w.cell.target, revoked.digest, await permit.sign(w.owner.wallet, rv))).wait();
      await refused(c2.workG0(ctx, delegate, { permit: revoked }), "the ledger refuses the permit now: PermitRevoked");
      expect(await ethers.provider.getTransactionCount(delegate.address)).to.equal(nonce);
      expect(await d.ledger.receiptCount()).to.equal(count);

      // sent: the cell is the worker of record, the delegate the sender and the origin, the permit's digest the authorization
      const r = await c2.workG0(ctx, delegate, { permit: p });
      expect([r.receipt.worker, r.receipt.sender, r.origin, r.receipt.authorization]).to.deep.equal([w.cell.target, delegate.address, delegate.address, p.digest]);
      expect([r.status.verdict, r.status.gmuSubsidized, r.work.audited, r.alreadyRecorded]).to.deep.equal([g.VERDICT.ACCEPTED, 10n, null, false]);
      const run = c2.runRecord(ctx, r, { rpc: "https://rpc.example.org/a-secret?k=1", recordedAt: "2026-11-27T00:00:00.000Z" });
      expect([run.schema, run.label, run.participant, run.sender, run.origin, run.permit.digest, run.permit.scope, run.endpointHost])
        .to.deep.equal([c2.RUN_SCHEMA, "delegated-by-owner-permit", w.cell.target, delegate.address, delegate.address, p.digest, ["submit-g0"], "rpc.example.org"]);
      expect(run.permit.recordSha256).to.equal(require("crypto").createHash("sha256").update(fs.readFileSync(cellPermit)).digest("hex"));
      // the run's transactions: the opening of the epoch and the entry, each with its outcome
      expect(run.transactions.map((x) => [x.step, x.from, x.status])).to.deep.equal([["openEpoch", delegate.address, "confirmed"], ["submitG0For", delegate.address, "confirmed"]]);
      expect([run.txHash, run.recordedIn, run.given.sendingKey, run.given.permit.digest]).to.deep.equal([r.txHash, "this run's transaction", delegate.address, p.digest]);
      expect(run.reading.some((x) => x.includes("no evidence that the participant's own software initiated the work"))).to.equal(true);
      expect([canonical.reportHash(run), canonical.resultHash(run)]).to.deep.equal([run.reportHash, run.resultHash]);
      expect(JSON.stringify(run).includes("a-secret")).to.equal(false);
      // run again: found by its contribution id, nothing sent
      const sent = await ethers.provider.getTransactionCount(delegate.address);
      const again = await c2.workG0(ctx, delegate, { permit: p });
      expect([again.alreadyRecorded, again.receiptId, await ethers.provider.getTransactionCount(delegate.address)]).to.deep.equal([true, r.receiptId, sent]);

      // a key for itself: the direct entry, labelled so
      const direct = await c2.workG0(ctx, w.w1);
      const runDirect = c2.runRecord(ctx, direct);
      expect([runDirect.label, runDirect.participant, runDirect.sender, runDirect.permit, direct.receipt.authorization])
        .to.deep.equal(["direct-by-key", w.w1.address, w.w1.address, null, ethers.ZeroHash]);

      // epoch 1: the job recomputes epoch 0 in full, which agrees and is complete, and then submits
      await h.toEpoch(d, 1);
      const next = await c2.workG0(ctx, delegate, { permit: p });
      expect([next.work.audited, next.work.receipts, next.work.complete, next.status.verdict]).to.deep.equal([0n, 2, true, g.VERDICT.ACCEPTED]);
      // a receipt of a module this client does not read: the next epoch's job agrees, is not complete, and sends nothing
      await t.record(d, PROFILE.FREE, t.facts(d, { worker: w.w2, demander: w.w1 }));
      await h.toEpoch(d, 2);
      const before = await ethers.provider.getTransactionCount(delegate.address);
      const incomplete = await refused(c2.workG0(ctx, delegate, { permit: p }), "agrees with the ledger but left 1 receipt(s) undecided");
      expect(incomplete).to.be.instanceOf(c2.AuditIncomplete);
      expect([incomplete.report.agrees, incomplete.report.complete]).to.deep.equal([true, false]);
      expect(await ethers.provider.getTransactionCount(delegate.address)).to.equal(before);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("confirms a tender through the owner's delegate under the owner's permit, and refuses before sending what would be refused (L53)", async () => {
    const w = await world();
    const { d, ctx, dir, delegate, holder } = w;
    try {
      const ownerPermit = c2.readPermitFile(ctx, signPermit(dir, "owner.json", d, holder.file,
        { account: holder.wallet.address, delegate: delegate.address, scope: "confirm-tender" }));
      const settled = await h.tender(d, { owner: holder.wallet, worker: w.w2 });
      const nonce = await ethers.provider.getTransactionCount(delegate.address);
      const count = await d.ledger.receiptCount();
      const ofW1 = await h.tender(d, { owner: w.w1, worker: w.w2 });
      await refused(c2.confirmTender(ctx, delegate, { ...ofW1, permit: ownerPermit }), `the tender ${ofW1.tokenId} is owned by ${w.w1.address}, not by ${holder.wallet.address}`);
      const g0Only = c2.readPermitFile(ctx, signPermit(dir, "g0-only.json", d, holder.file,
        { account: holder.wallet.address, delegate: delegate.address, scope: "submit-g0", nonce: 2 }));
      await refused(c2.confirmTender(ctx, delegate, { ...settled, permit: g0Only }), "the permit's scope (submit-g0) does not include confirm-tender");
      await refused(c2.confirmTender(ctx, w.w2, { ...settled, permit: ownerPermit }), "is not the permit's delegate");
      const open = await h.tender(d, { owner: holder.wallet, worker: w.w2, settle: false });
      await refused(c2.confirmTender(ctx, delegate, { ...open, permit: ownerPermit }), "confirmFor would be refused: NotSettled");
      expect([await ethers.provider.getTransactionCount(delegate.address), await d.ledger.receiptCount()]).to.deep.equal([nonce, count]);

      const r = await c2.confirmTender(ctx, delegate, { ...settled, permit: ownerPermit });
      expect([r.receipt.counterparty, r.receipt.worker, r.receipt.sender, r.receipt.authorization, r.origin])
        .to.deep.equal([holder.wallet.address, w.w2.address, delegate.address, ownerPermit.digest, delegate.address]);
      const run = c2.runRecord(ctx, r);
      expect([run.command, run.label, run.participant, run.tender.tokenId, run.tender.adapter]).to.deep.equal(["bridge", "delegated-by-owner-permit", holder.wallet.address, settled.tokenId.toString(), d.adapter.target]);
      const sent = await ethers.provider.getTransactionCount(delegate.address);
      const again = await c2.confirmTender(ctx, delegate, { ...settled, permit: ownerPermit });
      expect([again.alreadyRecorded, again.receiptId, await ethers.provider.getTransactionCount(delegate.address)]).to.deep.equal([true, r.receiptId, sent]);
      // the owner's key for itself
      const own = await c2.confirmTender(ctx, w.w1, ofW1);
      expect([c2.runRecord(ctx, own).label, own.receipt.counterparty, own.receipt.authorization]).to.deep.equal(["direct-by-key", w.w1.address, ethers.ZeroHash]);
      // and the audit of the epoch reads both permits from the delegates' own transactions
      await h.toEpoch(d, 1);
      const report = await a2.auditEpoch(ctx, 0);
      expect([report.ok, report.entries.delegated, report.entries.byPermitEvidence]).to.deep.equal([true, 1, { [a2.PERMIT_EVIDENCE.IN_TRANSACTION]: 1 }]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses at the command line what a deployment of the other kind does not take, and never writes over a file (L54)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-cli-"));
    try {
      const v2Manifest = path.join(dir, "v2.json");
      fs.writeFileSync(v2Manifest, JSON.stringify({ schema: "finchain-pouw.deployment/2", name: "x", chainId: 31337, contracts: {} }));
      const kernelManifest = path.join(root, "deployments", "finchain-sepolia-r2.json");
      const taken = path.join(dir, "taken.json");
      fs.writeFileSync(taken, "kept\n");
      // an endpoint nobody listens on: each refusal comes before anything is asked of it
      const pouw = (...args) => spawnSync(process.execPath, [path.join(root, "client", "pouw.js"), ...args, "--rpc", "http://127.0.0.1:9"], { encoding: "utf8", timeout: 20000 });
      const a = pouw("work", "--manifest", v2Manifest, "--account", ethers.ZeroAddress);
      expect([a.status, a.stderr.includes("--account is for the kernel")]).to.deep.equal([1, true]);
      const b = pouw("audit", "0", "--manifest", v2Manifest, "--out", taken);
      expect([b.status, b.stderr.includes("exists already: an output of the v2 client is a new file")]).to.deep.equal([1, true]);
      expect(fs.readFileSync(taken, "utf8")).to.equal("kept\n");
      const c = pouw("work", "--manifest", kernelManifest, "--permit", taken);
      expect([c.status, c.stderr.includes("--permit and --permits are for a deployment of ledger v2")]).to.deep.equal([1, true]);
      const e = pouw("status", "--manifest", path.join(root, "package.json"));
      expect([e.status, e.stderr.includes("expected finchain-pouw.deployment/1 or finchain-pouw.deployment/2")]).to.deep.equal([1, true]);
      // the exit status of the audit command: a difference is not the same as what was not read again
      expect([{ ok: true, agrees: true }, { ok: false, agrees: true }, { ok: false, agrees: false }].map(c2.auditExitStatus)).to.deep.equal([0, 5, 2]);
      // the output helpers themselves: a place taken, or refused with the file left as it was
      const fresh = c2.reserveOutput(path.join(dir, "new.json"));
      c2.finishOutput(fresh, "{}\n");
      expect(fs.readFileSync(path.join(dir, "new.json"), "utf8")).to.equal("{}\n");
      expect(() => c2.reserveOutput(taken)).to.throw("exists already");
      expect(fs.readFileSync(taken, "utf8")).to.equal("kept\n");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("checks before the epoch is opened what it can know, does only the function it evaluates, and says what it sent when it stops (L56)", async () => {
    const [, owner, , delegate] = await ethers.getSigners();
    const ready = async (change) => {
      const d = await t.deploy({ start: false, admit: [owner] });
      if (change) await change(d);
      await h.setTime(d.genesisTime);
      const ctx = await a2.connect({ name: "fixture", environment: "local-devnet", ledger: d.ledgerAddress, policy: d.policy.target, deployBlock: 0, chainId: d.chainId }, ethers.provider, { tag: "latest" });
      const s = await t.signed(d, owner, owner.address, { delegate: delegate.address, scope: 1 });
      const p = { file: "inline", sha256: null, digest: s.digest, statement: s.st, message: s.st.message, tuple: s.tuple, signature: s.signature, signatureKey: owner.address, declaredSigner: null };
      return { d, ctx, p };
    };
    // conditions that hold before the run begins: each refused with nothing sent, the epoch left unopened
    const cases = [
      ["paused", (d) => d.policy.setPaused(true), "submitG0For would be refused: Paused()"],
      ["retired", (d) => d.policy.retireProfile(g.profileKey(g.PROFILE_G0_REF), 0), "no g0.ref profile is in force in epoch 0: NoActiveProfile"],
      ["of pool G1", (d) => d.policy.registerProfile(d.spec(g.PROFILE_G0_REF, 1, d.audit.target, 10, 10, 0)), "submitG0For would be refused: WrongPool()"],
      ["another function", (d) => d.policy.registerProfile(d.spec(g.PROFILE_G0_REF, 0, d.echo.target, 10, 10, 1)), "which this client does not evaluate: its function id is"],
    ];
    for (const [what, change, text] of cases) {
      const { d, ctx, p } = await ready(async (x) => (await change(x)).wait());
      const nonce = await ethers.provider.getTransactionCount(delegate.address);
      const e = await refused(c2.workG0(ctx, delegate, { permit: p }), text);
      expect(String(e.message), what).to.contain("nothing was sent");
      expect([await ethers.provider.getTransactionCount(delegate.address), await d.ledger.seedOf(0), await d.ledger.receiptCount()], what).to.deep.equal([nonce, ethers.ZeroHash, 0n]);
    }
    // a module that is not this ledger's AuditV1 is refused for its code and its ledger as well
    const other = await (await ethers.getContractFactory("contracts/v2/functions/AuditV1.sol:AuditV1")).deploy(delegate.address);
    const { d: d2, ctx: ctx2, p: p2 } = await ready(async (x) => (await x.policy.registerProfile(x.spec(g.PROFILE_G0_REF, 0, other.target, 10, 10, 1))).wait());
    await refused(c2.workG0(ctx2, delegate, { permit: p2 }), `it does not read this ledger (${delegate.address})`);
    // and a deployment that names its AuditV1 is held to it
    const named = { ...ctx2, deployment: { ...ctx2.deployment, contracts: { AuditV1: d2.audit.target } } };
    await refused(c2.workG0(named, delegate, { permit: p2 }), `it is not the deployment's AuditV1 ${d2.audit.target}`);

    // a run that stops after it opened the epoch says so, and carries what it sent
    const { d, ctx, p } = await ready();
    const events = [];
    const onEvent = async (e) => { events.push([e.event, e.step]); if (e.event === "confirmed" && e.step === "openEpoch") await (await d.policy.setPaused(true)).wait(); };
    const stopped = await refused(c2.workG0(ctx, delegate, { permit: p, onEvent }), "submitG0For would be refused: Paused()");
    expect(stopped).to.be.instanceOf(c2.RunStopped);
    expect(String(stopped.message)).to.contain("nothing more was sent; this run sent openEpoch (tx 0x");
    expect([stopped.transactions.map((x) => [x.step, x.status]), events]).to.deep.equal([[["openEpoch", "confirmed"]], [["submitted", "openEpoch"], ["confirmed", "openEpoch"]]]);
    expect(await d.ledger.receiptCount()).to.equal(0n);
    // the same run when nothing changes: the epoch is open, and only the entry is sent
    await (await d.policy.setPaused(false)).wait();
    const r = await c2.workG0(ctx, delegate, { permit: p });
    expect([r.transactions.map((x) => x.step), r.receipt.contributionId, r.contributionId, r.differences]).to.deep.equal([["submitG0For"], r.contributionId, v2.g0ContributionId(ctx.domain, g.AUDIT_V1_FUNCTION_ID, 0, 0, owner.address), []]);
    // the receipt is held to what the client computed, field by field
    expect(c2.receiptDifferences({ contributionId: "0xAB", epoch: 1n, sender: "0x00" }, { contributionId: "0xab", epoch: 1n, sender: "0x01" })).to.deep.equal(["sender: computed 0x01, recorded 0x00"]);
  });

  it("keeps what a run was given apart from what the receipt shows, and records no signer it did not verify (L57)", async () => {
    const w = await world();
    const { d, ctx, dir, delegate } = w;
    try {
      const record = async (owner, nonce, signer) => {
        const st = permit.statement("Permit", d.chainId, d.ledgerAddress, { account: owner.address, delegate: delegate.address, scope: 1, notBeforeEpoch: 0, notAfterEpoch: 100, nonce, guard: ethers.ZeroAddress, guardBindingVersion: 0 });
        const value = { schema: "finchain-pouw.signed-statement/1", kind: "Permit", typedData: permit.typedData(st), digest: permit.digestOf(st), signature: await permit.sign(owner, st) };
        if (signer !== undefined) value.signer = signer;
        return value;
      };
      const file = (name, value) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(value)); return f; };
      // a wallet works for itself; then a delegate comes with a permit of the wallet's that was never used and is revoked
      const first = await c2.workG0(ctx, w.w1);
      const unused = c2.readPermitFile(ctx, file("unused.json", await record(w.w1, 41, w.w1.address)));
      await (await d.ledger.connect(w.w1).revokePermit(unused.digest)).wait();
      const nonce = await ethers.provider.getTransactionCount(delegate.address);
      const found = await c2.workG0(ctx, delegate, { permit: unused });
      expect([found.alreadyRecorded, await ethers.provider.getTransactionCount(delegate.address)]).to.deep.equal([true, nonce]);
      const run = c2.runRecord(ctx, found);
      // the receipt's own: entered by the wallet for itself; read back from the ledger's log
      expect([run.label, run.sender, run.permit, run.origin, run.txHash, run.recordedIn, run.gasUsed, run.transactions])
        .to.deep.equal(["direct-by-key", w.w1.address, null, w.w1.address, first.txHash, "read back from the ledger's log", null, []]);
      // what this run was given: the delegate and the revoked permit, which the receipt was not recorded under
      expect([run.given.sendingKey, run.given.permit.digest, run.receipt.authorization]).to.deep.equal([delegate.address, unused.digest, ethers.ZeroHash]);
      expect(run.reading[0]).to.contain("recorded before this run");
      // a receipt recorded under a permit that is not the one given: its digest, and no statement claimed for it
      const used = c2.readPermitFile(ctx, file("used.json", await record(w.w2, 1)));
      const byDelegate = await c2.workG0(ctx, delegate, { permit: used });
      const other = c2.readPermitFile(ctx, file("other.json", await record(w.w2, 2)));
      const again = c2.runRecord(ctx, await c2.workG0(ctx, delegate, { permit: other }));
      expect([again.label, again.permit.digest, again.permit.statement.startsWith("not given to this run"), again.txHash])
        .to.deep.equal(["delegated-by-owner-permit", used.digest, true, byDelegate.txHash]);
      // the signer field is what the record declares: checked against the signature's key, recorded under its name
      expect([used.signatureKey, used.declaredSigner]).to.deep.equal([w.w2.address, null]);
      await refused(record(w.w2, 3, w.other.address).then((v) => c2.readPermitFile(ctx, file("forged.json", v))),
        `the record's signer field names ${w.other.address}, but its signature is the key ${w.w2.address}'s`);
      await refused(record(w.w2, 3, "someone").then((v) => c2.readPermitFile(ctx, file("word.json", v))), "the record's signer field is not an address");
      // a full record whose typed data is null, false, zero or empty is not read through the message beside it
      const whole = await record(w.w2, 4, w.w2.address);
      for (const [name, value] of [["null", null], ["false", false], ["zero", 0], ["empty", ""]]) {
        await refused(Promise.resolve().then(() => c2.readPermitFile(ctx, file(`typed-${name}.json`, { ...whole, typedData: value, message: whole.typedData.message }))), "its typed data is not an object");
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("takes the place of --out before anything is sent, and keeps each transaction as it is taken (L58)", async () => {
    const [steward] = await ethers.getSigners();
    const d = await t.deploy({ start: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-v2-out-"));
    const hre = require("hardhat");
    // the in-process network behind an endpoint on the loopback, for the command line
    const server = http.createServer((req, res) => {
      let body = ""; req.on("data", (x) => { body += x; });
      req.on("end", async () => {
        const one = async (q) => { try { return { jsonrpc: "2.0", id: q.id, result: await hre.network.provider.request({ method: q.method, params: q.params ?? [] }) }; } catch (e) { return { jsonrpc: "2.0", id: q.id, error: { code: e.code ?? -32000, message: e.message, data: e.data } }; } };
        const input = JSON.parse(body);
        const out = Array.isArray(input) ? await Promise.all(input.map(one)) : await one(input);
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out));
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const pouw = (...args) => new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, "client", "pouw.js"), ...args], { cwd: root, env: { ...process.env, POUW_POLL_MS: "50" }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (x) => { stdout += x; }); child.stderr.on("data", (x) => { stderr += x; });
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    try {
      const key = keyOf(dir, "worker");
      await (await steward.sendTransaction({ to: key.wallet.address, value: ethers.parseEther("1") })).wait();
      await (await d.policy.setAdmission(key.wallet.address, true)).wait();
      await (await d.policy.declareOperator(key.wallet.address, 9)).wait();
      await h.setTime(d.genesisTime);
      const manifest = path.join(dir, "manifest.json");
      fs.writeFileSync(manifest, JSON.stringify({ schema: "finchain-pouw.deployment/2", name: "out-test", environment: "local-devnet", chainId: Number(d.chainId),
        ledger: d.ledgerAddress, policy: d.policy.target, deployBlock: 0, rpc: `http://127.0.0.1:${server.address().port}` }));
      const nonce = await ethers.provider.getTransactionCount(key.wallet.address);
      // a directory that does not exist: refused before anything is read or sent
      const absent = path.join(dir, "absent", "run.json");
      const a = await pouw("work", "--manifest", manifest, "--key-file", key.file, "--out", absent, "--json");
      expect([a.status, a.stderr.includes("does not exist; nothing was sent"), fs.existsSync(absent)]).to.deep.equal([1, true, false]);
      expect([await ethers.provider.getTransactionCount(key.wallet.address), await d.ledger.receiptCount()]).to.deep.equal([nonce, 0n]);
      // a run refused before it sends leaves no file behind
      await (await d.policy.setPaused(true)).wait();
      const refusedOut = path.join(dir, "refused.json");
      const b = await pouw("work", "--manifest", manifest, "--key-file", key.file, "--out", refusedOut, "--json");
      expect([b.status, b.stderr.includes("submitG0 would be refused: Paused()"), fs.existsSync(refusedOut)]).to.deep.equal([1, true, false]);
      await (await d.policy.setPaused(false)).wait();
      // a run that sends: each transaction on the standard error when taken and with its outcome; the record in the file
      const out = path.join(dir, "run.json");
      const c = await pouw("work", "--manifest", manifest, "--key-file", key.file, "--out", out, "--json");
      expect(c.status, c.stderr).to.equal(0);
      expect(["submitted openEpoch", "confirmed openEpoch", "submitted submitG0", "confirmed submitG0"].map((x) => c.stderr.includes(x))).to.deep.equal([true, true, true, true]);
      const written = JSON.parse(fs.readFileSync(out, "utf8"));
      expect([written.schema, written.transactions.map((x) => [x.step, x.status]), written.label, written.recordedIn])
        .to.deep.equal([c2.RUN_SCHEMA, [["openEpoch", "confirmed"], ["submitG0", "confirmed"]], "direct-by-key", "this run's transaction"]);
      expect(written.transactions.map((x) => x.nonce)).to.deep.equal([nonce, nonce + 1]);
      // the journal while a run goes on, and what is left of it when the run stops
      const journal = c2.reserveOutput(path.join(dir, "stopped.json"));
      c2.appendEvent(journal, { event: "submitted", step: "openEpoch", txHash: written.transactions[0].txHash, from: key.wallet.address, nonce });
      expect(c2.releaseOutput(journal)).to.equal(path.join(dir, "stopped.json"));
      expect(JSON.parse(fs.readFileSync(path.join(dir, "stopped.json"), "utf8").trim()).txHash).to.equal(written.transactions[0].txHash);
      const empty = c2.reserveOutput(path.join(dir, "empty.json"));
      expect([c2.releaseOutput(empty), fs.existsSync(path.join(dir, "empty.json"))]).to.deep.equal([null, false]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("labels a direct entry by its evidence: the participant's key, the participant's account, or not known (L61)", async () => {
    const w = await world();
    const { d, ctx, dir, delegate } = w;
    try {
      // the cell's own audit job, entered by the cell account itself: its owner makes it call the ledger through execute
      await (await w.steward.sendTransaction({ to: w.owner.wallet.address, value: ethers.parseEther("1") })).wait();
      await (await d.ledger.openEpoch()).wait();
      const seed = await d.ledger.seedOf(0);
      const { subject } = await a2.auditSubjectFor(ctx, 0n);
      const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, w.cell.target);
      const output = g.auditOutput(instance, g.auditInputHash(0n, subject));
      const call = d.ledger.interface.encodeFunctionData("submitG0", [g.profileKey(g.PROFILE_G0_REF), 0, 0, output]);
      const sent = await (await w.cell.connect(w.owner.wallet).execute(d.ledgerAddress, 0, call)).wait();
      // a delegate with a permit of the cell finds the receipt and sends nothing; the record names how it was entered
      const cellPermit = signPermit(dir, "cell.json", d, w.owner.file,
        { account: w.cell.target, delegate: delegate.address, scope: "submit-g0", guard: w.guard.target, guardBindingVersion: 1 });
      const nonce = await ethers.provider.getTransactionCount(delegate.address);
      const found = c2.runRecord(ctx, await c2.workG0(ctx, delegate, { permit: c2.readPermitFile(ctx, cellPermit) }));
      expect(await ethers.provider.getTransactionCount(delegate.address)).to.equal(nonce);
      expect([found.label, found.participant, found.sender, found.origin, found.txHash, found.permit])
        .to.deep.equal(["direct-by-account", w.cell.target, w.cell.target, w.owner.wallet.address, sent.hash, null]);
      expect(found.reading[1]).to.contain("by the participant's account itself in a transaction another key sent");
      expect(found.reading[1]).to.contain("It was not the participant's own key that sent it");
      // a wallet's own entry: its key sent it
      const direct = c2.runRecord(ctx, await c2.workG0(ctx, w.w1));
      expect([direct.label, direct.origin, direct.sender]).to.deep.equal(["direct-by-key", w.w1.address, w.w1.address]);
      // an origin that could not be read leaves the route unknown, and a permit's digest decides before anything else
      const receipt = { authorization: ethers.ZeroHash, sender: w.cell.target };
      expect([c2.labelOf(receipt, "unknown"), c2.labelOf(receipt, null), c2.labelOf(receipt, w.cell.target), c2.labelOf(receipt, w.owner.wallet.address),
        c2.labelOf({ ...receipt, authorization: ethers.id("permit") }, "unknown")])
        .to.deep.equal(["direct-route-unknown", "direct-route-unknown", "direct-by-key", "direct-by-account", "delegated-by-owner-permit"]);
      const unknown = c2.runRecord(ctx, { ...await c2.workG0(ctx, delegate, { permit: c2.readPermitFile(ctx, cellPermit) }), origin: "unknown" });
      expect([unknown.label, unknown.reading[1].includes("could not be read")]).to.deep.equal(["direct-route-unknown", true]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
