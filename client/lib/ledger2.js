// Ledger v2: the encodings and the arithmetic of the contracts, repeated off chain
// (docs/ledger-v2.md). Nothing here reads a chain or holds a key. The client's commands for a v2
// deployment - the audit that re-decides v2 receipts, work and confirmation through a delegate -
// are built on this once the interfaces are frozen; until then it serves the tests and whoever
// wants to check an encoding by hand.

"use strict";

const { ethers } = require("ethers");

const abi = {
  policy: require("../abi/GenesisPolicyV2.json"),
  ledger: require("../abi/GenesisLedgerV2.json"),
  adapter: require("../abi/TenderAdapter8414V2.json"),
  guard: require("../abi/IParticipantGuard.json"),
};

const coder = ethers.AbiCoder.defaultAbiCoder();
const enc = (types, values) => ethers.keccak256(coder.encode(types, values));

const POOL_G0 = 0;
const POOL_G1 = 1;
const LEDGER_DOMAIN_TAG = "finchain-pouw.genesis-ledger.v2";
const FACT_DOMAIN_TAG = "finchain-pouw.work-fact.v2";

const INELIGIBLE = {
  NONE: 0, REJECTED: 1, NOT_ADMITTED: 2, SELF_DEALING: 3, BEFORE_GENESIS: 4, RELATION: 5, ASSET: 6, BOUNTY: 7,
  DEMANDER_CAP: 8, PAIR_CAP: 9, WORKER_CAP: 10, DEMANDER_NOT_ADMITTED: 11, OPERATOR_NOT_DECLARED: 12,
  DEMANDER_OPERATOR_NOT_DECLARED: 13, DUPLICATE_CONTRIBUTION: 14, NOT_A_TASK_UNIT: 15,
};
const INELIGIBLE_NAME = ["eligible", "rejected", "worker-not-admitted", "self-dealing", "delivered-before-genesis",
  "declared-related-not-subsidized", "bounty-asset-not-native", "bounty-below-minimum", "demander-cap", "pair-cap",
  "worker-cap", "demander-not-admitted", "operator-not-declared", "demander-operator-not-declared",
  "duplicate-contribution", "not-a-task-unit"];
// the one order in which the rules are asked, per pool: a status has the first reason that applies
const REASON_ORDER = {
  g0: [1, 2, 12, 10],
  g1: [15, 14, 3, 4, 2, 11, 12, 13, 5, 6, 7, 8, 9, 10],
};
const ROLE = { UNCLASSIFIED: 0, INTELLIGENCE_PRODUCTION: 1, AGENT_FULFILLMENT: 2, VERIFICATION: 3, PUBLIC_SERVICE: 4 };
const UNIT = { NONE: 0, WHOLE: 1, NOT_MEMBER: 2, PART: 3, WRONG_ISSUER: 4 };
const PATH = { ACCOUNT: 1, STATEMENT: 2, DELEGATE: 3 };

// ---------------------------------------------------------------- encodings (as in the contracts)

/// keccak256(abi.encode(string tag, uint256 chainId, address ledger))
const ledgerDomain = (chainId, ledger) => enc(["string", "uint256", "address"], [LEDGER_DOMAIN_TAG, chainId, ledger]);
const factDomain = (chainId, ledger) => enc(["string", "uint256", "address"], [FACT_DOMAIN_TAG, chainId, ledger]);
const factId = (factDomain_, source, tokenId, submissionId) =>
  enc(["bytes32", "address", "uint256", "uint256"], [factDomain_, source, tokenId, submissionId]);
const configHash = (domain, policy, seedSource, genesisTime, epochDuration) =>
  enc(["bytes32", "address", "address", "uint64", "uint64"], [domain, policy, seedSource, genesisTime, epochDuration]);
const epochSeed = (domain, epoch, material) => enc(["bytes32", "uint64", "bytes32"], [domain, epoch, material]);
/// A G0 instance, which is the work id of its receipt: the participant in the place 0.1.3 gives the sender.
const g0Instance = (seed, functionId, jobIndex, participant) =>
  enc(["bytes32", "bytes32", "uint32", "address"], [seed, functionId, jobIndex, participant]);
