#!/usr/bin/env node
// pouw - the Genesis Mining reference client. JSON-RPC only: it needs a deployment manifest and an
// endpoint, and - for the commands that send a transaction - a key file on the machine it runs on.
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const g = require("./lib/genesis");
const { auditRecord, auditText, points, CLIENT } = require("./lib/report");
const a2 = require("./lib/audit2");
const m2 = require("./lib/manifest2");
const r2 = require("./lib/report2");
const c2 = require("./lib/client2");
const permitLib = require("./lib/permit");

const USAGE = `pouw ${CLIENT.version} - Genesis Mining reference client

  pouw status                          the deployment, the current epoch, its parameters and totals
  pouw work                            do the current epoch's audit job (g0.ref) with the key: recompute the
                                       previous epoch in full, submit only if the recomputation matches
  pouw bridge <tokenId> <submissionId> confirm a settled submission of an ERC-8414 tender the key owns (g1.tender)
  pouw seal <epoch>                    write the close record of an ended epoch (any key; changes no figure)
  pouw audit <epoch>                   recompute an ended epoch from the chain and compare it with the ledger.
                                       Everything is read at one block, which the record names
  pouw verify                          check the deployment: the code on chain is this repository's build, and
                                       the contracts are wired as the manifest says. Read at one block as well

  The same commands take the manifest of a deployment of ledger v2 (schema finchain-pouw.deployment/2).
  There work and bridge send either for the key itself or, with --permit, as the delegate named in the
  participant's permit; the audit is that of docs/ledger-v2.md 13.1; and every --out creates a new file.
  Ledger v2 only:
  pouw check-permit --permit <file> --operation submit-g0|confirm-tender [--delegate <address>]
                                       check a signed permit at one block as the ledger would when its
                                       delegate sends (default: the permit's delegate). No key, nothing sent;
                                       exit 0 accepted, 2 refused by the ledger, 3 the block is before the
                                       genesis, 4 the endpoint cannot serve a read at the block

  --manifest <path>    deployment manifest                       (or POUW_MANIFEST)
  --rpc <url>          JSON-RPC endpoint                          (or POUW_RPC, else the manifest's rpc)
  --key-file <path>    file with the private key, for work, bridge and seal   (or POUW_KEY_FILE)
  --account <address>  work, bridge: act through this contract account, by its execute(target, value, data).
                       The worker of record, and the tender owner that bridges, is then the account and
                       not the key. The key must be the account's owner or operator
  --permit <file>      ledger v2, work and bridge: send as the delegate named in this permit, for the
                       permit's account. The file is the record scripts/sign-permit.js wrote where the
                       account's key is, signed; the key file given here is the delegate's own
  --epoch <n>          ledger v2, work and bridge: send only if the chain is in epoch n now; otherwise nothing
                       is sent. The epoch of the receipt is the record's own and is checked there
  --permits <file>     ledger v2, audit and work: permits a deployment has published, as one record or
                       a JSON array of records, for receipts whose transaction does not show its permit
  --address <address>  status: also show this address
  --tag <tag>          block treated as settled: finalized (default), safe, latest, or a block number.
                       audit and verify take that block once and read nothing after it; a number repeats
                       a run at the block of an earlier record
  --require-sealed     audit: also report it as a difference when the epoch has no close record at the block
  --log-chunk <n>      largest block range of one log query; 0 = no limit   (or POUW_LOG_CHUNK, else the
                       manifest's logChunk, else 0)
  --json               print JSON instead of text
  --out <path>         audit, verify: also write the record to a file. Ledger v2: audit, verify, work and
                       bridge; the file is created before anything is read or sent, so that a path that
                       exists or cannot be created is refused with nothing sent. While work or bridge
                       runs, the file holds the journal of the transactions it sends, one event per
                       line, and the record takes its place at the end; a run that stops after sending
                       leaves the journal. Each transaction is also shown on the standard error when it
                       is taken and with its outcome

Exit status: 0 done / the audit or the check matches; 2 it differs (and work submits nothing), or,
ledger v2, work or bridge sent and the receipt recorded is not the one the client computed;
3 not settled yet; 4 the endpoint cannot serve state at the block that was taken (nothing is read at
another block in its place); 5 ledger v2: the audit agrees with the ledger but left receipts
undecided, which work it could not read again (and work submits nothing); 1 any other failure.
A key is read from a file and never from the command line. An audit needs no key.
Never give this client a key that a running agent node also sends from: two programs sending from one
key collide on nonces. A key beside an agent is its operator's wallet, not the agent: an agent whose
identity is a contract account takes part only when that account is the sender.`;

