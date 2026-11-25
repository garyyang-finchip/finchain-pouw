# Acceptance and Failure Matrix

Design revision v0.1.15, with software release 0.1.8, after the reviews of v0.1.4 to v0.1.7,
the owner's adoption of the recommendations on Q17 to Q29, the run of round R2a with its review,
the owner's rulings of 2026-11-25 and the review of the local implementation of ledger v2
(`decisions.md` A55-A86).
Sections 1 to 10 are those of v0.1.3 - the rows of the kernel and of round R2 - with four rows
added for the next version of the ledger (D18 to D21, A64), which pass on a local network from
release 0.1.4, and with the rows of the client's audit at one block (N9, D22, R11 to R14).
Section 15 points to the test matrix of ledger v2. Sections 11 to 14 are deliverable D
of the alignment of 2026-11-24 (A54): the staged acceptance of the production extension,
corrected and extended as the two reviews asked (A56 to A60, A65). Every row of those four
sections is planned and not run: A70 adopts the specified designs, not a test result.
A planned acceptance row neither approves a still-open mechanism nor shows that an
implementation exists; the decision state is recorded in `decisions.md`.

Following the formal review (A28), a row is accepted in a round only if that round implements
what it tests. Every row therefore carries a state:

- **passes** - implemented, and covered by the named test of this repository (`npm test`) or by a
  check of the rehearsal (`npm run local-run`);
- **Sepolia** - belongs to a round on Finchain Sepolia (`roadmap.md` 3), where the same behaviour
  is shown on a public chain or needs another party: round R2a (wallets an operator holds), round
  R2b (agents as their contract accounts) or round R3 (a third party);
- **deferred** - belongs to something not implemented (`decisions.md` A19, A23, A30), or to the
  next version of the ledger (A35, A64);
- **planned; not run** - belongs to the production extension (sections 11 to 14): the acceptance
  is specified but has not run. The underlying design may be adopted or still depend on a
  separately recorded ruling. Such a row says what a later increment has to show; it is not a
  passing test of this repository or a completed check of its rehearsal.

Row ids are stable across revisions: a row that was revised keeps its id, a row that no longer
applies stays in the table with its state. The recovery rows are numbered R1 to R10; to keep them
apart from the rounds, this document always writes "round R1".

The unit of round R1 (A30): two local workers -> G0 and G1 -> GMU -> epoch close -> independent
recomputation. The unit of round R2a (A39): a deployment with its code checked -> two wallets ->
G0 and G1 in a controlled self-test epoch and in a standard epoch -> epoch close -> recomputation
at finalized state by a machine that is not the operator's. Evidence is a record with `schema`,
`environment` and `recordedAt`, as in `finchain`, and with the deployment's `labels`.

Tests are named by file: `policy`, `g0`, `g1`, `epoch`, `audit`, `account`, `deploy`, `round`,
`boundaries`, `snapshot`, and `v2.permit`, `v2.guard`, `v2.ledger`, `v2.allocation` for ledger
v2, stand for `test/<name>.test.js`. All of them, and the rehearsal, can also be run on a
hosted runner from a clean checkout (`.github/workflows/ci.yml`). That workflow first ran there
on 2026-11-24, with success; the run, its commit and its record are in `decisions.md` 3.

## 1. Normal operation

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| N0 | An epoch is used for the first time | its seed is captured from the deployment's source, once, by whoever comes first; `seed = keccak256(domain, epoch, material)` | passes: `g0` |
| N1 | Two admitted workers do the `g0.ref` job | each on its own instance; both accepted, GMU measured and subsidized, counted in the epoch's G0 pool | passes: `g0`, `audit`; rehearsal. Sepolia, round R2a |
| N2 | A tender between two admitted parties is settled and bridged by its owner | the tender pays the bounty from its own vault; one G1 receipt, eligible; the kernel pays and holds nothing | passes: `g1`; rehearsal. Sepolia, round R2a, on the World's ERC-8414 contract |
| N3 | The epoch ends | its figures are frozen by time; a third account writes the close record without supplying a figure; the allocation is per pool, pro rata to subsidized GMU, capped per address | passes: `epoch`; rehearsal. Sepolia, round R2a |
| N4 | Test points read back | the same figure from the ledger's view, from the stored contributions with the client's arithmetic, and from the audit | passes: `epoch`, `audit` |
| N5 | An audit from the chain alone | a process given the manifest and the endpoint only re-decides every receipt and matches the ledger on every figure | passes: `audit`; rehearsal (a separate process, behind an endpoint whose settled block lags). Sepolia, round R2a: from a hosted runner that holds no key and runs no node |
| N6 | `g0.cal` re-measured by a sampled verifier | - | deferred |
| N7 | A receipt overturned late and counted in the next epoch | - | deferred with the challenge window; R1's rule for lateness is row R9 |
| N8 | A `g0.ver` finding that leads to an overturn | - | deferred |
| N9 | The record of an audit is hashed | it has one byte form - RFC 8785, with integers only and larger integers as decimal strings - and two hashes over it: of what was found, which two agreeing runs at one block share, and of the whole record with its own member left out. A second implementation and a second program compute the same from the record's file | passes: `snapshot`; rehearsal (an audit repeated at the block of the first: the same result hash, another report hash) |

