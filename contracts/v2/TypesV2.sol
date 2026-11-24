// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

// Shared types and codes of ledger v2 (docs/ledger-v2.md). The kernel of release 0.1.3 keeps its
// own types in GenesisTypes.sol and is not changed: v2 is a second set of contracts beside it.
//
// As in 0.1.3, work identity, acceptance status and reward eligibility are three separate records:
// a Receipt never changes, a Status says what the verifier found and whether the receipt counts
// toward the epoch's allocation, and why not when it does not.

uint8 constant POOL_G0 = 0; // protocol work
uint8 constant POOL_G1 = 1; // real demand (ERC-8414 tenders)

uint8 constant VERDICT_ACCEPTED = 1;
uint8 constant VERDICT_REJECTED = 2;

// What the kernel knows about the two parties of a G1 receipt. NONE_FOUND is not a proof of
// independence: two addresses with no declared relation may still have one controller.
uint8 constant RELATION_NONE_FOUND = 0;
uint8 constant RELATION_DECLARED_RELATED = 1;
uint8 constant RELATION_ATTESTED_INDEPENDENT = 2; // reserved; not produced by this version

// Why a receipt earns no test points. 0 = eligible. Codes 1 to 11 are those of 0.1.3.
uint8 constant ELIGIBLE = 0;
uint8 constant INELIGIBLE_REJECTED = 1;       // the work was not accepted
uint8 constant INELIGIBLE_NOT_ADMITTED = 2;   // the worker is not admitted to the early subsidy for this epoch
uint8 constant INELIGIBLE_SELF_DEALING = 3;   // G1: the worker is the tender's owner or its judge, as the tender stands when confirmed
uint8 constant INELIGIBLE_BEFORE_GENESIS = 4; // G1: the work was delivered before this deployment's first epoch
uint8 constant INELIGIBLE_RELATION = 5;       // G1: declared related parties, and the epoch does not subsidize them
uint8 constant INELIGIBLE_ASSET = 6;          // G1: the bounty is not in the chain's native currency
uint8 constant INELIGIBLE_BOUNTY = 7;         // G1: the bounty is below the epoch's minimum
uint8 constant INELIGIBLE_DEMANDER_CAP = 8;   // G1: the demander's subsidized tenders of the epoch are used up
uint8 constant INELIGIBLE_PAIR_CAP = 9;       // G1: the (demander, worker) pair's subsidized tenders are used up
uint8 constant INELIGIBLE_WORKER_CAP = 10;    // the worker's GMU cap under the profile is reached for the epoch
uint8 constant INELIGIBLE_DEMANDER_NOT_ADMITTED = 11; // G1: the tender's owner is not admitted for this epoch
uint8 constant INELIGIBLE_OPERATOR_NOT_DECLARED = 12; // the worker has no declared operator: measured, not subsidized
uint8 constant INELIGIBLE_DEMANDER_OPERATOR_NOT_DECLARED = 13; // G1: the demander has no declared operator
uint8 constant INELIGIBLE_DUPLICATE_CONTRIBUTION = 14; // G1: a later rightful delivery of a content key that is taken
uint8 constant INELIGIBLE_NOT_A_TASK_UNIT = 15;        // G1: not a whole task unit of the profile version

// The operations a permit can name: one bit each in Permit.scope. Any other bit makes a permit invalid.
uint32 constant OP_SUBMIT_G0 = 1;       // bit 0: submit the account's G0 work
uint32 constant OP_CONFIRM_TENDER = 2;  // bit 1: confirm a settled tender the account owns
uint32 constant KNOWN_SCOPE = 3;

// The contribution class of a profile version, recorded in every receipt of the version.
uint8 constant ROLE_UNCLASSIFIED = 0;            // the two profiles of 0.1.3: g0.ref and g1.tender
uint8 constant ROLE_INTELLIGENCE_PRODUCTION = 1;
uint8 constant ROLE_AGENT_FULFILLMENT = 2;
uint8 constant ROLE_VERIFICATION = 3;
uint8 constant ROLE_PUBLIC_SERVICE = 4;