function parse(argv) {
  const opts = { _: [] };
  const flags = new Set(["json", "help", "require-sealed"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts._.push(a); continue; }
    const name = a.slice(2);
    if (flags.has(name)) { opts[name] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
    opts[name] = argv[++i];
  }
  return opts;
}

/// A key file holds one private key and is its owner's alone: a file that others can read is refused.
function readKeyFile(file) {
  const mode = fs.statSync(file).mode & 0o777;
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(`${file} can be read by others (mode ${mode.toString(8)}): make it the owner's alone (chmod 600) and try again`);
  }
  return fs.readFileSync(file, "utf8").trim();
}

function need(value, what) {
  if (value === undefined || value === "") throw new Error(`${what} is required`);
  return value;
}

async function open(opts, { signer = false, pinned = false } = {}) {
  const manifestPath = need(opts.manifest ?? process.env.POUW_MANIFEST, "--manifest (or POUW_MANIFEST)");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const isV2 = manifest.schema === m2.MANIFEST_SCHEMA;
  if (!isV2 && manifest.schema !== g.MANIFEST_SCHEMA) throw new Error(`${manifestPath}: schema is ${manifest.schema}, expected ${g.MANIFEST_SCHEMA} or ${m2.MANIFEST_SCHEMA}`);
  // what a deployment of the one kind or the other does not take, refused before anything is read
  if (isV2 && opts.account !== undefined) {
    throw new Error("--account is for the kernel: on ledger v2 an account takes part through a delegate under its permit (--permit), or by its own key; the direct entry through an account's execute is not built in this client");
  }
  if (!isV2 && (opts.permit !== undefined || opts.permits !== undefined)) throw new Error("--permit and --permits are for a deployment of ledger v2");
  // the output's place is taken before anything is read or sent: a path that exists or cannot be
  // created is refused with nothing sent
  if (isV2 && opts.out !== undefined) output = c2.reserveOutput(opts.out);
  const rpc = need(opts.rpc ?? process.env.POUW_RPC ?? manifest.rpc, "--rpc (or POUW_RPC, or the manifest's rpc)");
  // no response cache: a read that follows a transaction must see it, also on a fast local network
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = Number(process.env.POUW_POLL_MS ?? 1000);
  let runner = provider;
  if (signer) {
    const keyFile = need(opts["key-file"] ?? process.env.POUW_KEY_FILE, "--key-file (or POUW_KEY_FILE)");
    runner = new ethers.Wallet(readKeyFile(keyFile), provider);
  }
  const tag = opts.tag === undefined ? "finalized" : (/^\d+$/.test(opts.tag) ? Number(opts.tag) : opts.tag);
  // an audit and a check take their block before anything else is read, the connection included
  const pin = pinned ? await g.pinBlock(provider, tag) : null;
  const connect = isV2 ? a2.connect : g.connect;
  const ctx = await connect(manifest, runner, { tag, logChunk: opts["log-chunk"] ?? process.env.POUW_LOG_CHUNK, pin });
  if (isV2) { ctx.manifest = manifest; ctx.v2 = true; }
  return { ctx, rpc, provider, signer: signer ? runner : null };
}

