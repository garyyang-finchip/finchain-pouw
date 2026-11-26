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
                      the record themselves
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
  const journal = (event) => fs.appendFileSync(journalPath, `${JSON.stringify(require("../client/lib/genesis").jsonable({ at: new Date().toISOString(), ...event }))}\n`);
  journal({ event: "planned", deployment: config.name, chainId: Number(p.chainId), steward: steward.address, transactions: p.transactions });

  console.log("");
  console.log(`  journal ${journalPath}`);
  let result;
  try {
    result = await d.deployV2({ ...args, steward, rpc, log: (m) => console.log(`  ${m}`), journal });
  } catch (e) {
    const partial = e.partial;
    if (partial) {
      journal({ event: "stopped", ...partial });
      let file = null;
      try { file = c.createJson(c.freshPath(out, "deployment-failed"), partial); } catch { file = null; }
      const n = partial.counts;
      console.error(`deploy-v2: stopped after ${partial.transactions.length} transaction(s): ${n.confirmed} confirmed, ${n.failed} failed, ${n.unknown} unknown. They are in the journal ${journalPath}${file ? ` and in ${file}` : ""}.`);
      for (const t of partial.transactions.filter((x) => x.status === "unknown" || x.status === "submitted")) {
        console.error(`  unknown: ${t.step} - tx ${t.txHash}, nonce ${t.nonce}. Look it up by its hash before anything is sent again: a transfer whose outcome is unknown may have arrived, and a party must not be funded twice.`);
      }
      if (n.confirmed > 0) console.error("  What is confirmed stays on chain; a new deployment does not undo it, and its configuration should not fund again a party that was funded here.");
    }
    throw e;
  }
  // the journal holds the result before the files are made: a failure to make them loses nothing
  journal({ event: "finished", manifest: result.manifest, record: result.record });
  try { c.createJson(manifestPath, result.manifest); } catch (e) { throw new Error(`${e.message}. The manifest and the record are in the journal ${journalPath}`); }
  const recordPath = c.createJson(c.freshPath(out, "deployment"), result.record);
  console.log(`\n${result.ok ? "DEPLOYED" : "DEPLOYED, BUT THE READ-BACK DIFFERS"}: ${result.record.transactions.length} transactions, gas ${result.record.gasUsed}`);
  console.log(`  manifest ${manifestPath}`);
  console.log(`  record   ${recordPath}`);
  console.log(`  journal  ${journalPath}`);
  console.log(`  ledger   ${result.manifest.contracts.GenesisLedgerV2}`);
  console.log(`  epoch 0  ${c.iso(genesisTime)} to ${c.iso(genesisTime + BigInt(config.epochDuration))}`);
  return result.ok ? 0 : 2;
}

c.run(main, "deploy-v2", require("../client/lib/genesis").refusal);
