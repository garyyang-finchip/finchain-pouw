# Genesis Mining MVP

The minimal runnable loop (A7):

```
Work  ->  Verify  ->  GMU  ->  Epoch  ->  Test Reward
 off chain   verdict on   measured     pools divided   non-transferable
             chain        per receipt  at epoch end    points, claimed once
```

Round 1 design; figures marked *illustrative* are examples (see `decisions.md`). Everything
below is written so that two existing cells (the OG cell and cell-b on Finchain Sepolia) can mine
one epoch and a third party can recompute the result from the chain alone - the P1 acceptance of
the roadmap.

## 1. Scope

In: G0 protocol work with three profiles, G1 real demand through ERC-8414, one receipt type, the
GMU v1 ledger, epochs with pinned parameters, non-transferable test points, a challenge window,
permissionless finalization, an audit recomputation.

Out (later milestones, A9): SIG assessment, IPC, routing, FCT, node attestations, GPU
infrastructure, cell completeness.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Profile | A versioned definition of what counts as work of one kind and how it is verified and measured (`ProfileRegistry`) |
| Receipt | One immutable on-chain record of one verified piece of work (`WorkReceipts`) |
| Verdict | `Accepted`, `Rejected` or `Pending` (awaiting an attested measurement); a receipt's verdict may be overturned once within its challenge window |
| GMU | The Genesis Mining measurement unit of a receipt's contribution, GMU v1 in the MVP (A4) |
| Epoch | A fixed interval with a pinned parameter set, two pools (G0, G1), a budget and a result |
| Test points | The epoch reward: an internal non-transferable, non-redeemable balance (A5, P7) |
| Dedup key | `keccak256(domain, profileId, worker, taskRef, inputHash)`; one receipt per key (P2) |
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
| `baseGmu` | `uint64` | GMU per unit of work before factors (*illustrative values below*) |
| `maxGmuPerReceipt` | `uint64` | cap per receipt |
| `maxGmuPerWorkerPerEpoch` | `uint64` | cap per worker per epoch under this profile |
| `challengeWindow` | `uint32` | seconds after the verdict during which it may be overturned |
| `status` | `uint8` | 0 = Active, 1 = Paused (no new receipts), 2 = Retired |

### 3.2 Receipt

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uint256` | sequential |
| `profileId` | `bytes32` | the profile version it was verified under |
| `worker` | `address` | the submitting address |
| `demander` | `address` | G1: the tender's owner; G0: zero |
| `taskRef` | `bytes32` | G0: the job reference inside the committed job set; G1: `keccak256(taskToken, tokenId)` |
| `inputHash` | `bytes32` | commitment to the inputs (G0: the job's canonical encoding; G1: the tender's task hash) |
| `outputHash` | `bytes32` | commitment to the output delivered |
| `dedupKey` | `bytes32` | see section 2 |
| `submittedAt` | `uint64` | block timestamp |
| `verdict` | `uint8` | 0 = Pending, 1 = Accepted, 2 = Rejected |
| `verifiedAt` | `uint64` | when the verdict was set |
| `verifier` | `address` | the module or the body that set it |
| `finalAt` | `uint64` | `verifiedAt + challengeWindow`; the verdict is final after this time |
| `units` | `uint64` | measured units of work (profile-specific; G1: 1) |
| `qualityFactor` | `uint16` | basis points, default 10000 (P5) |
| `tierFactor` | `uint16` | basis points from the worker's tier at submission |
| `gmu` | `uint64` | the measured contribution, set when the verdict is `Accepted` |
| `epoch` | `uint64` | the epoch the receipt is counted in: the epoch open at `finalAt` (a receipt whose window closes after an epoch ends counts in the next epoch; nothing in an open epoch is ever uncertain at its end) |

The content (job inputs, outputs, tender deliverables) is off chain, referenced by hash. Receipts
are append-only; a rejected receipt stays with its verdict (A4).

### 3.3 Epoch

| Field | Type | Meaning |
| --- | --- | --- |
| `index` | `uint64` | sequential from 0 |
| `start`, `end` | `uint64` | timestamps; `end = start + duration` |
| `paramsVersion` | `uint32` | the `ParamsRegistry` set pinned at `start` |
| `budget` | `uint128` | test points available in this epoch (from the schedule) |
| `splitG0Bps` | `uint16` | share of the budget for the G0 pool, the rest to G1 |
| `workerCapBps` | `uint16` | the per-worker share cap in each pool |
| `totalGmuG0`, `totalGmuG1` | `uint128` | sums of capped contributions, set at finalization |
| `finalized` | `bool` | set once; the result is then immutable |
| `resultHash` | `bytes32` | hash of the per-worker allocations (recomputable) |

### 3.4 Ledger and claims

`GMULedger`: `contribution[epoch][pool][worker]` (uncapped sum of accepted, final GMU) and the
per-worker capped value computed at finalization. `EpochRewards`: `allocation[epoch][worker]`,
`claimed[epoch][worker]`, `balance[worker]` (test points).

## 4. Receipt state machine

```
  submit(profile, taskRef, inputHash, outputHash)
     |  dedup key new, profile Active, epoch open
     v
  Pending ----verifier sets verdict----> Accepted ----window closes----> Final (counted in GMU ledger of epoch(finalAt))
     |                                     |   ^
     |                                     |   | overturn within window (higher tier / decision body): at most once
     |                                     v   |
     +-----------------------------------> Rejected ---window closes----> Final (kept, not counted)
