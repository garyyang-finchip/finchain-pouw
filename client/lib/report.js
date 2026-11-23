// Turning an audit report into a record and into text. No chain access here.
"use strict";

const { ethers } = require("ethers");
const g = require("./genesis");

const CLIENT = { name: "finchain-pouw", version: require("../../package.json").version };
const points = (v) => ethers.formatUnits(v, 18);

/// The host of an endpoint and nothing else: paths and query strings of RPC URLs can carry
/// access keys, which never go into a record.
function endpointHost(rpc) {
  try { return new URL(rpc).host; } catch { return "unknown"; }
}

/// The record of one epoch's audit: everything a second auditor needs to compare, nothing secret.
function auditRecord(ctx, report, { rpc = "", recordedAt = new Date().toISOString() } = {}) {
  return g.jsonable({
    schema: "finchain-pouw.audit/1",
    environment: ctx.manifest.environment ?? "unspecified",
    labels: ctx.manifest.labels ?? [],
    deployment: ctx.manifest.name ?? "unnamed",
    chainId: ctx.chainId,
    ledger: ctx.ledger.target,
    domain: ctx.domain,
    epoch: report.epoch,
    epochStart: ctx.genesisTime + report.epoch * ctx.epochDuration,
    epochEnd: g.epochEnd(ctx, report.epoch),
    settledTag: String(ctx.tag),
    settledBlock: report.settledBlock,
    endpointHost: endpointHost(rpc),
    recordedAt,
    client: CLIENT,
    ok: report.ok,
    findings: report.findings,
    mode: report.mode,
    paramsVersion: report.paramsVersion,
    params: report.params,
    budget: report.budget,
    pools: { g0: report.pools[0], g1: report.pools[1] },
    seed: report.seed,
    digest: report.digest,
    receiptCount: report.receiptCount,
    measured: { g0: report.totals.measured[0], g1: report.totals.measured[1] },
    subsidized: { g0: report.totals.subsidized[0], g1: report.totals.subsidized[1] },
    subject: report.subject,
    sealed: report.isSealed,
    allocated: report.allocated,
    unallocated: report.unallocated,
    tableHash: report.tableHash,
    table: report.table.map((row) => ({
      worker: row.worker, operator: row.operator, admitted: row.admitted, receipts: row.receipts,
      measured: { g0: row.measured[0], g1: row.measured[1] }, subsidized: { g0: row.subsidized[0], g1: row.subsidized[1] },
      allocation: row.allocation, allocationG0: row.allocationG0, allocationG1: row.allocationG1,
    })),
    operators: report.operators,
    undeclaredAddresses: report.undeclaredAddresses,
    g1: report.g1,
    observations: report.observations,
    receipts: report.receipts.map((it) => ({
      id: it.id, pool: it.receipt.pool === g.POOL_G0 ? "g0" : "g1", worker: it.receipt.worker, counterparty: it.receipt.counterparty,
      contributionId: it.receipt.contributionId, verdict: g.VERDICT_NAME[it.status.verdict],
      eligibility: g.INELIGIBLE_NAME[it.status.ineligible], relation: g.RELATION_NAME[it.status.relation],
      gmuMeasured: it.status.gmuMeasured, gmuSubsidized: it.status.gmuSubsidized, blockNumber: it.blockNumber, txHash: it.txHash,
      ...(it.tender ? { tender: it.tender } : {}),
    })),
    reading: [
      "Test points are the value of a function of the ledger; nothing was issued, credited or made claimable.",
      "An accepted g0.ref receipt shows a present address and a conforming submission, not an amount of computation.",
      "relation none-found means no declared relation, not independence; the share cap binds an address, not a party.",
      report.mode === "controlled-self-test"
        ? "This epoch subsidized declared-related parties: it is a controlled self-test and no evidence of external demand."
        : "A settled tender is evidence of a settlement confirmed by its owner, not of independent demand.",
      "The ledger reads a tender as it stands when it is bridged; observations list what the tender's log shows about the moment it settled.",
      ...((ctx.manifest.labels ?? []).includes("controlled-self-test")
        ? ["Every party of this deployment belongs to one operator: the deployment as a whole is a controlled self-test, whatever the mode of an epoch."] : []),
      ...((ctx.manifest.labels ?? []).includes("operator-wallet-integration")
        ? ["The parties are wallets held by an operator. No agent's contract account took part: this is not a record of an agent mining as itself."] : []),
    ],
  });
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

/// The report as text, for a terminal.
function auditText(ctx, report) {
  const lines = [];
  lines.push(`epoch ${report.epoch}  ${report.ok ? "MATCH" : "DIFFERS"}  mode ${report.mode}  settled block ${report.settledBlock}`);
  if ((ctx.manifest.labels ?? []).length > 0) lines.push(`  ${ctx.manifest.environment ?? "environment unspecified"}: ${ctx.manifest.labels.join(", ")}`);
  lines.push(`  parameters v${report.paramsVersion}  budget ${points(report.budget)} (G0 ${points(report.pools[0])}, G1 ${points(report.pools[1])})  share cap ${Number(report.params.workerCapBps) / 100}% per address`);
  lines.push(`  receipts ${report.receiptCount}  measured GMU G0 ${report.totals.measured[0]} G1 ${report.totals.measured[1]}  subsidized GMU G0 ${report.totals.subsidized[0]} G1 ${report.totals.subsidized[1]}`);
  lines.push(`  digest  ${report.digest}`);
  lines.push(`  subject ${report.subject}`);
  lines.push(`  table   ${report.tableHash}  allocated ${points(report.allocated)}  unallocated ${points(report.unallocated)}`);
  lines.push("");
  lines.push(`  ${pad("worker", 42)}  ${pad("op", 3)} ${pad("adm", 3)} ${pad("GMU s/m G0", 10)} ${pad("GMU s/m G1", 10)}  test points`);
  for (const row of report.table) {
    lines.push(`  ${row.worker}  ${pad(row.operator || "-", 3)} ${pad(row.admitted ? "yes" : "no", 3)} ${pad(`${row.subsidized[0]}/${row.measured[0]}`, 10)} ${pad(`${row.subsidized[1]}/${row.measured[1]}`, 10)}  ${points(row.allocation)}`);
  }
  if (report.operators.length > 0) {
    lines.push("");
    lines.push("  by declared operator (the cap binds an address; this is the same table added up):");
    for (const o of report.operators) lines.push(`    operator ${o.operator}: ${o.addresses.length} address(es), ${points(o.allocation)} test points`);
  }
  if (report.g1.receipts > 0) {
    lines.push("");
    lines.push(`  G1 receipts ${report.g1.receipts}, subsidized ${report.g1.subsidized}; by relation ${JSON.stringify(report.g1.byRelation)}; by settlement ${JSON.stringify(report.g1.bySettlement)}`);
  }
  const refused = report.receipts.filter((it) => it.status.ineligible !== g.INELIGIBLE.NONE);
  if (refused.length > 0) {
    lines.push("");
    lines.push("  recorded and not subsidized:");
    for (const it of refused) lines.push(`    receipt ${it.id} G${it.receipt.pool} ${it.receipt.worker}: ${g.INELIGIBLE_NAME[it.status.ineligible]}`);
  }
  if (report.observations.length > 0) {
    lines.push("");
    lines.push("  observations (not differences: what the tender's log shows and the ledger's rules cannot read):");
    for (const o of report.observations) lines.push(`    receipt ${o.receiptId}${o.subsidized ? ", subsidized" : ""}: ${o.noted.join(", ")}`);
  }
  if (!report.ok) {
    lines.push("");
    lines.push("  differences (recomputed / ledger):");
    for (const f of report.findings) lines.push(`    ${f.what}: ${f.recomputed} / ${f.ledger}`);
  }
  return lines.join("\n");
}

module.exports = { CLIENT, auditRecord, auditText, endpointHost, points };
