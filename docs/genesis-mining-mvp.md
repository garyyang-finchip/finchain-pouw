# Genesis Mining MVP

The minimal runnable loop (A7):

```
Work  ->  Verify  ->  GMU  ->  Epoch  ->  Test Reward
 off chain   verdict on   measured     closed on chain,   the finalized allocation
             chain        per receipt  deterministic      table, recomputable by anyone
```

Round 1 design, revised after the first review (v0.1.1; `decisions.md` P15-P18 record the
review's six points). Figures marked *illustrative* are examples. Everything below is written
so that two independent workers can mine one epoch on Finchain Sepolia and a third party can
recompute the result from the chain alone - the R1 unit of `roadmap.md`.

The three errors the MVP is built to prevent, in the review's words: fake compute earning a
reward, non-real demand drawing the subsidy, over-engineering blocking the MVP.

## 1. Scope

In: G0 protocol work with three profiles on unpredictable per-worker instances, G1 real demand
through ERC-8414 with subsidy eligibility separated from settlement, one receipt type, the GMU v1
ledger of verified work, epochs with pinned parameters and an on-chain seed, deterministic
on-chain finalization, the allocation table as the test-reward record, an audit recomputation.

Out (later milestones, A9): SIG assessment, IPC, routing, FCT, node attestations, GPU
infrastructure, cell completeness, any transferable or redeemable balance.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Profile | A versioned definition of what counts as work of one kind and how it is verified and measured (`ProfileRegistry`) |
| Seed | A value captured on chain when an epoch opens, unpredictable before that moment; every G0 instance of the epoch derives from it (P17) |
| Instance | One G0 job made unique to one worker: `keccak256(seed, profileId, jobIndex, worker)`; the instance, not the job, is what the worker computes and the verifier recomputes |
| Receipt | One immutable on-chain record of one verified piece of work (`WorkReceipts`) |
| Verdict | `Accepted`, `Rejected` or `Pending`; a receipt's verdict may be overturned once within its challenge window |
| GMU | The Genesis Mining measurement unit of a receipt's verified work, GMU v1 in the MVP (A4). GMU counts work that was verified; a declared capability never adds GMU (P5) |
| Capability record | The output of a calibration job: a measured, re-measurable statement about a worker's capability, kept apart from GMU as input for SIG later |
| Epoch | A fixed interval with a seed, a pinned parameter set, two pools (G0, G1), a budget and a result computed on chain |
| Allocation table | The epoch's result: test points per worker, computed by the contract from its own ledger; the sum of a worker's allocations over epochs is its test-point record (P7) |
| Dedup key | `keccak256(domain, profileId, instance or taskRef, worker)`; one receipt per key (P2) |
| Domain | `keccak256(chainId, address(WorkReceipts))` read at deployment (A13) |

## 3. Data structures

### 3.1 Profile

| Field | Type | Meaning |
| --- | --- | --- |
| `profileId` | `bytes32` | `keccak256(kind, name, version)` |
| `kind` | `uint8` | 0 = G0, 1 = G1 |
| `name` | `string` | `g0.ref`, `g0.cal`, `g0.ver`, `g1.tender` |
| `version` | `uint32` | increments on any change of verifier, formula or caps |
| `verifier` | `address` | the verifier module |
| `formulaVersion` | `uint32` | GMU formula version the receipts of this profile are measured under |
| `baseGmu` | `uint64` | GMU per verified unit of work (*illustrative values in section 6*) |
| `maxGmuPerReceipt` | `uint64` | cap per receipt |
| `maxGmuPerWorkerPerEpoch` | `uint64` | cap per worker per epoch under this profile |
| `challengeWindow` | `uint32` | seconds after the verdict during which it may be overturned |
| `jobsPerEpoch` | `uint32` | G0: the number of job indices in an epoch (finite; each worker may do each index once) |
| `status` | `uint8` | 0 = Active, 1 = Paused (no new receipts), 2 = Retired |

### 3.2 Receipt

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uint256` | sequential |
| `profileId` | `bytes32` | the profile version it was verified under |
| `worker` | `address` | the submitting address |
| `demander` | `address` | G1: the tender's owner; G0: zero |
| `instance` | `bytes32` | G0: the per-worker instance (section 2); G1: `keccak256(taskToken, tokenId)` |
| `inputHash` | `bytes32` | G0: the canonical encoding of the instance's inputs; G1: the tender's task hash |
| `outputHash` | `bytes32` | commitment to the output delivered |
| `dedupKey` | `bytes32` | see section 2 |
| `epoch` | `uint64` | the epoch whose seed the instance derives from (G0) or in which the tender settled (G1); the receipt is counted in this epoch only if its verdict is final before the epoch's finalization time, else in the next (section 7) |
| `submittedAt`, `verifiedAt` | `uint64` | block timestamps |
| `verdict` | `uint8` | 0 = Pending, 1 = Accepted, 2 = Rejected |
| `verifier` | `address` | the module or the body that set the verdict |
| `finalAt` | `uint64` | `verifiedAt + challengeWindow` |
| `units` | `uint64` | verified units of work (G0: 1 per instance; G1: 1 per tender) |
| `tierFactor` | `uint16` | basis points from the worker's identity tier at submission (section 6) |
| `subsidyEligible` | `bool` | G1: whether the receipt may earn test points (section 7.3); G0: always true |
| `gmu` | `uint64` | the measured work, set when the verdict is `Accepted` |

Receipts are append-only; a rejected receipt stays with its verdict (A4). Content (instance
outputs, tender deliverables) stays off chain, referenced by hash (P2).

### 3.3 Calibration record (apart from receipts)

`CalibrationRecords`: per (worker, profile version) the latest measured record hash, the
re-measurements that confirmed or contradicted it, and its status (Declared, Confirmed,
Contradicted). It is informational in the MVP - the input of the SIG Assessed tier later - and
no field of it enters the GMU formula (P5).

### 3.4 Epoch

| Field | Type | Meaning |
| --- | --- | --- |
| `index` | `uint64` | sequential from 0 |
| `start`, `end` | `uint64` | timestamps; `end = start + duration` |
| `seed` | `bytes32` | captured by `openEpoch()` from the seed source the manifest names (section 7.1) |
| `paramsVersion` | `uint32` | the `ParamsRegistry` set pinned at `start` |
| `budget` | `uint128` | test points available in this epoch (from the schedule) |
| `splitG0Bps`, `workerCapBps` | `uint16` | the G0 pool share and the per-worker share cap of each pool |
| `finalizableAt` | `uint64` | `end + longest challengeWindow of the active profiles` (section 7.2) |
| `totalGmuG0`, `totalGmuG1` | `uint128` | sums of capped, subsidy-eligible, final contributions, set at finalization |
| `finalized` | `bool` | set once; the allocation table is then immutable |
| `resultHash` | `bytes32` | hash of the allocation table |

### 3.5 Ledger and allocations

`GMULedger`: `contribution[epoch][pool][worker]` (sum of `gmu` of accepted, final, eligible
receipts) and the participant list per epoch and pool (appended when a worker's first eligible
receipt becomes final). `EpochRewards`: `allocation[epoch][worker]`, written by `finalize`. There
is no balance, transfer, approval, claim or redemption (P7).

## 4. Receipt state machine

```
  submit(profile, instance|taskRef, inputHash, outputHash)
     |  dedup key new, profile Active, epoch open, instance derived from this epoch's seed
     v
  Pending ---verifier sets verdict---> Accepted ---window closes---> Final (counted)
     |                                   |  ^
     |                                   |  | overturn within the window, at most once
     |                                   v  |
     +---------------------------------> Rejected --window closes--> Final (kept, not counted)
```

For `g0.ver` the submission is a commitment: `commit(hash(finding, salt))` during the window of
the verified receipt, `reveal(finding, salt)` after that window closes (section 5). A reveal
that does not match its commitment, or a commitment with no reveal, is Rejected.

Rules: a receipt never leaves `Final`; an overturn is recorded as a second verdict event with the
overturning verifier, the receipt's `verdict`, `verifier` and `verifiedAt` are replaced (the first
verdict stays in the event log) and the window restarts once; a profile paused after submission
does not touch receipts already submitted.

## 5. Profiles of the MVP (P3, P15, P17)

### 5.1 Why instances

A job whose answer can be known in advance proves correctness, not work: an answer set can be
copied, precomputed or shared. The MVP therefore never commits answers. A G0 job is a
deterministic function; what a worker computes is its own instance of it, derived from the
epoch's seed and the worker's address, unknowable before the epoch opens and different for every
worker. Verification recomputes the instance. The work is useful by construction: the first
profiles compute things the protocol itself consumes (section 5.2).

### 5.2 Profiles

| Profile | Work | Submission | Verification | GMU |
| --- | --- | --- | --- | --- |
| `g0.ref` reference computation | a deterministic function `f(instance)` of a size the profile fixes; the first functions are the protocol's own needs: recomputation of a previous epoch's allocation table from the chain (an audit, useful by definition), canonical re-encoding and hashing of public records, and deterministic known-model inference checks once a reference model is pinned | `(instance, inputHash, outputHash)`; `instance` must equal `keccak256(seed, profileId, jobIndex, worker)` for a `jobIndex < jobsPerEpoch`, else the submission reverts | `RecomputeVerifier`: for functions cheap enough, recomputed on chain from the instance; for the others, re-executed by `g0.ver` workers under commit-reveal within the window, with the on-chain verifier applying the majority of revealed findings and marking the receipt Pending until then | 1 unit per accepted instance; per-worker cap per epoch |
| `g0.cal` resource calibration | a benchmark instance (seeded like `g0.ref`) whose output is a capability record: model identifier, latency, throughput, correctness on the instance | `(instance, inputHash, outputHash = hash of the record)` with the record's figures in calldata | `CalibrationVerifier`: well formed and within the profile's plausibility bounds -> the job's verdict Pending for the window; a `g0.ver` re-measurement that agrees sets Accepted and marks the record Confirmed, one that disagrees sets Rejected and marks it Contradicted; with no re-measurement the job is Accepted and the record stays Declared | 1 unit per accepted job, fixed: the record's figures never change the GMU (P5) |
| `g0.ver` verification work | re-executing an attested instance (`g0.ref` of the expensive kind, `g0.cal`) and reporting the finding | assignment by sampling: a worker may verify receipt `r` only if `keccak256(seed, r, worker) mod samplingRate == 0` (the profile's rate), so verifiers do not pick their targets; `commit` within the window of `r`, `reveal` after it; the verifier is never the worker of `r`, nor an address bound to the same identity | `AgreementVerifier`: a revealed finding that matches its commitment and agrees with the final verdict of `r` -> Accepted; a revealed finding that was the first to contradict a verdict later overturned -> Accepted with the overturn bonus; late reveals, unmatched reveals, or findings that merely repeat a verdict already final at commit time -> Rejected | 1 unit per accepted finding; the overturn bonus is a profile constant |
| `g1.tender` real demand | an ERC-8414 tender taken, delivered and accepted (or settled by silence after the judgment window): the M3-C business-loop path | written by `TenderBridge8414` on reading the tender's settlement; nobody submits it by hand | `AcceptanceVerifier`: the tender's settlement is the verdict; a tender under dispute yields no receipt until settled (P4). Settlement proves the delivery; it does not by itself make the receipt subsidy-eligible (section 7.3) | 1 unit per settled tender when eligible |

The number of job indices per epoch is finite (`jobsPerEpoch`) and every worker may do each index
once, so G0 work per worker per epoch is bounded twice: by the indices and by the GMU cap.

## 6. GMU v1 (P5)

```
gmu = baseGmu(profile) x units x tierFactor / 10000
capped by maxGmuPerReceipt and, per worker per epoch, by maxGmuPerWorkerPerEpoch
```

| Factor | Source | Default when unknown |
| --- | --- | --- |
| `baseGmu` | the profile (*illustrative*: `g0.ref` 10, `g0.cal` 5, `g0.ver` 5 plus an overturn bonus of 20, `g1.tender` 50) | profile value |
| `units` | the verifier: 1 per accepted instance, job, finding or tender | 1 |
| `tierFactor` | the worker's identity tier at submission: Unrated 5000, Declared 10000 (an ERC-8004 or ERC-8434 binding). Capability records play no part (P5) | 5000 |

Two things the formula deliberately does not contain: a quality factor (no quality assessment
exists yet; SIG later) and any figure declared by the worker about its own capability. GMU is a
count of verified work under a declared base; capability is recorded beside it, for SIG.

The formula is versioned (`formulaVersion`, pinned by the epoch's parameter set); a receipt is
measured under the version of the epoch it is counted in. A missing measurement takes the
default; a verdict is never invented to make a measurement possible (A4).

## 7. Epochs and the reward (P6, P8, P15, P16)

### 7.1 Opening

`openEpoch()` is permissionless and callable once `end` of the previous epoch has passed. It
captures the seed from the source the deployment manifest names - on an OP Stack chain the latest
L1 block hash from the `L1Block` predeploy, on another chain `prevrandao` or the previous block
hash - pins the parameter version, and computes `finalizableAt`. Nothing about an epoch's
instances is known before this transaction.

### 7.2 Finalization

`finalize(epoch, page)` is permissionless and may be called only when:

1. `block.timestamp >= finalizableAt` - every receipt that can count in this epoch has passed its
   challenge window, so no verdict of the epoch can change;
2. the previous epoch is finalized;
3. the caller supplies no numbers.

The contract computes the allocation table from its own ledger - per pool, per participant:
`c = min(contribution, cap)`, `T = sum of c`, share `= c / T x poolBudget` capped at
`workerCapBps` of the pool budget, the capped remainder not redistributed (P8), integer
arithmetic in base units, dust unallocated - and stores `allocation[epoch][worker]`, the totals
and `resultHash`. Participants are processed in pages of a fixed size so that an epoch of any
size can be closed; the last page sets `finalized`. A caller cannot submit a wrong summary
because there is nothing to submit; a different caller, or the same caller later, produces the
same table. The audit (`pouw audit`) recomputes the table off chain from the receipts and the
pinned parameters and compares `resultHash`; it is a check, not the source of truth.

Receipts whose verdict is not final by `finalizableAt` do not exist for that epoch; by
construction (`finalizableAt = end + longest window`) that only happens to receipts overturned
and re-windowed late, and those count in the next epoch.

### 7.3 G1 subsidy eligibility (P16)

Settlement of a tender proves that a buyer accepted a delivery and paid for it from escrow - real
revenue, accounted on its own (A18). The public subsidy is a second question with its own rules,
pinned in the parameter set:

| Rule | MVP default (*illustrative values*) |
| --- | --- |
| Distinct parties | the demander and the worker are different addresses and, where either has an identity binding, not bound to the same identity; otherwise the receipt is recorded with `subsidyEligible = false` |
| Minimum real bounty | the tender's escrowed bounty paid at settlement is at least `minBountyWei` (*0.001 ETH*) |
| Per-demander cap | at most `maxSubsidizedPerDemander` (*3*) eligible tenders per demander per epoch; later ones are recorded, not eligible |
| Per-pair cap | at most `maxSubsidizedPerPair` (*1*) eligible tenders per (demander, worker) pair per epoch |
| G1 pool cap | the G1 pool is a fixed share of the budget; the subsidy per tender is bounded by the per-worker share cap like any contribution |

An ineligible receipt still exists: it is evidence of work and of demand and enters the SIG
record later; it earns no test points. Related parties therefore can trade freely through
ERC-8414 and never draw the subsidy for it.

### 7.4 Parameters pinned per epoch

| Parameter | Meaning | *Illustrative* |
| --- | --- | --- |
| `duration` | epoch length | 24 h |
| `budget` schedule | test points per epoch, decreasing | 1,000 in epoch 0, halved every 8 epochs |
| `splitG0Bps` | G0 pool share | 7000 |
| `workerCapBps` | per-worker cap of each pool's budget | 2500 |
| `unclaimedPolicy` | treatment of budget not allocated (no contribution, caps) | retire (default), carry forward |
| G1 eligibility rules | section 7.3 | as listed |
| `samplingRate`, overturn bonus | `g0.ver` | 4, 20 |
| `pageSize` | participants per `finalize` call | 100 |

## 8. The test reward (A5, P7)

The epoch's allocation table is the reward record. A worker's test points are the sum of its
allocations over finalized epochs, readable by anyone from the contract or from the events; there
is no balance to hold, nothing to transfer, approve, redeem or convert, and therefore nothing to
claim twice. The deployment manifest and the contract's documentation state that test points
simulate the Genesis Mining schedule and carry no right to any future asset (A5). If a later
ruling ever relates them to anything, that ruling starts from a snapshot of the tables - a
separate, reviewable step, not a property of this system.

## 9. Defaults, versioning, idempotency, recovery, upgrade (A11)

| Concern | Rule |
| --- | --- |
| Defaults | a missing binding means Unrated; a profile with `jobsPerEpoch = 0` yields no receipts; an epoch nobody opens on time opens late with the seed of that moment (its `end` still follows the schedule) |
| Version locking | profiles and parameter sets are versioned and immutable once pinned by an epoch; a change applies from the next epoch; the reference client refuses a profile version it does not know |
| Idempotency | submission is idempotent on the dedup key (a repeat reverts, the first stands); `openEpoch` and `finalize` are idempotent (a repeat is a no-op); commit and reveal are once per (verifier, receipt) |
| Recovery | a worker that crashes mid-instance recomputes and resubmits (same key, same output); a keeper that fails is replaced by anyone; the result does not depend on who finalizes or when |
| Reorgs | the reference client and the audit read finalized blocks for settlement and evidence (P13) |
| Audit | `pouw audit <epoch>` recomputes the table from receipts and pinned parameters and compares `resultHash`; an auditor needs the RPC and nothing else |
| Upgrade | contracts are not upgradeable in place; a new protocol version is a new deployment named in the manifest; the old deployment keeps its history |
| Emergency | the steward can pause submission and nothing else; verdicts, tables and records cannot be edited |

## 10. Minimal interfaces (for round 2)

```solidity
interface IProfileRegistry {
    function register(uint8 kind, string calldata name, address verifier, uint32 formulaVersion, uint64 baseGmu,
        uint64 maxGmuPerReceipt, uint64 maxGmuPerWorkerPerEpoch, uint32 challengeWindow, uint32 jobsPerEpoch) external returns (bytes32 profileId);
    function setStatus(bytes32 profileId, uint8 status) external;
    function get(bytes32 profileId) external view returns (Profile memory);
}

interface IWorkReceipts {
    function submit(bytes32 profileId, uint32 jobIndex, bytes32 inputHash, bytes32 outputHash, bytes calldata attestation) external returns (uint256 id); // G0: the instance is derived and checked here
    function commit(uint256 verifiedReceiptId, bytes32 commitment) external returns (uint256 id);  // g0.ver, within the window, sampling checked
    function reveal(uint256 id, bytes32 finding, bytes32 salt) external;                           // g0.ver, after the window
    function setVerdict(uint256 id, uint8 verdict, uint64 units) external;                         // the profile's verifier only
    function overturn(uint256 id, uint8 verdict, bytes calldata basis) external;                   // within the window, by an eligible overturner
    function get(uint256 id) external view returns (Receipt memory);
    function dedup(bytes32 key) external view returns (uint256 id);                                // 0 when unknown
}

interface ICalibrationRecords {
    function record(address worker, bytes32 profileId) external view returns (bytes32 recordHash, uint8 status, uint32 confirmations, uint32 contradictions);
}

interface IVerifier {
    function verify(uint256 receiptId, bytes32 instance, bytes32 inputHash, bytes32 outputHash, bytes calldata attestation) external returns (uint8 verdict, uint64 units);
}

interface IEpochRewards {
    function openEpoch() external returns (uint64 index);                                          // anyone, after the previous end; captures the seed
    function currentEpoch() external view returns (uint64);
    function seed(uint64 epoch) external view returns (bytes32);
    function finalize(uint64 epoch, uint32 page) external;                                         // anyone, from finalizableAt; no inputs but the page
    function allocation(uint64 epoch, address worker) external view returns (uint128);
    function params(uint64 epoch) external view returns (EpochParams memory);
}

interface ITenderBridge8414 {
    function settle(uint256 tokenId) external returns (uint256 receiptId, bool subsidyEligible);  // reads the tender's settlement; anyone may call
}
```

Events carry everything an auditor needs: `EpochOpened(index, seed, paramsVersion)`,
`ReceiptSubmitted`, `Committed`, `Revealed`, `VerdictSet`, `VerdictOverturned`,
`CalibrationRecorded`, `EpochFinalized(index, totalGmuG0, totalGmuG1, resultHash)`.

## 11. Open points for the ruling

1. P3 / P17: the three G0 profiles on seeded instances as the MVP set, or `g0.ref` (on-chain
   recomputable functions only) and `g1.tender` first, with `g0.cal` and `g0.ver` in R3.
2. P5: the two-tier factor from identity binding only (Unrated 5000, Declared 10000).
3. P6 / P8 / P15: pinned parameters per epoch, the per-worker share cap, retire-by-default, and
   on-chain deterministic finalization in pages.
4. P9: the challenge window and who may overturn in the MVP (a Declared-tier `g0.ver` finding
   under commit-reveal, or an ERC-8436 body from the start).
5. P16: the G1 eligibility defaults (distinct parties, minimum bounty, per-demander and per-pair
   caps).
6. P7: the allocation table as the whole test-reward record (no balance, no claim) in the MVP.
7. P12: the first miners (the OG cell and cell-b) and the first third-party worker.
8. The seed source per chain (OP Stack: the `L1Block` predeploy hash; others: `prevrandao` or the
   previous block hash) and the first `g0.ref` functions.