// What a profile's module found about a delivery, under a profile version that counts task units.
// UNIT_NONE is the only value under a profile version that does not.
uint8 constant UNIT_NONE = 0;
uint8 constant UNIT_WHOLE = 1;        // a member of the version's committed set, whole, issued by a named demander
uint8 constant UNIT_NOT_MEMBER = 2;   // not a member of the committed set
uint8 constant UNIT_PART = 3;         // a part of a task unit
uint8 constant UNIT_WRONG_ISSUER = 4; // not issued by a demander the version names

// How a permit was ended, or a minimum nonce raised.
uint8 constant PATH_ACCOUNT = 1;   // a call sent by the account itself
uint8 constant PATH_STATEMENT = 2; // a statement signed by the account, relayed by anyone
uint8 constant PATH_DELEGATE = 3;  // the delegate gave the permit up

struct Profile {
    bytes32 key;                     // keccak256(bytes(name))
    bytes32 id;                      // keccak256(abi.encode(key, version))
    uint8 pool;                      // POOL_G0 or POOL_G1
    uint32 version;                  // from 1, per key
    address module;                  // G0: the function contract (IG0Function); G1: the module allowed to record
    uint64 baseGmu;                  // GMU of one accepted unit of work
    uint64 maxGmuPerWorkerPerEpoch;  // subsidized GMU a worker can accrue under this profile per epoch
    uint32 jobsPerEpoch;             // G0: job indices per epoch; G1: 0
    uint64 activeFromEpoch;          // first epoch this version applies to
    uint64 retiredFromEpoch;         // first epoch it no longer applies to (max = never)
    uint8 role;                      // ROLE_*: the contribution class of the version's receipts
    bool countsUnits;                // G1: a task unit of this version is counted once per ledger
    bytes32 unitSetRoot;             // commitment to the version's task units; zero unless countsUnits
    bytes32 issuerSetRoot;           // commitment to the demanders the version names; zero unless countsUnits
    string name;
}

// What the steward states when it registers a profile version; the policy derives the rest.
struct ProfileSpec {
    string name;
    uint8 pool;
    address module;
    uint64 baseGmu;
    uint64 maxGmuPerWorkerPerEpoch;
    uint32 jobsPerEpoch;
    uint64 activeFromEpoch;
    uint8 role;
    bool countsUnits;
    bytes32 unitSetRoot;
    bytes32 issuerSetRoot;
}

struct Params {
    uint64 activeFromEpoch;          // first epoch this version applies to
    uint128 budgetBase;              // test points (18 decimals) of the first epoch of this version
    uint32 halvingInterval;          // epochs between halvings of the budget; 0 = constant
    uint16 splitG0Bps;               // share of the budget for the G0 pool; the rest is the G1 pool
    uint16 workerCapBps;             // largest share of a pool one worker address can be allocated
    uint16 operatorCapBps;           // largest share of a pool the addresses of one declared operator can be allocated
    uint128 minBountyWei;            // G1: smallest native bounty a subsidized tender pays
    uint32 maxSubsidizedPerDemander; // G1: subsidized receipts per demander per epoch
    uint32 maxSubsidizedPerPair;     // G1: subsidized receipts per (demander, worker) pair per epoch
    bool subsidizeDeclaredRelated;   // G1: whether declared-related parties are subsidized (controlled self-tests only)
}

// The statement by which an account lets a separate key record its work, within bounds. EIP-712,
// in the ledger's own domain; never registered, presented and checked at every use.
struct Permit {
    address account;             // the participant that authorizes
    address delegate;            // the only key that may use the permit
    uint32 scope;                // OP_* bits
    uint64 notBeforeEpoch;       // first epoch in which it can be used
    uint64 notAfterEpoch;        // last epoch in which it can be used
    uint64 nonce;                // usable only while it is not below the account's minimum
    address guard;               // the guard the consumer must consult; zero only for an account without code
    uint64 guardBindingVersion;  // the version of the account's guard binding the permit was signed for
}

