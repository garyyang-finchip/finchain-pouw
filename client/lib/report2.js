// Turning the audit of an epoch of ledger v2 (audit2.js) into a record. No chain access here.
"use strict";

const g = require("./genesis");
const v2 = require("./ledger2");
const { sealed } = require("./canonical");
const { CLIENT, endpointHost } = require("./report");

const SCHEMA = "finchain-pouw.ledger-v2.audit/1";

// the codes of the frozen types, by name: "intelligence-production", "whole", "not-member" ...
const namesOf = (codes) => Object.fromEntries(Object.entries(codes).map(([name, code]) => [code, name.toLowerCase().replace(/_/g, "-")]));
const ROLE_NAME = namesOf(v2.ROLE);
const UNIT_NAME = namesOf(v2.UNIT);
const pair = (x) => ({ g0: x[0], g1: x[1] });

/// The record of one epoch's audit of a v2 ledger: everything a second auditor needs to compare,
/// nothing secret.
///
/// It is built as the record of the kernel's audit is (report.js, schema `finchain-pouw.audit/2`):
/// one block, named in `snapshot`; every integer that can exceed 2^53 a decimal string; two hashes
/// over the canonical form (canonical.js) - `resultHash` over what was found, `reportHash` over the
/// whole record. It differs where ledger v2 does:
///  - `agrees`, `complete` and `undecided` beside `ok` and `findings`: a receipt whose work the
///    client could not read again is not a difference, and it is not left out either. `complete`
///    is the completeness of the work's re-decision within what this client reads, and nothing
///    else: the authorization behind each receipt has states of its own under `entry`;
///  - each receipt names its transaction and how it entered (`entry`): by its participant, or by
///    a delegate under a permit, with where the permit came from - the entry's own call, or the
///    permits given to the run - and what was held of it;
///  - `operators` gives each declared operator's share under the operator cap, and each row of
///    `table` the operator its address was attributed to;
///  - `permits` lists the permits the run was given, after they were read by their own domain and
///    types and sorted into usable, foreign and unusable; they are part of what was found, so two
///    runs at one block agree in `resultHash` when they were given the same permits.
/// `deployment` names the deployment the way its manifest does: `name`, `environment`, `labels`.
function auditRecord(ctx, report, { deployment = {}, rpc = "", recordedAt = new Date().toISOString() } = {}) {
  const labels = deployment.labels ?? [];
  return sealed(g.jsonable({
    schema: SCHEMA,
    environment: deployment.environment ?? "unspecified",
    labels,
    deployment: deployment.name ?? "unnamed",
    chainId: ctx.chainId,
    ledger: ctx.address,
    policy: ctx.policy.target,
    domain: ctx.domain,
    factDomain: ctx.factDomain,
    epoch: report.epoch,
    epochStart: ctx.genesisTime + report.epoch * ctx.epochDuration,
    epochEnd: g.epochEnd(ctx, report.epoch),
    snapshot: g.snapshotOf(report.pin),
    snapshotTag: report.pin.tag,
    snapshotFinality: report.pin.finality,
    observedAt: report.pin.observedAt,
    endpointHost: endpointHost(rpc),
    recordedAt,
    client: CLIENT,
    ok: report.ok,
    agrees: report.agrees,
    complete: report.complete,
    findings: report.findings,
    undecided: report.undecided,
    mode: report.mode,
    paramsVersion: report.paramsVersion,
    params: report.params,
    budget: report.budget,
    pools: pair(report.pools),
    seed: report.seed,
    digest: report.digest,
    receiptCount: report.receiptCount,
    measured: pair(report.totals.measured),
    subsidized: pair(report.totals.subsidized),
    subject: report.subject,
    sealed: report.isSealed,
    closeRecord: report.closeRecord,
    allocated: report.allocated,
    unallocated: report.unallocated,
    tableHash: report.tableHash,
    table: report.table.map((row) => ({
      worker: row.worker, operator: row.operator, admitted: row.admitted, receipts: row.receipts,
      measured: pair(row.measured), subsidized: pair(row.subsidized),
      allocation: row.allocation, allocationG0: row.allocationG0, allocationG1: row.allocationG1,
    })),
    operators: report.operators.map((o) => ({
      operator: o.operator, addresses: o.addresses, subsidized: pair(o.subsidized), share: pair(o.share), capped: pair(o.capped),
      allocated: pair(o.allocated), allocation: o.allocation,
    })),
    undeclaredAddresses: report.undeclaredAddresses,
    entries: report.entries,
    permits: report.permits,
    guards: report.guards,
    facts: report.facts,
    g1: report.g1,
    observations: report.observations,
    receipts: report.receipts.map((it) => ({
      id: it.id, pool: it.receipt.pool === v2.POOL_G0 ? "g0" : "g1", profileId: it.receipt.profileId, worker: it.receipt.worker,
      counterparty: it.receipt.counterparty, operator: it.operator, role: ROLE_NAME[it.receipt.role] ?? String(it.receipt.role),
      unit: UNIT_NAME[it.receipt.unit] ?? String(it.receipt.unit), contentKey: it.receipt.contentKey, workId: it.receipt.workId,
      contributionId: it.receipt.contributionId, verdict: g.VERDICT_NAME[it.status.verdict] ?? String(it.status.verdict),
      eligibility: v2.INELIGIBLE_NAME[it.status.ineligible] ?? String(it.status.ineligible),
      relation: g.RELATION_NAME[it.status.relation] ?? String(it.status.relation),
      gmuMeasured: it.status.gmuMeasured, gmuSubsidized: it.status.gmuSubsidized, duplicateOf: it.status.duplicateOf,
      blockNumber: it.blockNumber, txHash: it.txHash, facts: it.facts ?? null,
      ...(it.entry ? { entry: it.entry } : {}),
      ...(it.tender ? { tender: it.tender } : {}),
    })),
    reading: [
      "Test points are the value of a function of the ledger; nothing was issued, credited or made claimable.",
      "An accepted receipt of the audit function shows a present address and a conforming submission, not an amount of computation.",
      "relation none-found means no declared relation, not independence. The operator cap binds the addresses that the policy attributes to one declared operator; it does not find a party that declares several operators, or none.",
      report.mode === "controlled-self-test"
        ? "This epoch subsidized declared-related parties: it is a controlled self-test and no evidence of external demand."
        : "A settled tender is evidence of a settlement confirmed by its owner or under its owner's permit, not of independent demand.",
      "A receipt entered through a delegate names the digest of a permit. Where the delegate's own transaction is the entry's call, the permit is read from that call and the whole call is held to the receipt; where the call went through another contract and the permit was given to this run, the record holds the given permit against the receipt; otherwise the record holds the digest and nothing about the permit.",
      "The ledger asked a contract account for its signature when the receipt was recorded; this run did not ask again. Whether an account had code at that moment is not in the block that was read: which of the ledger's two rules a permit passed is inferred from the permit and the frozen rules - a permit without a guard passes for an account without code only, one with a guard for an account with code only - and the account's code at the snapshot is reported beside it and decides nothing.",
      "A receipt listed under undecided was not re-decided: its work is of a function or a module this client does not read. Its recorded status is in the totals as recorded, and complete is false. complete says that the work of every receipt was re-decided within what this client reads; it does not say that the authorization behind each receipt was shown, which each receipt's entry says for itself.",
      "The ledger reads a tender as it stands when it is confirmed; observations list what the tender's log shows about the moment it settled.",
      "The tender's log shows the authority that was registered before an acceptance. It does not establish who carried out a verification; where the authority changed in the acceptance's own transaction the record says evidence-insufficient and concludes nothing about a party.",
      "A work fact is what anyone had the module read from a settled tender; it is no receipt, and it counts nothing.",
      "Everything was read at the one block named in snapshot; sealed and closeRecord are as of that block.",
      ...(labels.includes("controlled-self-test")
        ? ["Every party of this deployment belongs to one operator: the deployment as a whole is a controlled self-test, whatever the mode of an epoch."] : []),
      ...(labels.includes("operator-wallet-integration")
        ? ["The parties are wallets held by an operator. No agent's contract account took part: this is not a record of an agent mining as itself."] : []),
    ],
  }));
}

module.exports = { SCHEMA, ROLE_NAME, UNIT_NAME, auditRecord };
