# Decisions

Three classes, kept strictly apart. **Approved** entries are rulings by the owner (with the
advisor) and bind the design. **Proposed** entries are this repository's own choices; each is in
force only after a ruling, and those that round R1 implements are marked so that they can be
confirmed or vetoed one by one. **Illustrative** entries are figures used to explain a mechanism;
none of them is a protocol parameter, and the kernel runs with any value in their place.

Design revision v0.1.3. Sections 2 and 3 record the two reviews - of v0.1.1, and of v0.1.2 with
round R1 - and how each ruling was applied; sections 4 and 5 give the state of the earlier
proposals; section 6 lists what this revision adds on its own judgment; section 7 holds the
questions for the next ruling.

## 1. Approved

| Id | Ruling | Source |
| --- | --- | --- |
| A1 | PoUW is built on top of the Finchain EVM L2 as an economic-layer protocol. It does not change the chain's consensus or sequencing; whether useful work ever affects sequencing eligibility is separate protocol research, not part of this work. | FPM01; owner, 2026-11-16 and 2026-11-23 |
| A2 | Genesis Mining runs two tracks: G0 protocol work (reference computation, resource calibration, verification work of real use) and G1 real demand (tasks tendered, executed and accepted through ERC-8414). | FPM01-G v0.2; owner, 2026-11-23 |
| A3 | Participation is open, but the early public subsidy pool has a controlled budget and controlled eligibility to claim. | FPM01-G v0.2 |
| A4 | GMU is the versioned measurement of contribution and the transitional unit toward SIG. Unknown measurements take defaults; a verification result is never fabricated to fill a gap. | FPM01-G v0.2 |
| A5 | Before any real FCT: non-transferable, non-redeemable test points, awarded under a decreasing simulated budget. Early test points create no right to future FCT. | FPM01-G v0.2; owner, 2026-11-23 |
| A6 | Reuse ERC-8414 (task tenders), ERC-8444 (ARD Onchain value registry), FOGA and the covenant World. Existing functions are not rebuilt. | owner, 2026-11-23 |
| A7 | The MVP core is Work Receipt, Contribution Ledger (GMU) and Epoch Reward; the loop is Work -> Verify -> GMU -> Epoch -> Test Reward. | owner, 2026-11-23 |
| A8 | The Finchain AI Node (EVM verification node + FOGA autonomous cell + PoUW mining interface) is the standard complete form of a node, not a precondition for mining. Three participation tiers: Finchain AI Node, Finchain Work Node (FOGA or a compatible agent + RPC + PoUW), Finchain Chain Node (EVM verification only). A GPU is never a requirement of any tier. Verifying the ledger produces no PoUW reward by itself. | FPM01-N; owner, 2026-11-23 |
| A9 | SIG (standardized intelligence-production capability) and IPC (redeemable intelligence-production credits) are the long-term protocol direction and are not preconditions of the Genesis Mining MVP. | owner, 2026-11-23 |
| A10 | Nothing here changes the chain's consensus or sequencing, FOGA's independence, or the mainnet M5 security work. FOGA runs fully without Finchain; Finchain runs fully without FOGA. | owner, 2026-11-12 and 2026-11-23 |
| A11 | Every protocol part has default handling, version locking, idempotent operations, failure recovery and a reviewable upgrade path. | owner, 2026-11-23 |
| A12 | This repository (`finchain-pouw`) is independent of `finchain` and `foga` and stays so: it is the long-term home of the PoUW protocol, not a staging area to be merged later. Finchain integrates verified versions, configurations and deployment evidence. Only if PoUW ever reaches the sequencer or consensus layer do chain-client changes enter `finchain`'s integration; the general specification and the economic kernel stay here. | owner, 2026-11-23 |
| A13 | The standard is chain-neutral: applicable across agents, compute providers and EVM chains; no Finchain chain id, FOGA identity or FCT address is hard coded. Finchain is the first reference deployment chain. | owner, 2026-11-23 |
| A14 | Round 1 delivers design documents only (architecture, Genesis Mining MVP, implementation roadmap, acceptance and failure matrix); no code before the architecture and the minimal scope are ruled on. The design review point is the PoUW-Upgrade-Mark of 2026-11-27. | owner, 2026-11-23. Fulfilled: the scope was ruled on by the formal review (A30) |
| A15 | First deployment and acceptance on Finchain Sepolia (the recommended reference version, the World, the OG cell and cell-b exist there); the mainnet receives the protocol as an independent module after internal and third-party acceptance. The mainnet's running acceptance (anchor, bond, Type 8, withdrawal) proceeds separately and is not delayed. | owner, 2026-11-23 |
| A16 | Cellular completeness (a cell's self-repair and replication by code) is a goal pursued across P1 to P4, not a gate for participation. | FPM01; owner, 2026-11-16 and 2026-11-23 |
| A17 | A worker's fuel (compute, model tokens) may come from the operator (stage 1), from the agent itself buying tokens with USDC through x402 (stage 2) or, in the future, from the node's own GPUs (stage 3); the protocol accepts all three and requires none. Most first-batch nodes start in stage 1. | owner, 2026-11-20 |
| A18 | Real service revenue (G1 payments between demander and worker) and simulated mining points are accounted separately and never mixed. | owner, 2026-11-23 |
| A19 | R1 implements `g0.ref` and `g1.tender` only; `g0.cal` and `g0.ver` are deferred. A correct G0 result is never equated with proof of compute. | formal review of v0.1.1, relayed by the owner, 2026-11-23 |
| A20 | Identity does not raise GMU: in R1 the tier factor is uniformly 10000. | formal review of v0.1.1 |
| A21 | The R1 epoch is closed once, deterministically and within bounds. Any later paging first freezes the global eligible contributions and the denominator, and only then allocates. | formal review of v0.1.1 |
| A22 | The seed stays as the basis from which instances are derived. The `L1Block` hash is not called secure randomness. Timing, precomputation and the splitting of identities are to be solved before any subsidy of value. | formal review of v0.1.1 |
| A23 | R1 verifies deterministically and relies on ERC-8414's own acceptance and dispute path. The `g0.ver` commit-reveal, whose timing conflicts with the challenge window, is deferred. | formal review of v0.1.1 |
| A24 | A settled G1 tender is not thereby real, independent demand. The OG cell and cell-b belong to one party: their drill is labelled `controlled-self-test` and is not evidence of external demand. | formal review of v0.1.1 |
| A25 | The G1 minimum bounty, the caps and the identity checks stay. The protocol never claims that every related party or every Sybil is detected. | formal review of v0.1.1 |
| A26 | The test reward remains the non-redeemable epoch allocation table: no balance, no claim, no token. | formal review of v0.1.1 |
| A27 | The rules for duplicates, late acceptance, cross-epoch and cross-version cases are complete. Work identity, acceptance status and reward eligibility are recorded separately. | formal review of v0.1.1 |
| A28 | The acceptance matrix is updated so that R1 tests only what R1 implements. | formal review of v0.1.1 |
| A29 | PoUW protocol independent, Finchain chain-native integration. Finchain M5, the FOGA main program and the existing ERC-8414 business loop are not modified. The work waits neither for the FPM01 record nor for FCT Tokenomics. | formal review of v0.1.1 |
| A30 | The design revision v0.1.2 comes first, without a new architecture and without large new functions; R1 may then start. R1 scope: Profile and Policy, Work Receipts, Epoch Rewards, the ERC-8414 adapter, the reference client with its audit. Not in R1: calibration records, the agreement verifier, commit-reveal, multi-level challenges, complex paging, SIG, IPC, FCT, node attestations, the full FOGA adapter. The R1 unit: two local workers -> G0 and G1 -> GMU -> epoch close -> independent recomputation. | formal review of v0.1.1 |

| A31 | Round R1 passes, with conditions. The work goes on to round R2 on Finchain Sepolia without another restructuring of the architecture and without rebuilding R1. The first things to settle are the matching of accounts (A37) and the boundary of the test (A38); R2 follows at once. | review of v0.1.2 and round R1 (FPM01-G), relayed by the owner, 2026-11-23 |
| A32 | The proposals P19 to P31 are approved. With these notes: P22 is limited to eligibility for the public subsidy; P24 holds for R2, and a later channel for receipts that are not subsidized is kept open (A33); P26 is accepted as test work, not as proof of compute; P29 in full; P31 continues to pin the upstream commit and the hashes of the files. | review of v0.1.2 and round R1 |
| A33 | Q9: the two additions to the G1 subsidy rules (an admitted demander; bridging by the tender's owner) are confirmed for R2. Reservation: later, work that has settled must be able to leave a receipt that is not subsidized even when the demander does not bridge it. | review of v0.1.2 and round R1 |
| A34 | Q10: on Finchain Sepolia, epochs of two hours, the pools split 10 percent G0 and 90 percent G1, and two rounds: one epoch as a controlled self-test, in which the OG and cell-b may be given simulated G1 points under that label, and one standard epoch, in which the subsidy of related parties is off and only measured GMU remains. `genesisTime` and `epochDuration` are immutable, so two hours is the parameter of this test deployment and of nothing else. | review of v0.1.2 and round R1 |
| A35 | Q11: before R3, a cap on the aggregate of a declared operator; and the plain statement that related addresses which are not declared are not identified. `GenesisLedger` cannot be upgraded, so R3 needs a new version of the contracts: the old ledger and its audit records are kept, and the switch is made by a versioned manifest. | review of v0.1.2 and round R1 |
| A36 | Q12: Hardhat stays. Hardhat, solc-js and the dependency lock file are pinned. | review of v0.1.2 and round R1 |
| A37 | The identity of a participant. The reference client signs with an externally owned key, so the ledger records that key's address. A FOGA cell has two addresses - its Cell Account and the key of its owner and operator - and a tender held by the account cannot be bridged by the key. The statement that FOGA 1.0.9 takes part unchanged, with the reference client and the cell's key, is therefore not proven. Before the R2 deployment a short check compares the tender's owner, the Cell Account, the operator key and the sender the client's transactions would have. If they differ, the protocol-level test may be run with externally owned keys, and must then be labelled, truthfully, an operator-wallet integration; mining by the Cell Account itself follows, through the account execution interface FOGA already has or through an optional adapter. The two identities are not to be confused for the sake of reaching R2, and an external reference program must not go around FOGA's authorization of operations and its budget control. Where needed, the test and the Cell Account integration are accepted separately. | review of v0.1.2 and round R1 |
| A38 | The boundary of the self-dealing check. The adapter reads the acceptance authority when a tender is bridged, and that authority can be handed on: a worker that judged its own delivery and then transferred the right to judge is not caught by `worker == judge`. A regression test for "settle, transfer the judge, then bridge" is added and states the boundary; the absolute wording in the documents is corrected. R2 may go on with controlled test points that cannot be redeemed. Before any subsidy of value, the authority as it was at settlement, and the evidence for it, must be bound. | review of v0.1.2 and round R1 |
| A39 | The route of R2: (1) the current contracts are deployed on Finchain Sepolia, with a manifest that holds the addresses, the code hashes and the deployment block; (2) the relation between a FOGA Cell Account and the account that executes for PoUW is confirmed; (3) the OG and cell-b do G0 and G1 work in both kinds of epoch; (4) after the epochs, every receipt, the GMU and the test points are verified again on an independent machine, at finalized state; (5) the result is submitted as independent evidence labelled `public-testnet` and `controlled-self-test`, claiming neither compute nor independent commercial demand. When R2 has passed and the complete independent audit evidence is in, R3 begins with real third-party miners. The mainnet's M5 runs on independently and is not affected. | review of v0.1.2 and round R1 |

The rulings of both reviews are recorded here in condensed form from the owner's relay of them;
a review's own text governs wherever a wording here falls short of it.

## 2. The formal review of v0.1.1 and how it was applied

### 2.1 The rulings

| Ruling | Applied in R1 as | Where |
| --- | --- | --- |
| A19 | Two profiles exist: `g0.ref` (one function, `AuditV1`) and `g1.tender`. The contracts and the documents state what an accepted G0 receipt shows - presence and a conforming submission - and that it shows no amount of computation | `genesis-mining-mvp.md` 5.2, 5.3; `contracts/functions/AuditV1.sol` |
| A20 | No tier factor exists in the contracts: GMU of an accepted unit is the profile's base. No identity binding is read | `genesis-mining-mvp.md` 6 |
| A21 | Receipts count in the epoch they are recorded in and the totals are kept as they come in, so an epoch is frozen by time and its allocation is a pure function: nothing is submitted at the close, in one call or in pages. This is stronger than a bounded single close (P20) | `genesis-mining-mvp.md` 7.3, 7.4 |
| A22 | The seed is kept and described as what it is; the documents, the contracts' comments and a test say that it is predictable to whoever captures it. The open problems are listed as conditions for any valuable subsidy | `genesis-mining-mvp.md` 5.1, 13.6; test X9 |
| A23 | G0 is verified by recomputation in the submitting transaction; G1 takes ERC-8414's settlement as the verdict. No challenge window, overturn or commit-reveal exists. The conflict in the old `g0.ver` timing and the design kept for it are written down | `genesis-mining-mvp.md` 4, 5.4, 13.1 |
| A24 | Operators are declared; a tender between addresses of one declared operator is classed `declared-related` and not subsidized. An epoch that subsidizes such tenders needs a parameter set that says so, and every audit of it is labelled `controlled-self-test`. The roadmap's R2 is reworded accordingly | `genesis-mining-mvp.md` 7.5; `roadmap.md` 3; tests D9, D10 |
| A25 | The checks are kept and two are added (P22, P24). Each rule is listed with what it does not establish; a test shows the bypass that remains | `genesis-mining-mvp.md` 7.5, 7.6; tests D6, D11 |
| A26 | The contracts keep no balance, cannot receive funds and have no function that issues, transfers or claims anything; a test enforces it | `genesis-mining-mvp.md` 8; test X11 |
| A27 | One table of rules, each with its test; receipt, verdict and eligibility are three records | `genesis-mining-mvp.md` 4, 9 |
| A28 | The matrix marks every row as R1, later round or deferred, and names the test of each R1 row | `acceptance-matrix.md` |
| A29, A30 | No change outside this repository. The revision keeps the architecture's layers and reduces the modules; nothing in the list of exclusions is built | `architecture.md` 3; `roadmap.md` 2 |

### 2.2 The three protocol-level problems the review named

| Problem | State |
| --- | --- |
| The G0 seed can be predicted and its capture timed | Not solved, and no longer claimed: A22. Harmless in R1 because the one function has no cost worth saving; a condition for anything of value (`genesis-mining-mvp.md` 13.6) |
| The `g0.ver` state machine contradicts itself: a finding committed inside a challenge window and revealed after it cannot bear on a verdict that became final when the window closed | `g0.ver` is deferred (A19, A23). The kept design has four disjoint intervals and no verdict before the reveals are in (`genesis-mining-mvp.md` 13.1) |
| Paged settlement without a fixed global denominator lets the order of pages change the result | Removed with the pages: the denominators are fixed at the epoch boundary and the allocation is a pure function (A21, P20). Test X10 reads and seals in different orders |

### 2.3 Corrections the review required

| What v0.1.1 said | Correction |
| --- | --- |
| Roadmap R2: the tender between the OG cell and cell-b is eligible "because they are distinct parties" | They are two addresses of one party. Being distinct addresses satisfies a formal condition and proves nothing about demand: A24, `roadmap.md` 3 |
| Matrix D6: splitting work across addresses "changes who holds the points, not how many exist" | Wrong as a defence: one controller with four admitted addresses takes a whole pool against a 25 percent cap. The row now states the bypass and a test demonstrates it: `genesis-mining-mvp.md` 7.6 |
| `finalizableAt = end + longest window` guarantees that every countable receipt is final | Not sufficient once a verdict can be overturned and re-windowed, and it tied the close to the windows. R1 has no windows; a receipt is final when recorded (P19) |

### 2.4 The eight open points of v0.1.1 (`genesis-mining-mvp.md` section 11 of that version)

| Point | Ruling |
| --- | --- |
| Q1 Three G0 profiles, or `g0.ref` and `g1.tender` first | The second: A19 |
| Q2 The two-tier factor from an identity binding | No: A20 |
| Q3 Pinned parameters, the share cap, retire by default, paged finalization | Pinned parameters and the cap stay; one bounded deterministic close; paging only after the denominator is frozen: A21 |
| Q4 The challenge window and who may overturn | Neither in R1: A23 |
| Q5 The G1 eligibility defaults | Kept, without any claim of completeness: A25 |
| Q6 The allocation table as the whole test reward | Yes: A26 |
| Q7 The first miners | The OG cell and cell-b, as a controlled self-test: A24 |
| Q8 The seed source per chain and the first `g0.ref` functions | The seed stays, described as what it is: A22. The first function is the audit of the previous epoch |

## 3. The review of v0.1.2 and of round R1, and how it was applied

The reviewer read the code of round R1 and ruled on it without running the tests again: the
dependencies could not be installed in the reviewer's environment in time. From this revision on
the tests and the rehearsal can be run on a hosted runner, from a clean checkout, by starting one
job (`.github/workflows/ci.yml`), and are run so for each version: a reader does not depend on an
installation of their own.

### 3.1 The rulings

| Ruling | Applied as | Where |
| --- | --- | --- |
| A31 | No contract was rebuilt. The six deployable contracts compile to the code of v0.1.2, the metadata hash aside: two comments changed (A38), and the interfaces are identical. What is new is the tooling of round R2 | `build/`; section 6 |
| A32 | P19 to P31 are in force by ruling, with the notes of the ruling | section 5 |
| A33 | Unchanged for R2. A channel for receipts that are not subsidized is proposed for the next version of the ledger (P40) | `genesis-mining-mvp.md` 13.7 |
| A34 | The R2 configuration: epochs of 7200 seconds, `splitG0Bps` 1000, a parameter version for epoch 0 that subsidizes declared-related parties and one from epoch 1 that does not. The rehearsal runs this configuration. In round R2a the parties of the two epochs are the operator's two wallets, as A37 allows; the OG and cell-b themselves are round R2b | `deployments/finchain-sepolia-r2.config.json`; `scripts/local-run.js` |
| A35 | Not in R2. The cap per declared operator and the versioned switch are proposed content of the next ledger version (P41); wherever the cap is described, the documents say that it binds an address and that undeclared relations are not identified | `genesis-mining-mvp.md` 7.6, 13.4 |
| A36 | As it was: exact versions in `package.json`, the lock file committed, the compiler the pinned solc-js. The builds a deployment is made from are committed as well, with a test that they are what the sources compile to | `package.json`; `build/`; `test/boundaries.test.js` |
| A37 | The check exists and what it establishes is recorded (3.2); the statement is withdrawn (3.4); R2 is two acceptances (P32, P33); the kernel and the client are shown to treat a contract account as the party (P34); how a Cell Account mines as itself is put up for a ruling (P35) | `scripts/identity-check.js`; `roadmap.md` 3; `test/account.test.js` |
| A38 | The regression test is there. The audit now also reads, from the tender's own log, who owned and who judged a tender when it settled, and reports every receipt for which that differs from what the ledger read. The wording is corrected in the contracts' comments and in the documents. The binding required before a subsidy of value is a kept design (P36) | `test/g1.test.js` and `test/audit.test.js` (row D17); `genesis-mining-mvp.md` 7.5, 12, 13.8 |
| A39 | (1) `scripts/deploy.js` deploys from the committed builds and writes the manifest with code hashes and blocks; `pouw verify` checks a deployment against the builds (P37). (2) is 3.2. (3) `scripts/round.js`, for the operator's wallets, in round R2a: the protocol-level test A37 allows with keys. The OG and cell-b doing the same as their accounts is round R2b, which is not accepted by R2a. (4) `pouw audit`, run by a hosted runner that holds no key (P38). (5) the labels on every record (P39) | `docs/r2-runbook.md` |

### 3.2 A FOGA cell's identity and the sender of the client's transactions (A37)

Established from the source of FOGA 1.0.9 and from the business loop recorded on Finchain Sepolia
on 2026-11-13 (`finchain`, `manifests/evidence/business-loop-2026-11-13.json`).
`scripts/identity-check.js` reads the same facts from the chain; its record belongs to the
evidence of round R2.

| | The OG | cell-b |
| --- | --- | --- |
| Cell Account: a contract - the cell's identity, the owner of what the cell mints, the fulfiller of record of what it delivers | `0x9F76...7aD1` | `0x2Dd0...15BB` |
| The cell's key: one key in the roles of owner, operator and guardian; it signs, and pays the gas | `0x5Fee...fb4E` | `0x7dCE...cd81` |

| Question | Answer |
| --- | --- |
| Who owns a tender that a cell mints | the cell's account: the node mints to the account, through the account's `execute`. Tender 5 is the OG's account's |
| Who is the fulfiller of record | the delivering cell's account. For tender 5, cell-b's account |
| Who judges | the World's hashlock verifier, a contract; the settlement path is `verified` |
| What is the sender of a transaction the reference client sends with a key | the key's own address |
| `pouw work` with a cell's key | records the key's address as the worker. The cell does not appear, and the address is not the one under which the cell's G1 work is recorded |
| `pouw bridge` of a cell's tender with the cell's key | refused by the adapter: `NotDemander(key, account)` |
| Running the client with the key of a cell whose node is running | two programs sending from one key collide on nonces; a FOGA node that finds a nonce of its own used by another program stops the operation as ambiguous and leaves it to be resolved by hand. And the key of a one-key cell is its owner key: giving it to a second program is the way around FOGA's authorization that A37 forbids |

The result: the identities differ. Work done with keys alone is an operator-wallet integration and
is labelled so; a cell mining as its account is another acceptance (P32).

### 3.3 The four questions of v0.1.2

| Question | Ruling |
| --- | --- |
| Q9 An admitted demander and bridging by the tender's owner | Confirmed for R2, with a reservation: A33 |
| Q10 Epoch duration, kinds of epoch and the pool split on Sepolia | Two hours; one controlled self-test and one standard epoch; 10 / 90: A34 |
| Q11 A cap per declared operator | Before R3, in a new version of the contracts: A35 |
| Q12 Hardhat instead of Foundry | Hardhat stays, pinned: A36 |

### 3.4 Corrections the review required

| What v0.1.2 said | Correction |
| --- | --- |
| Roadmap, sections 1 and 4, and architecture, section 5: nothing needs to change for round R2, "the reference client runs beside each cell with the cell's key" | Withdrawn (A37). A key is not the cell, and a cell's tender cannot be bridged by the key. Round R2a is worked by wallets the operator holds; no FOGA cell takes part in it; a Cell Account mining as itself is round R2b |
| The specification 7.5 rule 1, matrix row D5, architecture 7: self-dealing is "never subsidized, in any epoch" | True of a tender as it stands when it is bridged, not of its past. The rule now says so; row D17 and its test show the case it misses; the audit reports that case (A38) |
| Roadmap R2, matrix rows T4 and R1: the kernel "driven by two cells", "a cell's unit restarted" | Reworded for what R2a is; what needs a cell is moved to R2b |

## 4. The proposals of v0.1.0 and v0.1.1, and their state

| Id | Proposal (short) | State after the review |
| --- | --- | --- |
| P1 | A worker is an EVM address; identity bindings may raise an eligibility tier | Revised: an address, nothing else. Bindings raise nothing (A20) and are not read by the contracts; the steward may consider them when admitting (P22) |
| P2 | A receipt is written once, is immutable and carries hashes; one receipt per dedup key | In force, with the key replaced by a contribution id that does not depend on the profile (P25) |
| P3 | Three G0 profiles on seeded instances | `g0.ref` in force; `g0.cal`, `g0.ver` deferred (A19) |
| P4 | G1 receipts derive from ERC-8414 settlement; a dispute withholds the receipt | In force: only an `Accepted` submission can be bridged (A23) |
| P5 | GMU v1 = base x units x tier factor | Revised: base x units; no factor (A20) |
| P6 | Fixed epochs, parameters pinned per epoch, separate pools, a per-worker share cap, permissionless deterministic close | In force; the close is by time (P19, P20) |
| P7 | No balance and no claim: the allocation table is the reward | Confirmed (A26) |
| P8 | Budget that is not allocated is not redistributed | In force: it is allocated to nobody. The carry-forward option is dropped |
| P9 | A challenge window with one overturn | Deferred with `g0.ver` (A23) |
| P10 | The manifest is the only place a chain is named | In force (`deployments/README.md`) |
| P11 | The reference client speaks JSON-RPC only; FOGA takes part through an optional adapter in its own repository | In force for the client. How a cell takes part is reopened by A37: a key beside the cell is not the cell (P35) |
| P12 | First miners: the OG cell and cell-b, then a third party | Revised (A37): the first round on Sepolia is worked by two wallets the operator holds, as a controlled self-test (R2a); the two cells take part as their accounts in R2b; then a third party |
| P13 | Settlement and audit read the chain's finalized state | In force (P27) |
| P14 | Node attestations are a later module | Confirmed (A30) |
| P15 | Paged on-chain finalization from `finalizableAt` | Replaced (A21, P19, P20) |
| P16 | G1 settlement and G1 subsidy are separate | In force, extended (A24, A25, P22-P24) |
| P17 | Instances derive from a seed captured at epoch open | In force, with the claim about unpredictability withdrawn (A22) |
| P18 | The technical loop and the economics are separate acceptances | In force (`acceptance-matrix.md`, last section) |

## 5. Proposed in v0.1.2, and ruled on

Implemented in R1 on this repository's own judgment, and approved since by the review of v0.1.2
and round R1 (A32). The notes of that ruling: P22 is limited to eligibility for the public
subsidy; P24 holds for R2, with a later channel for receipts that are not subsidized kept open
(A33, P40); P26 is test work and no proof of compute; P29 in full; P31 goes on pinning the
upstream commit and the hashes of the files.

| Id | Proposal | Why | Where |
| --- | --- | --- | --- |
| P19 | Epochs are intervals of a clock fixed at deployment. A receipt is final when recorded and counts in the epoch it is recorded in. Nothing moves between epochs | Removes the windows, the pending state and the question of when an epoch may close | `genesis-mining-mvp.md` 4, 7.1-7.3 |
| P20 | The ledger keeps the totals as receipts are recorded; the allocation is a view; `seal` writes a record and changes nothing | Carries out A21 without a close transaction to get wrong: no figures supplied, no pages, no participant bound | `genesis-mining-mvp.md` 7.3, 7.4 |
| P21 | Every policy change applies from a later epoch; a version still ahead can be replaced until its epoch begins; the pause is the one immediate lever and only stops recording | Parameters of a running epoch cannot change, and a mistake can still be corrected in time | `genesis-mining-mvp.md` 7.1, 10 |
| P22 | The early subsidy goes to admitted addresses only: the worker and, for G1, the demander. Work by others is recorded and measured | A3. Without it, a fresh address as demander passes every G1 rule for the price of gas | `genesis-mining-mvp.md` 7.5 |
| P23 | The steward declares operators; G1 receipts carry a relation class (`none-found`, `declared-related`, `attested-independent` reserved); `subsidizeDeclaredRelated` marks a controlled self-test | A24: the label has to live on chain and in every audit, not in a document | `genesis-mining-mvp.md` 7.5, 12 |
| P24 | Only the tender's owner can bridge a settled submission | A tender and its judgment can be pushed onto any address; without this an admitted worker could manufacture demand "from" an admitted demander | `genesis-mining-mvp.md` 5.4 |
| P25 | The contribution id leaves the profile out; a G0 instance takes one attempt and a submission names its epoch; a wrong output is recorded as rejected | A27: no double recording across versions, no lost attempt at an epoch boundary, no guessing | `genesis-mining-mvp.md` 9 |
| P26 | A G0 function has a seed-independent cost, a 32-byte digest output and a stated use. The first is the audit of the previous epoch, which the reference client carries out in full before it submits | A19, A22: no function whose answer is worth precomputing, and a job whose result the protocol uses | `genesis-mining-mvp.md` 5.2, 5.3 |
| P27 | The client reads logs up to the settled block and only frozen state at the latest block; it never asks for an old state | An audit must run against an ordinary full node and a public endpoint | `genesis-mining-mvp.md` 12 |
| P28 | Two contracts of substance: `GenesisPolicy` (profiles, parameters, parties, the clock) and `GenesisLedger` (receipts, GMU, the allocation). Work Receipts and Epoch Rewards of A30 are one contract | They share every figure; two contracts would add a trust boundary and no separation of duty | `architecture.md` 3 |
| P29 | GMU does not scale with the bounty | Money moved between two addresses of one party must not buy GMU | `genesis-mining-mvp.md` 6 |
| P30 | Tests and build use Hardhat with the solc-js compiler pinned in `package.json`; tests are JavaScript | The Foundry binaries could not be installed in the build environment. Nothing is downloaded at test time | `README.md` |
| P31 | The ERC-8414 reference contracts are copied byte for byte, pinned to the commit the World locks, as test fixtures | The adapter is tested against the standard itself, not a stand-in | `contracts/vendor/erc8414/NOTICE` |

Kept for later rulings, not implemented (`genesis-mining-mvp.md` 13): the `g0.ver` state machine,
`g0.cal`, the paging rule, a cap per declared operator, a freshness window for bridging, the
conditions on a seed for a valuable subsidy, receipts without the demander, the binding of the
settlement-time authority, the delegation signed by an account.

## 6. Proposed in this revision

On this repository's own judgment, to carry out the rulings of section 3. P32, P33, P34, P37, P38
and P39 are implemented and in force unless vetoed. P35, P36, P40 and P41 are designs put up for
a ruling; nothing of them is built.

| Id | Proposal | Why | Where |
| --- | --- | --- | --- |
| P32 | Round R2 is two acceptances. R2a, the operator-wallet integration: the kernel of R1 on Finchain Sepolia, worked by wallets an operator holds. R2b, the contract-account integration: agents take part as their accounts. A record of the one is never presented as the other | A37 | `roadmap.md` 3; `r2-runbook.md` |
| P33 | The wallets of R2a are keys made for the round, on the host that uses them. No cell's key and no Cell Account is used, and no FOGA node is stopped, restarted or reconfigured for it | A key that a running node sends from cannot be shared with a second program, and the key of a one-key cell is its owner key (3.2) | `r2-runbook.md`; `scripts/keys.js` |
| P34 | The client can act through a contract account of the common `execute(target, value, data)` shape (`--account`): the worker of record, and the owner that confirms a tender, is then the account. It is for an account whose key no other program sends from; for a running agent node it is not the route (P33) | The kernel always took any address as a party; the client did not. Tests and the rehearsal show an account working, and its key alone being somebody else | `client/`; `test/account.test.js`; `scripts/local-run.js` |
| P35 | For ruling - how a Cell Account mines as itself: a delegation signed by the account. In the next version of the ledger, the owner of an account signs once (EIP-712; for a contract account checked through ERC-1271) that a named key may, until a named epoch, submit G0 work and confirm the account's settled tenders on its behalf. Receipts name the account. The cell's key sends no transaction and no other program keeps it: the one signature is the owner's act, made once and offline; the delegated key can do those two things and nothing else, spends its own gas only, and the delegation ends by itself and can be withdrawn | It needs no change to FOGA 1.0.9, whose account accepts its owner's signature; it touches neither the cell's nonces nor its budget; it serves any smart account. Weighed against it: the cell's own key driving `execute` from an outside program (P34 - it collides with a running node and is the way around FOGA that A37 forbids); the account's operator slot given to a mining key (the FOGA node keeps its own key in that slot and checks it); a capability inside FOGA - the fullest form, and FOGA's own decision and release, neither required by this protocol nor waited for (A29) | `genesis-mining-mvp.md` 13.9 |
| P36 | For ruling - binding the authority as it was at settlement, before any subsidy of value. The evidence is the tender's own log, which has every change of owner and of judge in order; the audit reads it already. The kept design makes eligibility depend on it: the confirmation states who judged at settlement, the verification work of the following epoch checks the statement against the log, and a false one loses the subsidy | A38. State on chain cannot decide it: ERC-8414 keeps no record of a past authority. The design therefore needs the verification work that is deferred | `genesis-mining-mvp.md` 13.8 |
| P37 | A deployment is made from the builds committed under `build/`, by one script driven by a configuration file. Its manifest records, for each contract, the build it came from, the code hash, the deployment transaction and the block, and the code hash of the ERC-8414 contract it points at. `pouw verify` compares the code on chain with the builds, immutable values aside, and checks the wiring | A39 (1). The host that deploys needs no compiler, and anyone can check that what is deployed is this repository's code | `scripts/deploy.js`; `deployments/README.md`; `test/deploy.test.js` |
| P38 | The independent machine of R2 is a hosted CI runner: a job started by hand that installs the client only and runs `pouw verify` and `pouw audit` against the manifest's public endpoint. It holds no key and runs no node, and anyone can repeat it from a fork | A39 (4). It is none of the operator's machines, and the run is public | `.github/workflows/ci.yml` |
| P39 | A record says what it is in three separate fields: `environment` (where it ran), the deployment's `labels` (what kind of exercise it is: `controlled-self-test`, `operator-wallet-integration`) and, for an epoch, its `mode` (whether its parameters subsidize declared-related parties). A standard epoch of a controlled self-test stays labelled a controlled self-test | A39 (5), A37 | `deployments/README.md`; `client/lib/report.js` |
| P40 | For ruling, with the next ledger version - receipts without the demander: anyone may record a settled submission as a receipt that is measured and never subsidized. The subsidy still takes the owner's confirmation | A33 | `genesis-mining-mvp.md` 13.7 |
| P41 | For ruling, with the next ledger version - the cap per declared operator of 13.4, and a manifest field that names the deployment a new one supersedes. The old ledger stays readable and auditable, as every ledger does | A35 | `genesis-mining-mvp.md` 13.4; `deployments/README.md` |

## 7. Open for the next ruling

| Id | Question | This repository's suggestion |
| --- | --- | --- |
| Q13 | How a Cell Account mines as itself (A37): the delegation signed by the account, in the next ledger version (P35), or another route | P35. FOGA stays as it is and the cell's key stays inside FOGA |
| Q14 | Whether round R2b is run on the present kernel. That is possible only by driving a cell's `execute` with the cell's own key from the reference client, with the cell's node stopped for the duration | No. R2a now, on the present kernel; R2b on the next ledger version |
| Q15 | The independent machine of R2: a hosted CI runner (P38) | Confirm. A further audit from any other machine costs nothing and can be added |
| Q16 | The content of the next ledger version, before R3: the cap per declared operator (A35, P41), receipts without the demander (A33, P40), the delegation (P35), and what is decided about the authority at settlement (A38, P36) | One version with the first three; the fourth together with the verification work, before any subsidy of value |

## 8. Illustrative (figures used to explain, not parameters)

The parameters of the R2 deployment are ruled (A34) and are that test deployment's own: epochs of
two hours and a 10 / 90 split say nothing about any later deployment. The other figures of its
configuration are the examples below.

| Figure | Used where | Note |
| --- | --- | --- |
| 24-hour epoch | tests | an example duration; the policy takes any duration at deployment |
| 1,000 test points as the first epoch's budget, halved every 8 epochs | tests, the R2 configuration | an example of a decreasing schedule; a parameter version carries its own |
| 70 / 30 split between the G0 and G1 pools | tests | an example split |
| 25 percent share cap per address | tests, the R2 configuration | an example cap |
| GMU bases: `g0.ref` 10, `g1.tender` 50; per-worker caps 10 and 200 | tests, the R2 configuration | examples; set when a profile version is registered |
| G1 rules: a minimum bounty of 0.001 ETH in the tests and 0.0001 ETH in the R2 configuration, whose test tenders pay 0.0005 ETH; 3 subsidized receipts per demander and 1 per pair, per epoch | tests, the R2 configuration | examples; carried by the parameter version |