## 2. Participation

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| T1 | A worker with the reference client, its own key and a public endpoint, running no node | its work is recorded and measured from the first receipt; it is subsidized from the epoch after its admission | Sepolia, round R3. Rehearsal: every command is a separate process with its own key file |
| T2 | A worker that is not a FOGA cell, with its own code against the published interface | same as T1 | Sepolia, round R3 |
| T3 | An address that is not admitted does work | recorded, accepted, measured; subsidized nothing; an admission made during an epoch applies from the next (revised: the tier factor of v0.1.1 is gone, A20) | passes: `g0`, `g1`; rehearsal (the key of an agent, sending by itself) |
| T4 | A chain node and a worker on one machine with separate keys | the worker side behaves as any worker; running the node changes nothing in the ledger | Sepolia, round R2a, when the host of the round is a chain node's machine |
| T5 | A party with no role recomputes an epoch | its table equals the ledger's and any other auditor's (`tableHash`) | passes: `audit`; rehearsal. Sepolia, round R2a: the host's audit and the hosted runner's hold one `tableHash`; round R3: by a third party |
| T6 | An agent whose identity on chain is a contract account | it takes part as itself when the account is the sender: the account is the worker of record and confirms the tenders it owns. Its key sending by itself is another party - another worker with another instance, admitted or not on its own, and refused as the demander | passes: `account`; rehearsal. Sepolia, round R2b |
| T7 | Before a deployment on a chain whose agents are contract accounts | the accounts, the keys, and the owner, judge and fulfiller of a tender are read from the chain, and the record says whether keys alone would be the agents | passes: rehearsal (`scripts/identity-check.js`). Sepolia, round R2a, step 1 |

## 3. Duplicate rewards and demand that is not real

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| D1 | The same G0 instance submitted twice | the second reverts; one receipt | passes: `g0`; rehearsal |
| D2 | The same settled submission bridged twice, in the same or a later epoch | the existing receipt is returned; nothing is added | passes: `g1`; the rehearsal runs the round twice in one epoch and nothing is added |
| D3 | A transaction replayed against another deployment or chain | another domain: another instance, another contribution id; the replayed output is rejected | passes: `epoch` |
| D4 | A worker submits another worker's correct output | not its own instance: rejected, and the attempt is spent | passes: `g0` |
| D5 | Self-dealing (revised, A38): the worker is the tender's owner or its judge when the tender is bridged | recorded and measured; not subsidized, whatever the epoch's parameters. What the rule reads is the tender at that moment: row D17 | passes: `g1` |
| D6 | One controller splits across several admitted addresses (revised: v0.1.1 presented the cap as a defence) | not prevented: the share cap binds an address. Four addresses take 80 percent of a pool beside one other worker and all of it alone, against a 25 percent cap. Declared under one operator, the audit report adds them up; undeclared, nothing shows | passes: `epoch`, `audit` - the tests assert the bypass |
| D7 | A `g0.ver` finding committed after the verdict, or copied | - | deferred |
| D8 | Wash tenders: many tenders between the same parties in one epoch | subsidized up to the per-pair and per-demander caps; the rest recorded with the reason; what is refused uses up nothing | passes: `g1` |
| D9 | A tender between declared-related parties: one operator on both sides, or the judge under the worker's operator | recorded, classed `declared-related`, not subsidized. Two addresses with nothing declared are classed `none-found`, which is not a finding of independence | passes: `g1`; rehearsal. Sepolia, round R2a, epoch 1 |
| D10 | A controlled self-test: an epoch whose parameters subsidize declared-related parties | subsidized, the class stays on the receipt, and every audit of the epoch is labelled `controlled-self-test`; self-dealing is refused even then | passes: `g1`, `audit`; rehearsal. Sepolia, round R2a, epoch 0 |
| D11 | Demand pushed onto another party: a worker settles a tender of its own and hands the tender and its judgment to an admitted address | only the owner can bridge: the worker and a bystander are refused. Not detected: an owner who chooses to confirm a tender that was handed to it | passes: `g1`, `account`; rehearsal |
| D12 | A fresh address as the demander | recorded and measured; not subsidized (`demander-not-admitted`) | passes: `g1` |
| D13 | A bounty in a token, or below the minimum | recorded and measured; not subsidized | passes: `g1` |
| D14 | A worker beyond its GMU cap under a profile | the last unit is subsidized in part, later ones not at all | passes: `g1` |
| D15 | Work delivered before the deployment's genesis | recorded and measured; not subsidized | passes: `g1`; rehearsal (a tender older than the deployment, confirmed by the account that owns it) |
| D16 | A tender settled by default, the judge having said nothing | the worker has the bounty and cannot bridge by itself; subsidized once the demander confirms it; the audit reports the settlement as `default` | passes: `g1`, `audit` |
| D17 | The worker judged its own delivery and handed the right to judge to another address before the bridge | not caught by the ledger: the rule reads the judge of the moment of bridging, finds another address, and the receipt is subsidized when the tender's owner - another admitted address - confirms it, within the caps. The audit reads the tender's own log, finds who judged and who owned it at settlement, and reports the receipt as an observation; `ok` is not affected | passes: `g1`, `audit` - the tests assert the boundary. Eligibility is to depend on it before any subsidy of value (A38) |
| D18 | A third party records a settled submission before its demander confirms it (the next version of the ledger) | the third party's record is a work fact: it enters no total and does not take the contribution id. The demander's later confirmation makes the receipt, its eligibility decided as for any confirmation, in the epoch in which it is recorded. No earlier epoch changes and no recorded status changes | passes on a local network, for ledger v2, which is not deployed: `v2.ledger` (`ledger-v2.md` 14, rows L26 and L30). The design is adopted (A64; `decisions.md` P60, Q26, A70) and ruled into the next version (A75) |
| D19 | The same settlement recorded as a work fact twice, by one party or by two | one fact, with one stable id of its own; the second call returns it and adds nothing | passes on a local network, for ledger v2, which is not deployed: `v2.ledger` (row L26). The design is adopted (A64; `decisions.md` P60, Q26, A70) and ruled into the next version (A75) |
| D20 | A work fact for a delivery under a production profile | it takes neither the contribution id nor the content key, and uses up no cap and no counter. The confirmation that follows takes the counting as if no fact existed | passes on a local network at the level of the ledger, for ledger v2, which is not deployed: `v2.ledger` (`ledger-v2.md` 14, row L29), with a module that states what a test tells it. The module of the production profile, which shows membership, is not built |
| D21 | A confirmation with no fact before it; a fact recorded after the receipt; a demander that never confirms | all three are valid, and the fact and the receipt of one work are found by its source. In the third the work has no receipt and whatever public fact somebody recorded for it - none is made automatically: it is in no epoch's GMU, measured or subsidized, and no report presents it as a contribution that was counted | passes on a local network, for ledger v2, which is not deployed: `v2.ledger` (row L26). The design is adopted (A64; `decisions.md` P60, Q26, A70) and ruled into the next version (A75) |
| D22 | A verifier hands the right to judge on inside its own verification: the tender's log then shows the successor as the last authority before the acceptance | the audit keeps the registered address as what the log holds, marks the evidence `evidence-insufficient`, and draws no observation about a party from it - it does not say that the worker judged its own delivery when the successor is the worker. Without the handing on, the registered authority is visible and is the verifier | passes: `snapshot` (`ledger-v2.md` 10 and 14, row L32). Derived from the reference contract's source and reproduced locally with a verifier written for the test; not observed on a public chain |