/// The permits a deployment of ledger v2 has published, from --permits: one record or an array.
function givenPermits(opts) {
  if (opts.permits === undefined) return [];
  const value = JSON.parse(fs.readFileSync(opts.permits, "utf8"));
  return Array.isArray(value) ? value : [value];
}

/// The output of a v2 command, taken by `open` when --out is given (client2.js reserveOutput).
let output = null;

/// Each transaction of a run, when the endpoint takes it and again with its outcome: on the standard
/// error at once, and into the output's journal when there is one.
function onEvent(event) {
  const where = event.block !== undefined ? ` in block ${event.block}` : "";
  console.error(`  ${event.event} ${event.step}: tx ${event.txHash ?? "with no hash"} from ${event.from}${event.nonce !== null && event.nonce !== undefined ? `, nonce ${event.nonce}` : ""}${where}`);
  if (output) c2.appendEvent(output, event);
}

/// The record of a v2 command: printed, and with --out written in the place taken for it.
function emitRecord(opts, record, text) {
  const json = JSON.stringify(record, null, 2) + "\n";
  if (output) c2.finishOutput(output, json);
  console.log(opts.json ? json.trimEnd() : text);
}

const print = (opts, value, text) => console.log(opts.json ? JSON.stringify(g.jsonable(value), null, 2) : text);
const via = (r) => (r.account ? ` (the account ${r.account}, driven by ${r.key})` : "");

async function status(opts) {
  const { ctx } = await open(opts);
  if (ctx.v2) return status2(opts, ctx);
  const out = {
    deployment: ctx.manifest.name, environment: ctx.manifest.environment, chainId: ctx.chainId, ledger: ctx.ledger.target,
    policy: ctx.policy.target, seedSource: ctx.seedSource, domain: ctx.domain, genesisTime: ctx.genesisTime,
    epochDuration: ctx.epochDuration, started: await ctx.policy.started(), paused: await ctx.policy.paused(),
  };
  const lines = [
    `${out.deployment ?? "deployment"} (${[out.environment ?? "environment unspecified", ...(ctx.manifest.labels ?? [])].join(", ")}) on chain ${out.chainId}`,
    `  ledger ${out.ledger}  policy ${out.policy}`,
    `  epochs of ${out.epochDuration} s from ${new Date(Number(out.genesisTime) * 1000).toISOString()}${out.paused ? "  PAUSED" : ""}`,
  ];
  if (!out.started) {
    lines.push("  not started");
  } else {
    const epoch = await ctx.policy.currentEpoch();
    const s = await ctx.ledger.epochSummary(epoch);
    const [version, params] = await ctx.policy.paramsFor(epoch);
    out.epoch = { epoch, opened: s.opened, paramsVersion: version, params: g.plainParams(params), budget: s.budget, budgetG0: s.budgetG0,
      budgetG1: s.budgetG1, receipts: s.receiptCount, measured: [s.measuredG0, s.measuredG1], subsidized: [s.subsidizedG0, s.subsidizedG1],
      endsAt: g.epochEnd(ctx, epoch) };
    lines.push(`  epoch ${epoch}${s.opened ? "" : " (not opened)"}, ends ${new Date(Number(out.epoch.endsAt) * 1000).toISOString()}, parameters v${version}${params.subsidizeDeclaredRelated ? " (controlled self-test)" : ""}`);
    lines.push(`  budget ${points(s.budget)} (G0 ${points(s.budgetG0)}, G1 ${points(s.budgetG1)}); receipts ${s.receiptCount}; subsidized GMU G0 ${s.subsidizedG0} G1 ${s.subsidizedG1}`);
    if (opts.address) {
      const a = ethers.getAddress(opts.address);
      out.address = { address: a, admitted: await ctx.policy.isAdmitted(a), operator: await ctx.policy.operatorOf(a),
        provisional: await ctx.ledger.provisionalAllocation(epoch, a) };
      lines.push(`  ${a}: ${out.address.admitted ? "admitted" : "not admitted"}, operator ${out.address.operator || "undeclared"}, provisional ${points(out.address.provisional)} test points (changes until the epoch ends)`);
    }
  }
  print(opts, out, lines.join("\n"));
}

