#!/usr/bin/env node
// Who is who on a chain where agents act through contract accounts. Read-only; no key is needed.
"use strict";

const { ethers } = require("ethers");
const c = require("./lib/common");
const { TENDER_ABI } = require("./lib/tender");

const USAGE = `usage: node scripts/identity-check.js --config <file> [--rpc <url>] [--out <file>] [--json]

Reads, and only reads: for each party of the configuration, its contract account and the key the
configuration names for it; for each tender named, who owns it, who judges it and who delivered.
From that it says what the reference client's transactions would be on this chain - whose address
the ledger would record for a key's audit job, and which sender the adapter would accept for each
tender. It sends nothing and needs no key.

  --config <file>   parties and tenders to look at, and contracts to call by name (deployments/*.identities.json)
  --rpc <url>       JSON-RPC endpoint (or POUW_RPC, else the configuration's rpc)
  --out <file>      also write the record to a file
  --json            print the record instead of text`;

const ACCOUNT_VIEWS = [
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function ACCOUNT_VERSION() view returns (uint8)",
];
const STATUS_NAME = ["pending", "accepted", "rejected"];

async function main() {
  const opts = c.parse(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return 0; }
  const config = c.readJson(c.need(opts.config, "--config"));
  if (config.schema !== "finchain-pouw.identity-config/1") throw new Error(`the configuration's schema is ${config.schema}, expected finchain-pouw.identity-config/1`);
  const rpc = c.need(opts.rpc ?? process.env.POUW_RPC ?? config.rpc, "--rpc (or POUW_RPC, or the configuration's rpc)");
  const provider = c.connectRpc(rpc);
  const { chainId } = await provider.getNetwork();
  if (BigInt(config.chainId) !== chainId) throw new Error(`the configuration is for chain ${config.chainId}; the endpoint answers for chain ${chainId}`);
  const latest = await provider.getBlock("latest");
  const finalized = await provider.getBlock("finalized").catch(() => null);
  const same = (x, y) => Boolean(x) && Boolean(y) && ethers.getAddress(x) === ethers.getAddress(y);
  const isContract = async (address) => (await provider.getCode(address)) !== "0x";
  const attempt = async (call) => { try { return await call(); } catch { return null; } };

  // the parties: an account, and the key the configuration names for it
  const parties = [];
  for (const p of config.parties ?? []) {
    const account = ethers.getAddress(p.account);
    const wallet = ethers.getAddress(p.wallet);
    const views = new ethers.Contract(account, ACCOUNT_VIEWS, provider);
    const owner = await attempt(() => views.owner());
    const operator = await attempt(() => views.operator());
    const version = await attempt(() => views.ACCOUNT_VERSION());
    parties.push({
      name: p.name, account, wallet, accountIsContract: await isContract(account), walletIsContract: await isContract(wallet),
      accountVersion: version === null ? null : Number(version), owner, operator, walletIsOwner: same(owner, wallet), walletIsOperator: same(operator, wallet),
      walletTransactions: await provider.getTransactionCount(wallet),
    });
  }
  const whose = (address) => {
    for (const p of parties) {
      if (same(address, p.account)) return `the account of ${p.name}`;
      if (same(address, p.wallet)) return `the key of ${p.name}`;
    }
    for (const k of config.contracts ?? []) if (same(address, k.address)) return k.name;
    return null;
  };

  // the tenders: owner, judge, deliveries
  const tenders = [];
  if ((config.tenders ?? []).length > 0) {
    const token = new ethers.Contract(ethers.getAddress(config.taskToken8414.address), TENDER_ABI, provider);
    for (const t of config.tenders) {
      const tokenId = BigInt(t.tokenId);
      const owner = await token.ownerOf(tokenId);
      const judge = await token.acceptanceAuthorityOf(tokenId);
      const count = await token.submissionCountOf(tokenId);
      const ids = t.submissionId === undefined ? Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1)) : [BigInt(t.submissionId)];
      const submissions = [];
      for (const id of ids) {
        const s = await token.submissionOf(tokenId, id);
        submissions.push({ submissionId: id, fulfiller: s.fulfiller, fulfillerIs: whose(s.fulfiller), status: STATUS_NAME[Number(s.status)] ?? String(s.status),
          machineSettled: s.machineSettled, submittedAt: c.iso(s.submittedAt) });
      }
      const ownerIsContract = await isContract(owner);
      tenders.push({
        tokenId, contract: token.target, owner, ownerIs: whose(owner), ownerIsContract, acceptanceAuthority: judge, acceptanceAuthorityIs: whose(judge),
        acceptanceAuthorityIsContract: await isContract(judge), submissions,
        bridge: { acceptedSender: owner, aKeySendingByItselfIsAccepted: !ownerIsContract },
      });
    }
  }

  // what follows for the reference client
  const conclusions = [];
  for (const p of parties) {
    if (!p.accountIsContract) { conclusions.push(`${p.name}: ${p.account} is not a contract. An agent whose identity is its own key takes part with that key directly.`); continue; }
    const roles = [p.walletIsOwner ? "owner" : null, p.walletIsOperator ? "operator" : null].filter(Boolean);
    conclusions.push(`${p.name}: the identity on chain is the contract account ${p.account}; the key ${p.wallet} is ${roles.length > 0 ? `its ${roles.join(" and ")}` : "neither its owner nor its operator"}. `
      + `A transaction the key sends by itself comes from ${p.wallet}: the ledger would record that address as the worker of an audit job, not the account. `
      + "The account is the sender only of calls made through its execute.");
  }
  for (const t of tenders) {
    conclusions.push(`tender ${t.tokenId} is owned by ${t.owner}${t.ownerIs ? ` (${t.ownerIs})` : ""}: the adapter accepts its confirmation from that address only`
      + `${t.ownerIsContract ? ", and that address is a contract - a key sending by itself is refused (NotDemander)" : ""}.`);
    for (const s of t.submissions) {
      conclusions.push(`tender ${t.tokenId}, submission ${s.submissionId} (${s.status}${s.machineSettled ? ", settled by a verifier" : ""}) was delivered by ${s.fulfiller}`
        + `${s.fulfillerIs ? ` (${s.fulfillerIs})` : ""}: that is the worker a receipt would name.`);
    }
    conclusions.push(`tender ${t.tokenId} is judged by ${t.acceptanceAuthority}${t.acceptanceAuthorityIs ? ` (${t.acceptanceAuthorityIs})` : t.acceptanceAuthorityIsContract ? " (a contract)" : ""}.`);
  }
  const accountsAreKeys = parties.every((p) => !p.accountIsContract);
  conclusions.push(accountsAreKeys
    ? "The parties act with their own keys: a key's transactions are the party's."
    : "Here the agents' identities are contract accounts and the keys are other addresses. Taking part with keys alone is an operator-wallet integration; it is not the agents taking part as themselves, and the two are to be accepted separately.");

  const record = {
    schema: "finchain-pouw.identity-check/1", name: config.name, chainId: chainId.toString(), endpointHost: c.endpointHost(rpc),
    recordedAt: new Date().toISOString(), block: { latest: latest.number, finalized: finalized?.number ?? null },
    client: { name: "finchain-pouw", version: c.version() }, host: c.hostInfo(),
    accountsAreKeys, parties, tenders, conclusions, ...(config.source ? { source: config.source } : {}),
  };
  const jsonable = (v) => (typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(jsonable)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)])) : v);
  const plain = jsonable(record);
  if (opts.out) c.writeJson(c.expand(opts.out), plain);
  if (opts.json) { console.log(JSON.stringify(plain, null, 2)); return 0; }

  console.log(`${config.name} on chain ${chainId}, block ${latest.number}${finalized ? ` (finalized ${finalized.number})` : ""}`);
  for (const p of parties) {
    console.log(`  ${p.name}`);
    console.log(`    account ${p.account}  ${p.accountIsContract ? `contract${p.accountVersion === null ? "" : `, revision ${p.accountVersion}`}` : "NOT a contract"}`);
    console.log(`      owner    ${p.owner ?? "-"}`);
    console.log(`      operator ${p.operator ?? "-"}`);
    console.log(`    key     ${p.wallet}  ${p.walletIsContract ? "a contract" : "externally owned"}, ${p.walletTransactions} transactions sent`);
  }
  for (const t of tenders) {
    console.log(`  tender ${t.tokenId} of ${t.contract}`);
    console.log(`    owner ${t.owner}${t.ownerIs ? `  ${t.ownerIs}` : ""}`);
    console.log(`    judge ${t.acceptanceAuthority}${t.acceptanceAuthorityIs ? `  ${t.acceptanceAuthorityIs}` : t.acceptanceAuthorityIsContract ? "  a contract" : ""}`);
    for (const s of t.submissions) console.log(`    submission ${s.submissionId}: ${s.fulfiller}${s.fulfillerIs ? `  ${s.fulfillerIs}` : ""}, ${s.status}${s.machineSettled ? ", verifier" : ""}`);
  }
  console.log("");
  for (const line of conclusions) console.log(`- ${line}`);
  return 0;
}

c.run(main, "identity-check");
