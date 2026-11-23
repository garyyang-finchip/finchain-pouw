# Acceptance and Failure Matrix

Design revision v0.1.2. Following the formal review (A28), a row is accepted in round R1 only if
R1 implements what it tests. Every row therefore carries a state:

- **passes** - implemented, and covered by the named test of this repository (`npm test`) or by a
  check of the local run (`npm run local-run`);
- **Sepolia** - belongs to the deployment on Finchain Sepolia (rounds R2 and R3 of `roadmap.md`),
  where the same behaviour is shown on a public chain or needs a second party;
- **deferred** - belongs to something R1 does not implement (`decisions.md` A19, A23, A30).

Row ids are stable across revisions: a row that was revised keeps its id, a row that no longer
applies stays in the table with its state. The recovery rows are numbered R1 to R10; to keep them
apart from the rounds, this document always writes "round R1".

The unit of round R1 (A30): two local workers -> G0 and G1 -> GMU -> epoch close -> independent
recomputation. Evidence is a record with `schema`, `environment` and `recordedAt`, as in
`finchain`; the local run writes `evidence/local-run-<time>.json` with `environment:
local-devnet`.

Tests are named by file: `policy`, `g0`, `g1`, `epoch`, `audit`, `boundaries` stand for
`test/<name>.test.js`.

## 1. Normal operation

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| N0 | An epoch is used for the first time | its seed is captured from the deployment's source, once, by whoever comes first; `seed = keccak256(domain, epoch, material)` | passes: `g0` |
| N1 | Two admitted workers do the `g0.ref` job | each on its own instance; both accepted, GMU measured and subsidized, counted in the epoch's G0 pool | passes: `g0`, `audit`; local run |
| N2 | A tender between two admitted parties is settled and bridged by its owner | the tender pays the bounty from its own vault; one G1 receipt, eligible; the kernel pays and holds nothing | passes: `g1`; local run |
| N3 | The epoch ends | its figures are frozen by time; a third account writes the close record without supplying a figure; the allocation is per pool, pro rata to subsidized GMU, capped per address | passes: `epoch`; local run |
| N4 | Test points read back | the same figure from the ledger's view, from the stored contributions with the client's arithmetic, and from the audit | passes: `epoch`, `audit` |
| N5 | An audit from the chain alone | a process given the manifest and the endpoint only re-decides every receipt and matches the ledger on every figure | passes: `audit`; local run (separate process). Sepolia, round R2: from a machine that runs no node |
| N6 | `g0.cal` re-measured by a sampled verifier | - | deferred |
| N7 | A receipt overturned late and counted in the next epoch | - | deferred with the challenge window; R1's rule for lateness is row R9 |
| N8 | A `g0.ver` finding that leads to an overturn | - | deferred |

## 2. Participation

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| T1 | A worker with the reference client, its own key and a public endpoint, running no node | its work is recorded and measured from the first receipt; it is subsidized from the epoch after its admission | Sepolia, round R3. Local run: every party acts through the client as a separate process with its own key file |
| T2 | A worker that is not a FOGA cell, with its own code against the published interface | same as T1 | Sepolia, round R3 |
| T3 | An address that is not admitted does work | recorded, accepted, measured; subsidized nothing; an admission made during an epoch applies from the next (revised: the tier factor of v0.1.1 is gone, A20) | passes: `g0`, `g1`; local run |
| T4 | A chain node and a worker on one machine with separate keys | the worker side behaves as any worker; running the node changes nothing in the ledger | Sepolia, round R2 |
| T5 | A party with no role recomputes an epoch | its table equals the ledger's and any other auditor's (`tableHash`) | passes: `audit`; local run. Sepolia, round R3: by a third party |