## 4. Disconnection, restart, lateness and recovery

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| R1 | A worker is stopped and started again | it runs the job again: accepted once; afterwards the client finds the receipt and sends nothing (from release 0.1.4 - before, the second submission was sent and refused by the ledger, which still refuses one that is sent); nothing is counted twice | passes: `g0`, `audit`, `round`; rehearsal. Sepolia, round R2a: the round command run a second time |
| R2 | Nobody writes the close record (revised: there is no keeper) | nothing depends on it: the allocation is final when the epoch has ended; the next epoch's first use, or anyone, writes the record later | passes: `epoch` |
| R3 | The endpoint drops or rate-limits during a submission, or serves a log query over a limited range only | the command is run again: every step looks at the chain first, and at most one receipt exists. The client reads the log in ranges and gets the same result | passes: `audit` (ranges of 1, 7 and 1000 blocks); `round` (a test tender stopped after each of its steps and carried on); rehearsal (ranges of 40 blocks; the round run again). Sepolia, round R2a |
| R4 | A reorganization before finality | the client reads logs up to the settled block; it neither audits an epoch nor does the audit job on top of it before that block has passed the epoch's end | passes: `audit`; rehearsal (the endpoint holds its finalized block back: the audit and the audit jobs wait, and go on when it moves). Sepolia, round R2a |
| R5 | The steward is gone | recording, sealing and auditing continue under the versions in force; the budget follows the schedule already registered | passes: `epoch` |
| R6 | A profile's module fails | no receipt under that profile; other profiles proceed (revised: no pending state exists) | passes: `epoch` |
| R7 | A final figure or a close record is asked for while the epoch runs | both revert; a provisional figure is available and says what it is | passes: `epoch`; rehearsal |
| R8 | An epoch nobody opens, or nobody uses | the first receipt captures the seed; an unused epoch is empty, allocates nothing and can be sealed | passes: `epoch` |
| R9 | Late acceptance: delivered in one epoch, accepted in a second, bridged in a third | one receipt, in the epoch it is recorded in, under that epoch's rules; the earlier epochs do not move | passes: `epoch` |
| R10 | A G0 submission that lands after its epoch, or an old epoch's output submitted for the current one | the first reverts and spends nothing; the second is recorded as rejected | passes: `g0` |
| R11 | An audit, or a check of a deployment, while the chain goes on | it takes one block and reads everything at it: the logs up to it, and every view, nested read and piece of code at its number. The record names the block by number, hash and time and keeps the time of observation apart. The close record is verified within the block, and an epoch that was not yet sealed at that block is reported as not sealed, whatever is true later | passes: `snapshot` (every read of a watched endpoint names the block); rehearsal (`ledger-v2.md` 14, row L34) |
| R12 | The endpoint cannot serve state at the block the audit took | the run fails with that reason (exit status 4) and reads no other block in its place; a revert is the contract's answer and is not taken for a missing state | passes: `snapshot` (row L34) |
| R13 | The answer to a submission or a confirmation is lost, or the process stops after sending | after a restart the client finds the receipt by its contribution id and sends nothing; a confirmation is looked up for the tender's owner only, and anybody else is refused by the adapter as before | passes: `snapshot` (row L33), `audit`, `account`; rehearsal |
| R14 | The block an audit read no longer has the hash it had | nothing is reported | passes: `snapshot` |

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
| X7 | Gas prices spike | the client is run again later; the epoch clock does not depend on it | Sepolia, round R2a |
| X8 | A calibration record with inflated figures | - | deferred |
| X9 | Seed predictability and timing | shown, not prevented: the material is public before it is captured, whoever opens picks the moment, and the first submitter of an epoch computes the seed before anyone else. Nothing in R1 claims otherwise | passes: `g0`, `epoch` |
| X10 | Order: allocations read in different orders and in pages, epochs sealed in different orders, before or after reading | one table | passes: `epoch` |
| X11 | Balance, claim, token | the kernel's contracts have no payable function and no function that issues, transfers, approves or claims; they cannot be sent value | passes: `boundaries` |
| X12 | A ledger whose figures differ from the rules: a wrong allocation, a total that is not the sum of its receipts, a rejected output recorded as accepted | the audit reports each difference by name; the reference worker submits nothing on top of a difference | passes: `audit` |
| X13 | A tender changes owner, judge and task after it was bridged | the audit reads the tender's history from its log, as of the bridging: the same result | passes: `audit` |
| X14 | A manifest that names the wrong chain, policy or seed source | the client refuses it | passes: `audit`. What a manifest says about the code is rows M1 and M2 |
| X15 | Chain neutrality and the absence of an upgrade path | no chain id and no address in the kernel's code, except the OP Stack predeploy inside the OP Stack seed source; no proxy, no delegatecall, no self-destruct | passes: `boundaries` |
| X16 | Epochs built at random: parties, admissions, operators, parameters, G0 work right and wrong, tenders of every kind, some bridged an epoch late | the audit agrees with the ledger on every figure of every epoch; the generator is fixed, so a failure can be reproduced | passes: `audit` |

The five tests the review asked for: seed predictability and timing (X9), order of pages (X10),
late acceptance (R9), the multi-wallet split with its bypass (D6), cross-version recovery (V6).

