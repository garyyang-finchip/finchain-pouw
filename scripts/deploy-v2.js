#!/usr/bin/env node
// Deploy ledger v2 on a chain from a configuration file and the committed builds (build/v2/*.json).
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const c = require("./lib/common");
const d = require("./lib/deploy2");

const USAGE = `usage: node scripts/deploy-v2.js --config <file> --keys <directory> --genesis <time> [--yes]

  --config <file>     the deployment's configuration (schema finchain-pouw.deploy-config/2). Its
                      supersedes.manifest names, relative to the configuration's own directory, the
                      manifest of the deployment this one supersedes
  --keys <directory>  where scripts/keys.js made the keys: steward.key deploys, registers, binds the
                      guards and funds; a party the configuration names by key is looked up by its
                      .address file
  --genesis <time>    start of epoch 0: +15m (after the chain's latest block), an ISO-8601 time with
                      its zone (2026-01-31T10:00:00+08:00), or seconds since 1970. At least ten
                      minutes ahead: everything is registered before it
  --steward <name>    the steward's key name (default: steward)
  --rpc <url>         JSON-RPC endpoint (or POUW_RPC, else the configuration's rpc)
  --out <directory>   where the manifest and the record go (default: out/<name>). Both are created;
                      a file that exists is never replaced. Before anything is sent a journal is
                      created there, deployment-<time>.journal.jsonl, which holds every transaction
                      the moment it is taken and its outcome after, and in the end the manifest and
                      the record themselves. Each event is also shown on the standard error first;
                      when the journal cannot be written, nothing more is sent and the transactions
                      taken so far are listed there, to be looked up before anything is sent again
  --yes               send the transactions. Without it the plan is checked and printed and
                      nothing is sent

Exit status: 0 planned, or deployed and read back; 2 deployed but the read-back differs; 1 failure.`;

/// Whether anything has this name - a file, a directory, a link, a link to nothing.
function taken(file) {
  try { fs.lstatSync(file); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; }
}

