"use strict";

// The client for a deployment of ledger v2 (docs/ledger-v2.md 2, 12, 13): the audit job and the
// confirmation of a tender, sent by the participant's own key or by a delegate under a permit that
// scripts/sign-permit.js signed where the participant's key is, with the run record and its label.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
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
      expect([p.message.account, p.message.delegate, p.signer]).to.deep.equal([w.cell.target, delegate.address, w.owner.wallet.address]);

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
      // the file helper itself: created, or refused with the file left as it was
      c2.createFile(path.join(dir, "new.json"), "{}\n");
      expect(() => c2.createFile(taken, "other\n")).to.throw("exists already: nothing is overwritten");
      expect(fs.readFileSync(taken, "utf8")).to.equal("kept\n");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