## 3. Duplicate rewards and demand that is not real

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| D1 | The same G0 instance submitted twice | the second reverts; one receipt | passes: `g0`; local run |
| D2 | The same settled submission bridged twice, in the same or a later epoch | the existing receipt is returned; nothing is added | passes: `g1`; local run |
| D3 | A transaction replayed against another deployment or chain | another domain: another instance, another contribution id; the replayed output is rejected | passes: `epoch` |
| D4 | A worker submits another worker's correct output | not its own instance: rejected, and the attempt is spent | passes: `g0` |
| D5 | Self-dealing: the worker is the tender's owner or its judge | recorded, measured, never subsidized, in any epoch | passes: `g1` |
| D6 | One controller splits across several admitted addresses (revised: v0.1.1 presented the cap as a defence) | not prevented: the share cap binds an address. Four addresses take 80 percent of a pool beside one other worker and all of it alone, against a 25 percent cap. Declared under one operator, the audit report adds them up; undeclared, nothing shows | passes: `epoch`, `audit` - the tests assert the bypass |
| D7 | A `g0.ver` finding committed after the verdict, or copied | - | deferred |
| D8 | Wash tenders: many tenders between the same parties in one epoch | subsidized up to the per-pair and per-demander caps; the rest recorded with the reason; what is refused uses up nothing | passes: `g1` |
| D9 | A tender between declared-related parties: one operator on both sides, or the judge under the worker's operator | recorded, classed `declared-related`, not subsidized. Two addresses with nothing declared are classed `none-found`, which is not a finding of independence | passes: `g1`; local run |
| D10 | A controlled self-test: an epoch whose parameters subsidize declared-related parties | subsidized, the class stays on the receipt, and every audit of the epoch is labelled `controlled-self-test`; self-dealing is refused even then | passes: `g1`, `audit` |
| D11 | Demand pushed onto another party: a worker settles a tender of its own and hands the tender and its judgment to an admitted address | only the owner can bridge: the worker and a bystander are refused. Not detected: an owner who chooses to confirm a tender that was handed to it | passes: `g1`; local run |
| D12 | A fresh address as the demander | recorded and measured; not subsidized (`demander-not-admitted`) | passes: `g1` |
| D13 | A bounty in a token, or below the minimum | recorded and measured; not subsidized | passes: `g1` |
| D14 | A worker beyond its GMU cap under a profile | the last unit is subsidized in part, later ones not at all | passes: `g1` |
| D15 | Work delivered before the deployment's genesis | recorded and measured; not subsidized | passes: `g1` |
| D16 | A tender settled by default, the judge having said nothing | the worker has the bounty and cannot bridge by itself; subsidized once the demander confirms it; the audit reports the settlement as `default` | passes: `g1`, `audit` |

## 4. Disconnection, restart, lateness and recovery

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| R1 | A worker is stopped and started again | it runs the job again: accepted once, refused afterwards; nothing is counted twice | passes: `g0`, `audit`; local run. Sepolia, round R2: a cell's unit restarted |
| R2 | Nobody writes the close record (revised: there is no keeper) | nothing depends on it: the allocation is final when the epoch has ended; the next epoch's first use, or anyone, writes the record later | passes: `epoch` |
| R3 | The endpoint drops or rate-limits during a submission | the client is run again; at most one receipt exists | Sepolia, round R2 |
| R4 | A reorganization before finality | the client reads logs up to the settled block; it neither audits an epoch nor does the audit job on top of it before that block has passed the epoch's end | passes: `audit` |
| R5 | The steward is gone | recording, sealing and auditing continue under the versions in force; the budget follows the schedule already registered | passes: `epoch` |
| R6 | A profile's module fails | no receipt under that profile; other profiles proceed (revised: no pending state exists) | passes: `epoch` |
| R7 | A final figure or a close record is asked for while the epoch runs | both revert; a provisional figure is available and says what it is | passes: `epoch`; local run |
| R8 | An epoch nobody opens, or nobody uses | the first receipt captures the seed; an unused epoch is empty, allocates nothing and can be sealed | passes: `epoch` |
| R9 | Late acceptance: delivered in one epoch, accepted in a second, bridged in a third | one receipt, in the epoch it is recorded in, under that epoch's rules; the earlier epochs do not move | passes: `epoch`; local run |
| R10 | A G0 submission that lands after its epoch, or an old epoch's output submitted for the current one | the first reverts and spends nothing; the second is recorded as rejected | passes: `g0` |

## 5. Versions

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| V1 | A parameter version registered during an epoch | the running epoch keeps the set it started with; the new set applies from the epoch it names | passes: `policy`, `epoch` |
| V2 | A profile retired | from its epoch on, submissions under it revert; receipts recorded before stay as they are; a retirement in force is final | passes: `policy`, `epoch` |
| V3 | A new profile version | each receipt is measured under the version of its epoch, and an audit of an old epoch uses the old version | passes: `policy`, `epoch`, `audit` |
| V4 | A second deployment beside the first | separate ledgers, separate domains; the manifest names the one in force | passes: `epoch` |
| V5 | An upgraded client beside an old one against the same contracts | both work | Sepolia, round R3 |
| V6 | Cross-version recovery: a contribution recorded under one adapter version, another left behind | under the next version the first is found and not recorded again; the second is bridged once and measured under the version in force; the old adapter is refused | passes: `epoch`, `audit` |
| V7 | A version registered and then corrected before its epoch begins; changes made twice in one epoch | the last registration before the epoch applies; nothing can be changed once the epoch has begun; the client replays the policy exactly as the contract applied it | passes: `policy`, `audit` |

