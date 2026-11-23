// Round R1 on a development network: two workers, one round of G0 and G1 work, GMU, two epochs
// closed by time, and a third party's audit from the chain alone.
//
//   npm run local-run
//
// The script starts its own Hardhat node and deploys the kernel beside the ERC-8414 reference
// contract. Every party then acts the way a participant on a public chain would: through the
// reference client (client/pouw.js) run as a separate process, with a key file of its own and the
// endpoint - `pouw work`, `pouw bridge`, `pouw seal`, `pouw audit`. Only what is not this
// protocol's business is done by the script directly: funding the parties, the steward's
// registrations, the ERC-8414 tenders themselves (tender, deliver, accept), and moving the
// development node's clock. One evidence record is written under evidence/.
//
// Keys: each party's key is generated at run time, kept in out/local-run/keys/ for the duration of
// the run and deleted at the end. No key is embedded in this repository in any form.
//
// What a run shows: that the mechanism works end to end and that an independent recomputation
// agrees with the ledger. All parties belong to whoever runs it, so it shows nothing about
// independent participation or about demand.
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const g = require("../client/lib/genesis");

const root = path.join(__dirname, "..");
const PORT = Number(process.env.POUW_LOCAL_PORT ?? 18545);
const RPC = `http://127.0.0.1:${PORT}`;
const OUT = path.join(root, "out", "local-run");
const KEYS = path.join(OUT, "keys");
const POUW = path.join(root, "client", "pouw.js");
const EPOCH = 600n;                        // seconds
const REWARD = ethers.parseEther("0.002"); // bounty of each tender
const version = (name) => require(`${name}/package.json`).version;

const PARAMS = {
  activeFromEpoch: 0,
  budgetBase: ethers.parseUnits("1000", 18),
  halvingInterval: 8,
  splitG0Bps: 7000,
  workerCapBps: 2500,
  minBountyWei: ethers.parseEther("0.001"),
  maxSubsidizedPerDemander: 3,
  maxSubsidizedPerPair: 1,
  subsidizeDeclaredRelated: false,
};

