#!/usr/bin/env node
// pouw - the Genesis Mining reference client. JSON-RPC only: it needs a deployment manifest and an
// endpoint, and - for the commands that send a transaction - a key file on the machine it runs on.
"use strict";

const fs = require("fs");
const { ethers } = require("ethers");
const g = require("./lib/genesis");
const { auditRecord, auditText, points, CLIENT } = require("./lib/report");

const USAGE = `pouw ${CLIENT.version} - Genesis Mining reference client

  pouw status                          the deployment, the current epoch, its parameters and totals
  pouw work                            do the current epoch's audit job (g0.ref) with the key: recompute the
                                       previous epoch in full, submit only if the recomputation matches
  pouw bridge <tokenId> <submissionId> confirm a settled submission of an ERC-8414 tender the key owns (g1.tender)
  pouw seal <epoch>                    write the close record of an ended epoch (any key; changes no figure)
  pouw audit <epoch>                   recompute an ended epoch from the chain and compare it with the ledger

  --manifest <path>    deployment manifest                       (or POUW_MANIFEST)
  --rpc <url>          JSON-RPC endpoint                          (or POUW_RPC, else the manifest's rpc)
  --key-file <path>    file with the private key, for work, bridge and seal   (or POUW_KEY_FILE)
  --address <address>  status: also show this address
  --tag <tag>          block treated as settled: finalized (default), safe, latest, or a block number
  --log-chunk <n>      largest block range of one log query; 0 = no limit (default)
  --json               print JSON instead of text
  --out <path>         audit: also write the record to a file

Exit status: 0 done / the audit matches; 2 the recomputation differs from the ledger (nothing is submitted);
3 not settled yet; 1 any other failure.
A key is read from a file and never from the command line. An audit needs no key.`;

function parse(argv) {
  const opts = { _: [] };
  const flags = new Set(["json", "help"]);
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

function need(value, what) {
  if (value === undefined || value === "") throw new Error(`${what} is required`);
  return value;
}

async function open(opts, { signer = false } = {}) {
  const manifestPath = need(opts.manifest ?? process.env.POUW_MANIFEST, "--manifest (or POUW_MANIFEST)");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== g.MANIFEST_SCHEMA) throw new Error(`${manifestPath}: schema is ${manifest.schema}, expected ${g.MANIFEST_SCHEMA}`);
  const rpc = need(opts.rpc ?? process.env.POUW_RPC ?? manifest.rpc, "--rpc (or POUW_RPC, or the manifest's rpc)");
  // no response cache: a read that follows a transaction must see it, also on a fast local network
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = Number(process.env.POUW_POLL_MS ?? 1000);
  let runner = provider;
  if (signer) {
    const keyFile = need(opts["key-file"] ?? process.env.POUW_KEY_FILE, "--key-file (or POUW_KEY_FILE)");
    runner = new ethers.Wallet(fs.readFileSync(keyFile, "utf8").trim(), provider);
  }
  const tag = opts.tag === undefined ? "finalized" : (/^\d+$/.test(opts.tag) ? Number(opts.tag) : opts.tag);
  const ctx = await g.connect(manifest, runner, { tag, logChunk: Number(opts["log-chunk"] ?? 0) });
  return { ctx, rpc, provider, signer: signer ? runner : null };
}

const print = (opts, value, text) => console.log(opts.json ? JSON.stringify(g.jsonable(value), null, 2) : text);

