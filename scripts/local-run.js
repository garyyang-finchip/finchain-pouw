// The rehearsal of round R2 on a development network.
//
//   npm run local-run
//
// What an operator does on a public chain is done here with the same commands, each run as a
// process of its own: scripts/keys.js, scripts/identity-check.js, scripts/deploy.js (from the
// committed builds and the round's own configuration, deployments/finchain-sepolia-r2.config.json),
// client/pouw.js verify, scripts/round.js, client/pouw.js audit. The script itself does only what
// the chain and the world around the protocol do: it starts a development node, puts in place the
// two things an OP Stack chain with agents on it has (the L1Block predeploy, an ERC-8414 contract),
// funds the steward, moves the node's clock, and stands in front of the node as an endpoint whose
// `finalized` block lags the way a rollup's does. The node mines a block at intervals, not one per
// transaction.
//
// Three deployments are made, because three things are accepted separately:
//   1. operator wallets  - two wallets of one operator work two epochs: a controlled self-test,
//                          then a standard epoch. This is round R2a as it is configured.
//   2. contract accounts - two agents whose on-chain identity is a contract account take part as
//                          themselves, through their accounts; their keys alone are somebody else.
//   3. ledger v2         - deployed by scripts/deploy-v2.js from the builds of build/v2, superseding
//                          deployment 1, with the cell guard bound to a stand-in for a FOGA cell, and
//                          checked from the outside against its manifest; then worked with the
//                          client's commands: the cell's audit job through a delegate under a permit
//                          that scripts/sign-permit.js signed with the cell owner's key, a wallet for
//                          itself, and a tender confirmed through the delegate under its owner's
//                          permit; then audited and checked by the commands.
//
// Keys are made by scripts/keys.js in a temporary directory outside the repository and deleted at
// the end. One evidence record is written under evidence/.
//
// What a run shows: that the commands work end to end and that an independent recomputation agrees
// with the ledger. Every party belongs to whoever runs it; it shows nothing about independent
// participation, demand, or an amount of computation.
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");
const g = require("../client/lib/genesis");
const a2 = require("../client/lib/audit2");
const m2 = require("../client/lib/manifest2");
const canonical = require("../client/lib/canonical");
const c = require("./lib/common");
const { TENDER_ABI, eventIn, stageTender } = require("./lib/tender");

const root = c.root;
const NODE_PORT = Number(process.env.POUW_LOCAL_PORT ?? 18545);
const NODE = `http://127.0.0.1:${NODE_PORT}`;
const RPC = `http://127.0.0.1:${NODE_PORT + 1}`; // the endpoint the commands see
const OUT = path.join(root, "out", "local-run");
const BLOCK_MS = Number(process.env.POUW_LOCAL_BLOCK_MS ?? 250); // the development node's block interval
const R2_CONFIG = "deployments/finchain-sepolia-r2.config.json";
const L1_BLOCK = "0x4200000000000000000000000000000000000015";
const versionOf = (name) => require(`${name}/package.json`).version;
const artifact = (rel) => c.readJson(path.join(root, "artifacts", "contracts", rel));

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesUnder(rel));
    else out.push(rel);
  }
  return out.sort();
}

/// A command as a process of its own. Never blocks this process: the endpoint lives in it.
function run(script, args, env = {}, onOutput = () => {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, script), ...args.map(String)],
      { cwd: root, env: { PATH: process.env.PATH, HOME: os.homedir(), POUW_POLL_MS: "50", ...env } });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; onOutput(stdout); });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { json = null; }
      resolve({ status, stdout, stderr: stderr.trim(), json });
    });
  });
}