```

Rules: a receipt never leaves `Final`; an overturn is recorded as a second verdict event with the
overturning verifier, and the receipt's `verdict`, `verifier` and `verifiedAt` are replaced
(the first verdict stays in the event log); an overturn restarts the window once; a profile paused
after submission does not touch receipts already submitted.

## 5. Profiles of the MVP

| Profile | Work | Submission | Verification | Units |
| --- | --- | --- | --- | --- |
| `g0.ref` reference computation | a job from the epoch's committed job set: a deterministic computation whose answer the steward has committed to (hash of the answer set, published with the job set); first jobs: known-answer inference checks and deterministic transformations of public data that the protocol itself needs (for example the recomputation of a previous epoch's result, which is useful work by definition) | `(jobRef, inputHash = job encoding, outputHash)` | `RecomputeVerifier`: `outputHash` equals the committed answer hash -> Accepted; else Rejected | 1 per job |
| `g0.cal` resource calibration | a benchmark job with declared measurements (latency, throughput, model identifier) that calibrate the capability a worker can later declare; the output is a measurement record | `(jobRef, inputHash, outputHash = hash of the measurement record)` plus the record's declared figures in calldata | `CalibrationVerifier`: the record must be well formed and within the profile's plausibility bounds, else Rejected; otherwise the verdict stays Pending for the window: a `g0.ver` re-measurement by a Declared-tier worker that agrees sets Accepted, one that disagrees sets Rejected, and with no re-measurement the declaration stands - Accepted at the Unrated factor | 1 per job |
| `g0.ver` verification work | re-verifying another receipt: re-run a `g0.ref` job or re-measure a `g0.cal` record and submit the finding | `(taskRef = the receipt id verified, inputHash = that receipt's inputHash, outputHash = hash of the finding)` | `AgreementVerifier`: the verdict is set when the verified receipt's window closes - Accepted when the finding agrees with that receipt's final verdict (a finding that caused an overturn agrees by definition), Rejected otherwise | 1 per verification |
| `g1.tender` real demand | an ERC-8414 tender taken, delivered and accepted (or settled by silence after the judgment window), exactly the M3-C business-loop path | written by `TenderBridge8414` on reading the tender's settlement; nobody submits it by hand | `AcceptanceVerifier`: the tender's acceptance or silent settlement is the verdict; a tender under dispute yields no receipt until settled (P4) | 1 per tender |

The G0 job set of an epoch is committed by the steward before the epoch starts (a Merkle root of
the job references and answer hashes), is finite, and is published where workers can fetch it
(the deployment manifest names the location). Workers pick jobs from it; a job may be done by
several workers (each a separate receipt; the cap limits the total).

## 6. GMU v1 (P5)

```
gmu = baseGmu(profile) x units x qualityFactor / 10000 x tierFactor / 10000
capped by maxGmuPerReceipt, and per worker per epoch by maxGmuPerWorkerPerEpoch
```

| Factor | Source | Default when unknown |
| --- | --- | --- |
| `baseGmu` | the profile (*illustrative*: `g0.ref` 10, `g0.cal` 20, `g0.ver` 5, `g1.tender` 50) | profile value |
| `units` | the verifier (G0) or 1 (G1) | 1 |
| `qualityFactor` | 10000 in the MVP (no quality assessment yet; SIG later) | 10000 |
| `tierFactor` | Unrated 5000, Declared 10000 (the two MVP tiers; Assessed and Calibrated reserved for SIG) | 5000 |

The formula is versioned (`formulaVersion` on the profile, pinned by the epoch's parameter set);
a receipt is measured under the version of the epoch it is counted in. A missing measurement
takes the default; a verdict is never invented to make a measurement possible (A4).

## 7. Epochs and the reward (P6, P8)

Parameters pinned per epoch, from `ParamsRegistry` at `start`:

| Parameter | Meaning | *Illustrative* |
| --- | --- | --- |
| `duration` | epoch length | 24 h |
| `budget` schedule | test points per epoch, decreasing | 1,000 in epoch 0, halved every 8 epochs |
| `splitG0Bps` | G0 pool share | 7000 (70 / 30) |
| `workerCapBps` | per-worker cap of each pool's budget | 2500 (25 percent) |
| `unclaimedPolicy` | what happens to budget not allocated (no contribution) or not claimed | retire (default), carry forward |
| `claimEligibility` | which tiers may claim from the early subsidy pool (A3) | Unrated and Declared in the MVP |

Finalization, callable by anyone after `end`, deterministic:

1. For each pool, for each worker: `c = min(contribution, maxGmuPerWorkerPerEpoch summed over the
   pool's profiles)`; `T = sum of c`.
2. If `T = 0` the pool's budget follows `unclaimedPolicy`; else each worker's raw share is
   `c / T x poolBudget`, capped at `workerCapBps` of the pool budget; the capped remainder is not
   redistributed (P8).
3. `allocation[epoch][worker]` is the sum over the two pools; `resultHash` is the hash of the
   sorted (worker, allocation) list; `finalized = true`.
4. Receipts whose window closes after `end` belong to the next epoch (section 3.2), so a finalized
   result never changes.

Rounding: integer arithmetic in test-point base units (1e18); shares round down; the dust stays
unallocated.

## 8. Test points (A5, P7)

An internal balance in `EpochRewards`: `claim(epoch)` adds `allocation[epoch][msg.sender]` to
`balance[msg.sender]` once; there is no transfer, approval, redemption or conversion. The contract
states in its interface documentation and in the deployment manifest that test points are a
simulation of the Genesis Mining reward schedule and carry no right to any future asset (A5). Real
G1 payments move through the tender contract and are never mirrored here (A18).

## 9. Defaults, versioning, idempotency, recovery, upgrade (A11)

| Concern | Rule |
| --- | --- |
| Defaults | every missing measurement or binding takes the default of section 6; a worker with no binding is Unrated; a profile with no job set yields no receipts rather than an error |
| Version locking | profiles and parameter sets are versioned and immutable once pinned by an epoch; a change creates a new version that applies from the next epoch; the reference client refuses to submit under a profile version it does not know |
| Idempotency | submission is idempotent on the dedup key (a repeat reverts, the first stands); finalization is idempotent (a second call is a no-op); a claim is idempotent (second call pays nothing) |
| Recovery | a worker that crashes mid-job resubmits (same key, same result, or a new output hash if the job allows several); a keeper that fails to finalize is replaced by any other caller; the epoch's result does not depend on who finalizes or when |
| Reorgs | the reference client and the audit read finalized blocks for settlement and evidence (P13) |
| Audit | `pouw audit <epoch>` recomputes allocations from the receipts and the pinned parameters and compares `resultHash`; an auditor needs the RPC and nothing else |
| Upgrade | contracts are not upgradeable in place; a new protocol version is a new deployment named in the manifest; the old deployment keeps serving its history; migration of balances, if ever, is an explicit, reviewable step |
| Emergency | the steward can pause submission (no new receipts) and nothing else; verdicts, results and balances cannot be edited |

## 10. Minimal interfaces (for round 2)

```solidity
interface IProfileRegistry {
    function register(uint8 kind, string calldata name, address verifier, uint32 formulaVersion,
        uint64 baseGmu, uint64 maxGmuPerReceipt, uint64 maxGmuPerWorkerPerEpoch, uint32 challengeWindow) external returns (bytes32 profileId);
    function setStatus(bytes32 profileId, uint8 status) external;
    function get(bytes32 profileId) external view returns (Profile memory);
}

interface IWorkReceipts {
    function submit(bytes32 profileId, bytes32 taskRef, bytes32 inputHash, bytes32 outputHash, bytes calldata attestation) external returns (uint256 id);
    function setVerdict(uint256 id, uint8 verdict, uint64 units) external;      // the profile's verifier only
    function overturn(uint256 id, uint8 verdict, bytes calldata basis) external; // within the window, by an eligible overturner
    function get(uint256 id) external view returns (Receipt memory);
    function dedup(bytes32 key) external view returns (uint256 id);             // 0 when unknown
}

interface IVerifier {
    function verify(uint256 receiptId, bytes32 inputHash, bytes32 outputHash, bytes calldata attestation) external returns (uint8 verdict, uint64 units);
}

interface IEpochRewards {
    function currentEpoch() external view returns (uint64);
    function finalize(uint64 epoch) external;                                   // anyone, after end
    function allocation(uint64 epoch, address worker) external view returns (uint128);
    function claim(uint64 epoch) external;
    function balance(address worker) external view returns (uint128);           // test points, non-transferable
    function params(uint64 epoch) external view returns (EpochParams memory);
}

interface ITenderBridge8414 {
    function settle(uint256 tokenId) external returns (uint256 receiptId);      // reads the tender's acceptance; anyone may call
}
```

Events carry everything an auditor needs: `ReceiptSubmitted`, `VerdictSet`, `VerdictOverturned`,
`EpochFinalized(index, totalGmuG0, totalGmuG1, resultHash)`, `Claimed`.

## 11. Open points for the ruling

1. P3: the three G0 profiles as the MVP set, or `g0.ref` alone first.
2. P5: the two-tier factor (Unrated 5000, Declared 10000) and whether an identity binding is
   the right line between them.
3. P6 / P8: pinned parameters per epoch, the per-worker share cap, and retire-by-default for
   unallocated budget.
4. P9: the challenge window and who may overturn in the MVP (a Declared-tier `g0.ver` worker,
   or an ERC-8436 body from the start).
5. P12: the first miners (the OG cell and cell-b) and the first third-party worker.
6. The job-set publication location for G0 (a URL in the manifest, the World address book, or an
   ERC-8444 registry entry of kind `task`).
