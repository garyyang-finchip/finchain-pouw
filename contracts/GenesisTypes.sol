// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

// Shared types and codes of the Genesis Mining kernel (docs/genesis-mining-mvp.md).
// Work identity, acceptance status and reward eligibility are three separate records:
// a Receipt never changes, a Status says what the verifier found and whether the receipt
// counts toward the epoch's allocation, and why not when it does not.

uint8 constant POOL_G0 = 0; // protocol work
uint8 constant POOL_G1 = 1; // real demand (ERC-8414 tenders)

uint8 constant VERDICT_ACCEPTED = 1;
uint8 constant VERDICT_REJECTED = 2;

// What the kernel knows about the two parties of a G1 receipt. NONE_FOUND is not a proof of
// independence: two addresses with no declared relation may still have one controller.
uint8 constant RELATION_NONE_FOUND = 0;
uint8 constant RELATION_DECLARED_RELATED = 1;
uint8 constant RELATION_ATTESTED_INDEPENDENT = 2; // reserved; not produced by this version

// Why a receipt earns no test points. 0 = eligible.
uint8 constant ELIGIBLE = 0;
uint8 constant INELIGIBLE_REJECTED = 1;       // the work was not accepted
uint8 constant INELIGIBLE_NOT_ADMITTED = 2;   // the worker is not admitted to the early subsidy for this epoch
uint8 constant INELIGIBLE_SELF_DEALING = 3;   // G1: the worker is the tender's owner or its acceptance authority
uint8 constant INELIGIBLE_BEFORE_GENESIS = 4; // G1: the work was delivered before this deployment's first epoch
uint8 constant INELIGIBLE_RELATION = 5;       // G1: declared related parties, and the epoch does not subsidize them
uint8 constant INELIGIBLE_ASSET = 6;          // G1: the bounty is not in the chain's native currency
uint8 constant INELIGIBLE_BOUNTY = 7;         // G1: the bounty is below the epoch's minimum
uint8 constant INELIGIBLE_DEMANDER_CAP = 8;   // G1: the demander's subsidized tenders of the epoch are used up
uint8 constant INELIGIBLE_PAIR_CAP = 9;       // G1: the (demander, worker) pair's subsidized tenders are used up
uint8 constant INELIGIBLE_WORKER_CAP = 10;    // the worker's GMU cap under the profile is reached for the epoch
uint8 constant INELIGIBLE_DEMANDER_NOT_ADMITTED = 11; // G1: the tender's owner is not admitted for this epoch

struct Profile {
    bytes32 key;                     // keccak256(bytes(name))
    bytes32 id;                      // keccak256(abi.encode(key, version))
    uint8 pool;                      // POOL_G0 or POOL_G1
    uint32 version;                  // from 1, per key
    address module;                  // G0: the function contract (IG0Function); G1: the adapter allowed to record
    uint64 baseGmu;                  // GMU of one accepted unit of work
    uint64 maxGmuPerWorkerPerEpoch;  // subsidized GMU a worker can accrue under this profile per epoch
    uint32 jobsPerEpoch;             // G0: job indices per epoch; G1: 0
    uint64 activeFromEpoch;          // first epoch this version applies to
    uint64 retiredFromEpoch;         // first epoch it no longer applies to (max = never)
    string name;
}

struct Params {
    uint64 activeFromEpoch;          // first epoch this version applies to
    uint128 budgetBase;              // test points (18 decimals) of the first epoch of this version
    uint32 halvingInterval;          // epochs between halvings of the budget; 0 = constant
    uint16 splitG0Bps;               // share of the budget for the G0 pool; the rest is the G1 pool
    uint16 workerCapBps;             // largest share of a pool one worker address can be allocated
    uint128 minBountyWei;            // G1: smallest native bounty a subsidized tender pays
    uint32 maxSubsidizedPerDemander; // G1: subsidized receipts per demander per epoch
    uint32 maxSubsidizedPerPair;     // G1: subsidized receipts per (demander, worker) pair per epoch
    bool subsidizeDeclaredRelated;   // G1: whether declared-related parties are subsidized (controlled self-tests only)
}

struct Receipt {
    uint64 epoch;          // the epoch the receipt was recorded in; it counts there and nowhere else
    uint8 pool;
    bytes32 profileId;     // the profile version the work was measured under
    address worker;
    address counterparty;  // G1: the demander (the tender's owner, who bridged it); G0: zero
    bytes32 ref;           // G0: the worker's instance; G1: keccak256(abi.encode(source, tokenId, submissionId))
    bytes32 inputHash;     // commitment to what was asked
    bytes32 outputHash;    // commitment to what was delivered
    bytes32 contributionId; // the unit of work, independent of the profile: one receipt per contribution
    uint64 recordedAt;
}

struct Status {
    uint8 verdict;         // VERDICT_ACCEPTED or VERDICT_REJECTED
    uint8 ineligible;      // ELIGIBLE or the reason
    uint8 relation;        // G1: RELATION_*; G0: RELATION_NONE_FOUND
    uint64 gmuMeasured;    // GMU of the accepted work, whether subsidized or not
    uint64 gmuSubsidized;  // GMU counted toward the epoch's allocation
    address verifier;      // the module that produced the verdict
}

struct G1Facts {
    address source;        // the ERC-8414 contract
    uint256 tokenId;
    uint256 submissionId;
    address worker;        // the fulfiller of record
    address demander;      // the tender's owner, who confirmed the settlement by bridging it
    address judge;         // the tender's acceptance authority when the receipt is recorded
    bytes32 inputHash;
    bytes32 outputHash;
    address asset;         // bounty asset; zero = native currency
    uint256 reward;        // bounty paid per completion
    uint64 deliveredAt;    // when the fulfillment was submitted
}

struct EpochSummary {
    uint64 epoch;
    bool opened;           // the seed was captured
    bool ended;            // the epoch's interval has passed: its figures can no longer change
    bool isSealed;         // the close event was emitted
    bytes32 seed;
    bytes32 digest;        // rolling hash over the epoch's receipts in order
    uint64 receiptCount;
    uint32 paramsVersion;
    uint128 budget;
    uint128 budgetG0;
    uint128 budgetG1;
    uint128 measuredG0;
    uint128 measuredG1;
    uint128 subsidizedG0;
    uint128 subsidizedG1;
}