## 7. Deployment and operation

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| M1 | A deployment made from the committed builds | the builds are what the sources compile to; the manifest records, for each contract, its build, the hash of its code, its transaction and block; the deployment's own read-back and `pouw verify` find the code, the wiring, the clock and the policy as configured | passes: `boundaries`, `deploy`; rehearsal. Sepolia, round R2a |
| M2 | A deployment that is not this repository's code, or not what its manifest says: another code hash on record, another contract behind a role, no contract at all, this repository's build wired to another ledger, another clock, another ERC-8414 contract or one whose code has changed, a manifest without code hashes | `pouw verify` reports each by name and ends with a status that says "differs" | passes: `deploy`; rehearsal |
| M3 | A plan that cannot run as written: the wrong chain, a genesis too close, a missing or unknown profile, parameter versions out of order, an unknown seed source, an OP Stack seed source on a chain without the predeploy, no contract at the ERC-8414 address, a party listed twice, a steward that cannot pay | refused before anything is sent; without `--yes` nothing is ever sent | passes: `deploy`; rehearsal |
| M4 | Keys: asked for inside the repository's checkout; a key file others can read; the key script run a second time | refused; refused before anything is sent; every key kept as it is | passes: `deploy`; rehearsal |
| M5 | A second deployment over an existing manifest; a deployment that stops part of the way | refused; the transactions already sent are listed and nothing depends on them | passes: rehearsal (the first). Sepolia, round R2a, if it happens |
| M6 | Labels | every deployment-result record carries its environment and its labels; an epoch's mode is a separate field, and a standard epoch of a controlled self-test is still labelled as part of one | passes: `deploy`; rehearsal |

## 8. The rehearsal

`npm run local-run` starts a development network and runs round R2 on it with the commands of the
public deployment, each as a separate process: the key script, the identity check, the deployment
from the committed builds and the R2a configuration, `pouw verify`, the round command, `pouw
audit`. The script itself puts in place what an OP Stack chain has (the L1Block predeploy, an
ERC-8414 contract), funds the steward, moves the clock, and holds back the endpoint's finalized
block for a while. Two deployments are made, because two things are accepted separately. Its
checks, all of which must hold for the record to say `ok`:

| Check | Rows |
| --- | --- |
| keys are not made inside the checkout; a key file is its owner's alone; a second run keeps every key; a key file others can read is refused | M4 |
| without `--yes` the deployment is planned and nothing is sent; deployed from the builds and read back as configured; a second deployment over the manifest is refused | M1, M3, M5 |
| `pouw verify` agrees; with another code hash on record it differs | M1, M2 |
| before genesis the round does nothing and says when to come back | - |
| epoch 0, a controlled self-test: a test tender each way is settled and confirmed, both wallets do the audit job; each wallet is allocated the capped quarter of either pool and half the budget stays unallocated | N1, N2, N3, D10 |
| run again in the same epoch, the round finds its work on chain and does nothing twice | D1, D2, R1, R3 |
| a key that does not own a tender cannot confirm it; a second `pouw work` for the same instance finds its receipt and sends nothing; a close record for a running epoch is refused | D11, R1, R13, R7 |
| an epoch that has not ended, or has ended and is not settled, is not audited; the audit jobs of the next epoch wait for it, and go on when the settled block moves | R4 |
| epoch 1, standard: the tenders between declared-related wallets are measured and not subsidized; each audit job recomputes epoch 0 in full | D9, N1 |
| after the last epoch the round writes its close record and starts no new work | N3 |
| per epoch: the audit, as a separate process with the manifest and the endpoint only, agrees with the ledger on every figure, and every row of its table equals the ledger's view | N3, N4, N5, T5 |
| per epoch: the audit read one block and names it, with the epoch's close record within it; an audit repeated at that block has the same result hash, and the hashes of both records are those of their canonical form | R11, N9 |
| the audit adds the table up per declared operator: one operator, two addresses, twice the share an address can have | D6 |
| every deployment-result record carries the deployment's labels; no contract of the kernel holds funds | M6, X11 |
| the identity check reads that the agents are contract accounts, that the tender is the account's and that a key alone would not be accepted | T7 |
| through `--account` the worker of record is the account; the same key by itself is another worker, measured and not subsidized; a key the account does not obey is refused | T6, T3 |
| a tender owned by an account is not confirmed by the account's key; through the account it is; a tender older than the deployment is measured and earns nothing | T6, D11, D15 |
| the audit of the accounts' epoch agrees with the ledger: two accounts and one key are three workers of record | T6, N5 |

## 9. Round R2 on Finchain Sepolia

Round R2a is accepted when:

1. the identity check has been run against the chain and its record says what `decisions.md` 3.2
   says (T7);
2. the deployment record says `ok`, and `pouw verify`, run by the hosted runner, says the code at
   the manifest's addresses is this repository's (M1);
3. epoch 0 and the standard epoch of the round hold the expected receipts (N1, N2, D9, D10),
   and both are closed (N3). The standard epoch is epoch 1, or the later epoch in which the
   standard round was in fact completed (`r2-runbook.md`, step 5). Any additional epoch holding
   a receipt of the round is recorded and closed too. Combining receipts from partial epochs
   does not satisfy the four-receipt expectation of a complete standard epoch. Each close
   record is shown to be in the finalized chain: by the receipt of its transaction, which
   succeeded; by the `EpochSealed` event of the deployment's ledger in that receipt; by the
   receipt's block hash, equal to the chain's for that block; and by its block, which is not
   after the finalized block that the hosted audit of its epoch read up to. The number, the
   hash and the time of that finalized block are on record. An estimate of elapsed time does
   not show any of this, and neither does the `sealed` flag of an audit of release 0.1.3, which
   is read at the latest block (A72);
4. the hosted runner's audits, at finalized state, say `ok` for epoch 0, the actual standard
   epoch and every additional receipt-bearing epoch. Expected figures follow `roadmap.md` 4
   with the budget and receipts actually in force. For the same deployment and epoch, the
   host's and runner's audits hold the same `tableHash` (N5, T5). The host's audits, the input
   of the hosted job and the evidence name the same epochs (A69);