async function work(opts) {
  const { ctx, signer, rpc } = await open(opts, { signer: true });
  if (ctx.v2) return work2(opts, ctx, signer, rpc);
  const r = await g.workAudit(ctx, signer, { account: opts.account ?? null });
  const text = r.alreadyRecorded
    ? `epoch ${r.epoch}: the audit job of ${r.worker}${via(r)} is recorded already, receipt ${r.receiptId} (${g.VERDICT_NAME[r.status.verdict]}, ${g.INELIGIBLE_NAME[r.status.ineligible]}); nothing was sent`
    : `epoch ${r.epoch}: ${r.worker}${via(r)} audited ${r.audited === null ? "the deployment's configuration" : `epoch ${r.audited} (${r.receiptsAudited} receipts)`}; `
    + `receipt ${r.receiptId} ${g.VERDICT_NAME[r.status.verdict]}, ${g.INELIGIBLE_NAME[r.status.ineligible]}, GMU ${r.status.gmuSubsidized}/${r.status.gmuMeasured}; tx ${r.txHash}`;
  print(opts, r, text);
}

async function bridge(opts) {
  const tokenId = BigInt(need(opts._[1], "tokenId"));
  const submissionId = BigInt(need(opts._[2], "submissionId"));
  const { ctx, signer, rpc } = await open(opts, { signer: true });
  if (ctx.v2) return bridge2(opts, ctx, signer, rpc, tokenId, submissionId);
  const r = await g.bridgeTender(ctx, signer, { tokenId, submissionId, account: opts.account ?? null });
  print(opts, r, `receipt ${r.receiptId} in epoch ${r.epoch}: confirmed by ${r.demander}${via(r)} for the worker ${r.worker}; `
    + `${g.INELIGIBLE_NAME[r.status.ineligible]}, relation ${g.RELATION_NAME[r.status.relation]}, GMU ${r.status.gmuSubsidized}/${r.status.gmuMeasured}; `
    + (r.alreadyRecorded ? "recorded already, nothing was sent" : `tx ${r.txHash}`));
}

async function seal(opts) {
  const epoch = BigInt(need(opts._[1], "epoch"));
  const { ctx, signer } = await open(opts, { signer: true });
  const rc = await (await ctx.ledger.connect(signer).seal(epoch)).wait();
  const s = await ctx.ledger.epochSummary(epoch);
  print(opts, { epoch, sealed: s.isSealed, txHash: rc.hash, block: rc.blockNumber }, `epoch ${epoch} sealed; tx ${rc.hash}, block ${rc.blockNumber}`);
}

async function audit(opts) {
  const epoch = BigInt(need(opts._[1], "epoch"));
  const { ctx, rpc } = await open(opts, { pinned: true });
  if (ctx.v2) return audit2(opts, ctx, rpc, epoch);
  const report = await g.auditEpoch(ctx, epoch, { requireSealed: Boolean(opts["require-sealed"]) });
  const record = auditRecord(ctx, report, { rpc });
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(record, null, 2) + "\n");
  console.log(opts.json ? JSON.stringify(record, null, 2) : auditText(ctx, report));
  return report.ok ? 0 : 2;
}

