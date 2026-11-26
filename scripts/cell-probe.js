#!/usr/bin/env node
// Read-only: what the cell guard would answer for each contract account of a configuration, and the
// gas its signature check and the guard take against it, before a round on ledger v2.
"use strict";

const path = require("path");
const { ethers } = require("ethers");
const c = require("./lib/common");
const g = require("../client/lib/genesis");
const probe = require("./lib/cellprobe");

const USAGE = `usage: node scripts/cell-probe.js --config <file> [--block <tag>] [--rpc <url>] [--out <file>] [--json]

Reads, and only reads, at one block: for each party of the configuration, its contract account's
views as the cell guard (contracts/v2/guards/FogaCellGuard.sol) reads them, and what the guard
would answer; then the gas the guard takes for each of the two delegated operations and the gas the
account's signature check takes for a well-formed signature that is not the owner's, each against
the bound the ledger gives it (500,000 and 200,000). The guard is the committed build, placed by a
state override for each call only: nothing is deployed, nothing is sent, and no key is needed.

  --config <file>   the parties (deployments/*.identities.json): each party's "account" is probed
  --block <tag>     the block to read: finalized (default), latest, or a number
  --rpc <url>       JSON-RPC endpoint (or POUW_RPC, else the configuration's rpc). It must accept a
                    state override in eth_call
  --out <file>      also write the record to a file; the file is created, never replaced
  --json            print the record instead of text

Exit status: 0 read; 1 failure.`;

async function main() {
  const opts = c.parse(process.argv.slice(2), ["json"]);
  if (opts.help) { console.log(USAGE); return 0; }
  const config = c.readJson(c.expand(c.need(opts.config, "--config")));
  if (config.schema !== "finchain-pouw.identity-config/1") throw new Error(`the configuration's schema is ${config.schema}, expected finchain-pouw.identity-config/1`);
  const rpc = c.need(opts.rpc ?? process.env.POUW_RPC ?? config.rpc, "--rpc (or POUW_RPC, or the configuration's rpc)");
  const provider = c.connectRpc(rpc);
  const { chainId } = await provider.getNetwork();
  if (BigInt(config.chainId) !== chainId) throw new Error(`the configuration is for chain ${config.chainId}; the endpoint answers for chain ${chainId}`);
  const tag = opts.block === undefined ? "finalized" : /^\d+$/.test(opts.block) ? Number(opts.block) : opts.block;
  const body = await probe.probe(provider, (config.parties ?? []).map((p) => ({ name: p.name, account: p.account })), { blockTag: tag });
  const record = g.jsonable({
    schema: "finchain-pouw.cell-probe/2",
    environment: config.environment ?? "unspecified",
    configuration: config.name,
    chainId,
    endpointHost: c.endpointHost(rpc),
    recordedAt: new Date().toISOString(),
    client: { name: "finchain-pouw", version: c.version() },
    host: c.hostInfo(),
    ...body,
    notes: [
      "Read-only: every figure is an eth_call at the block named, with the guard's committed build and a gas meter placed at two unused addresses for that call only. Nothing was deployed or sent.",
      "The signature checked is a well-formed signature by a key made for the probe and not kept: the figure is the cost of the account's check for a signature that is not its owner's.",
      "The gas of a call is as the caller sees it: it includes the access of the called contract and a few dozen gas of setup. Whether a bound held is whether the call succeeded when it was given that bound, not a comparison of the caller's figure with the bound.",
      "The block's hash was asked for again after the last read and was the same: every figure is of that one block.",
    ],
  });
  if (opts.out) c.createJson(path.resolve(c.expand(opts.out)), record);
  if (opts.json) { console.log(JSON.stringify(record, null, 2)); return 0; }
  const b = record.block;
  console.log(`${config.name} on chain ${chainId}, block ${b.number} ${b.hash} (${b.asked}, ${c.iso(b.timestamp)}); its hash asked for again at the end and unchanged`);
  for (const p of record.parties) {
    const r = p.reading;
    console.log(`\n${p.name ?? p.account}  ${p.account}`);
    console.log(`  views     revision ${r.accountVersion ?? "unreadable"}, ${r.presentedBindings ?? "?"} bindings for ${r.clauses ?? "?"} clauses, verdict ${["unknown", "satisfied", "not satisfied"][r.verdict] ?? "unreadable"}`
      + `${r.aid && r.aid !== ethers.ZeroAddress ? `, anchor ${["dormant", "active", "stale", "retired"][r.aidState] ?? "unreadable"} in ${r.aid}` : ", no AID registry named"}`);
    console.log(`  guard     would ${r.allows ? "allow" : `refuse (${r.reasons.join("; ")})`}; the guard itself answers ${p.guard.submitG0.allows ? "allow" : "refuse"} for submitG0 and ${p.guard.confirmTender.allows ? "allow" : "refuse"} for confirmTender${p.readingAgreesWithGuard ? "" : " - NOT what the views say"}`);
    const callText = (x, bound) => `${x.callerGas} caller gas, ${x.succeededWithTheBound ? `succeeded with ${bound}` : `FAILED with ${bound} (${x.failure})`}${x.succeededWithTheBound && !x.answerValid ? ", ANSWER NOT IN THE FORM THE LEDGER READS" : ""}`;
    console.log(`  guard gas submitG0: ${callText(p.guard.submitG0, record.bounds.guard)}; confirmTender: ${callText(p.guard.confirmTender, record.bounds.guard)}`);
    console.log(`  signature ${callText(p.signature, record.bounds.signature)}; answer ${p.signature.answer ?? "none"}${p.signature.acceptedTheForeignSignature ? " - IT ACCEPTED A SIGNATURE THAT IS NOT THE OWNER'S" : ""}`);
  }
  if (opts.out) console.log(`\nrecord ${opts.out}`);
  return 0;
}

c.run(main, "cell-probe", g.refusal);