5. deployment-result records carry `public-testnet`, `controlled-self-test` and
   `operator-wallet-integration` (M6). The pre-deployment identity check, workflow metadata
   (`run.json`) and working notes retain their original schemas; their provenance is described
   in `evidence/r2a/README.md` 8 rather than retroactively adding deployment labels.

A process listing or a successful background-wrapper exit is not evidence that the round
completed. Each audit identifies its ledger, chain and clock; records from an unused deployment
stay with that deployment and cannot satisfy the replacement deployment's acceptance.

The hosted run passes when both of its jobs succeeded - an artifact is also uploaded by a job
that failed - and its records say `ok`. A `tableHash` covers the workers' addresses and their
allocations and nothing else, so the host's and the runner's reports are compared in full (A72).

Round R2a was run on 2026-11-24. `evidence/r2a/README.md` 8 sets each of the five conditions
against its evidence. The advisor subsequently accepted its technical scope after reviewing
evidence commit `b53e52f` (`decisions.md` 6.11). This closes R2a for the active deployment and
epochs 0 and 1: public-testnet, controlled-self-test and operator-wallet-integration. CI #3
(`45359832829`) and `evidence/r2a/r2a-close-evidence.json` establish the required seal finality:
`540870 < 546161 <= 547050 <= 547405`. No new run or redeployment is required for this status
update. This outcome neither adopts Q13/Q14/the remaining Q16 choices nor accepts R2b or R3.

Round R2b is not accepted by any of this. It is accepted when the Cell Accounts of the two cells
are the admitted parties, the workers of record and the owners that confirm the cells' own
tenders (T6), by a route that leaves each cell's key inside the cell's own software (A37). The
route is ruled (A74, A75): the next version of the ledger, through a bounded delegation that the
account signs or through the account's own `execute`. That version is built and tested on a
local network and is not deployed (`ledger-v2.md`; section 15). Until the round is run the
rehearsal's second deployment shows the mechanics with test accounts and nothing more.

## 10. What the rounds prove, and what they do not

Round R1 proves, on a local network: the loop Work -> Verify -> GMU -> Epoch -> Test Reward runs
end to end; an epoch closes without anyone's figures; every receipt, total and allocation can be
recomputed from the chain alone by a party with no role, and a ledger that differed would be
caught; duplicates, lateness and version changes follow written rules; settlement and subsidy are
separate; nothing can be claimed.

Round R2a adds, on a public chain: that what is deployed is this repository's code; that the same
loop runs there against the chain's own ERC-8414 contract and its finality; and that a machine
which is not the operator's, with no key and no node, recomputes every figure.

Neither proves, and neither claims:

- computation: an accepted `g0.ref` receipt shows presence and a conforming submission (A19);
- demand: a settled tender shows a settlement confirmed by its owner; all parties of the
  rehearsal and both wallets of round R2a are one party, and the tenders of R2a carry no task
  (A24, A39);
- an agent: no FOGA cell takes part in round R2a. A key beside a cell is the operator's wallet
  (A37);
- that self-dealing is excluded: the rule reads a tender as it stands when it is bridged (A38);
- resistance to one party holding many addresses, or to two admitted parties who conceal their
  relation (A25); round R2a shows one declared operator with twice an address's cap (A35);
- an unpredictable seed (A22);
- participation by anyone else (round R3);
- an economy: that test points mean anything, that GMU measures intelligence, that anyone will
  take part. Economic sustainability - a funding source, participation, the decreasing schedule,
  FCT - is a separate acceptance at P4 with its own evidence (P18).

## 11. Staged acceptance of the production extension

The fourteen planned checks of `genesis-mining-mvp.md` 15, with identifiers, the items of A54
each belongs to (`decisions.md` 4.3) and the production increment planned to run it
(`roadmap.md` 8, 9). A later run reports its environment, versions, data source, parties, finance
mode and evidence, and says which facts were simulated.

| Id | Planned check | Expected observation | Items | Increment | State |
| --- | --- | --- | --- | --- | --- |
| E1 | Manual startup funding and renewal | a Holder's manual fiat purchase or renewal makes service available; later usage and delivery are recorded separately from the top-up | 1, 6 | first | planned; not run |
| E2 | Authorized agent wallet procurement | an agent purchases and reconciles a supported digital-asset service within its scope and budget; pending and failed payments remain distinguishable | 2 | second | planned; not run |
| E3 | Authorized fiat-account procurement | an agent purchases or renews through a supported fiat-billed account within the Holder's authority; provider actions that are not supported are reported, not assumed | 2 | second | planned; not run |
| E4 | Manual and autonomous coexistence | both routes operate with attribution and reconciliation; a manual top-up is not reclassified as autonomous income | 3 | second | planned; not run |
| E5 | Qualified inference delivery | the chosen profile records model and tokenizer versions, usage categories, output, the evaluator's findings and the accepted service units | 1, 5 | first | planned; not run |
| E6 | Mixed-source service | external and operated suppliers are assessed against the same specification, with source control and evidence classes stated separately | 4 | third | planned; not run |
| E7 | Declared usage limitation | a worker's declaration and a provider's attested usage are not reported as a proof of inference or of GPU ownership | 5 | first | planned; not run |
| E8 | Customer cash receipt | acceptance, credit owed, withdrawal and actual receipt are reconciled; gross amounts, fees and refunds stay identifiable | 1, 6 | first | planned; not run |
| E9 | Cost and autonomy report | a period report separates payment autonomy, revenue coverage and supply control, with Holder funding, liabilities and operating costs | 6 | first; its payment and supply dimensions with the second and third | planned; not run |
| E10 | Multiple contribution roles | producer, fulfiller and verifier contributions link to their funding and work without a second subsidy for the same contribution | 7 | after the third, with the profiles of the other roles | planned; not run |
| E11 | Unknown payment result and restart | a crash or a timeout is reconciled without a second purchase or an invented success | 2, 7 | first for a restart of the worker; second for a payment | planned; not run |
| E12 | Repair, replication and authorization | recovery keeps obligations and evidence; a replica has its own identity and budget, repeats no past contribution and inherits no unrestricted authority | 7 | with a FOGA cell taking part, on FOGA's cycle | planned; not run |
| E13 | Missing evidence and source change | the report exposes evidence that is unavailable and assumptions about the model or the service that changed; qualification follows the profile's rule | 5 | first for missing evidence; third for a change of source | planned; not run |
| E14 | Related-party demand | controlled self-tests stay labelled; no set of addresses, signatures or transfers is presented as proof that all parties are independent | 1, 5 | first | planned; not run |