async function verify(opts) {
  const { ctx, rpc } = await open(opts, { pinned: true });
  if (ctx.v2) return verify2(opts, ctx, rpc);
  const loadBuild = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", `${name}.json`), "utf8"));
  const result = await g.verifyDeployment(ctx, loadBuild);
  // schema 2: read at one block, which `snapshot` names; the two hashes are those of an audit record
  const record = g.withHashes(g.jsonable({
    schema: "finchain-pouw.deployment-check/2", environment: ctx.manifest.environment ?? "unspecified", labels: ctx.manifest.labels ?? [],
    deployment: ctx.manifest.name ?? "unnamed",
    chainId: ctx.chainId, ledger: ctx.ledger.target, snapshot: g.snapshotOf(result.pin), snapshotTag: result.pin.tag,
    snapshotFinality: result.pin.finality, observedAt: result.pin.observedAt,
    endpointHost: (() => { try { return new URL(rpc).host; } catch { return "unknown"; } })(),
    recordedAt: new Date().toISOString(), client: CLIENT, ok: result.ok, epoch: result.epoch, started: result.started, steward: result.info.steward,
    paused: result.info.paused, code: result.code, checks: result.checks,
  }));
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(record, null, 2) + "\n");
  const text = [`${ctx.manifest.name ?? "deployment"} on chain ${ctx.chainId}: ${result.ok ? "MATCH" : "DIFFERS"}`,
    `  read at block ${result.pin.number} ${result.pin.hash} (${result.pin.finality}), observed ${result.pin.observedAt}`,
    ...result.checks.map((c) => `  ${c.ok ? "ok  " : "FAIL"} ${c.what}${c.ok || !c.detail ? "" : ` (${c.detail})`}`),
    `  steward ${result.info.steward}${result.info.paused ? "; recording is PAUSED" : ""}`].join("\n");
  console.log(opts.json ? JSON.stringify(record, null, 2) : text);
  return result.ok ? 0 : 2;
}

// ---------------------------------------------------------------- ledger v2

const scopeText = (r) => `${r.given.permit ? `as the delegate ${r.given.sendingKey} under the permit ${r.given.permit.digest} of ${r.participant}` : `by ${r.given.sendingKey} for itself`}`;
const statusText = (st) => `${g.VERDICT_NAME[st.verdict]}, ${require("./lib/ledger2").INELIGIBLE_NAME[st.ineligible]}, GMU ${st.gmuSubsidized}/${st.gmuMeasured}`;

async function status2(opts, ctx) {
  const m = ctx.manifest;
  const out = {
    deployment: m.name, environment: m.environment, chainId: ctx.chainId, ledger: ctx.address, policy: ctx.policy.target, seedSource: ctx.seedSource,
    domain: ctx.domain, genesisTime: ctx.genesisTime, epochDuration: ctx.epochDuration, started: await ctx.policy.started(), paused: await ctx.policy.paused(),
    ...(m.supersedes ? { supersedes: m.supersedes } : {}),
  };
  const lines = [
    `${out.deployment ?? "deployment"} (${[out.environment ?? "environment unspecified", ...(m.labels ?? [])].join(", ")}) on chain ${out.chainId}: ledger v2`,
    `  ledger ${out.ledger}  policy ${out.policy}`,
    `  epochs of ${out.epochDuration} s from ${new Date(Number(out.genesisTime) * 1000).toISOString()}${out.paused ? "  PAUSED" : ""}`,
    ...(m.supersedes ? [`  supersedes ${m.supersedes.name} (ledger ${m.supersedes.ledger})`] : []),
  ];
  const epoch = out.started ? await ctx.policy.currentEpoch() : 0n;
  if (!out.started) lines.push("  not started");
  else {
    const s = await ctx.ledger.epochSummary(epoch);
    const [version, params] = await ctx.policy.paramsFor(epoch);
    out.epoch = { epoch, opened: s.opened, paramsVersion: version, params: a2.plainParams(params), budget: s.budget, budgetG0: s.budgetG0, budgetG1: s.budgetG1,
      receipts: s.receiptCount, measured: [s.measuredG0, s.measuredG1], subsidized: [s.subsidizedG0, s.subsidizedG1], endsAt: g.epochEnd(ctx, epoch) };
    lines.push(`  epoch ${epoch}${s.opened ? "" : " (not opened)"}, ends ${new Date(Number(out.epoch.endsAt) * 1000).toISOString()}, parameters v${version}${params.subsidizeDeclaredRelated ? " (controlled self-test)" : ""}`);
    lines.push(`  budget ${points(s.budget)} (G0 ${points(s.budgetG0)}, G1 ${points(s.budgetG1)}); receipts ${s.receiptCount}; subsidized GMU G0 ${s.subsidizedG0} G1 ${s.subsidizedG1}`);
  }
  if (opts.address) {
    const a = ethers.getAddress(opts.address);
    const [binding] = await ctx.policy.guardBindingOf(a);
    out.address = { address: a, contractAccount: (await ctx.provider.getCode(a)) !== "0x", admitted: await ctx.policy.isAdmitted(a), operator: await ctx.policy.operatorOf(a),
      guard: binding.guard, guardBindingVersion: binding.version, minNonce: await ctx.ledger.minNonce(a),
      provisional: out.started ? await ctx.ledger.provisionalAllocation(epoch, a) : 0n };
    const x = out.address;
    lines.push(`  ${a}${x.contractAccount ? " (contract account)" : ""}: ${x.admitted ? "admitted" : "not admitted"}, operator ${x.operator || "undeclared"}, `
      + `${x.guard === ethers.ZeroAddress ? "no guard" : `guard ${x.guard} binding ${x.guardBindingVersion}`}, minimum nonce ${x.minNonce}`
      + `${out.started ? `, provisional ${points(x.provisional)} test points (changes until the epoch ends)` : ""}`);
  }
  print(opts, out, lines.join("\n"));
}

