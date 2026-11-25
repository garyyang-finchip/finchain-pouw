"use strict";

// The reference client from release 0.1.4 on: an audit and a deployment check read one block; a
// record has a canonical byte form and two hashes over it; the authority at a settlement is
// reported as far as a tender's log settles it; and work that is recorded is not sent again.
// These tests run against the kernel of 0.1.3: none of them needs the interfaces of ledger v2.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;
const canonical = require("../client/lib/canonical");
const { auditRecord, auditText } = require("../client/lib/report");

const root = path.join(__dirname, "..");
const KEY = g.profileKey(g.PROFILE_G0_REF);
const show = (report) => JSON.stringify(g.jsonable(report.findings), null, 2);

/// A provider that notes every read it is asked for, and can stand in for an endpoint that does not
/// keep the state of one block, or whose block changes under the reader.
function watched(provider, { noStateAt = null, movedAt = null } = {}) {
  const seen = { calls: [], codes: [], logs: [], blocks: [] };
  const proxy = new Proxy(provider, {
    get(target, prop) {
      if (prop === "provider") return proxy;
      if (prop === "call") {
        return async (tx) => {
          seen.calls.push(tx.blockTag);
          if (noStateAt !== null && tx.blockTag === noStateAt) throw Object.assign(new Error("missing trie node 6b1f (path ) state 0x9c2e is not available"), { code: -32000 });
          return target.call(tx);
        };
      }
      if (prop === "getCode") {
        return async (address, tag) => {
          seen.codes.push(tag);
          if (noStateAt !== null && tag === noStateAt) throw Object.assign(new Error("missing trie node 6b1f (path ) state 0x9c2e is not available"), { code: -32000 });
          return target.getCode(address, tag);
        };
      }
      if (prop === "getLogs") return async (filter) => { seen.logs.push([filter.fromBlock, filter.toBlock]); return target.getLogs(filter); };
      if (prop === "getBlock") {
        return async (tag) => {
          seen.blocks.push(tag);
          const block = await target.getBlock(tag);
          // the second time the pinned number is asked for, it is another block
          if (movedAt !== null && tag === movedAt && seen.blocks.filter((x) => x === movedAt).length > 1) return { ...block, number: block.number, hash: ethers.id("another block"), timestamp: block.timestamp };
          return block;
        };
      }
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { proxy, seen };
}

/// Epoch 0 with work of both pools in it, ended; returns the block at which it had just ended.
async function endedEpoch() {
  const [, w1, w2, d1] = await ethers.getSigners();
  const d = await h.deploy({ admit: [w1, w2, d1] });
  await h.submitAudit(d, w1);
  await h.submitAudit(d, w2);
  const tender = await h.tender(d, { owner: d1, worker: w1 });
  await h.bridge(d, tender);
  await h.toEpoch(d, 1);
  const block = await ethers.provider.getBlock("latest");
  return { d, w1, w2, d1, tender, block };
}

/// A manifest of the fixture's deployment with every contract's code on record, as a deployment's own manifest has it.
async function fullManifest(d) {
  const code = async (c) => ethers.keccak256(await ethers.provider.getCode(c.target ?? c));
  const roles = { GenesisPolicy: [d.policy, "GenesisPolicy"], SeedSource: [d.seedSource, "PrevBlockSeedSource"], GenesisLedger: [d.ledger, "GenesisLedger"],
    AuditV1: [d.audit, "AuditV1"], TenderAdapter8414: [d.adapter, "TenderAdapter8414"] };
  const m = { schema: g.MANIFEST_SCHEMA, name: "fixture", environment: "local-devnet", chainId: 31337, deployBlock: 0, contracts: {}, code: {},
    external: { taskToken8414: { address: d.taskToken.target, deployBlock: 0, codeHash: await code(d.taskToken) } },
    clock: { genesisTime: Number(d.genesisTime), epochDuration: Number(d.duration) } };
  for (const [role, [contract, name]] of Object.entries(roles)) {
    m.contracts[role] = contract.target;
    m.code[role] = { contract: name, codeHash: await code(contract) };
  }
  return m;
}
const loadBuild = (name) => JSON.parse(fs.readFileSync(path.join(root, "build", `${name}.json`), "utf8"));

describe("The reference client: one block for everything an audit reads", () => {
  it("audits at one block with a manifest and an endpoint and no key: logs, views, nested reads and code, all at that block (L34)", async () => {
    const { d, w1, d1, block } = await endedEpoch();
    // the chain goes on after the block: the close record, work of the next epoch, a tender changing hands, a policy change
    await (await d.ledger.seal(0)).wait();
    await h.submitAudit(d, w1);
    const later = await h.tender(d, { owner: d1, worker: w1 });
    await h.bridge(d, later);
    await (await d.policy.setAdmission(w1.address, false)).wait();
    expect((await ethers.provider.getBlock("latest")).number > block.number).to.equal(true);

    // the reader: an endpoint, and nothing that could sign
    const { proxy, seen } = watched(ethers.provider);
    const pin = await g.pinBlock(proxy, block.number);
    expect([pin.number, pin.hash, pin.timestamp, pin.tag]).to.deep.equal([block.number, block.hash, BigInt(block.timestamp), String(block.number)]);
    const finalized = await ethers.provider.getBlock("finalized");
    expect(pin.finality).to.equal(block.number <= finalized.number ? "at-or-below-finalized" : "above-finalized");
    expect(Number.isNaN(Date.parse(pin.observedAt))).to.equal(false);
    const ctx = await g.connect(d.manifest, proxy, { tag: block.number, pin });
    const report = await g.auditEpoch(ctx, 0);
    expect(report.ok, show(report)).to.equal(true);
    expect([report.pin.number, report.pin.hash]).to.deep.equal([block.number, block.hash]);
    expect(report.receiptCount).to.equal(3n);

    // every state read named the block; every log query ended at or before it; the hash was asked for again
    expect(seen.calls.length > 10).to.equal(true);
    expect(seen.calls.filter((tag) => tag !== block.number), "a view was read at another block").to.deep.equal([]);
    expect(seen.codes.filter((tag) => tag !== block.number), "code was read at another block").to.deep.equal([]);
    expect(seen.logs.length > 5).to.equal(true);
    expect(seen.logs.filter(([, to]) => !(Number(to) <= block.number)), "a log query went past the block").to.deep.equal([]);
    expect(seen.blocks.filter((tag) => tag === block.number).length).to.equal(2); // taken, and checked again at the end
    expect(seen.blocks.filter((tag) => typeof tag !== "number" && tag !== "finalized"), "a block other than the pinned one was asked for").to.deep.equal([]);

    // at that block the epoch had no close record, although it has one now: the report says what was true there
    expect([report.isSealed, report.closeRecord.present]).to.deep.equal([false, false]);
    expect((await d.ledger.epochSummary(0)).isSealed).to.equal(true);
    const strict = await g.auditEpoch(ctx, 0, { requireSealed: true });
    expect(strict.findings.map((f) => f.what)).to.deep.equal(["close record"]);

    // a later block has it, within the block, with the figures of the recomputation
    const now = await g.auditEpoch(await g.connect(d.manifest, ethers.provider, { tag: "latest" }), 0, { requireSealed: true });
    expect(now.ok, show(now)).to.equal(true);
    expect([now.isSealed, now.closeRecord.present]).to.deep.equal([true, true]);
    expect(now.closeRecord.block > block.number && now.closeRecord.block <= now.pin.number).to.equal(true);
    expect(now.closeRecord.blockTimestamp >= g.epochEnd(ctx, 0)).to.equal(true);
    // and the two audits agree on everything the later events could not change
    expect([now.digest, now.subject, now.tableHash, now.allocated]).to.deep.equal([report.digest, report.subject, report.tableHash, report.allocated]);

    // the deployment check reads its block the same way
    const check = watched(ethers.provider);
    const manifest = await fullManifest(d);
    const checkPin = await g.pinBlock(check.proxy, block.number);
    const result = await g.verifyDeployment(await g.connect(manifest, check.proxy, { tag: block.number, pin: checkPin }), loadBuild);
    expect(result.ok, JSON.stringify(result.checks.filter((c) => !c.ok))).to.equal(true);
    expect(result.pin.number).to.equal(block.number);
    expect(check.seen.calls.filter((tag) => tag !== block.number)).to.deep.equal([]);
    expect(check.seen.codes.length >= 6 && check.seen.codes.every((tag) => tag === block.number)).to.equal(true);
    // at a block before the deployment existed there is no ledger to connect to
    let early = null;
    try { await g.connect(manifest, ethers.provider, { tag: 0, pin: await g.pinBlock(ethers.provider, 0) }); } catch (e) { early = e; }
    expect(String(early?.message)).to.contain("no contract at the ledger's address");
  });

  it("fails, with the reason, when the endpoint has no state at that block, and reads no other block in its place (L34)", async () => {
    const { d, block } = await endedEpoch();
    await (await d.ledger.seal(0)).wait(); // the latest block is a different one, and would answer

    // through the connection: the first read of state fails
    const first = watched(ethers.provider, { noStateAt: block.number });
    let error = null;
    try { await g.connect(d.manifest, first.proxy, { tag: block.number, pin: await g.pinBlock(first.proxy, block.number) }); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.StateUnavailable);
    expect(error.message).to.contain(`at block ${block.number}`);
    expect(error.message).to.contain("missing trie node");
    expect(error.message).to.contain("does not fall back");
    expect([...first.seen.calls, ...first.seen.codes].filter((tag) => tag !== block.number)).to.deep.equal([]);

    // through the audit, with a connection that was made earlier: the same, and nothing is reported
    const second = watched(ethers.provider, { noStateAt: block.number });
    const ctx = await g.connect(d.manifest, second.proxy, { tag: block.number });
    const made = second.seen.calls.length; // the connection's own reads, made without a pin
    error = null;
    try { await g.auditEpoch(ctx, 0); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.StateUnavailable);
    expect(second.seen.calls.slice(made).filter((tag) => tag !== block.number)).to.deep.equal([]);
    // so too for the deployment check and for a worker's own audit before its job
    error = null;
    try { await g.verifyDeployment(ctx, loadBuild); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.StateUnavailable);

    // a revert is not a missing state: it is the contract's answer, and is passed on as it is
    const answer = Object.assign(new Error("execution reverted"), { code: "CALL_EXCEPTION", data: "0x" });
    let passed = null;
    try { await g.stateRead({ number: 5 }, "a view", async () => { throw answer; }); } catch (e) { passed = e; }
    expect(passed).to.equal(answer);
    // an answer the library cannot read as a revert is the endpoint's failure
    let failed = null;
    try { await g.stateRead({ number: 5 }, "a view", async () => { throw Object.assign(new Error("missing revert data"), { code: "CALL_EXCEPTION", data: null, info: { error: { code: -32000, message: "header not found" } } }); }); } catch (e) { failed = e; }
    expect(failed).to.be.instanceOf(g.StateUnavailable);
    expect(failed.message).to.contain("header not found");
  });

  it("reports nothing when the block it read is no longer the block it was", async () => {
    const { d, block } = await endedEpoch();
    const { proxy } = watched(ethers.provider, { movedAt: block.number });
    const ctx = await g.connect(d.manifest, proxy, { tag: block.number });
    let error = null;
    try { await g.auditEpoch(ctx, 0); } catch (e) { error = e; }
    expect(error).to.be.instanceOf(g.SnapshotMoved);
    expect(error.message).to.contain(block.hash);
  });
});

describe("The reference client: the authority at a settlement, as far as a tender's log settles it", () => {
  /// A tender that a verifier contract settles: minted and funded by `owner`, fulfilled by `worker`, settled by anybody's call.
  async function verified(d, { owner, worker, verifier, n }) {
    const t = d.taskToken;
    const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: ethers.parseEther("0.002"), maxCompletions: 0, submitBy: 0, settleBy: 0,
      epochLength: 0, maxCompletionsPerEpoch: 0, judgmentWindow: 3600 };
    const tokenId = await t.nextId();
    await (await t.connect(owner).mintTask(owner.address, owner.address, verifier.target, ethers.id(`td v${n}`), ethers.id(`task v${n}`), `ipfs://task-v${n}`, terms)).wait();
    await (await t.connect(owner).fundTask(tokenId, terms.rewardPerCompletion, { value: terms.rewardPerCompletion })).wait();
    await (await t.connect(worker).submitFulfillment(tokenId, ethers.id(`result v${n}`), `ipfs://result-v${n}`)).wait();
    const submissionId = await t.submissionCountOf(tokenId);
    const rc = await (await t.connect(worker).settleFulfillment(tokenId, submissionId, "0x")).wait();
    return { tokenId, submissionId, owner, settledIn: rc.hash };
  }

  it("records evidence-insufficient, and concludes nothing about a party, when a verifier hands the authority on inside its own verification (L32)", async () => {
    const [, w1, d1, bystander] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const Verifier = await ethers.getContractFactory("HandoverVerifier");
    // the verifier names the worker itself as its successor: the log's last authority before the acceptance is the worker
    const handsOn = await Verifier.deploy(w1.address);
    const plain = await Verifier.deploy(ethers.ZeroAddress);
    const moved = await verified(d, { owner: d1, worker: w1, verifier: handsOn, n: 1 });
    const kept = await verified(d, { owner: d1, worker: bystander, verifier: plain, n: 2 });
    expect(await d.taskToken.acceptanceAuthorityOf(moved.tokenId)).to.equal(w1.address);
    const movedReceipt = await h.bridge(d, moved);
    const keptReceipt = await h.bridge(d, kept);
    // the ledger read the tender as it stood at the bridge: there the worker is the judge
    expect(movedReceipt.status.ineligible).to.equal(g.INELIGIBLE.SELF_DEALING);

    await h.toEpoch(d, 1);
    const report = await g.auditEpoch(d.ctx, 0);
    expect(report.ok, show(report)).to.equal(true); // the ledger applied its rules; the audit agrees with it

    const item = report.receipts.find((it) => it.id === movedReceipt.id);
    // the fact of the log is kept: the address the last record before the acceptance names
    expect(item.tender.authority).to.deep.equal({ registered: w1.address, changedInAcceptanceTransaction: true, evidence: "evidence-insufficient" });
    expect(item.tender.settlement).to.equal("verified");
    // and nothing is concluded from it: the worker did not judge its own delivery, a verifier did,
    // and the log cannot show which. The observation names the limit and no party
    expect(report.observations.find((o) => o.receiptId === movedReceipt.id).noted).to.deep.equal(["authority-changed-in-the-acceptance-transaction"]);
    expect(JSON.stringify(g.jsonable(report.observations))).to.not.contain("worker-judged-its-own-delivery");

    // the same verifier without the handing on: the registered authority is visible, and is the verifier
    const control = report.receipts.find((it) => it.id === keptReceipt.id);
    expect(control.tender.authority).to.deep.equal({ registered: plain.target, changedInAcceptanceTransaction: false, evidence: "registered-authority-visible" });
    expect(report.observations.some((o) => o.receiptId === keptReceipt.id)).to.equal(false);
    expect(report.g1.byAuthorityEvidence).to.deep.equal({ "evidence-insufficient": 1, "registered-authority-visible": 1 });

    // a change of the same tender in another transaction, or of another tender in the same one, is not this case
    expect(g.authorityAtSettlement({ judges: [{ blockNumber: 1, index: 0, transactionHash: "0xaa", args: { newAuthority: "A" } }] },
      { blockNumber: 2, index: 0, transactionHash: "0xbb" })).to.deep.equal({ registered: "A", changedInAcceptanceTransaction: false, evidence: "registered-authority-visible" });
    expect(g.authorityAtSettlement({ judges: [] }, null).evidence).to.equal("no-acceptance-record");

    // the record and the text say it in so many words
    const record = auditRecord(d.ctx, report);
    const inRecord = record.receipts.find((r) => r.id === String(movedReceipt.id)).tender.authority;
    expect(inRecord.evidence).to.equal("evidence-insufficient");
    expect(record.reading.some((line) => line.includes("does not establish who carried out a verification"))).to.equal(true);
    expect(auditText(d.ctx, report)).to.contain("authority at settlement: evidence-insufficient");
  });
});

describe("The reference client: work that is recorded is not sent again", () => {
  /// A signer whose transactions of one kind are mined while their answer never arrives.
  function lossy(signer, selector) {
    return new Proxy(signer, {
      get(target, prop) {
        if (prop === "sendTransaction") {
          return async (tx) => {
            const sent = await target.sendTransaction(tx);
            await sent.wait();
            if (String(tx.data ?? "").startsWith(selector)) throw new Error("the connection was closed before the answer arrived");
            return sent;
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }

  it("finds a submission whose answer was lost by its contribution id, after a restart, and sends nothing (L33)", async () => {
    const [, w1, d1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1, d1] });
    const selector = (contract, name) => contract.interface.getFunction(name).selector;

    // the audit job: sent, mined, and the answer lost
    let error = null;
    try { await g.workAudit(d.ctx, lossy(w1, selector(d.ledger, "submitG0"))); } catch (e) { error = e; }
    expect(String(error?.message)).to.contain("before the answer arrived");
    expect(await d.ledger.receiptCount()).to.equal(1n);
    // the process starts again, knowing nothing of the first run
    let nonce = await ethers.provider.getTransactionCount(w1.address);
    const again = await g.workAudit(await g.connect(d.manifest, ethers.provider), w1);
    expect([again.alreadyRecorded, again.receiptId, again.txHash, again.worker]).to.deep.equal([true, 1n, null, w1.address]);
    expect(again.status.gmuSubsidized).to.equal(10n);
    expect(again.instance).to.equal(g.g0Instance(await d.ledger.seedOf(0), g.AUDIT_V1_FUNCTION_ID, 0, w1.address));
    expect(await ethers.provider.getTransactionCount(w1.address)).to.equal(nonce);
    expect(await d.ledger.receiptCount()).to.equal(1n);

    // a confirmation: the same
    const tender = await h.tender(d, { owner: d1, worker: w1 });
    error = null;
    try { await g.bridgeTender(d.ctx, lossy(d1, selector(d.adapter, "bridge")), tender); } catch (e) { error = e; }
    expect(String(error?.message)).to.contain("before the answer arrived");
    expect(await d.ledger.receiptCount()).to.equal(2n);
    nonce = await ethers.provider.getTransactionCount(d1.address);
    const confirmed = await g.bridgeTender(await g.connect(d.manifest, ethers.provider), d1, tender);
    expect([confirmed.alreadyRecorded, confirmed.receiptId, confirmed.txHash, confirmed.demander, confirmed.worker]).to.deep.equal([true, 2n, null, d1.address, w1.address]);
    expect(await ethers.provider.getTransactionCount(d1.address)).to.equal(nonce);
    expect(await d.ledger.receiptCount()).to.equal(2n);
    // what was not sent before is sent
    const next = await h.tender(d, { owner: d1, worker: w1 });
    const fresh = await g.bridgeTender(d.ctx, d1, next);
    expect([fresh.alreadyRecorded, fresh.receiptId]).to.deep.equal([false, 3n]);
  });
});

describe("The reference client: a record has one byte form and two hashes", () => {
  /// The canonical form written a second time, another way: explicit comparison of code units and explicit escapes.
  function second(value) {
    if (value === null || typeof value === "boolean") return String(value);
    if (typeof value === "number") return value.toFixed(0).replace(/^-0$/, "0");
    if (typeof value === "string") {
      let out = "\"";
      for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        const short = { 8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r", 34: "\\\"", 92: "\\\\" }[c];
        out += short ?? (c < 32 ? `\\u${c.toString(16).padStart(4, "0")}` : value[i]);
      }
      return `${out}"`;
    }
    if (Array.isArray(value)) return `[${value.map(second).join(",")}]`;
    const byUnits = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) { const x = a.charCodeAt(i) - b.charCodeAt(i); if (x !== 0) return x; } return a.length - b.length; };
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort(byUnits).map((k) => `${second(k)}:${second(value[k])}`).join(",")}}`;
  }
  const sha = (text) => require("crypto").createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

  it("serializes by RFC 8785 with integers only, so that one record has one hash (L35)", () => {
    // the member order of the specification's own example: by UTF-16 code units, not by code points
    const sample = { "\u20ac": "Euro Sign", "\r": "Carriage Return", "\ufb33": "Hebrew Letter Dalet With Dagesh", 1: "One",
      "\ud83d\ude00": "Emoji: Grinning Face", "\u0080": "Control", "\u00f6": "Latin Small Letter O With Diaeresis" };
    const order = ["\r", "1", "\u0080", "\u00f6", "\u20ac", "\ud83d\ude00", "\ufb33"];
    expect(canonical.canonicalize(sample)).to.equal(`{${order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(sample[k])}`).join(",")}}`);
    expect(order.slice().sort((a, b) => (a.codePointAt(0) - b.codePointAt(0))).join("")).to.not.equal(order.join("")); // code points would order them otherwise
    // one text, whichever way the value was written down
    expect(canonical.canonicalize(JSON.parse("{\"x\":\"\\u00e9\",\"a\":[true,null,-0,7]}"))).to.equal("{\"a\":[true,null,0,7],\"x\":\"\u00e9\"}");
    expect(canonical.canonicalize({ b: 1, a: { d: "\n\u0001\"\\", c: undefined } })).to.equal("{\"a\":{\"d\":\"\\n\\u0001\\\"\\\\\"},\"b\":1}");
    // what is not an exact integer is refused, not rounded; a large integer travels as a decimal string
    for (const bad of [0.5, 2 ** 53, Number.NaN, Infinity, 10n, new Map(), () => 1, "\ud800"]) {
      expect(() => canonical.canonicalize({ v: bad }), String(bad)).to.throw("not a canonical record");
    }
    expect(() => canonical.canonicalize([undefined])).to.throw("not a canonical record");
    const big = 2n ** 200n + 1n;
    expect(canonical.canonicalize(g.jsonable({ v: big, safe: 2 ** 53 - 1 }))).to.equal(`{"safe":9007199254740991,"v":"${big}"}`);
  });

  it("refuses an array with an empty slot, where it used to write fewer elements or text that is not JSON", () => {
    /* eslint-disable no-sparse-arrays */
    const holes = [new Array(1), [1, , 2], [, 1], [1, 2, , ], Object.assign([1, 2], { length: 3 })];
    /* eslint-enable no-sparse-arrays */
    for (const bad of holes) {
      expect(() => canonical.canonicalize({ x: bad }), JSON.stringify(bad)).to.throw("an array with an empty slot");
      // no hash is made of such a record
      expect(() => canonical.sealed({ rows: bad })).to.throw("not a canonical record");
      expect(() => canonical.resultHash({ deep: [{ inner: bad }] })).to.throw("an array with an empty slot");
    }
    // the refusal names the slot
    expect(() => canonical.canonicalize({ x: [[0], [1, , 2]] })).to.throw(".x[1][1]"); // eslint-disable-line no-sparse-arrays
    // a slot that holds no value is refused as well, and is told apart
    expect(() => canonical.canonicalize({ x: [1, undefined] })).to.throw("no value (undefined)");
    // complete arrays are written as before: empty, nested, with null
    expect(canonical.canonicalize({ x: [], y: [[1], [null, []]], z: new Array(2).fill(0) })).to.equal("{\"x\":[],\"y\":[[1],[null,[]]],\"z\":[0,0]}");
    // and every text this function writes is JSON that reads back to the same value
    const value = { a: [1, [2, [3, null]], "x"], b: [] };
    expect(JSON.parse(canonical.canonicalize(value))).to.deep.equal(value);
  });

  it("computes the hashes of an audit's record the same twice, in a second implementation and in a second program (L35)", async function () {
    const { d, block } = await endedEpoch();
    const at = async () => g.auditEpoch(await g.connect(d.manifest, ethers.provider, { tag: block.number }), 0);
    const record = auditRecord(d.ctx, await at(), { rpc: "https://node.example/with/a-key-in-the-path" });
    expect(record.schema).to.equal("finchain-pouw.audit/2");
    expect(record.snapshot).to.deep.equal({ number: block.number, hash: block.hash, timestamp: String(block.timestamp) });
    expect([record.snapshotTag, ["at-or-below-finalized", "above-finalized"].includes(record.snapshotFinality)]).to.deep.equal([String(block.number), true]);
    expect(record.endpointHost).to.equal("node.example");
    expect(/^[0-9a-f]{64}$/.test(record.reportHash) && /^[0-9a-f]{64}$/.test(record.resultHash)).to.equal(true);

    // twice; after a trip through a file; and with the field itself changed or absent: the same
    expect(canonical.reportHash(record)).to.equal(record.reportHash);
    expect(canonical.reportHash(JSON.parse(JSON.stringify(record, null, 2)))).to.equal(record.reportHash);
    expect(canonical.reportHash({ ...record, reportHash: "something else" })).to.equal(record.reportHash);
    expect(canonical.reportHash(canonical.without(record, ["reportHash"]))).to.equal(record.reportHash);
    // any other member is part of it
    expect(canonical.reportHash({ ...record, observedAt: "2026-01-01T00:00:00.000Z" })).to.not.equal(record.reportHash);
    expect(canonical.reportHash({ ...record, allocated: "1" })).to.not.equal(record.reportHash);
    // the second implementation, from the stated serialization
    expect(sha(second(canonical.without(record, ["reportHash"])))).to.equal(record.reportHash);
    expect(sha(second(canonical.without(record, canonical.RUN_MEMBERS)))).to.equal(record.resultHash);

    // two runs at one block: one result, two reports - each observed the block at its own time
    await new Promise((resolve) => setTimeout(resolve, 20));
    const other = auditRecord(d.ctx, await at(), { rpc: "http://another-endpoint.example:8545" });
    expect(other.observedAt).to.not.equal(record.observedAt);
    expect(other.resultHash).to.equal(record.resultHash);
    expect(other.reportHash).to.not.equal(record.reportHash);
    // a different finding is a different result
    expect(canonical.resultHash({ ...record, ok: false })).to.not.equal(record.resultHash);

    // the second program: another language, the record's file, no code of the client
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-record-"));
    try {
      const file = path.join(dir, "audit-epoch-0.json");
      const tampered = path.join(dir, "tampered.json");
      fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
      fs.writeFileSync(tampered, JSON.stringify({ ...record, allocated: "1" }, null, 2) + "\n");
      const run = (args) => {
        try { return { status: 0, out: execFileSync("python3", [path.join(root, "scripts", "report-hash.py"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) {
          if (e.code === "ENOENT") return null;
          return { status: e.status, out: String(e.stdout) + String(e.stderr) };
        }
      };
      const good = run([file]);
      if (good === null) { this.skip(); return; } // no python3 on this machine: the second implementation above stands
      expect(good.status, good.out).to.equal(0);
      expect(good.out).to.contain(`${record.reportHash}  reportHash`);
      expect(good.out).to.contain(`${record.resultHash}  resultHash`);
      expect(good.out.match(/as stated/g).length).to.equal(2);
      const bad = run([tampered]);
      expect(bad.status).to.equal(2);
      expect(bad.out).to.contain("DIFFERS");
      // the specification's ordering example and a number that is not an integer, in the second program
      const sample = path.join(dir, "sample.json");
      fs.writeFileSync(sample, "{\"\\u20ac\":1,\"\\r\":2,\"\\ufb33\":3,\"1\":4,\"\\ud83d\\ude00\":5,\"\\u0080\":6,\"\\u00f6\":7}");
      expect(run([sample]).out).to.contain(sha(canonical.canonicalize(JSON.parse(fs.readFileSync(sample, "utf8")))));
      fs.writeFileSync(sample, "{\"v\":0.5}");
      expect(run([sample]).status).to.equal(1);
      // a member named twice in one object, at the top or at any depth: the file is refused and no
      // hash is computed from it. A parser that keeps the last of the two would hash another record
      for (const twice of ["{\"allocated\":\"999\",\"allocated\":\"1\"}", "{\"a\":{\"b\":1,\"b\":2}}", "{\"rows\":[{\"k\":1},{\"k\":1,\"k\":1}]}",
        JSON.stringify(record).replace("{", "{\"ok\":false,")]) {
        fs.writeFileSync(sample, twice);
        const refusedTwice = run([sample]);
        expect(refusedTwice.status, twice.slice(0, 60)).to.equal(1);
        expect(refusedTwice.out).to.contain("given twice");
        expect(/reportHash|resultHash/.test(refusedTwice.out), "a hash was printed").to.equal(false);
      }
      // the same name in two objects is not a name given twice
      fs.writeFileSync(sample, "{\"a\":{\"k\":1},\"b\":{\"k\":1},\"rows\":[{\"k\":1},{\"k\":1}]}");
      expect(run([sample]).status).to.equal(0);
      // and the record of this test, as its file has it, is still read as before
      expect(run([file]).status).to.equal(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