const artifact = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", rel), "utf8"));
const sha256 = (file) => require("crypto").createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
// the files a run exercises: the record names their hashes, so that it can be tied to a state of the repository
const SOURCES = [
  "contracts/GenesisTypes.sol", "contracts/GenesisPolicy.sol", "contracts/GenesisLedger.sol", "contracts/TenderAdapter8414.sol",
  "contracts/functions/AuditV1.sol", "contracts/seed/PrevBlockSeedSource.sol", "contracts/interfaces/IGenesisLedger.sol",
  "contracts/interfaces/IGenesisPolicy.sol", "contracts/interfaces/IG0Function.sol", "contracts/interfaces/ISeedSource.sol",
  "contracts/interfaces/ITaskTender8414.sol", "contracts/vendor/erc8414/TaskToken.sol", "client/pouw.js", "client/lib/genesis.js",
  "client/lib/report.js", "scripts/local-run.js",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---------------------------------------------------------------- build and network
  const hardhat = require.resolve("hardhat/internal/cli/bootstrap");
  const build = spawnSync(process.execPath, [hardhat, "compile", "--quiet"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`compile failed:\n${build.stdout}${build.stderr}`);
  fs.rmSync(KEYS, { recursive: true, force: true });
  fs.mkdirSync(KEYS, { recursive: true, mode: 0o700 });
  const nodeLog = fs.openSync(path.join(OUT, "node.log"), "w");
  const node = spawn(process.execPath, [hardhat, "node", "--port", String(PORT), "--hostname", "127.0.0.1"],
    { cwd: root, stdio: ["ignore", nodeLog, nodeLog] });
  const cleanup = () => {
    try { node.kill("SIGTERM"); } catch { /* already gone */ }
    fs.rmSync(KEYS, { recursive: true, force: true });
  };
  process.on("exit", cleanup);

  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) break;
    } catch (e) { /* not listening yet */ }
    if (i > 150 || node.exitCode !== null) throw new Error(`the development node did not start on ${RPC} (see out/local-run/node.log)`);
    await sleep(200);
  }
  // no response cache: a read that follows a transaction must see it
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  provider.pollingInterval = 50;
  const chainId = Number((await provider.getNetwork()).chainId);
  const now = async () => BigInt((await provider.getBlock("latest")).timestamp);
  const setTime = async (t) => { await provider.send("evm_setNextBlockTimestamp", [Number(t)]); await provider.send("evm_mine", []); };
  const sent = async (txPromise) => (await txPromise).wait();
  console.log(`development network on ${RPC}, chain ${chainId}`);

  // ---------------------------------------------------------------- parties
  // The steward is the node's first unlocked account: it deploys, registers and funds. Everybody
  // else gets a key of its own, made now, used through the client, deleted at the end.
  const [steward] = await provider.listAccounts();
  const party = async (name, role, operator, admitted) => {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    const keyFile = path.join(KEYS, `${name}.key`);
    fs.writeFileSync(keyFile, `${wallet.privateKey}\n`, { mode: 0o600 });
    await sent(steward.sendTransaction({ to: wallet.address, value: ethers.parseEther("10") }));
    return { name, role, operator, admitted, wallet, keyFile, address: wallet.address };
  };
  const workerA = await party("worker-a", "worker A", 1, true);
  const workerB = await party("worker-b", "worker B", 2, true);
  const demander = await party("demander", "demander", 3, true);
  const relatedDemander = await party("related-demander", "demander declared under worker B's operator", 2, true);
  const stranger = await party("stranger", "address that is not admitted", 0, false);
  const third = await party("third", "third party: asks for the close records and audits; no role in the protocol", 0, false);
  const parties = [workerA, workerB, demander, relatedDemander, stranger, third];

  // ---------------------------------------------------------------- deployment (before genesis)
  const gas = { deployment: {}, work: [], bridge: [], seal: [] }; // gas used, for planning a public deployment
  const deploy = async (rel, ...args) => {
    const a = artifact(rel);
    const c = await new ethers.ContractFactory(a.abi, a.bytecode, steward).deploy(...args);
    const rc = await c.deploymentTransaction().wait();
    gas.deployment[a.contractName] = Number(rc.gasUsed);
    return { contract: c, address: await c.getAddress(), block: rc.blockNumber };
  };
  const gasOf = async (txHash) => Number((await provider.getTransactionReceipt(txHash)).gasUsed);
  const genesisTime = (await now()) + 300n;
  const policy = await deploy("GenesisPolicy.sol/GenesisPolicy.json", await steward.getAddress(), genesisTime, EPOCH, PARAMS);
  const seedSource = await deploy("seed/PrevBlockSeedSource.sol/PrevBlockSeedSource.json");
  const ledger = await deploy("GenesisLedger.sol/GenesisLedger.json", policy.address, seedSource.address);
  const auditFn = await deploy("functions/AuditV1.sol/AuditV1.json", ledger.address);
  const taskToken = await deploy("vendor/erc8414/TaskToken.sol/TaskToken.json", "Task Tenders", "TASK");
  const adapter = await deploy("TenderAdapter8414.sol/TenderAdapter8414.json", ledger.address, taskToken.address, g.PROFILE_G1_TENDER);

  await sent(policy.contract.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, auditFn.address, 10, 10, 1, 0));
  await sent(policy.contract.registerProfile(g.PROFILE_G1_TENDER, g.POOL_G1, adapter.address, 50, 200, 0, 0));
  for (const p of parties) {
    if (p.admitted) await sent(policy.contract.setAdmission(p.address, true));
    if (p.operator) await sent(policy.contract.declareOperator(p.address, p.operator));
  }

  const manifest = {
    schema: g.MANIFEST_SCHEMA,
    name: "local-run",
    environment: "local-devnet",
    chainId,
    deployBlock: policy.block,
    protocol: version(".."),
    contracts: {
      GenesisPolicy: policy.address, GenesisLedger: ledger.address, SeedSource: seedSource.address,
      AuditV1: auditFn.address, TenderAdapter8414: adapter.address,
    },
    external: { taskToken8414: { address: taskToken.address, deployBlock: taskToken.block } },
    clock: { genesisTime: Number(genesisTime), epochDuration: Number(EPOCH) },
  };
  const manifestPath = path.join(OUT, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const transcript = [];
  const log = (step, detail = {}) => { transcript.push({ step, ...g.jsonable(detail) }); console.log(`  ${step}`); };
  const checks = [];
  const check = (what, ok) => { checks.push({ check: what, ok: Boolean(ok) }); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); };
  log("deployed: policy, seed source, ledger, audit function, ERC-8414 reference contract, adapter; two profiles; admissions and operators declared before genesis",
    { manifest: "out/local-run/manifest.json", ledger: ledger.address });

  /// The reference client as a separate process: the manifest, the endpoint, and a key file when it sends.
  const pouw = (args, who, { json = true } = {}) => {
    const run = spawnSync(process.execPath, [POUW, ...args.map(String), "--manifest", manifestPath, "--rpc", RPC,
      ...(json ? ["--json"] : []), ...(who ? ["--key-file", who.keyFile] : [])],
      { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, POUW_POLL_MS: "50" } });
    let out = null;
    if (json) { try { out = JSON.parse(run.stdout); } catch { out = null; } }
    return { status: run.status, out, text: run.stdout, stderr: run.stderr.trim() };
  };
  const must = (run, what) => { if (run.status !== 0 || !run.out) throw new Error(`${what} failed (exit ${run.status}): ${run.stderr}`); return run.out; };

  const work = async (who) => {
    const r = must(pouw(["work"], who), `pouw work for ${who.name}`);
    gas.work.push(await gasOf(r.txHash));
    return { by: who.address, epoch: r.epoch, audited: r.audited === null ? "the deployment's configuration" : `epoch ${r.audited}`,
      receiptsAudited: r.receiptsAudited, receiptId: r.receiptId, verdict: g.VERDICT_NAME[r.status.verdict],
      eligibility: g.INELIGIBLE_NAME[r.status.ineligible], gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized, txHash: r.txHash };
  };
  const bridge = async (who, t) => {
    const r = must(pouw(["bridge", t.tokenId, t.submissionId], who), `pouw bridge by ${who.name}`);
    gas.bridge.push(await gasOf(r.txHash));
    return { by: who.address, receiptId: r.receiptId, epoch: r.epoch, eligibility: g.INELIGIBLE_NAME[r.status.ineligible],
      relation: g.RELATION_NAME[r.status.relation], gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized, txHash: r.txHash };
  };
  // one ERC-8414 tender, by the standard's own calls: minted and funded by the owner, delivered by
  // the worker, accepted by the owner. Nothing of this protocol is involved until it is bridged.
  const tt = taskToken.contract;
  let n = 0;
  const tender = async (owner, worker) => {
    n += 1;
    const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: REWARD, maxCompletions: 0, submitBy: 0, settleBy: 0,
      epochLength: 0, maxCompletionsPerEpoch: 0, judgmentWindow: 3600 };
    const tokenId = await tt.nextId();
    await sent(tt.connect(owner.wallet).mintTask(owner.address, owner.address, owner.address, ethers.id(`td ${n}`), ethers.id(`task ${n}`), `local://task/${n}`, terms));
    await sent(tt.connect(owner.wallet).fundTask(tokenId, REWARD, { value: REWARD }));
    await sent(tt.connect(worker.wallet).submitFulfillment(tokenId, ethers.id(`result ${n}`), `local://result/${n}`));
    const submissionId = await tt.submissionCountOf(tokenId);
    await sent(tt.connect(owner.wallet).acceptFulfillment(tokenId, submissionId));
    return { tokenId: tokenId.toString(), submissionId: submissionId.toString() };
  };

  // ---------------------------------------------------------------- epoch 0
  await setTime(genesisTime);
  console.log("epoch 0");
  log("epoch 0: worker A does the audit job (pouw work)", await work(workerA));
  log("epoch 0: worker B does the audit job (pouw work)", await work(workerB));
  log("epoch 0: an address that is not admitted does the audit job (pouw work)", await work(stranger));

  const t1 = await tender(demander, workerB);
  const pushed = pouw(["bridge", t1.tokenId, t1.submissionId], workerB);
  check("the worker cannot bridge a tender by itself: the client is refused with NotDemander", pushed.status === 1 && pushed.stderr.includes("NotDemander"));
  const b1 = await bridge(demander, t1);
  log("epoch 0: the demander's tender, delivered by worker B, accepted; the demander confirms it (pouw bridge)", b1);
  const t2 = await tender(relatedDemander, workerB);
  const b2 = await bridge(relatedDemander, t2);
  log("epoch 0: a tender between declared-related parties, confirmed by its owner (pouw bridge)", b2);
  const t3 = await tender(demander, workerA);
  log("epoch 0: a second tender of the demander, delivered by worker A and accepted - not bridged yet", t3);

  const early = pouw(["audit", 0], null);
  check("an audit of an epoch that has not ended is refused (exit status 3)", early.status === 3);
  const tooEarly = pouw(["seal", 0], third);
  check("a close record for a running epoch is refused with EpochNotEnded", tooEarly.status === 1 && tooEarly.stderr.includes("EpochNotEnded"));

  // ---------------------------------------------------------------- epoch 1
  await setTime(genesisTime + EPOCH + 5n);
  console.log("epoch 1");
  const subject0 = await ledger.contract.auditSubject(0);
  log("epoch 1: worker A recomputes epoch 0 from the log and submits (pouw work)", await work(workerA));
  log("epoch 1: worker B recomputes epoch 0 from the log and submits (pouw work)", await work(workerB));
  const twice = pouw(["work"], workerB);
  check("a second submission for the same instance is refused with AlreadySubmitted", twice.status === 1 && twice.stderr.includes("AlreadySubmitted"));
  const b3 = await bridge(demander, t3);
  log("epoch 1: the tender accepted in epoch 0 is confirmed now (pouw bridge)", b3);
  const count = await ledger.contract.receiptCount();
  const b3again = await bridge(demander, t3);
  check("bridging the same submission again returns the same receipt and adds nothing", b3again.receiptId === b3.receiptId && (await ledger.contract.receiptCount()) === count);

  // ---------------------------------------------------------------- after epoch 1: close records and the audit
  await setTime(genesisTime + 2n * EPOCH + 5n);
  console.log("after epoch 1");
  for (const e of [0, 1]) {
    const r = must(pouw(["seal", e], third), `pouw seal ${e}`);
    gas.seal.push(await gasOf(r.txHash));
    log(`the third party asks for the close record of epoch ${e} (pouw seal)`, r);
  }

  const epochs = [];
  for (const e of [0, 1]) {
    const run = pouw(["audit", e], null);
    check(`epoch ${e}: the audit, run as a separate process with the manifest and the endpoint only, agrees with the ledger on every figure`,
      run.status === 0 && run.out && run.out.ok === true && run.out.findings.length === 0);
    if (!run.out) throw new Error(`audit of epoch ${e} produced no record: ${run.stderr}`);
    let same = run.out.table.length > 0;
    for (const row of run.out.table) same = same && (await ledger.contract.allocation(e, row.worker)).toString() === row.allocation;
    check(`epoch ${e}: every row of the audit's table equals the ledger's view`, same);
    epochs.push(run.out);
  }

  const row = (e, address) => epochs[e].table.find((r) => r.worker === address);
  const P = (v) => ethers.parseUnits(String(v), 18).toString();
  check("epoch 0: worker A is allocated 175 test points and worker B 250 - the capped share of each pool they worked in",
    row(0, workerA.address).allocation === P(175) && row(0, workerB.address).allocation === P(250));
  check("epoch 1: worker A is allocated 250 test points and worker B 175",
    row(1, workerA.address).allocation === P(250) && row(1, workerB.address).allocation === P(175));
  check("the address that is not admitted is measured and allocated nothing",
    row(0, stranger.address).measured.g0 === "10" && row(0, stranger.address).allocation === "0");
  check("the tender between declared-related parties is recorded, classed and not subsidized",
    b2.relation === "declared-related" && b2.eligibility === "declared-related-not-subsidized" && b2.gmuMeasured === "50" && b2.gmuSubsidized === "0");
  check("the tender confirmed late counts in epoch 1, and epoch 0 did not move",
    b3.epoch === "1" && b3.eligibility === "eligible" && (await ledger.contract.auditSubject(0)) === subject0 && epochs[0].subject === subject0);
  let held = 0n;
  for (const c of [policy, ledger, adapter, auditFn, seedSource]) held += await provider.getBalance(c.address);
  check("no contract of the kernel holds funds; the bounties were paid by the tenders' own vaults", held === 0n);
  check("each epoch's allocations and its unallocated remainder add up to its budget",
    epochs.every((r) => BigInt(r.allocated) + BigInt(r.unallocated) === BigInt(r.budget) && BigInt(r.unallocated) >= 0n));

  // what a third party sees
  console.log("");
  console.log(pouw(["status", "--address", workerA.address], null, { json: false }).text.trimEnd());
  for (const e of [0, 1]) { console.log(""); console.log(pouw(["audit", e], null, { json: false }).text.trimEnd()); }

  // ---------------------------------------------------------------- evidence
  const ok = checks.every((c) => c.ok);
  const recordedAt = new Date().toISOString();
  const stamp = recordedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const record = {
    schema: "finchain-pouw.local-run/1",
    environment: "local-devnet",
    recordedAt,
    what: "Round R1: two workers, one round of G0 and G1 work, GMU, two epochs closed by time, an audit from the chain alone",
    ok,
    host: { node: process.version, platform: `${process.platform}/${process.arch}` },
    tools: { hardhat: version("hardhat"), ethers: ethers.version, solc: version("solc") },
    client: { name: "finchain-pouw", version: version("..") },
    sources: Object.fromEntries(SOURCES.map((f) => [f, sha256(f)])),
    deployment: manifest,
    parameters: g.jsonable(PARAMS),
    profiles: [
      { name: g.PROFILE_G0_REF, function: "audit-v1", module: auditFn.address, baseGmu: 10, maxGmuPerWorkerPerEpoch: 10, jobsPerEpoch: 1 },
      { name: g.PROFILE_G1_TENDER, module: adapter.address, baseGmu: 50, maxGmuPerWorkerPerEpoch: 200 },
    ],
    parties: parties.map((p) => ({ role: p.role, address: p.address, operator: p.operator, admitted: p.admitted })),
    gasUsed: gas,
    checks,
    transcript,
    epochs,
    notes: [
      "Every party's key was generated for this run and deleted after it; all parties belong to whoever ran the script, and the operator numbers stand in for distinct parties so that the rules can be exercised.",
      "The record is evidence that the mechanism works end to end and that an independent recomputation agrees with the ledger. It is not evidence of independent participation, of demand, or of any amount of computation.",
      "Workers, demanders and the third party acted through the reference client as separate processes; the ERC-8414 tenders were made with the standard's own calls.",
      "Time was moved by the development node's own controls; epochs are 600 seconds of the node's clock.",
      "The development node answers the finalized tag with its latest block, so the settlement rule is exercised by the test suite, not by this run.",
    ],
  };
  const out = path.join(root, "evidence", `local-run-${stamp}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(g.jsonable(record), null, 2)}\n`);
  console.log(`\n${ok ? "PASS" : "FAIL"}: ${checks.filter((c) => c.ok).length} of ${checks.length} checks; record evidence/${path.basename(out)}`);
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