## 6. Adversarial and boundary cases

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| X1 | A false verdict overturned within the window | - | deferred |
| X2 | An overturn attempted after the window | - | deferred |
| X3 | A pool nobody worked in | its budget is allocated to nobody; the other pool is unaffected | passes: `epoch` |
| X4 | Shares that do not divide evenly, shares above the cap | rounded down; what rounding and the cap leave is allocated to nobody | passes: `epoch` |
| X5 | The steward pauses | no receipt is recorded while paused; recording resumes afterwards | passes: `g0`, `g1` |
| X6 | Somebody tries to edit a receipt, a status, a total or a table | no such function exists: the state-changing functions are four on the ledger, eight on the policy (the steward's), one on the adapter | passes: `boundaries` |
| X7 | Gas prices spike | the client is run again later; the epoch clock does not depend on it | Sepolia, round R2 |
| X8 | A calibration record with inflated figures | - | deferred |
| X9 | Seed predictability and timing | shown, not prevented: the material is public before it is captured, whoever opens picks the moment, and the first submitter of an epoch computes the seed before anyone else. Nothing in R1 claims otherwise | passes: `g0`, `epoch` |
| X10 | Order: allocations read in different orders and in pages, epochs sealed in different orders, before or after reading | one table | passes: `epoch` |
| X11 | Balance, claim, token | the kernel's contracts have no payable function and no function that issues, transfers, approves or claims; they cannot be sent value | passes: `boundaries` |
| X12 | A ledger whose figures differ from the rules: a wrong allocation, a total that is not the sum of its receipts, a rejected output recorded as accepted | the audit reports each difference by name; the reference worker submits nothing on top of a difference | passes: `audit` |
| X13 | A tender changes owner, judge and task after it was bridged | the audit reads the tender's history from its log, as of the bridging: the same result | passes: `audit` |
| X14 | A manifest that names the wrong chain, policy or seed source | the client refuses it | passes: `audit` |
| X15 | Chain neutrality and the absence of an upgrade path | no chain id and no address in the kernel's code, except the OP Stack predeploy inside the OP Stack seed source; no proxy, no delegatecall, no self-destruct | passes: `boundaries` |
| X16 | Epochs built at random: parties, admissions, operators, parameters, G0 work right and wrong, tenders of every kind, some bridged an epoch late | the audit agrees with the ledger on every figure of every epoch; the generator is fixed, so a failure can be reproduced | passes: `audit` |

The five tests the review asked for: seed predictability and timing (X9), order of pages (X10),
late acceptance (R9), the multi-wallet split with its bypass (D6), cross-version recovery (V6).

## 7. The local run

`npm run local-run` starts a development network, deploys the kernel beside the ERC-8414 reference
contract and takes six parties through two epochs. Workers, demanders and the third party act
through the reference client as separate processes, each with a key made for the run and deleted
after it. Its checks, all of which must hold for the record to say `ok`:

| Check | Rows |
| --- | --- |
| the worker cannot bridge a tender by itself | D11 |
| an audit of an epoch that has not ended is refused; so is its close record | R4, R7 |
| a second submission for the same instance is refused | D1, R1 |
| bridging the same submission again adds nothing | D2 |
| per epoch: the audit, as a separate process with the manifest and the endpoint only, agrees with the ledger on every figure, and every row of its table equals the ledger's view | N3, N4, N5, T5 |
| both workers are allocated the capped share of each pool they worked in, in both epochs | N1, N2, N3 |
| the address that is not admitted is measured and allocated nothing | T3 |
| the tender between declared-related parties is recorded, classed and not subsidized | D9 |
| the tender confirmed late counts in the later epoch, and the earlier epoch did not move | R9 |
| no contract of the kernel holds funds | X11 |
| each epoch's allocations and its unallocated remainder add up to its budget | X3, X4 |

## 8. What round R1 proves, and what it does not

Proves, on a local network: the loop Work -> Verify -> GMU -> Epoch -> Test Reward runs end to
end; an epoch closes without anyone's figures; every receipt, total and allocation can be
recomputed from the chain alone by a party with no role, and a ledger that differed would be
caught; duplicates, lateness and version changes follow written rules; settlement and subsidy are
separate; nothing can be claimed.

Does not prove, and does not claim:

- computation: an accepted `g0.ref` receipt shows presence and a conforming submission (A19);
- demand: a settled tender shows a settlement confirmed by its owner; all parties of a local run,
  and the OG cell and cell-b on Sepolia, are one party (A24);
- resistance to one party holding many addresses, or to two admitted parties who conceal their
  relation (A25);
- an unpredictable seed (A22);
- operation on a public chain (round R2) or participation by anyone else (round R3);
- an economy: that test points mean anything, that GMU measures intelligence, that anyone will
  take part. Economic sustainability - a funding source, participation, the decreasing schedule,
  FCT - is a separate acceptance at P4 with its own evidence (P18).