// Who sent the call that led to a G1 receipt, and under which permit. Stated by a profile's
// module, the only caller the ledger accepts for a G1 receipt.
struct Entry {
    address sender;        // the caller of the module's entry function
    bytes32 authorization; // zero on the direct entry; the permit's digest on the delegated one
}

struct Receipt {
    uint64 epoch;           // the epoch the receipt was recorded in; it counts there and nowhere else
    uint8 pool;
    bytes32 profileId;      // the profile version the work was measured under
    address worker;         // the participant whose work it is
    address counterparty;   // G1: the demander that confirmed; G0: zero
    address sender;         // the caller of the entry function: of the ledger for G0, of the module for G1
    bytes32 authorization;  // zero on the direct entry; the permit's digest on the delegated one
    uint8 role;             // the profile version's ROLE_*
    uint8 unit;             // UNIT_*: what the module found, under a profile version that counts task units
    bytes32 workId;         // G0: the worker's instance; G1: keccak256(abi.encode(chainId, source, tokenId, submissionId))
    bytes32 parent;         // the workId of the work this one is a part of, or zero
    bytes32 envelopeHash;   // commitment to the production evidence envelope, or zero
    bytes32 contentKey;     // the task a profile version counts once, or zero
    bytes32 inputHash;      // commitment to what was asked
    bytes32 outputHash;     // commitment to what was delivered
    bytes32 contributionId; // the unit of work, independent of the profile: one receipt per contribution
    uint64 recordedAt;
}

struct Status {
    uint8 verdict;         // VERDICT_ACCEPTED or VERDICT_REJECTED
    uint8 ineligible;      // ELIGIBLE or the reason: the first that applies, in the order of docs/ledger-v2.md 7
    uint8 relation;        // G1: RELATION_*; G0: RELATION_NONE_FOUND
    uint64 gmuMeasured;    // GMU of the accepted work, whether subsidized or not
    uint64 gmuSubsidized;  // GMU counted toward the epoch's allocation
    address verifier;      // the module that produced the verdict
    uint256 duplicateOf;   // reason 14: the receipt that took the content key; zero in every other case
}

struct G1Facts {
    address source;        // the ERC-8414 contract
    uint256 tokenId;
    uint256 submissionId;
    address worker;        // the fulfiller of record
    address demander;      // the tender's owner, in whose name the settlement was confirmed
    address judge;         // the tender's acceptance authority when the receipt is recorded
    bytes32 inputHash;
    bytes32 outputHash;
    address asset;         // bounty asset; zero = native currency
    uint256 reward;        // bounty paid per completion
    uint64 deliveredAt;    // when the fulfillment was submitted
}

// What a profile's module adds to the facts of a G1 receipt.
struct G1Extra {
    bytes32 parent;        // the workId of the work this one is a part of, or zero
    bytes32 envelopeHash;  // commitment to the production evidence envelope, or zero
    bytes32 contentKey;    // the task the profile version counts once; zero under a version that does not
    uint8 unit;            // UNIT_*
}

// A settlement as a module read it from its source, recorded apart from any receipt. A fact
// counts nothing: no GMU, no contribution id, no content key, no cap, no counter.
struct FactData {
    address source;        // the ERC-8414 contract
    uint256 tokenId;
    uint256 submissionId;
    address fulfiller;
    address owner;         // the tender's owner as it stood when the fact was recorded
    address judge;         // the tender's acceptance authority as it stood then
    bytes32 taskHash;      // the task the submission cites; zero when the binding had moved on
    bytes32 resultHash;
    address asset;         // bounty asset; zero = native currency
    uint256 reward;        // bounty per completion
    uint64 deliveredAt;    // when the fulfillment was submitted
    address recorder;      // the caller of the module
}

struct Fact {
    FactData data;
    bytes32 profileId;     // the profile version whose module recorded it
    uint64 recordedAt;
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

// An account's guard binding: the one in force, or one scheduled for a later epoch.
struct GuardBinding {
    address guard;         // zero = none bound
    uint64 version;        // rises by one with every binding of the account, to any guard; never reused
    uint64 fromEpoch;      // first epoch the binding applies to
    bytes32 codeHash;      // the guard's code hash when it was bound; zero for the zero guard
}
