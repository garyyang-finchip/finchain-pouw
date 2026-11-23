# Acceptance and Failure Matrix

Round 1 design, revised after the first review (v0.1.1). Each row is a test the reference
implementation and the Finchain Sepolia deployment must pass before the Genesis Mining MVP is
called done. The R1 unit is: two independent workers -> one round of G0 and G1 work -> GMU ->
epoch closed on chain -> a third party recomputes the same table. "Local" rows run on Anvil in
R1; "Sepolia" rows run on the public testnet in R2 and R3 (`roadmap.md`). Evidence is a
schema-tagged JSON record with `environment` (`local-devnet` or `public-testnet`), the way
`finchain` records its acceptances.

## 1. Normal operation

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| N0 | Anyone opens the epoch | the seed is captured from the manifest's source; instances derived before the opening transaction do not validate | `EpochOpened`, a rejected early submission | local |
| N1 | Two workers submit `g0.ref` receipts for their own instances of the epoch's job indices | every receipt Accepted by recomputation of the instance, GMU per the formula, counted in the epoch's G0 pool; the two workers' instances differ for the same index | receipts, verdict events | local, Sepolia |
| N2 | A G1 tender between the two cells (one demands, the other delivers, acceptance paid) | the tender pays the bounty from its escrow; the bridge writes one G1 receipt, eligible when the rules of section 7.3 hold; no second payment anywhere | tender events, the receipt, balances of both cells | local, Sepolia |
| N3 | Finalization by a third account from `finalizableAt`, in pages | allocations per pool pro rata to capped, eligible contributions computed by the contract, `resultHash` set, `finalized = true` after the last page | `EpochFinalized` event, the table | local, Sepolia |
| N4 | Test points read back | a worker's points are the sum of its allocations over finalized epochs; the same figure from the contract, the events and the audit | the three readings | local, Sepolia |
| N5 | Audit from the chain alone | `pouw audit <epoch>` on a machine that runs no node recomputes the allocations and matches `resultHash` | the audit record with the RPC used and the finalized block | Sepolia |
| N6 | `g0.cal` declaration re-measured by a sampled `g0.ver` worker under commit-reveal | the calibration job Accepted with the fixed GMU, the record Confirmed, the finding Accepted; the record's figures change no GMU | receipts, the calibration record | local |
| N7 | A receipt overturned late and re-windowed past `finalizableAt` | counted in the next epoch; the closed epoch's table is unchanged | two epochs' tables | local |
| N8 | A `g0.ver` finding that contradicts a verdict and leads to its overturn | the finding is Accepted with the overturn bonus, the overturned receipt is Rejected | both receipts | local |

## 2. Third-party participation

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| T1 | A worker with the reference client, a fresh key, a public RPC endpoint and no Finchain node joins mid-epoch | submits, is verified and is allocated like the cells | the worker's receipts and allocation; a statement of its setup (no node) | Sepolia |
| T2 | A worker that is not a FOGA cell (its own code against the published interface) | same as T1 | same | Sepolia (R3) |
| T3 | A worker without any identity binding | treated as Unrated (tier factor 5000), nothing refused | receipts with `tierFactor` | local, Sepolia |
| T4 | A chain node and a worker on one machine with separated keys (the Finchain AI Node form) | the worker side behaves as any worker; running the node changes nothing in the ledger | the host's two processes and the ledger | Sepolia (E05: node-b beside cell-b) |
| T5 | A third party recomputes an epoch | matches N5 | its own audit record | Sepolia (R3) |

## 3. Duplicate and replayed rewards

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| D1 | The same receipt submitted twice (same dedup key) | the second submission reverts; one receipt exists | the revert, `dedup(key)` | local |
| D2 | The same instance delivered under two profiles, or the same tender bridged twice | the dedup key includes the profile; the bridge's receipt is keyed on the tender, so the second call returns the existing receipt id | receipts | local |
| D3 | A receipt transaction replayed against another deployment or chain | the domain separator differs; the receipt does not exist there | the revert | local (two Anvil deployments) |
| D4 | A worker submits another worker's correct output for the same job index | the instance is per worker, so the copied output does not match this worker's instance: Rejected | the receipt | local |
| D5 | Self-dealing: one address demands and delivers its own G1 tender; two addresses bound to one identity do the same | the bounty moves within the party; both receipts exist with `subsidyEligible = false`; no test points | receipts, allocation | local |
| D6 | Sybil: one operator splits work across many addresses | each address is capped; the pool budget is fixed, so splitting changes who holds the points, not how many exist | allocations summing to at most the budget | local |
| D7 | A `g0.ver` worker reveals a finding committed after the verified receipt's verdict was final, or copies the verdict without a commitment | Rejected; no GMU | the receipt | local |
| D8 | Wash tenders: a demander settles many small tenders with one worker in an epoch | eligibility stops at the per-pair and per-demander caps and below the minimum bounty; the rest are recorded, not subsidized | receipts, allocation | local |