The seven items of A54, and where each is first accepted:

| Item | Checks | First accepted in |
| --- | --- | --- |
| 1. A model service bought by a person; the agent produces, the delivery is accepted, the contribution is recorded | E1, E5, E8, E14 | the first increment |
| 2. The Holder funds or authorizes; the agent buys and renews within a budget | E2, E3, E11; rows F5 to F8, F18 to F21, F23 to F26 | the second increment |
| 3. Both kinds of participant under one work protocol | E4 | the second increment |
| 4. An external model service and a self-operated model under one specification | E6 | the third increment |
| 5. A third party re-checks usage, delivery, billing and contribution | E5, E7, E13, E14; rows S7, S9, S13 | the first increment, by a machine that is not the operator's; by a party that is not the operator's when one takes part (acceptances 3 and 4, below) |
| 6. Holder input, customer revenue, protocol subsidy and production cost told apart | E1, E8, E9; rows F1, F12, F13, F22 | the first increment |
| 7. A cell recovers after a failure; a replica obeys deduplication and attribution | E10, E11, E12; rows F11, F15, S17 to S20 | the first increment for the reference worker; with a cell for E12 |

The acceptances of the production line (`roadmap.md` 8; A59). Each has evidence of its own, and
none stands in for another:

| Acceptance | Rows | What it shows |
| --- | --- | --- |
| 1. The mechanism: controlled fixtures - the first increment | E1, E5, E7 to E9, E11 for a restart, E13 for missing evidence, E14; S1 to S13, S15 to S20 and S22 to S26; F1 to F4, F9 to F13, F16, F22, and F17 as far as the manual route shows it | production, acceptance, measurement and payment work as specified |
| 2. A FOGA cell takes part | the rows of the first, with a cell as the worker or as the demander; E12, F15 | a cell can use or organize the service |
| 3. An external supplier | the rows of the first, with a worker that the operator does not hold; T1, T2 | supply from outside can connect. Not demand |
| 4. An external customer's own request | S21, and the rows of the profile version that admits customers' own tasks, which this matrix does not have yet | one request from outside; paid with funds of value, one independent paid demand. Not supply, and not a market |

Adopted (`decisions.md` P58, Q27, A70): the milestone of A54 is met when acceptances 1, 2 and 4 have
each been evidenced, and when one chain of evidence joins them:

| Id | Closing A54 | Expected observation | State |
| --- | --- | --- | --- |
| L1 | One complete chain of business evidence, its links joined by request and work ids or by parent and child | an external customer's request; a cell that used or organized the service for it; the standardized delivery; its independent re-check; the state of its payment; its GMU record; its actual cost - each link naming the one before it. Acceptances that were shown apart and cannot be joined in this way do not close A54. Nothing more is asked of the first increment by it | planned; not run |

## 12. The first production profile

Rows for `production-service.md`. All are planned and not run; the increment is the first unless
a row says otherwise.