/// A run of work or bridge whose receipt is not the one the client computed has still sent its
/// transaction: its record is written, with the differences, and the exit status is 2.
async function sent(promise) {
  try { return await promise; } catch (e) { if (e instanceof c2.ReceiptDiffers) return e.result; throw e; }
}

/// --epoch: the epoch a run of work or bridge is meant for, or null.
function expectedEpoch(opts) {
  if (opts.epoch === undefined) return null;
  if (!/^\d+$/.test(opts.epoch)) throw new Error(`--epoch is a whole number, not ${opts.epoch}`);
  return BigInt(opts.epoch);
}

async function work2(opts, ctx, signer, rpc) {
  const permit = opts.permit === undefined ? null : c2.readPermitFile(ctx, opts.permit);
  const r = await sent(c2.workG0(ctx, signer, { permit, permits: givenPermits(opts), expectEpoch: expectedEpoch(opts), onEvent }));
  const record = c2.runRecord(ctx, r, { rpc, host: { node: process.version, platform: `${process.platform}/${process.arch}` } });
  const text = r.alreadyRecorded
    ? `epoch ${r.epoch}: the audit job of ${r.participant} is recorded already, receipt ${r.receiptId} (${statusText(r.status)}), ${record.label}; nothing was sent`
    : `epoch ${r.epoch}: ${r.participant} audited ${r.work.audited === null ? "the deployment's configuration" : `epoch ${r.work.audited} (${r.work.receipts} receipts)`}, sent ${scopeText(r)}; `
      + `receipt ${r.receiptId} ${statusText(r.status)}; ${r.transactions.length} transaction(s), the last ${r.txHash}`;
  emitRecord(opts, record, `${text}\n  label ${record.label}${differencesText(r)}`);
  return r.differences.length > 0 ? 2 : 0;
}

async function bridge2(opts, ctx, signer, rpc, tokenId, submissionId) {
  const permit = opts.permit === undefined ? null : c2.readPermitFile(ctx, opts.permit);
  const r = await sent(c2.confirmTender(ctx, signer, { tokenId, submissionId, permit, expectEpoch: expectedEpoch(opts), onEvent }));
  const record = c2.runRecord(ctx, r, { rpc, host: { node: process.version, platform: `${process.platform}/${process.arch}` } });
  const text = `receipt ${r.receiptId} in epoch ${r.epoch}: tender ${tokenId}, submission ${submissionId} of ${r.participant}, confirmed ${r.alreadyRecorded ? "before this run" : scopeText(r)} for the worker ${r.receipt.worker}; `
    + `${statusText(r.status)}, relation ${g.RELATION_NAME[r.status.relation]}; ${r.alreadyRecorded ? "recorded already, nothing was sent" : `tx ${r.txHash}`}`;
  emitRecord(opts, record, `${text}\n  label ${record.label}${differencesText(r)}`);
  return r.differences.length > 0 ? 2 : 0;
}