async function main() {
  const opts = c.parse(process.argv.slice(2), ["yes"]);
  if (opts.help) { console.log(USAGE); return 0; }
  const configPath = c.expand(c.need(opts.config, "--config"));
  const config = c.readJson(configPath);
  const keys = c.expand(c.need(opts.keys, "--keys"));
  const rpc = c.need(opts.rpc ?? process.env.POUW_RPC ?? config.rpc, "--rpc (or POUW_RPC, or the configuration's rpc)");
  const out = opts.out ? c.expand(opts.out) : path.join(c.root, "out", config.name);
  const manifestPath = path.join(out, "manifest.json");
  if (taken(manifestPath)) throw new Error(`${manifestPath} exists: a deployment named ${config.name} was made from here, or the name is taken. Nothing is overwritten; choose another --out`);

  let supersedes = null;
  if (config.supersedes !== undefined) {
    const file = path.resolve(path.dirname(configPath), c.need(config.supersedes.manifest, "supersedes.manifest in the configuration"));
    const bytes = fs.readFileSync(file);
    supersedes = { manifest: JSON.parse(bytes.toString("utf8")), sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  }
  const provider = c.connectRpc(rpc);
  const steward = c.walletOf(keys, opts.steward ?? "steward", provider);
  const latest = await provider.getBlock("latest");
  const genesisTime = c.parseTime(c.need(opts.genesis, "--genesis"), latest.timestamp);
  const parties = (config.parties ?? []).map((p) => ({ ...(p.key ? { name: p.key } : {}), ...p, address: p.address ?? c.addressOf(keys, p.key) }));
  const args = { config, genesisTime, parties, supersedes };

  const p = await d.plan({ ...args, provider, stewardAddress: steward.address });
  console.log(d.planText(config, p));
  if (!opts.yes) {
    console.log("\nplan only: nothing was sent. Run the same command with --yes to deploy.");
    return 0;
  }
  // the place for the records is taken before anything is sent: a journal that only this run writes
  c.writableDir(out);
  const journalPath = c.freshPath(out, "deployment").replace(/\.json$/, ".journal.jsonl");
  fs.writeFileSync(journalPath, "", { flag: "wx" });
  // every event is shown on the standard error first, in a line of its own, so that what was sent is
  // known whatever happens to the file; a write that fails stops the run - nothing more is sent - and
  // the file is not written to again, so that nothing is lost in trying to report the failure
  let journalLost = null;
  const journal = (event) => {
    console.error(`  ${journalLine(event)}`);
    if (journalLost) return;
    try {
      fs.appendFileSync(journalPath, `${JSON.stringify(require("../client/lib/genesis").jsonable({ at: new Date().toISOString(), ...event }))}\n`);
    } catch (e) {
      journalLost = e;
      throw new Error(`the journal ${journalPath} could not be written (${e.code ?? e.message}): nothing more is sent`);
    }
  };
  journal({ event: "planned", deployment: config.name, chainId: Number(p.chainId), steward: steward.address, transactions: p.transactions });

  console.log("");
  console.log(`  journal ${journalPath}`);
  let result;
  try {
    result = await d.deployV2({ ...args, steward, rpc, log: (m) => console.log(`  ${m}`), journal });
  } catch (e) {
    const partial = e.partial;
    if (partial) {
      try { journal({ event: "stopped", ...partial }); } catch { /* the journal is lost; what was sent is on the standard error */ }
      let file = null;
      try { file = c.createJson(c.freshPath(out, "deployment-failed"), partial); } catch { file = null; }
      const n = partial.counts;
      const where = [journalLost ? null : `the journal ${journalPath}`, file].filter(Boolean);
      console.error(`deploy-v2: stopped after ${partial.transactions.length} transaction(s): ${n.confirmed} confirmed, ${n.failed} failed, ${n.unknown} unknown, ${n.submitted} taken with no outcome. `
        + (where.length > 0 ? `They are in ${where.join(" and in ")}.` : "No file could be written: they are the journal lines above, on the standard error, and here:"));
      for (const t of partial.transactions) console.error(`  ${t.status} ${t.step}: tx ${t.txHash}, from ${t.from}, nonce ${t.nonce}${t.block !== undefined ? `, block ${t.block}` : ""}`);
      for (const t of partial.transactions.filter((x) => x.status === "unknown" || x.status === "submitted")) {
        console.error(`  look up: ${t.step} - tx ${t.txHash}, nonce ${t.nonce}. Its outcome is not known: look it up by its hash before anything is sent again - a transfer may have arrived, and a party must not be funded twice.`);
      }
      if (n.confirmed > 0) console.error("  What is confirmed stays on chain; a new deployment does not undo it, and its configuration should not fund again a party that was funded here.");
    }
    throw e;
  }
  // the journal holds the result before the files are made: a failure to make them loses nothing. The
  // deployment is complete by now; a journal that cannot take the result does not undo it
  try { journal({ event: "finished", manifest: result.manifest, record: result.record }); } catch (e) { console.error(`deploy-v2: ${e.message}; the deployment itself is complete`); }
  let recordPath;
  try {
    c.createJson(manifestPath, result.manifest);
    recordPath = c.createJson(c.freshPath(out, "deployment"), result.record);
  } catch (e) {
    if (!journalLost) throw new Error(`${e.message}. The manifest and the record are in the journal ${journalPath}`);
    // neither the journal nor the files could be written: the result goes to the standard output
    console.log(JSON.stringify({ manifest: result.manifest, record: result.record }, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    throw new Error(`${e.message}. Neither the journal nor the files could be written: the manifest and the record are on the standard output above`);
  }
  console.log(`\n${result.ok ? "DEPLOYED" : "DEPLOYED, BUT THE READ-BACK DIFFERS"}: ${result.record.transactions.length} transactions, gas ${result.record.gasUsed}`);
  console.log(`  manifest ${manifestPath}`);
  console.log(`  record   ${recordPath}`);
  console.log(`  journal  ${journalPath}`);
  console.log(`  ledger   ${result.manifest.contracts.GenesisLedgerV2}`);
  console.log(`  epoch 0  ${c.iso(genesisTime)} to ${c.iso(genesisTime + BigInt(config.epochDuration))}`);
  return result.ok ? 0 : 2;
}

/// One event of the journal in a line, for the standard error: a transaction with its hash, sender and
/// nonce, or the start and the end of the run.
function journalLine(e) {
  if (e.event === "planned") return `journal: planned ${e.transactions} transactions of ${e.deployment} on chain ${e.chainId}, steward ${e.steward}`;
  if (e.event === "finished") return `journal: finished, the ledger at ${e.manifest?.contracts?.GenesisLedgerV2}`;
  if (e.event === "stopped") return `journal: stopped after ${e.transactions?.length ?? 0} transaction(s)`;
  return `journal: ${e.event} ${e.step}: tx ${e.txHash}, from ${e.from}, nonce ${e.nonce}${e.block !== undefined ? `, block ${e.block}` : ""}${e.address ? `, at ${e.address}` : ""}`;
}

c.run(main, "deploy-v2", require("../client/lib/genesis").refusal);