const g0ContributionId = (domain, functionId, epoch, jobIndex, participant) =>
  enc(["bytes32", "uint8", "bytes32", "uint64", "uint32", "address"], [domain, POOL_G0, functionId, epoch, jobIndex, participant]);
const g1ContributionId = (domain, source, tokenId, submissionId) =>
  enc(["bytes32", "uint8", "address", "uint256", "uint256"], [domain, POOL_G1, source, tokenId, submissionId]);
/// The work id of a G1 receipt: one order on chain, one submission to one tender.
const g1WorkId = (chainId, source, tokenId, submissionId) =>
  enc(["uint256", "address", "uint256", "uint256"], [chainId, source, tokenId, submissionId]);
const digestStep = (digest, id, r, st, operator) =>
  enc(["bytes32", "uint256", "bytes32", "address", "uint8", "uint8", "uint8", "uint8", "uint64", "uint64", "uint256", "uint32"],
    [digest, id, r.contributionId, r.worker, r.pool, st.verdict, st.ineligible, st.relation, st.gmuMeasured, st.gmuSubsidized,
      st.duplicateOf, operator]);
const auditSubject = (epoch, digest, receiptCount, totals) =>
  enc(["uint64", "bytes32", "uint64", "uint128", "uint128", "uint128", "uint128"],
    [epoch, digest, receiptCount, totals.measured[0], totals.measured[1], totals.subsidized[0], totals.subsidized[1]]);

// ---------------------------------------------------------------- allocation (as in the ledger)

/// S(o): what the addresses of one operator can be allocated together in a pool.
function operatorShare(poolBudget, ofOperator, total, operatorCapBps) {
  if (ofOperator === 0n || total === 0n) return 0n;
  const raw = (poolBudget * ofOperator) / total;
  const cap = (poolBudget * BigInt(operatorCapBps)) / 10000n;
  return raw > cap ? cap : raw;
}

/// A(i): one address's allocation in a pool. Zero when the pool, the operator or the address has
/// no subsidized GMU; every division rounds down; what a cap withholds goes to nobody.
function share(poolBudget, mine, ofOperator, total, operatorCapBps, workerCapBps) {
  if (mine === 0n || ofOperator === 0n || total === 0n) return 0n;
  const raw = (operatorShare(poolBudget, ofOperator, total, operatorCapBps) * mine) / ofOperator;
  const cap = (poolBudget * BigInt(workerCapBps)) / 10000n;
  return raw > cap ? cap : raw;
}

// ---------------------------------------------------------------- plain values

function plainReceipt(r) {
  return {
    epoch: BigInt(r.epoch), pool: Number(r.pool), profileId: r.profileId, worker: r.worker, counterparty: r.counterparty,
    sender: r.sender, authorization: r.authorization, role: Number(r.role), unit: Number(r.unit), workId: r.workId,
    parent: r.parent, envelopeHash: r.envelopeHash, contentKey: r.contentKey, inputHash: r.inputHash, outputHash: r.outputHash,
    contributionId: r.contributionId, recordedAt: BigInt(r.recordedAt),
  };
}

function plainStatus(s) {
  return {
    verdict: Number(s.verdict), ineligible: Number(s.ineligible), relation: Number(s.relation),
    gmuMeasured: BigInt(s.gmuMeasured), gmuSubsidized: BigInt(s.gmuSubsidized), verifier: s.verifier, duplicateOf: BigInt(s.duplicateOf),
  };
}

module.exports = {
  abi, POOL_G0, POOL_G1, LEDGER_DOMAIN_TAG, FACT_DOMAIN_TAG, INELIGIBLE, INELIGIBLE_NAME, REASON_ORDER, ROLE, UNIT, PATH,
  ledgerDomain, factDomain, factId, configHash, epochSeed, g0Instance, g0ContributionId, g1ContributionId, g1WorkId,
  digestStep, auditSubject, operatorShare, share, plainReceipt, plainStatus,
};
