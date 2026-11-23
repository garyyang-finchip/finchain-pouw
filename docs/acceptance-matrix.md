# Acceptance and Failure Matrix

Design revision v0.1.3. Following the formal review (A28), a row is accepted in a round only if
that round implements what it tests. Every row therefore carries a state:

- **passes** - implemented, and covered by the named test of this repository (`npm test`) or by a
  check of the rehearsal (`npm run local-run`);
- **Sepolia** - belongs to a round on Finchain Sepolia (`roadmap.md` 3), where the same behaviour
  is shown on a public chain or needs another party: round R2a (wallets an operator holds), round
  R2b (agents as their contract accounts) or round R3 (a third party);
- **deferred** - belongs to something not implemented (`decisions.md` A19, A23, A30).

Row ids are stable across revisions: a row that was revised keeps its id, a row that no longer
applies stays in the table with its state. The recovery rows are numbered R1 to R10; to keep them
apart from the rounds, this document always writes "round R1".

The unit of round R1 (A30): two local workers -> G0 and G1 -> GMU -> epoch close -> independent
recomputation. The unit of round R2a (A39): a deployment with its code checked -> two wallets ->
G0 and G1 in a controlled self-test epoch and in a standard epoch -> epoch close -> recomputation
at finalized state by a machine that is not the operator's. Evidence is a record with `schema`,
`environment` and `recordedAt`, as in `finchain`, and with the deployment's `labels`.

Tests are named by file: `policy`, `g0`, `g1`, `epoch`, `audit`, `account`, `deploy`, `round`,
`boundaries` stand for `test/<name>.test.js`. All of them, and the rehearsal, are also run on a
hosted runner from a clean checkout, for each version (`.github/workflows/ci.yml`).

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

## 4. Disconnection, restart, lateness and recovery

| Id | Scenario | Expected outcome | State |
| --- | --- | --- | --- |
| R1 | A worker is stopped and started again | it runs the job again: accepted once, refused afterwards; nothing is counted twice | passes: `g0`, `audit`, `round`; rehearsal. Sepolia, round R2a: the round command run a second time |
| R2 | Nobody writes the close record (revised: there is no keeper) | nothing depends on it: the allocation is final when the epoch has ended; the next epoch's first use, or anyone, writes the record later | passes: `epoch` |
| R3 | The endpoint drops or rate-limits during a submission, or serves a log query over a limited range only | the command is run again: every step looks at the chain first, and at most one receipt exists. The client reads the log in ranges and gets the same result | passes: `audit` (ranges of 1, 7 and 1000 blocks); `round` (a test tender stopped after each of its steps and carried on); rehearsal (ranges of 40 blocks; the round run again). Sepolia, round R2a |
| R4 | A reorganization before finality | the client reads logs up to the settled block; it neither audits an epoch nor does the audit job on top of it before that block has passed the epoch's end | passes: `audit`; rehearsal (the endpoint holds its finalized block back: the audit and the audit jobs wait, and go on when it moves). Sepolia, round R2a |
| R5 | The steward is gone | recording, sealing and auditing continue under the versions in force; the budget follows the schedule already registered | passes: `epoch` |
| R6 | A profile's module fails | no receipt under that profile; other profiles proceed (revised: no pending state exists) | passes: `epoch` |
| R7 | A final figure or a close record is asked for while the epoch runs | both revert; a provisional figure is available and says what it is | passes: `epoch`; rehearsal |
| R8 | An epoch nobody opens, or nobody uses | the first receipt captures the seed; an unused epoch is empty, allocates nothing and can be sealed | passes: `epoch` |
| R9 | Late acceptance: delivered in one epoch, accepted in a second, bridged in a third | one receipt, in the epoch it is recorded in, under that epoch's rules; the earlier epochs do not move | passes: `epoch` |
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
| M6 | Labels | every record made from a deployment carries its environment and its labels; an epoch's mode is a separate field, and a standard epoch of a controlled self-test is still labelled as part of one | passes: `deploy`; rehearsal |

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
| a key that does not own a tender cannot confirm it; a second submission for the same instance is refused; a close record for a running epoch is refused | D11, D1, R7 |
| an epoch that has not ended, or has ended and is not settled, is not audited; the audit jobs of the next epoch wait for it, and go on when the settled block moves | R4 |
| epoch 1, standard: the tenders between declared-related wallets are measured and not subsidized; each audit job recomputes epoch 0 in full | D9, N1 |
| after the last epoch the round writes its close record and starts no new work | N3 |
| per epoch: the audit, as a separate process with the manifest and the endpoint only, agrees with the ledger on every figure, and every row of its table equals the ledger's view | N3, N4, N5, T5 |
| the audit adds the table up per declared operator: one operator, two addresses, twice the share an address can have | D6 |
| every record carries the deployment's labels; no contract of the kernel holds funds | M6, X11 |
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
3. epoch 0 and epoch 1 hold the receipts of the round (N1, N2, D9, D10), and both are closed (N3);
4. the hosted runner's audits of both epochs, at finalized state, say `ok`, their figures are the
   ones of `roadmap.md` 4, and the host's audits hold the same `tableHash` (N5, T5);
5. every record is labelled `public-testnet`, `controlled-self-test` and
   `operator-wallet-integration` (M6).

Round R2b is not accepted by any of this. It is accepted when the Cell Accounts of the two cells
are the admitted parties, the workers of record and the owners that confirm the cells' own
tenders (T6), by a route that leaves each cell's key inside the cell's own software (A37). Until
then the rehearsal's second deployment shows the mechanics with test accounts and nothing more.

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