## 4. Disconnection, restart and recovery

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| R1 | A worker is killed mid-job and restarted | it resubmits the job; if the first submission landed, the repeat reverts and the state is unchanged; no double count | receipts | local, Sepolia (restart cell-b's unit) |
| R2 | The keeper that was going to finalize is down at epoch end | any other account finalizes later; the table is identical because the contract computes it | `EpochFinalized` by a different sender; audit match | local |
| R7 | Finalization attempted before `finalizableAt`, or before the previous epoch is finalized | reverts | the revert | local |
| R8 | An epoch nobody opens on time | `openEpoch` later captures the seed of that moment; the schedule's `end` is unchanged | `EpochOpened` | local |
| R3 | The RPC endpoint rate-limits or drops during submission | the client retries with the same payload; at most one receipt exists | client log, receipts | Sepolia |
| R4 | A reorg drops a receipt's block before finality | the client reads finalized blocks for settlement; the receipt is resubmitted if it is gone | client log | local (forced reorg on Anvil) |
| R5 | The steward key is lost after deployment | submission, verification and finalization continue; only new profiles and parameter sets cannot be registered; the schedule already pinned runs to its end | a run with the steward unavailable | local |
| R6 | A verifier module reverts for one receipt | that receipt stays Pending and is never counted; others proceed | receipts | local |

## 5. Version upgrades

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| V1 | A new parameter set is registered while an epoch is open | the open epoch keeps its pinned set; the new set applies from the next epoch | `params(epoch)` of both epochs | local |
| V2 | A profile version is retired while receipts under it are Pending | existing receipts finish under the old version; new submissions under it revert | receipts, reverts | local |
| V3 | A new profile version with a changed verifier | receipts carry the version they were verified under; an audit of an old epoch uses the old version | receipts, audit | local |
| V4 | A new protocol deployment (new contracts) beside the old one | the old deployment keeps its history and tables; the manifest names both; the client refuses a profile version it does not know | two manifests | local |
| V5 | The reference client is upgraded while the cells keep the old version | the old client keeps working against the same contracts (the interface is versioned, additive) | a mixed-version epoch | Sepolia |

## 6. Adversarial and boundary cases

| Id | Scenario | Expected outcome | Evidence | Where |
| --- | --- | --- | --- | --- |
| X1 | A false Accepted verdict by an attested verifier, overturned within the window | the overturn stands, the receipt is Rejected and not counted; the overturning `g0.ver` receipt is Accepted | both receipts | local |
| X2 | An overturn attempted after the window | reverts; the verdict is final | the revert | local |
| X3 | An epoch with no contribution in one pool | that pool's budget follows `unclaimedPolicy` (retire by default); the other pool pays normally | result | local |
| X4 | A job set with one job and many workers | each worker's share is capped; the dust stays unallocated | result | local |
| X5 | The steward pauses submission | no new receipts; verification and finalization continue | reverts and continuing events | local |
| X6 | The steward, a keeper or anyone tries to edit a verdict, supply an epoch summary or change a table | no such function exists; `finalize` takes only an epoch and a page | the ABI | local |
| X8 | A `g0.cal` record with inflated figures | the job earns the fixed GMU at most; a sampled re-measurement contradicts the record and rejects the job; no figure of the record ever enters an allocation | receipts, the calibration record | local |
| X7 | Gas price spikes on the chain | the client waits and retries; the epoch clock does not depend on the client | client log | Sepolia |

## 7. What the MVP does not claim

The matrix does not test, and the MVP does not claim: that GMU measures intelligence (it measures
verified work under declared factors; SIG comes later), that test points have value (they have
none by construction, A5), that a chain node earns anything (A8), that Finchain is required (a
second manifest on another EVM chain is the test of A13, scheduled with P2), or anything about
sequencing or consensus (A1). Passing every row proves the technical loop; it does not prove a
PoUW economy. Economic sustainability - a funding source, participation beyond the first workers,
the decreasing schedule, FCT - is a separate acceptance at P4 with its own evidence (P18).