const differencesText = (r) => (r.differences.length > 0 ? `\n  DIFFERS: the receipt recorded is not the one this client computed: ${r.differences.join("; ")}` : "");

async function audit2(opts, ctx, rpc, epoch) {
  const report = await a2.auditEpoch(ctx, epoch, { requireSealed: Boolean(opts["require-sealed"]), permits: givenPermits(opts) });
  const record = r2.auditRecord(ctx, report, { deployment: ctx.manifest, rpc });
  emitRecord(opts, record, r2.auditText(ctx, report));
  return c2.auditExitStatus(report);
}

async function verify2(opts, ctx, rpc) {
  const result = await m2.verifyDeployment(ctx);
  const m = ctx.manifest;
  const record = g.withHashes(g.jsonable({
    schema: "finchain-pouw.ledger-v2.deployment-check/1", environment: m.environment ?? "unspecified", labels: m.labels ?? [], deployment: m.name ?? "unnamed",
    chainId: ctx.chainId, ledger: ctx.address, snapshot: g.snapshotOf(result.pin), snapshotTag: result.pin.tag, snapshotFinality: result.pin.finality,
    observedAt: result.pin.observedAt, endpointHost: (() => { try { return new URL(rpc).host; } catch { return "unknown"; } })(),
    recordedAt: new Date().toISOString(), client: CLIENT, ok: result.ok, epoch: result.epoch, started: result.started, steward: result.info.steward,
    paused: result.info.paused, ...(m.supersedes ? { supersedes: m.supersedes } : {}), code: result.code, checks: result.checks,
  }));
  const text = [`${m.name ?? "deployment"} on chain ${ctx.chainId}: ledger v2, ${result.ok ? "MATCH" : "DIFFERS"}`,
    `  read at block ${result.pin.number} ${result.pin.hash} (${result.pin.finality}), observed ${result.pin.observedAt}`,
    ...result.checks.map((x) => `  ${x.ok ? "ok  " : "FAIL"} ${x.what}${x.ok || !x.detail ? "" : ` (${x.detail})`}`),
    `  steward ${result.info.steward}${result.info.paused ? "; recording is PAUSED" : ""}`].join("\n");
  emitRecord(opts, record, text);
  return result.ok ? 0 : 2;
}