| Id | Scenario | Expected outcome |
| --- | --- | --- |
| S1 | The specification is published | the identifiers of its records are recomputed from their canonical form; a delivery made under another specification is not a delivery under the profile |
| S2 | A fixture is delivered and accepted | the checks that apply all pass; the submission settles by the route the profile names; the fixture is shown to be a member of the committed set; one receipt with the role, the work id, the content key and the envelope's hash; GMU is the profile's `baseGmu` |
| S3 | A delivery fails a check: not JSON, not valid against the schema, over the limit, a value not in the input, not the reference, late, or refused by the model | rejected with the published reason; no qualified delivery and no contribution; the cost stays in the worker's records |
| S4 | The same accepted result out of more generated tokens | the same qualified service units and the same GMU |
| S5 | A retry (revised, A57: the row also covered a repeat, to which it gave no units while the fixed GMU stayed) | one request id through every attempt, whatever work id an attempt has; the cost of every attempt stays in the worker's records; one delivery that counts. A repeat is rows S17 to S19 |
| S6 | Categories that overlap (revised, A56) | cached input is never added to input. The count of the canonical result is a count of its own: never added to the generated tokens, and never stated as a part of them |
| S7 | The counts are made again | for the categories that can be counted again, the recount equals the envelope; a difference is reported by category, with the counter used |
| S8 | The envelope stated by the worker is not the one the demander confirms | no receipt under the profile; the two statements are reported |
| S9 | Evidence that is public; evidence that cannot be retrieved | a machine with no role repeats the checks and the counts; the second delivery is marked unauditable and has no verified qualification, and its receipt stays as recorded |
| S10 | A report on a delivery | usage that was declared or attested by a provider is called that, and is presented neither as proof of inference nor as proof of operated hardware |
| S11 | The rules of the kernel on a production receipt: self-dealing, admission on both sides, a declared relation, a bounty in another asset or below the minimum, the caps | the outcomes of rows D5, D8, D9 and D12 to D14 |
| S12 | History | the receipts and the audits of the first ledger are unchanged; no `g0.ref` receipt is read as production; a new measurement version changes no recorded envelope |
| S13 | The ledger is right and a count is wrong | `pouw audit` says `ok` and the recount reports the difference: two reports, and neither stands for the other |
| S14 | A task fulfilled with inference bought for it (later, with a fulfiller's profile) | the agent that bought is the customer of the inference, and the supplier's qualified service to it is a delivery (A60); two receipts, the child naming its parent; each contribution counted once in its own role, and the agent's own thinking is no third one |
| S15 | A canonical result that is not a part of what was generated: re-ordered and re-escaped by the canonicalization, or counting more tokens than the provider reported as generated | recorded as it is: the delivered text and the canonical result each with its hash, `generated_tokens` with its origin, `canonical_delivery_tokens` from the public counter. No report states one as a part of the other unless the stream of tokens and the mapping were kept |
| S16 | The units of a delivery computed by two implementations | integers only, one division, rounded down: the same figure, and for the plan's example 1,810. A change of scale, weight, limit, counter, template, canonicalization rule or rounding is another measurement version, and a recorded delivery keeps its own |
| S17 | The fixture of a counted delivery is delivered again under another tender | another work id; the tender settles and pays, and those facts stay. The delivery is recorded as `duplicate-contribution` and names the receipt it repeats: no qualified units, no GMU measured or subsidized, no eligibility |
| S18 | Another submission for a fixture already counted: by the same worker or by another, under the same specification or under another | as S17. The content key names the task and no model, so it is the same key; the delivery whose confirmation the ledger recorded first is the one that counts, whoever delivers later and with whatever model |
| S19 | A demander makes a new request, with a new request id, for a fixture already counted | as S17: the content key decides, not the request id |
| S20 | One fixture cut into parts, each part tendered as a task | a part is not a member of the committed set: `not-a-task-unit`. What settles is recorded with that reason: no units, no GMU, no eligibility |
| S21 | A customer buys the same service for the same content again (later, with the profile version that admits customers' own tasks) | that version states its own scope of deduplication. The rule for fixtures is not inherited, and a legitimate repeat purchase is not refused by it |
| S22 | Two deliveries of one fixture: the one accepted first on its tender is confirmed second, the one accepted second is confirmed first | the one confirmed first takes the counting, in the transaction that records its receipt; the other is `duplicate-contribution` and names it. What decides is the order of confirmation on the ledger, and no report presents it as a reward for finishing first |
| S23 | Two confirmations for one content key reach the ledger at the same moment | one takes the counting and the other is a duplicate, whichever order the block gives them: testing that the key is free and marking it are one step |
| S24 | The same document under another instruction or another schema; the same task with another model, template or tokenizer | another task description and another key, which is a task unit only if the committed set holds it; the same key |
| S25 | A confirmation for a fixture on behalf of a party that is not a demander the profile version names, or for a tender that no such demander issued; and a confirmation by a named demander beside one by its rightful delegate (revised: the check is of the demander that is represented, not of whoever sends the transaction) | the first two are not tasks of the profile: `not-a-task-unit`, and they do not take the counting of the content key. The last two have the same outcome: a delegate is not another demander |
| S26 | A Unit or a Grade record of the profile is written, at the build | it is validated against the pinned schema, and the tool and the result are on record; before that no record is called valid. No build, test or run fetches the standard, and nothing waits for its status (A67) |

## 13. Supply, funds and payment

Rows for `supply-and-payment.md`. All are planned and not run.

| Id | Scenario | Expected outcome | Increment |
| --- | --- | --- | --- |
| F1 | A person buys quota for the worker | recorded as Holder funding and as a cost; never as production, never as income | first |
| F2 | The quota runs out during service | no new request is taken; requests in flight end as what they are; service resumes when credit is available; nothing is claimed for output that was not delivered | first |
| F3 | A second source under the same specification | deliveries go on; each envelope names the source and the revision actually used; a source that does not meet the specification is not used | first |
| F4 | The state of a purchase on the manual route (revised, A58) | its three parts - payment, service credit, adjustments - are entered from the person's report, the provider's receipt and the quota read back, and labelled so | first |
| F5 | The agent buys within its policy; a purchase beyond it | bought and renewed without a person acting; declined or escalated as the policy says | second |
| F6 | A renewal fails | a bounded number of retries inside the policy, then a stop and an escalation | second |
| F7 | The answer to a payment is lost | the payment is `unknown`: reconciled on the purchase's identifier before anything is sent again; one payment; its budget stays held meanwhile (row F20) | second |
| F8 | Paid, and the credit does not arrive | the payment `settled` and the credit `not-available`, both on record; not booked as service received | second |
| F9 | A request times out after the provider accepted it | reconciled before the service is bought again; a second bill is a second cost and still one delivery | first |
| F10 | The same request reaches the worker twice (revised, A57) | one request id: the first result answers it, and the model service is not bought again. A second order on chain is another work id of that request, and row S17 | first |
| F11 | The worker is stopped at each step of a delivery and started again | one submission, one envelope, one receipt, one cost per provider bill | first |
| F12 | The customer's payment | reserved, owed, received: an accepted submission that was not withdrawn is a receivable and is reported as one | first |
| F13 | The report | native amounts per asset or currency; what was not observed is listed as missing and is not zero; no sum across assets; a conversion names its source and time | first |
| F14 | A worker with a manual source and an agent's source at once | each purchase carries who decided and who executed it; the three dimensions are three fields | second |
| F15 | A replica | its own identity and budget, by an authorized procedure; no signing secret copied; no earlier contribution claimed again; the operator's rules bind it | with a cell |
| F16 | A bounty in an asset other than the native one | recorded, measured and not subsidized, as today (row D13), until an asset policy is ruled and a version of the contracts implements it | unchanged |
| F17 | States that hold together: the money taken and the credit not arrived; the credit half used and part of the money returned; the service in use and its payment disputed | each recorded as it is: the payment, the credit and the adjustments keep their own status and their own amounts, and none overwrites another | first, as far as the manual route shows them; second |
| F18 | What `settled` means on a channel | reached by the rule the adapter declared for its channel, with the channel's own state kept beside it as returned. A stage the channel does not have is recorded as absent; a capture that has not met the rule is `pending` | second |
| F19 | Two purchases need the same room in a budget at the same moment | one is reserved; the other is declined or waits, as the policy says. What is held plus what is consumed never exceeds the limit | second |
| F20 | A reservation whose payment is unknown; one whose request timed out; one whose payment definitely failed; one that the channel's release rule frees | kept; kept; released; released. A refund returns nothing to a budget unless the policy says so | second |
| F21 | The worker stops between the reservation and the note of the attempt, between that note and the sending, and between the sending and the answer (revised: v0.1.5 listed fewer points, and took up at a start only purchases already noted as sent) | at the next start every reservation that is not finished is taken up, a purchase that still shows `authorized` included. An attempt that was written counts as possibly sent and is reconciled on its identifiers. Nothing is sent twice, and nothing is freed by the stop | second |
| F22 | The report over a period with prepaid credit | per provider: opening plus bought, less consumed, with adjustments, is the closing figure, and the provider's balance read back stands beside it. Cash out, the cost of the period and the change of credit reconcile. One payment appears as a source and as a use and is not summed | first |
| F23 | A transaction sent again at the same nonce with a higher fee | one attempt with several transaction hashes, of which at most one is included; one purchase and one payment | second |
| F24 | A new attempt for a purchase | opened only after the attempt before it failed definitely, with the budget tested again. An attempt whose result is unknown is reconciled, or sent again as itself; no second attempt is opened beside it | second |
| F25 | A purchase that took several attempts | at most one payment that settled. What the failed attempts cost is on record as a cost of that purchase, and the report shows no second purchase | second |
| F26 | The fees of a purchase: a transaction sent again at a higher fee; a new attempt after a failed one | principal and fees are shown apart, each against the budget the policy charges it to. The reservation for fees is raised before the resending or the new attempt; a fee that was paid and cannot be recovered is consumption of its budget | second |

## 14. What the production increments are to show, and what they will not

The first increment - the mechanism, on controlled fixtures - is to show: a published
specification; deliveries qualified by published checks; usage recorded by category with the
origin of every counter; counts and checks repeated by a machine that is not the operator's; a
task unit counted once, however often it was wrapped; a contribution recomputed from the chain;
and a report that tells the cost of the model service from the bounty received and from the
Holder's funding.

The three acceptances after it each show one thing more, and only that: a cell that uses or
organizes the service; supply that connects from outside; one request from outside.

No increment and no acceptance shows, and none will claim:

- that a named model ran, before there is execution evidence;
- demand, while the procurement is controlled;
- more than there is, of a customer from outside: one such customer with a request of its own
  shows that one request and, paid with funds of value, that one independent paid demand. It
  shows neither the size of a market nor a repeat purchase nor sustainability;
- demand from a supplier, or supply from a customer: the two are evidenced separately (A59);
- that A54 is closed, from acceptances shown apart: one linked chain of evidence is needed as
  well (row L1);
- that a contribution was counted, from a work fact: a fact is a public trace and is in no
  epoch's GMU (rows D18 to D21);
- that related parties who are not declared, or one party behind several addresses, were
  identified: the rules that count a task unit once catch what can be recognized as the same
  (A57);
- self-sufficiency, from a renewal that happened by itself or from a token count;
- anything about real payments, from a mocked provider, a sandbox bill or a test asset;
- an economic stage: completing an increment certifies none (A53).

## 15. Ledger v2: the test matrix, as run on a local network

The next version of the ledger (`ledger-v2.md`) has a test matrix of its own, of 46 rows, in
section 14 of that document, with the result of each row and the limits of what a pass covers.
On 2026-11-25 every row had at least one test that carried its id and passed, on the in-process
network; the whole suite was 131 tests with release 0.1.4, of which 83 are the kernel's, 137
with release 0.1.5, 143 with release 0.1.6, 151 with release 0.1.7, whose eight new tests are
the rows L36 to L43, and is 154 with release 0.1.8, whose three are the rows L44 to L46. The six
that 0.1.5 added carry no row: three hold the frozen interfaces, and three are regressions on
the signing script's output path, on a statement verified at each submission and on an array
with an empty slot (`decisions.md` 15.4, 15.7). The six that 0.1.6 adds carry no row either:
they hold the compile boundary of v2 and its builds (`decisions.md` 16). The advisor ran the 131
tests again on its own and found all 35 ids of that release in its output (`decisions.md` 15.2).
From release 0.1.6 on the rows are run on the builds of the v2 compiler, solc 0.8.39, and no
longer on those of solc 0.8.24.

The ids L1 to L46 are those of that document. They are not row L1 of section 11 here, the
linked chain of evidence: where both could be meant, the document is named.

| Rows of `ledger-v2.md` 14 | What they cover | Tests |
| --- | --- | --- |
| L1 to L8, L11, L12, L16, L17 | the permit and the two statements that end one: bound to chain, ledger, account, delegate, operations, epochs and nonce; ended per account; one accepted form of a signature; a check that cannot take the call with it | `v2.permit` |
| L9, L10, L13 to L15 | a change of an account's keys; the guard, its binding and its version; what stays open while an account is suspended | `v2.guard` |
| L18 to L20, L25 to L31 | participant, sender and origin; one reason in one order; work facts apart from receipts; a task unit counted once; the epoch of a confirmation; the ledger's reading of a tender | `v2.ledger` |
| L21 to L24 | the cap on a declared operator's aggregate, the rounding, the zero cases and the attribution fixed at recording; also as properties of scenarios drawn at random | `v2.allocation` |
| L31 (the audit's part), L32 to L35 | the client of release 0.1.4, against the kernel of 0.1.3: the authority at a settlement, no second sending, one block for an audit, the hashes of a record | `audit`, `snapshot` |
| L36 to L43 | the audit of an epoch of ledger v2, as a library: every kind of receipt the client can read again re-decided; the next epoch under a changed policy; the permit behind a delegated receipt, from its transaction or given to the run; what the rules would have refused, found; one block; the record and its hashes; a function and a module the client does not read, listed as undecided and held as far as the rules reach | `v2.audit` |
| L44 to L46 | the corrections of release 0.1.8: a log that does not reach back is refused, not audited as a shorter history; the entry's own call is held to its receipt in full; signing records are read by their own domain | `v2.audit` |

None of these rows is an acceptance of round R2b or of round R3 (`decisions.md` A80): nothing of
ledger v2 is deployed, and of the client for a v2 deployment the audit alone is built, as a
library (`decisions.md` 17, corrected in 18). Its interfaces are frozen (`decisions.md` A81) and
its builds are committed as candidates (`build/v2/`). The rows marked "Sepolia, round R2b" in
sections 1 to 7 stay as they are.