async function status(opts) {
  const { ctx } = await open(opts);
  const out = {
    deployment: ctx.manifest.name, environment: ctx.manifest.environment, chainId: ctx.chainId, ledger: ctx.ledger.target,
    policy: ctx.policy.target, seedSource: ctx.seedSource, domain: ctx.domain, genesisTime: ctx.genesisTime,
    epochDuration: ctx.epochDuration, started: await ctx.policy.started(), paused: await ctx.policy.paused(),
  };
  const lines = [
    `${out.deployment ?? "deployment"} (${out.environment ?? "environment unspecified"}) on chain ${out.chainId}`,
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
    lines.push(`  epoch ${epoch}${s.opened ? "" : " (not opened)"}, ends ${new Date(Number(out.epoch.endsAt) * 1000).toISOString()}, parameters v${version}`);
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
  const { ctx, signer } = await open(opts, { signer: true });
  const r = await g.workAudit(ctx, signer);
  const text = `epoch ${r.epoch}: audited ${r.audited === null ? "the deployment's configuration" : `epoch ${r.audited} (${r.receiptsAudited} receipts)`}; `
    + `receipt ${r.receiptId} ${g.VERDICT_NAME[r.status.verdict]}, ${g.INELIGIBLE_NAME[r.status.ineligible]}, GMU ${r.status.gmuSubsidized}/${r.status.gmuMeasured}; tx ${r.txHash}`;
  print(opts, r, text);
}

async function bridge(opts) {
  const tokenId = BigInt(need(opts._[1], "tokenId"));
  const submissionId = BigInt(need(opts._[2], "submissionId"));
  const { ctx, signer } = await open(opts, { signer: true });
  const epoch = await ctx.policy.currentEpoch();
  const profile = await ctx.policy.activeProfile(g.profileKey(g.PROFILE_G1_TENDER), epoch);
  const adapter = new ethers.Contract(profile.module, g.abi.adapter, signer);
  const rc = await (await adapter.bridge(tokenId, submissionId)).wait();
  const ev = rc.logs.map((l) => { try { return adapter.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "TenderBridged");
  const id = ev.args.receiptId;
  const st = g.plainStatus(await ctx.ledger.status(id));
  const receipt = g.plainReceipt(await ctx.ledger.receipt(id));
  const out = { receiptId: id, epoch: receipt.epoch, status: st, txHash: rc.hash };
  print(opts, out, `receipt ${id} in epoch ${receipt.epoch}: ${g.INELIGIBLE_NAME[st.ineligible]}, relation ${g.RELATION_NAME[st.relation]}, GMU ${st.gmuSubsidized}/${st.gmuMeasured}; tx ${rc.hash}`);
}

async function seal(opts) {
  const epoch = BigInt(need(opts._[1], "epoch"));
  const { ctx, signer } = await open(opts, { signer: true });
  const rc = await (await ctx.ledger.connect(signer).seal(epoch)).wait();
  const s = await ctx.ledger.epochSummary(epoch);
  print(opts, { epoch, sealed: s.isSealed, txHash: rc.hash }, `epoch ${epoch} sealed; tx ${rc.hash}`);
}

async function audit(opts) {
  const epoch = BigInt(need(opts._[1], "epoch"));
  const { ctx, rpc } = await open(opts);
  const report = await g.auditEpoch(ctx, epoch);
  const record = auditRecord(ctx, report, { rpc });
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(record, null, 2) + "\n");
  console.log(opts.json ? JSON.stringify(record, null, 2) : auditText(ctx, report));
  return report.ok ? 0 : 2;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const command = opts._[0];
  if (opts.help || !command) { console.log(USAGE); return opts.help ? 0 : 1; }
  const commands = { status, work, bridge, seal, audit };
  if (!commands[command]) throw new Error(`unknown command ${command}\n\n${USAGE}`);
  return (await commands[command](opts)) ?? 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  if (e instanceof g.NotFinalYet) { console.error(`not settled yet: ${e.message}`); process.exitCode = 3; return; }
  if (e instanceof g.AuditMismatch) { console.error(`nothing submitted: ${e.message}`); process.exitCode = 2; return; }
  const refused = g.refusal(e);
  console.error(refused ? `pouw: refused by the contract: ${refused.name}(${refused.args.join(", ")})` : `pouw: ${e.shortMessage ?? e.message}`);
  process.exitCode = 1;
});