/// The read-only check of a signed permit, ledger v2: at one block, as the ledger would check it when
/// its delegate sends. No key is read and nothing is sent.
async function checkPermit(opts) {
  const { ctx, rpc } = await open(opts, { pinned: true });
  if (!ctx.v2) throw new Error("check-permit is for a deployment of ledger v2");
  const permit = c2.readPermitFile(ctx, need(opts.permit, "--permit"));
  const operation = { "submit-g0": permitLib.OP.SUBMIT_G0, "confirm-tender": permitLib.OP.CONFIRM_TENDER }[need(opts.operation, "--operation (submit-g0 or confirm-tender)")];
  if (operation === undefined) throw new Error("--operation is submit-g0 or confirm-tender");
  const r = await c2.permitCheck(ctx, permit, { delegate: opts.delegate ?? null, operation });
  if (r.beforeGenesis) {
    // the ledger takes no permit before its genesis: a check at such a block decides nothing yet
    throw new g.NotFinalYet(`block ${r.block.number} (${new Date(Number(r.block.timestamp) * 1000).toISOString()}, ${r.block.finality}) is before the genesis, `
      + `and the ledger takes no permit before it (NotStarted): check again once the ${ctx.tag ?? "finalized"} block's time has reached ${new Date(Number(ctx.genesisTime) * 1000).toISOString()}; nothing was recorded`);
  }
  const m = ctx.manifest;
  const record = g.withHashes(g.jsonable({
    schema: "finchain-pouw.ledger-v2.permit-check/2", environment: m.environment ?? "unspecified", labels: m.labels ?? [], deployment: m.name ?? "unnamed",
    chainId: ctx.chainId, ledger: ctx.address, endpointHost: (() => { try { return new URL(rpc).host; } catch { return "unknown"; } })(),
    recordedAt: new Date().toISOString(), client: CLIENT, ...r,
    reading: [
      "Read-only: no key was read and no transaction was sent. The permit was checked at the block named, as the ledger checks it when its delegate sends: the caller, the scope, the epochs, the nonce and the revocation, the account's signature (ERC-1271 for an account with code) and the guard, each under the ledger's own gas bound.",
      "This is the path of the valid permit. The probe's measurement of the refusal of a foreign signature is another path and does not stand for it. A check is of its block: the chain can change after it, and the transaction is then decided by the ledger.",
      "gasEstimate is the endpoint's estimate of the whole view call, asked with the block's number as the block parameter of eth_estimateGas, before the hash was asked for again; it is not the gas left to the callee. Where the endpoint gives none at that block, it is null and gasEstimateUnavailable says why; the check does not depend on it.",
      "A read the endpoint could not serve at the block stops the check (exit 4) and is never recorded as the ledger's refusal; a refusal is the contract's own answer.",
    ],
  }));
  const text = [`permit ${r.permit.digest} of ${r.permit.account} for ${r.sender}, ${r.operation.join(",")}: ${r.accepted ? "ACCEPTED" : `REFUSED, ${r.refused}`}`,
    `  read at block ${r.block.number} ${r.block.hash} (${r.block.finality}, ${new Date(Number(r.block.timestamp) * 1000).toISOString()}), epoch ${r.epoch}; the hash asked for again after every read`,
    `  account ${r.accountHasCode ? "with code" : "without code"}; signature key ${r.permit.signatureKey ?? "not an ECDSA signature"}; guard ${r.permit.guard} binding ${r.permit.guardBindingVersion}${r.guard ? `, which would ${r.guard.allows ? "allow" : "refuse"} it` : ""}`,
    `  gas estimate of the view call at that block ${r.gasEstimate ?? `not available (${r.gasEstimateUnavailable})`}`].join("\n");
  emitRecord(opts, record, text);
  return r.accepted ? 0 : 2;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const command = opts._[0];
  if (opts.help || !command) { console.log(USAGE); return opts.help ? 0 : 1; }
  const commands = { status, work, bridge, seal, audit, verify, "check-permit": checkPermit };
  if (!commands[command]) throw new Error(`unknown command ${command}\n\n${USAGE}`);
  return (await commands[command](opts)) ?? 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  // the output is removed when it is still the empty file this run made, and kept with its journal otherwise
  const kept = output ? c2.releaseOutput(output) : null;
  if (kept) console.error(`pouw: the journal of what this run sent is in ${kept}`);
  if (e instanceof g.NotFinalYet) { console.error(`not settled yet: ${e.message}`); process.exitCode = 3; return; }
  if (e instanceof g.StateUnavailable) { console.error(`no state at the block: ${e.message}`); process.exitCode = 4; return; }
  if (e instanceof g.AuditMismatch) { console.error(`nothing submitted: ${e.message}`); process.exitCode = 2; return; }
  if (e instanceof c2.AuditIncomplete) { console.error(`nothing submitted: ${e.message}`); process.exitCode = 5; return; }
  const refused = c2.refusal(e);
  console.error(refused ? `pouw: refused by the contract: ${refused.name}(${refused.args.join(", ")})` : `pouw: ${e.shortMessage ?? e.message}`);
  process.exitCode = 1;
});