async function main() {
  // ---------------------------------------------------------------- build, node, endpoint
  const hardhat = require.resolve("hardhat/internal/cli/bootstrap");
  const build = spawnSync(process.execPath, [hardhat, "compile", "--quiet"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`compile failed:\n${build.stdout}${build.stderr}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const KEYS = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-rehearsal-"));
  const nodeLog = fs.openSync(path.join(OUT, "node.log"), "w");
  const node = spawn(process.execPath, [hardhat, "node", "--port", String(NODE_PORT), "--hostname", "127.0.0.1"], { cwd: root, stdio: ["ignore", nodeLog, nodeLog] });

  // The endpoint: everything goes to the node unchanged, except that `finalized` is a block this
  // script chooses - the latest one, or one held back, as on a rollup whose batches settle later.
  let heldAt = null;
  const post = async (body) => (await fetch(NODE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
  const settle = (call) => (call && call.method === "eth_getBlockByNumber" && call.params?.[0] === "finalized"
    ? { ...call, params: [heldAt === null ? "latest" : ethers.toQuantity(heldAt), ...call.params.slice(1)] } : call);
  const endpoint = http.createServer((req, res) => {
    let text = "";
    req.on("data", (d) => { text += d; });
    req.on("end", async () => {
      try {
        const body = JSON.parse(text);
        const answer = await post(Array.isArray(body) ? body.map(settle) : settle(body));
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer));
      } catch (e) { res.writeHead(500).end(String(e.message)); }
    });
  });
  await new Promise((resolve) => endpoint.listen(NODE_PORT + 1, "127.0.0.1", resolve));
  const cleanup = () => {
    try { node.kill("SIGTERM"); } catch { /* already gone */ }
    fs.rmSync(KEYS, { recursive: true, force: true });
  };
  process.on("exit", cleanup);

  for (let i = 0; ; i++) {
    try { if ((await post({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })).result) break; } catch { /* not listening yet */ }
    if (i > 150 || node.exitCode !== null) throw new Error(`the development node did not start on ${NODE} (see out/local-run/node.log)`);
    await c.sleep(200);
  }
  const provider = new ethers.JsonRpcProvider(NODE, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  provider.pollingInterval = 50;
  const chainId = Number((await provider.getNetwork()).chainId);
  // blocks come at intervals, as on a public chain, and not one per transaction: a transaction waits
  // in the pool, and a command that read the chain too early, or reused a nonce, would show it here
  await provider.send("evm_setAutomine", [false]);
  await provider.send("evm_setIntervalMining", [BLOCK_MS]);
  const head = async () => provider.getBlock("latest");
  const setTime = async (t) => { await provider.send("evm_setNextBlockTimestamp", [Number(t)]); await provider.send("evm_mine", []); };
  const sent = async (txPromise) => (await txPromise).wait();
  console.log(`development network on ${NODE}, chain ${chainId}; the commands use ${RPC}`);

  const transcript = [];
  const log = (step, detail = {}) => { transcript.push({ step, ...g.jsonable(detail) }); console.log(`  ${step}`); };
  const checks = [];
  const check = (what, ok) => { checks.push({ check: what, ok: Boolean(ok) }); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); return Boolean(ok); };
  const must = (r, what) => { if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${r.stderr || r.stdout}`); return r; };
  const recordOf = (r) => c.readJson(/^record (.+)$/m.exec(r.stdout)[1]);
  // what the operator sees on the terminal, shown under the step that produced it
  const show = (r) => { for (const line of r.stdout.trimEnd().split("\n")) console.log(`      | ${line}`); return r; };
  const P = (v) => ethers.parseUnits(String(v), 18).toString();

  // ---------------------------------------------------------------- the chain as an operator finds it
  // an OP Stack chain has the L1Block predeploy; its values move with the L1 origin
  const [chainOperator] = await provider.listAccounts();
  const mock = artifact("testing/MockL1Block.sol/MockL1Block.json");
  await provider.send("hardhat_setCode", [L1_BLOCK, mock.deployedBytecode]);
  const l1 = new ethers.Contract(L1_BLOCK, mock.abi, chainOperator);
  let l1Number = 9000000n;
  const l1Origin = async () => { l1Number += 600n; await sent(l1.set(l1Number, ethers.id(`l1 block ${l1Number}`))); };
  await l1Origin();
  // and an ERC-8414 contract that was there before this protocol: the standard's reference contract
  const tt = artifact("vendor/erc8414/TaskToken.sol/TaskToken.json");
  const taskTokenDeploy = await new ethers.ContractFactory(tt.abi, tt.bytecode, chainOperator).deploy("Task Tenders", "TASK");
  const taskTokenBlock = (await taskTokenDeploy.deploymentTransaction().wait()).blockNumber;
  const taskToken = new ethers.Contract(await taskTokenDeploy.getAddress(), TENDER_ABI, provider);

  // ---------------------------------------------------------------- keys
  console.log("keys");
  const refusedInside = await run("scripts/keys.js", [path.join(OUT, "keys"), "steward"]);
  check("keys are not made inside the repository's checkout", refusedInside.status === 1 && refusedInside.stderr.includes("inside this repository") && !fs.existsSync(path.join(OUT, "keys")));
  const names = ["steward", "wallet-a", "wallet-b", "agent-x", "agent-y", "delegate"];
  const made = must(await run("scripts/keys.js", [KEYS, ...names, "--json"]), "scripts/keys.js").json;
  const address = Object.fromEntries(made.keys.map((k) => [k.name, k.address]));
  const again = must(await run("scripts/keys.js", [KEYS, ...names, "--json"]), "scripts/keys.js").json;
  check("a key file is its owner's alone, and a second run keeps every key",
    names.every((n) => (fs.statSync(c.keyFileOf(KEYS, n)).mode & 0o777) === 0o600) && again.keys.every((k) => k.key === "kept" && k.address === address[k.name]));
  const keyFile = (name) => c.keyFileOf(KEYS, name);
  // the chain's operator funds the steward, as on a public chain; the agents' keys hold their own gas
  await sent(chainOperator.sendTransaction({ to: address.steward, value: ethers.parseEther("1") }));
  for (const n of ["agent-x", "agent-y"]) await sent(chainOperator.sendTransaction({ to: address[n], value: ethers.parseEther("1") }));
  log("keys made by scripts/keys.js outside the repository; the steward funded by the chain's operator", { addresses: address });

  // ================================================================ 1. operator wallets (round R2a)
  console.log("1. operator wallets");
  const r2 = c.readJson(path.join(root, R2_CONFIG));
  const config = { ...r2, name: "local-run", environment: "local-devnet", chainId, rpc: RPC, logChunk: 40,
    taskToken8414: { address: taskToken.target, deployBlock: taskTokenBlock },
    notes: [`The parameters, profiles, parties and round of ${R2_CONFIG}, on a development network.`] };
  const configPath = path.join(OUT, "config.json");
  c.writeJson(configPath, config);
  const manifestPath = path.join(OUT, "manifest.json");
  const deployArgs = ["--config", configPath, "--keys", KEYS, "--genesis", "+15m", "--out", OUT];

  const nonceBefore = await provider.getTransactionCount(address.steward);
  const planned = show(must(await run("scripts/deploy.js", deployArgs), "scripts/deploy.js (plan)"));
  check("without --yes the deployment is planned and nothing is sent",
    planned.stdout.includes("plan only") && (await provider.getTransactionCount(address.steward)) === nonceBefore && !fs.existsSync(manifestPath));
  const deployed = await run("scripts/deploy.js", [...deployArgs, "--yes"]);
  must(deployed, "scripts/deploy.js");
  console.log(`      | ${deployed.stdout.trimEnd().split("\n").slice(-6).join("\n      | ")}`);
  const manifest = c.readJson(manifestPath);
  const deployment = c.readJson(/record +(\S+)/.exec(deployed.stdout)[1]);
  check("the kernel is deployed from the committed builds and read back as configured",
    deployed.stdout.includes("DEPLOYED:") && deployment.ok === true && deployment.verification.code.every((x) => x.ok) && deployment.verification.policy.every((x) => x.ok));
  const second = await run("scripts/deploy.js", [...deployArgs, "--yes"]);
  check("a second deployment over an existing manifest is refused", second.status === 1 && second.stderr.includes("exists"));
  log("deployed by scripts/deploy.js: policy, seed source, ledger, audit function, adapter; two profiles; two parameter versions; two wallets admitted, declared under one operator, funded",
    { manifest: "out/local-run/manifest.json", ledger: manifest.contracts.GenesisLedger, transactions: deployment.transactions.length, gasUsed: deployment.gasUsed });

  const pouw = (args, key, extra = []) => run("client/pouw.js", [...args, "--manifest", manifestPath, "--json", ...(key ? ["--key-file", keyFile(key)] : []), ...extra]);
  const verified = await pouw(["verify"]);
  check("pouw verify: the code on chain is the committed builds, wired as the manifest says", verified.status === 0 && verified.json?.ok === true);
  const tampered = path.join(OUT, "manifest-tampered.json");
  c.writeJson(tampered, { ...manifest, code: { ...manifest.code, GenesisLedger: { ...manifest.code.GenesisLedger, codeHash: ethers.id("another code") } } });
  const refusedCode = await run("client/pouw.js", ["verify", "--manifest", tampered, "--json"]);
  check("pouw verify differs (exit status 2) when the manifest records another code hash", refusedCode.status === 2 && refusedCode.json?.ok === false);

  const genesis = BigInt(manifest.clock.genesisTime);
  const EPOCH = BigInt(manifest.clock.epochDuration);
  const round = (extra = [], env = {}, onOutput = undefined) => run("scripts/round.js", ["--config", configPath, "--keys", KEYS, "--out", OUT, ...extra], env, onOutput);
  const before = await round();
  check("before genesis the round does nothing and says when to come back (exit status 3)", before.status === 3 && before.stdout.includes("not started"));

  // ---------------------------------------------------------------- epoch 0: controlled self-test
  await setTime(genesis + 5n);
  console.log("epoch 0");
  const rounds = [];
  const r0 = show(must(await round(), "scripts/round.js in epoch 0"));
  rounds.push(recordOf(r0));
  const tendersOf = (rec) => rec.did.filter((s) => s.step === "tender");
  const worksOf = (rec) => rec.did.filter((s) => s.step === "work");
  check("epoch 0 (controlled self-test): a test tender in each direction is settled and confirmed, and both wallets do the audit job",
    rounds[0].mode === "controlled-self-test" && tendersOf(rounds[0]).length === 2 && worksOf(rounds[0]).length === 2
    && tendersOf(rounds[0]).every((t) => t.bridge.relation === "declared-related" && t.bridge.eligibility === "eligible" && t.bridge.gmuSubsidized === "50")
    && worksOf(rounds[0]).every((w) => w.verdict === "accepted" && w.gmuSubsidized === "10" && w.audited === null));
  log("epoch 0: scripts/round.js - two test tenders (mint, fund, deliver, accept, pouw bridge), two audit jobs (pouw work)", { receipts: rounds[0].summary.receipts });
  const r0again = show(must(await round(), "scripts/round.js in epoch 0, again"));
  rounds.push(recordOf(r0again));
  check("run again in the same epoch, the round finds its work on chain and does nothing twice",
    rounds[1].did.length === 0 && rounds[1].found.length === 4 && rounds[1].summary.receipts === "4");

  const t0 = tendersOf(rounds[0])[0]; // owned by wallet-a
  const pushed = await pouw(["bridge", t0.tokenId, t0.submissionId], "wallet-b");
  check("a key that does not own a tender cannot confirm it: refused with NotDemander", pushed.status === 1 && pushed.stderr.includes("NotDemander"));
  const twice = await pouw(["work"], "wallet-a");
  check("a second pouw work for the same instance finds its receipt by the contribution id and sends nothing",
    twice.status === 0 && twice.json?.alreadyRecorded === true && twice.json.txHash === null
    && worksOf(rounds[0]).some((w) => w.worker === address["wallet-a"] && w.receiptId === twice.json.receiptId));
  const early = await pouw(["audit", 0]);
  check("an audit of an epoch that has not ended is refused (exit status 3)", early.status === 3);
  const tooEarly = await pouw(["seal", 0], "wallet-a");
  check("a close record for a running epoch is refused with EpochNotEnded", tooEarly.status === 1 && tooEarly.stderr.includes("EpochNotEnded"));
  fs.chmodSync(keyFile("wallet-b"), 0o644);
  const loose = await pouw(["work"], "wallet-b");
  fs.chmodSync(keyFile("wallet-b"), 0o600);
  check("a key file that others can read is refused before anything is sent", loose.status === 1 && loose.stderr.includes("can be read by others"));

  // ---------------------------------------------------------------- epoch 1: standard
  heldAt = (await head()).number; // the settled block stays inside epoch 0 for now
  await l1Origin();
  await setTime(genesis + EPOCH + 5n);
  console.log("epoch 1");
  const unsettled = await pouw(["audit", 0]);
  check("epoch 0 has ended but is not settled: an audit waits (exit status 3)", unsettled.status === 3 && unsettled.stderr.includes("not settled yet"));
  const r1 = show(await round());
  rounds.push(recordOf(r1));
  check("epoch 1 before epoch 0 is settled: the tenders are done, the audit jobs wait (exit status 3)",
    r1.status === 3 && tendersOf(rounds[2]).length === 2 && worksOf(rounds[2]).length === 0 && rounds[2].waiting.length === 2
    && rounds[2].did.some((s) => s.step === "close" && s.epoch === "0"));
  // the batches settle once the round has been seen waiting for them
  const r1wait = show(must(await round(["--wait"], { POUW_WAIT_MS: "300" }, (text) => { if (text.includes("waiting:")) heldAt = null; }), "scripts/round.js --wait in epoch 1"));
  rounds.push(recordOf(r1wait));
  check("with --wait the round waits for the settled block and then does the audit jobs: each recomputes epoch 0 in full",
    r1wait.stdout.includes("waiting:") && rounds[3].mode === "standard" && worksOf(rounds[3]).length === 2
    && worksOf(rounds[3]).every((w) => w.audited === "0" && w.receiptsAudited === 4 && w.gmuSubsidized === "10") && rounds[3].found.length === 2);
  check("epoch 1 (standard): the tenders between declared-related wallets are measured and not subsidized",
    tendersOf(rounds[2]).every((t) => t.bridge.eligibility === "declared-related-not-subsidized" && t.bridge.gmuMeasured === "50" && t.bridge.gmuSubsidized === "0"));
  log("epoch 1: scripts/round.js, first while epoch 0 was not settled, then with --wait", { receipts: rounds[3].summary.receipts });

  // ---------------------------------------------------------------- after epoch 1: close record, audits
  await l1Origin();
  await setTime(genesis + 2n * EPOCH + 5n);
  console.log("after epoch 1");
  const r2run = show(must(await round(), "scripts/round.js after the round"));
  rounds.push(recordOf(r2run));
  const reader = new ethers.Contract(manifest.contracts.GenesisLedger, g.abi.ledger, provider);
  check("after the round's last epoch the round writes its close record and starts no new work",
    rounds[4].did.length === 1 && rounds[4].did[0].step === "close" && rounds[4].did[0].epoch === "1"
    && (await reader.epochSummary(0)).isSealed && (await reader.epochSummary(1)).isSealed && (await reader.receiptCount()) === 8n);

  const audits = [];
  for (const e of [0, 1]) {
    const a = await pouw(["audit", e]);
    check(`epoch ${e}: the audit - a process with the manifest and the endpoint, no key - agrees with the ledger on every figure`,
      a.status === 0 && a.json?.ok === true && a.json.findings.length === 0);
    if (!a.json) throw new Error(`the audit of epoch ${e} produced no record: ${a.stderr}`);
    let same = a.json.table.length === 2;
    for (const row of a.json.table) same = same && (await reader.allocation(e, row.worker)).toString() === row.allocation;
    check(`epoch ${e}: every row of the audit's table equals the ledger's view`, same);
    // one block for everything: named in the record with its hash and its time, the close record within it
    const snap = a.json.snapshot ?? {};
    check(`epoch ${e}: the audit read one block and names it; the epoch's close record lies within that block`,
      a.json.schema === "finchain-pouw.audit/2" && a.json.snapshotTag === "finalized" && /^0x[0-9a-f]{64}$/.test(snap.hash ?? "") && Number(snap.timestamp) > 0
      && a.json.sealed === true && a.json.closeRecord.present === true && a.json.closeRecord.block <= snap.number
      && !Number.isNaN(Date.parse(a.json.observedAt)));
    // the same block again, by its number: what was found is the same, the report is another, and both hashes recompute
    const again = await pouw(["audit", e], null, ["--tag", snap.number]);
    check(`epoch ${e}: an audit repeated at that block has the same result hash; the hashes of both records are those of their canonical form`,
      again.status === 0 && again.json?.snapshot.hash === snap.hash && again.json.resultHash === a.json.resultHash
      && [a.json, again.json].every((r) => canonical.reportHash(r) === r.reportHash && canonical.resultHash(r) === r.resultHash));
    audits.push(a.json);
  }
  const rowOf = (e, who) => audits[e].table.find((r) => r.worker === address[who]);
  check("epoch 0 is a controlled self-test: budget 1000 as 100 / 900, each wallet 25 + 225 test points - the capped share of either pool - and half the budget unallocated",
    audits[0].mode === "controlled-self-test" && audits[0].pools.g0 === P(100) && audits[0].pools.g1 === P(900)
    && ["wallet-a", "wallet-b"].every((w) => rowOf(0, w).allocation === P(250) && rowOf(0, w).allocationG0 === P(25) && rowOf(0, w).allocationG1 === P(225))
    && audits[0].unallocated === P(500));
  check("epoch 1 is standard: each wallet 25 test points from the audit job; the tenders count 100 GMU measured and none subsidized",
    audits[1].mode === "standard" && ["wallet-a", "wallet-b"].every((w) => rowOf(1, w).allocation === P(25))
    && audits[1].measured.g1 === "100" && audits[1].subsidized.g1 === "0" && audits[1].g1.byRelation["declared-related"] === 2);
  check("the audit adds the table up per declared operator: one operator, two addresses, twice the share an address can have",
    audits[0].operators.length === 1 && audits[0].operators[0].addresses.length === 2 && audits[0].operators[0].allocation === P(500) && audits[0].undeclaredAddresses === 0);
  check("every record carries the deployment's labels", [...audits, verified.json].every((r) => r.labels.join() === config.labels.join()) && rounds.every((r) => r.labels.join() === config.labels.join()));
  let held = 0n;
  for (const a of Object.values(manifest.contracts)) held += await provider.getBalance(a);
  check("no contract of the kernel holds funds; the bounties were paid by the tenders' own vaults", held === 0n);

  console.log("");
  console.log((await run("client/pouw.js", ["status", "--manifest", manifestPath, "--address", address["wallet-a"]])).stdout.trimEnd());
  for (const e of [0, 1]) { console.log(""); console.log((await run("client/pouw.js", ["audit", e, "--manifest", manifestPath])).stdout.trimEnd()); }

  // ================================================================ 2. contract accounts
  console.log("\n2. contract accounts");
  const acct = artifact("testing/TestAccount.sol/TestAccount.json");
  const agents = {};
  for (const n of ["agent-x", "agent-y"]) {
    const key = c.walletOf(KEYS, n, provider);
    const account = await new ethers.ContractFactory(acct.abi, acct.bytecode, chainOperator).deploy(key.address);
    await account.deploymentTransaction().wait();
    const accountAddress = await account.getAddress();
    await sent(chainOperator.sendTransaction({ to: accountAddress, value: ethers.parseEther("0.1") })); // an account holds its own funds
    const act = async (data, value = 0n) => sent(new ethers.Contract(accountAddress, acct.abi, key).execute(taskToken.target, value, data));
    agents[n] = { key, account: accountAddress, act };
  }
  const X = agents["agent-x"]; const Y = agents["agent-y"];
  const REWARD = ethers.parseEther(String(r2.round.rewardEth));
  // one tender the way an agent's own software makes it: every ERC-8414 call is the account's, through execute
  const accountTender = async (label) => {
    const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: REWARD, maxCompletions: 1, submitBy: 0, settleBy: 0, epochLength: 0, maxCompletionsPerEpoch: 0, judgmentWindow: 3600 };
    const minted = await X.act(taskToken.interface.encodeFunctionData("mintTask", [X.account, X.account, X.account, ethers.id(`${label}:description`), ethers.id(`${label}:task`), `urn:finchain-pouw:rehearsal:${label}`, terms]));
    const tokenId = eventIn(minted, taskToken, "Transfer", (a) => a.to === X.account).args.tokenId;
    await X.act(taskToken.interface.encodeFunctionData("fundTask", [tokenId, REWARD]), REWARD);
    const delivered = await Y.act(taskToken.interface.encodeFunctionData("submitFulfillment", [tokenId, ethers.id(`${label}:result`), `urn:finchain-pouw:rehearsal:${label}:result`]));
    const submissionId = eventIn(delivered, taskToken, "FulfillmentSubmitted").args.submissionId;
    await X.act(taskToken.interface.encodeFunctionData("acceptFulfillment", [tokenId, submissionId]));
    return { tokenId: tokenId.toString(), submissionId: submissionId.toString() };
  };
  const old = await accountTender("before-this-deployment"); // a tender that exists before the deployment below

  // the check that comes before a deployment on a chain where agents are contract accounts
  const identitiesPath = path.join(OUT, "identities.json");
  c.writeJson(identitiesPath, { schema: "finchain-pouw.identity-config/1", name: "local-run", chainId, rpc: RPC, taskToken8414: { address: taskToken.target },
    parties: [{ name: "agent-x", account: X.account, wallet: X.key.address }, { name: "agent-y", account: Y.account, wallet: Y.key.address }],
    tenders: [{ tokenId: old.tokenId, submissionId: old.submissionId }] });
  const identities = must(await run("scripts/identity-check.js", ["--config", identitiesPath, "--json"]), "scripts/identity-check.js").json;
  show(await run("scripts/identity-check.js", ["--config", identitiesPath]));
  check("the identity check reads that the agents are contract accounts, that the tender is the account's and that a key alone would not be accepted",
    identities.accountsAreKeys === false && identities.parties.every((p) => p.accountIsContract && p.walletIsOwner)
    && identities.tenders[0].ownerIs === "the account of agent-x" && identities.tenders[0].submissions[0].fulfillerIs === "the account of agent-y"
    && identities.tenders[0].bridge.aKeySendingByItselfIsAccepted === false);
  log("scripts/identity-check.js: accounts, keys and the owner and worker of a tender, read from the chain", { conclusions: identities.conclusions });

  // a deployment of their own: the accounts are the admitted parties
  const OUT2 = path.join(OUT, "accounts");
  const config2 = { ...r2, name: "local-run-accounts", environment: "local-devnet", labels: ["controlled-self-test", "contract-account-integration"], chainId, rpc: RPC, logChunk: 40,
    taskToken8414: { address: taskToken.target, deployBlock: taskTokenBlock }, params: [r2.params[0]],
    parties: [{ name: "the account of agent-x", address: X.account, admitted: true, operator: 1 }, { name: "the account of agent-y", address: Y.account, admitted: true, operator: 1 }],
    notes: ["Two contract accounts of one operator, admitted as themselves. The accounts stand in for agents whose identity on chain is a contract account; they are the test account of contracts/testing."] };
  delete config2.round;
  const config2Path = path.join(OUT2, "config.json");
  c.writeJson(config2Path, config2);
  const deployed2 = must(await run("scripts/deploy.js", ["--config", config2Path, "--keys", KEYS, "--genesis", "+15m", "--out", OUT2, "--yes"]), "scripts/deploy.js (accounts)");
  const manifest2Path = path.join(OUT2, "manifest.json");
  const manifest2 = c.readJson(manifest2Path);
  const deployment2 = c.readJson(/record +(\S+)/.exec(deployed2.stdout)[1]);
  await l1Origin();
  await setTime(BigInt(manifest2.clock.genesisTime) + 5n);
  const pouw2 = (args, key, extra = []) => run("client/pouw.js", [...args, "--manifest", manifest2Path, "--json", ...(key ? ["--key-file", keyFile(key)] : []), ...extra]);

  const steps = [];
  const wx = must(await pouw2(["work"], "agent-x", ["--account", X.account]), "pouw work --account (agent-x)").json;
  const wy = must(await pouw2(["work"], "agent-y", ["--account", Y.account]), "pouw work --account (agent-y)").json;
  check("pouw work --account: the worker of record is the account, driven by its key, and the admitted account is subsidized",
    wx.worker === X.account && wx.key === X.key.address && wx.status.gmuSubsidized === "10" && wy.worker === Y.account && wy.status.gmuSubsidized === "10");
  const alone = must(await pouw2(["work"], "agent-x"), "pouw work (the key of agent-x alone)").json;
  check("the same key sending by itself is another worker: recorded under the key's own address, measured, not admitted, not subsidized",
    alone.worker === X.key.address && alone.worker !== wx.worker && alone.instance !== wx.instance && alone.status.gmuMeasured === "10" && alone.status.gmuSubsidized === "0"
    && g.INELIGIBLE_NAME[alone.status.ineligible] === "worker-not-admitted");
  const wrongKey = await pouw2(["work"], "agent-y", ["--account", X.account]);
  check("a key the account does not obey is refused before anything is sent", wrongKey.status === 1 && wrongKey.stderr.includes("neither the owner nor the operator"));
  steps.push({ step: "pouw work --account (agent-x)", ...wx }, { step: "pouw work --account (agent-y)", ...wy }, { step: "pouw work, the key of agent-x alone", ...alone });

  const fresh = await accountTender("in-epoch-0");
  const byKey = await pouw2(["bridge", fresh.tokenId, fresh.submissionId], "agent-x");
  check("a tender owned by an account is not confirmed by the account's key sending by itself: refused with NotDemander", byKey.status === 1 && byKey.stderr.includes("NotDemander"));
  const bx = must(await pouw2(["bridge", fresh.tokenId, fresh.submissionId], "agent-x", ["--account", X.account]), "pouw bridge --account").json;
  check("pouw bridge --account: confirmed by the owning account for the delivering account; declared-related, subsidized under the controlled self-test",
    bx.demander === X.account && bx.worker === Y.account && g.RELATION_NAME[bx.status.relation] === "declared-related" && bx.status.gmuSubsidized === "50");
  const bo = must(await pouw2(["bridge", old.tokenId, old.submissionId], "agent-x", ["--account", X.account]), "pouw bridge --account (the older tender)").json;
  check("a tender delivered before the deployment's first epoch is recorded and measured, and earns nothing",
    g.INELIGIBLE_NAME[bo.status.ineligible] === "delivered-before-genesis" && bo.status.gmuMeasured === "50" && bo.status.gmuSubsidized === "0");
  steps.push({ step: "pouw bridge --account", ...bx }, { step: "pouw bridge --account, the tender from before the deployment", ...bo });
  log("the accounts take part as themselves: pouw work --account, pouw bridge --account", { receipts: steps.length });

  await setTime(BigInt(manifest2.clock.genesisTime) + EPOCH + 5n);
  must(await pouw2(["seal", 0], "agent-x"), "pouw seal 0 (accounts)");
  const audit2 = await pouw2(["audit", 0]);
  check("the audit of the accounts' epoch agrees with the ledger: three workers of record - two accounts and one key",
    audit2.status === 0 && audit2.json?.ok === true && audit2.json.table.length === 3 && audit2.json.receiptCount === "5"
    && audit2.json.table.find((r) => r.worker === Y.account).allocation === P(250) && audit2.json.table.find((r) => r.worker === X.key.address).allocation === "0");
  console.log("");
  console.log((await run("client/pouw.js", ["audit", 0, "--manifest", manifest2Path])).stdout.trimEnd());

  // ================================================================ 3. ledger v2
  console.log("\n3. ledger v2");
  // a stand-in for a FOGA cell: the views the cell guard reads, and the owner's signature rule
  const cellArtifact = artifact("v2/testing/MockFogaCell.sol/MockFogaCell.json");
  const cellDeploy = await new ethers.ContractFactory(cellArtifact.abi, cellArtifact.bytecode, chainOperator).deploy(X.key.address);
  await cellDeploy.deploymentTransaction().wait();
  const cell = await cellDeploy.getAddress();
  const OUT3 = path.join(OUT, "v2");
  const config3 = {
    schema: "finchain-pouw.deploy-config/2", name: "local-run-v2", environment: "local-devnet", labels: ["controlled-self-test", "cell-account-integration"],
    chainId, rpc: RPC, logChunk: 40, epochDuration: r2.epochDuration, seedSource: r2.seedSource,
    taskToken8414: { address: taskToken.target, deployBlock: taskTokenBlock },
    supersedes: { manifest: path.relative(OUT3, manifestPath) },
    params: r2.params.map((v) => ({ ...v, operatorCapBps: 5000 })),
    profiles: r2.profiles,
    parties: [
      { name: "a stand-in for a FOGA cell", address: cell, admitted: true, operator: 1, guard: "FogaCellGuard" },
      { key: "wallet-a", admitted: true, operator: 1 },
      { key: "delegate", fundEth: "0.005" },
    ],
    notes: ["The parameters and profiles of round R2a with an operator cap, on ledger v2. One cell stand-in behind the cell guard, one wallet, and a delegate key funded for gas; all of one operator."],
  };
  const config3Path = path.join(OUT3, "config.json");
  c.writeJson(config3Path, config3);
  const manifest3Path = path.join(OUT3, "manifest.json");
  const deploy3Args = ["--config", config3Path, "--keys", KEYS, "--genesis", "+15m", "--out", OUT3];
  const nonce3 = await provider.getTransactionCount(address.steward);
  const planned3 = show(must(await run("scripts/deploy-v2.js", deploy3Args), "scripts/deploy-v2.js (plan)"));
  check("v2: without --yes the deployment is planned and nothing is sent; the plan names what it supersedes and what the cell guard would answer",
    planned3.stdout.includes("plan only") && planned3.stdout.includes("replaces  local-run, ledger") && planned3.stdout.includes("the cell guard would allow it now")
    && (await provider.getTransactionCount(address.steward)) === nonce3 && !fs.existsSync(manifest3Path));
  const deployed3 = must(await run("scripts/deploy-v2.js", [...deploy3Args, "--yes"]), "scripts/deploy-v2.js");
  console.log(`      | ${deployed3.stdout.trimEnd().split("\n").slice(-6).join("\n      | ")}`);
  const manifest3Bytes = fs.readFileSync(manifest3Path);
  const manifest3 = JSON.parse(manifest3Bytes.toString("utf8"));
  const deployment3 = c.readJson(/record +(\S+)/.exec(deployed3.stdout)[1]);
  check("v2: deployed from build/v2 and read back as configured - code, wiring, log starts, the guard and its code hash, the policy",
    deployed3.stdout.includes("DEPLOYED:") && deployment3.ok === true && deployment3.verification.deployment.every((x) => x.ok) && deployment3.verification.policy.every((x) => x.ok)
    && Object.keys(deployment3.builds).every((f) => f.startsWith("build/v2/")));
  check("v2: the manifest names the deployment it supersedes by name, ledger and the SHA-256 of its manifest, and the guard bound to the cell",
    manifest3.supersedes.name === "local-run" && manifest3.supersedes.ledger === manifest.contracts.GenesisLedger
    && manifest3.supersedes.manifestSha256 === c.sha256File(path.relative(root, manifestPath))
    && manifest3.guards[cell]?.contract === "FogaCellGuard" && manifest3.guards[cell].guard === manifest3.contracts.FogaCellGuard && manifest3.guards[cell].bindingVersion === 1);
  // the journal: created before anything was sent, each transaction written down when taken and again when confirmed
  const journal3 = fs.readFileSync(/journal +(\S+)/.exec(deployed3.stdout)[1], "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));
  const journalTaken3 = journal3.filter((e) => e.event === "submitted");
  const journalConfirmed3 = journal3.filter((e) => e.event === "confirmed");
  check("v2: the journal holds every transaction of the deployment, written down when taken and again when confirmed, and ends with the manifest",
    journal3[0]?.event === "planned" && journal3[0].transactions === journalTaken3.length && journalTaken3.length === deployment3.transactions.length && journalTaken3.length === journalConfirmed3.length
    && journalTaken3.every((e, i) => e.txHash === journalConfirmed3[i].txHash && e.status === "submitted" && journalConfirmed3[i].status === "confirmed")
    && journal3.at(-1)?.event === "finished" && journal3.at(-1).manifest?.contracts?.GenesisLedgerV2 === manifest3.contracts.GenesisLedgerV2);
  const second3 = await run("scripts/deploy-v2.js", [...deploy3Args, "--yes"]);
  check("v2: a second deployment over an existing manifest is refused, and the manifest is left as it was",
    second3.status === 1 && second3.stderr.includes("exists") && Buffer.compare(fs.readFileSync(manifest3Path), manifest3Bytes) === 0);
  // the check from the outside: the manifest and the endpoint, at the endpoint's finalized block
  const endpointProvider = c.connectRpc(RPC);
  const check3 = await m2.verifyDeployment(await a2.connect(manifest3, endpointProvider, { tag: "finalized" }));
  check("v2: the deployment checked from the outside against its manifest, at the finalized block", check3.ok === true);
  log("deployed by scripts/deploy-v2.js from build/v2: policy, seed source, ledger, audit function, adapter, cell guard; two profiles; two parameter versions; a cell stand-in bound to the cell guard; superseding deployment 1",
    { manifest: "out/local-run/v2/manifest.json", ledger: manifest3.contracts.GenesisLedgerV2, transactions: deployment3.transactions.length, gasUsed: deployment3.gasUsed });

  // worked with the commands. The permits are signed by scripts/sign-permit.js with the account's key
  // (the cell's owner key is agent-x's here, as the stand-in was made for it); the delegate key sends
  const ledger3 = manifest3.contracts.GenesisLedgerV2;
  const EPOCH3 = BigInt(manifest3.clock.epochDuration);
  await l1Origin();
  await setTime(BigInt(manifest3.clock.genesisTime) + 5n);
  const sign3 = (out, account, keyName, scope, extra = []) => run("scripts/sign-permit.js", ["permit", "--chain-id", chainId, "--ledger", ledger3, "--account", account,
    "--delegate", address.delegate, "--scope", scope, "--not-before-epoch", 0, "--not-after-epoch", 10, "--nonce", 1, ...extra, "--key-file", keyFile(keyName), "--out", path.join(OUT3, out)]);
  must(await sign3("permit-cell.json", cell, "agent-x", "submit-g0", ["--guard", manifest3.contracts.FogaCellGuard, "--guard-binding-version", 1]), "scripts/sign-permit.js (the cell)");
  must(await sign3("permit-wallet-a.json", address["wallet-a"], "wallet-a", "confirm-tender"), "scripts/sign-permit.js (wallet-a)");
  const pouw3 = (args, key, extra = []) => run("client/pouw.js", [...args, "--manifest", manifest3Path, "--json", ...(key ? ["--key-file", keyFile(key)] : []), ...extra]);
  const permitCell = path.join(OUT3, "permit-cell.json");
  const runs3 = [];
  // the signed permit checked read-only before the first work, as the operation package of round R2b does it
  const nonceD3 = await provider.getTransactionCount(address.delegate);
  const pc3 = await pouw3(["check-permit"], null, ["--permit", permitCell, "--operation", "submit-g0", "--tag", "latest", "--out", path.join(OUT3, "permit-check-cell.json")]);
  const pcOut3 = await pouw3(["check-permit"], null, ["--permit", permitCell, "--operation", "confirm-tender", "--tag", "latest"]);
  check("v2: pouw check-permit: the cell's signed permit accepted read-only at one block, the cell guard allowing it, no key read and nothing sent; an operation outside its scope refused",
    pc3.status === 0 && pc3.json?.schema === "finchain-pouw.ledger-v2.permit-check/1" && pc3.json.accepted === true && pc3.json.guard?.allows === true
    && pc3.json.block.hashRechecked === true && pcOut3.status === 2 && pcOut3.json?.refused?.startsWith("OutOfScope")
    && (await provider.getTransactionCount(address.delegate)) === nonceD3 && fs.existsSync(path.join(OUT3, "permit-check-cell.json")));
  const wc = must(await pouw3(["work"], "delegate", ["--permit", permitCell, "--out", path.join(OUT3, "run-work-cell-0.json")]), "pouw work --permit (the cell)").json;
  check("v2: pouw work --permit: the cell's audit job, sent by the delegate under the cell's permit; the cell is the worker of record, the run record says delegated-by-owner-permit and lists the opening of the epoch and the entry",
    wc.label === "delegated-by-owner-permit" && wc.participant === cell && wc.sender === address.delegate && wc.origin === address.delegate
    && wc.receipt.worker === cell && wc.status.verdict === "accepted" && wc.differences.length === 0
    && wc.transactions.map((x) => `${x.step} ${x.status}`).join(", ") === "openEpoch confirmed, submitG0For confirmed"
    && c.readJson(path.join(OUT3, "run-work-cell-0.json")).reportHash === wc.reportHash);
  const wa = must(await pouw3(["work"], "wallet-a"), "pouw work (wallet-a, for itself)").json;
  check("v2: pouw work without a permit: a wallet for itself, labelled direct-by-key", wa.label === "direct-by-key" && wa.participant === address["wallet-a"] && wa.sender === address["wallet-a"]);
  const again3 = must(await pouw3(["work"], "delegate", ["--permit", permitCell]), "pouw work --permit (again)").json;
  check("v2: a second pouw work --permit finds the cell's receipt and sends nothing", again3.alreadyRecorded === true && again3.receiptId === wc.receiptId);
  const nonceB3 = await provider.getTransactionCount(address["wallet-b"]);
  const absent3 = await pouw3(["work"], "wallet-b", ["--out", path.join(OUT3, "absent", "run.json")]);
  check("v2: an --out in a directory that does not exist is refused before anything is read or sent",
    absent3.status === 1 && absent3.stderr.includes("does not exist; nothing was sent") && (await provider.getTransactionCount(address["wallet-b"])) === nonceB3);
  const wrongKey3 = await pouw3(["work"], "wallet-b", ["--permit", permitCell]);
  check("v2: a key that is not the permit's delegate is refused before anything is sent", wrongKey3.status === 1 && wrongKey3.stderr.includes("is not the permit's delegate"));
  // a tender of wallet-a's, delivered by agent-y's key and accepted by wallet-a, confirmed by the delegate under wallet-a's permit
  await sent(chainOperator.sendTransaction({ to: address["wallet-a"], value: ethers.parseEther("0.1") }));
  const staged = await stageTender({ tenderAddress: taskToken.target, demander: c.walletOf(KEYS, "wallet-a", provider), worker: Y.key,
    reward: ethers.parseEther(String(r2.round.rewardEth)), label: "local-run-v2" });
  const wb = must(await pouw3(["bridge", staged.tokenId, staged.submissionId], "delegate", ["--permit", path.join(OUT3, "permit-wallet-a.json"), "--out", path.join(OUT3, "run-bridge.json")]), "pouw bridge --permit").json;
  check("v2: pouw bridge --permit: wallet-a's tender confirmed by the delegate under wallet-a's permit, for the delivering key",
    wb.label === "delegated-by-owner-permit" && wb.participant === address["wallet-a"] && wb.receipt.counterparty === address["wallet-a"] && wb.receipt.worker === Y.key.address
    && wb.receipt.sender === address.delegate);
  runs3.push(wc, wa, wb);
  const taken3 = await pouw3(["work"], "delegate", ["--permit", permitCell, "--out", path.join(OUT3, "run-work-cell-0.json")]);
  check("v2: an --out that exists is refused, and the file stays as it was", taken3.status === 1 && taken3.stderr.includes("exists already")
    && c.readJson(path.join(OUT3, "run-work-cell-0.json")).reportHash === wc.reportHash);

  await l1Origin();
  await setTime(BigInt(manifest3.clock.genesisTime) + EPOCH3 + 5n);
  must(await pouw3(["seal", 0], "delegate"), "pouw seal 0 (v2)");
  const audit3 = await pouw3(["audit", 0, "--out", path.join(OUT3, "audit-epoch-0.json")]);
  check("v2: pouw audit: the epoch agrees with the ledger and is complete; both delegated receipts read from the delegate's own transactions",
    audit3.status === 0 && audit3.json?.ok === true && audit3.json.complete === true && audit3.json.receiptCount === "3" && audit3.json.entries.delegated === 2
    && audit3.json.entries.byPermitEvidence["permit-in-the-transaction"] === 2 && audit3.json.sealed === true);
  const wc1 = must(await pouw3(["work"], "delegate", ["--permit", permitCell]), "pouw work --permit (epoch 1)").json;
  check("v2: in epoch 1 the cell's audit job recomputes epoch 0 in full through its delegate and is accepted",
    wc1.epoch === "1" && wc1.work.audited === "0" && wc1.work.receipts === 3 && wc1.status.verdict === "accepted");
  runs3.push(wc1);
  const verified3 = await pouw3(["verify"]);
  check("v2: pouw verify: the deployment as its manifest says, once started", verified3.status === 0 && verified3.json?.ok === true && verified3.json.schema === "finchain-pouw.ledger-v2.deployment-check/1");
  console.log("");
  console.log((await run("client/pouw.js", ["status", "--manifest", manifest3Path, "--address", cell])).stdout.trimEnd());
  console.log("");
  console.log((await run("client/pouw.js", ["audit", 0, "--manifest", manifest3Path])).stdout.trimEnd());
  log("ledger v2 worked with the commands: the cell's audit job through its delegate, a wallet for itself, a tender through the delegate; audited and checked",
    { runs: runs3.length, audit: audit3.json?.resultHash, verify: verified3.json?.resultHash });

  // ---------------------------------------------------------------- evidence
  const ok = checks.every((x) => x.ok);
  const recordedAt = new Date().toISOString();
  const sources = [...filesUnder("contracts"), ...filesUnder("build"), ...filesUnder("client"), ...filesUnder("scripts"), R2_CONFIG, "hardhat.config.js", "package.json", "package-lock.json"];
  const gasOf = (list, step) => list.filter((s) => s.step === step);
  const record = {
    schema: "finchain-pouw.local-run/4",
    environment: "local-devnet",
    recordedAt,
    what: "Rehearsal of round R2 with the commands of a public deployment: keys, deployment from the committed builds, verification, an operator's round over two epochs (controlled self-test, then standard) with a settled block that lags, close records, audits; then two contract accounts taking part as themselves on a deployment of their own; then ledger v2 deployed from its own builds, superseding the first deployment, checked against its manifest, worked through a delegate under its participants' permits, and audited",
    ok,
    host: c.hostInfo(),
    tools: { hardhat: versionOf("hardhat"), ethers: ethers.version, solc: versionOf("solc") },
    client: { name: "finchain-pouw", version: c.version() },
    sources: Object.fromEntries(sources.map((f) => [f, c.sha256File(f)])),
    checks,
    operatorWallets: { configuration: config, deployment, verification: verified.json, rounds, audits },
    contractAccounts: { identities, configuration: config2, deployment: deployment2, steps: g.jsonable(steps), audits: [audit2.json] },
    ledgerV2: { configuration: config3, deployment: deployment3, verification: g.jsonable({ ok: check3.ok, block: check3.pin.number, checks: check3.checks }),
      runs: runs3, audits: [audit3.json], check: verified3.json },
    gasUsed: {
      deployment: deployment.gasUsed,
      work: rounds.flatMap((r) => gasOf(r.did, "work").map((s) => s.gasUsed)),
      tender: rounds.flatMap((r) => gasOf(r.did, "tender").map((s) => Object.fromEntries([...s.tender.map((t) => [t.step, t.gasUsed]), ["bridge", s.bridge.gasUsed]]))),
      close: rounds.flatMap((r) => gasOf(r.did, "close").map((s) => s.gasUsed)),
      workThroughAccount: [wx.gasUsed, wy.gasUsed],
      bridgeThroughAccount: [bx.gasUsed, bo.gasUsed],
      deploymentV2: deployment3.gasUsed,
      workThroughDelegate: [wc.gasUsed, wc1.gasUsed],
      bridgeThroughDelegate: [wb.gasUsed],
    },
    transcript,
    notes: [
      "Every key was made for this run by scripts/keys.js in a temporary directory and deleted after it. All parties belong to whoever ran the script, and are declared under one operator for that reason.",
      "The record is evidence that the commands of a public deployment work end to end and that an independent recomputation agrees with the ledger. It is not evidence of independent participation, of demand, or of any amount of computation.",
      "Keys, deployment, verification, rounds, audits and the identity check ran as separate processes against an endpoint, as on a public chain. The script moved the node's clock, set the stand-in for the L1Block predeploy, deployed the ERC-8414 reference contract, funded the steward, and held back the endpoint's finalized block for a while in epoch 1.",
      `Blocks were mined every ${BLOCK_MS} ms, not one per transaction: transactions waited in the pool as they do on a public chain. Epochs are the two hours of the round's configuration, on the node's clock.`,
      "The contract accounts are the test account of contracts/testing: one owner key and an execute call. They show that the kernel and the client treat an account as the party; they are not an agent's node, and nothing here was done through one.",
      "The test tenders settle a fixed result and carry no task.",
      "The v2 deployment of part 3 is made, checked and worked with the client's commands. Its cell is a stand-in from contracts/v2/testing with the views the cell guard reads and its owner's signature rule; no FOGA build product is used. The permits were signed by scripts/sign-permit.js with keys made for the run, and the delegate key sent for the accounts. The run records say how each transaction was authorized; they are no evidence of which program decided to do the work.",
    ],
  };
  const out = path.join(root, "evidence", `local-run-${c.stamp(new Date(recordedAt))}.json`);
  c.writeJson(out, g.jsonable(record));
  endpoint.close();
  console.log(`\n${ok ? "PASS" : "FAIL"}: ${checks.filter((x) => x.ok).length} of ${checks.length} checks; record evidence/${path.basename(out)}`);
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
