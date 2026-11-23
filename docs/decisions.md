# Decisions

Three classes, kept strictly apart. **Approved** entries are rulings by the owner (with the
advisor) and bind the design. **Proposed** entries are this repository's own choices; each is in
force only after a ruling, and those that round R1 implements are marked so that they can be
confirmed or vetoed one by one. **Illustrative** entries are figures used to explain a mechanism;
none of them is a protocol parameter, and the kernel runs with any value in their place.

Design revision v0.1.2. Section 2 records the formal review of v0.1.1 and how each ruling was
applied; section 3 gives the state of every earlier proposal; section 4 lists what this revision
adds on its own judgment.

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

The review's rulings are recorded here in condensed form from the owner's relay of it; the
review's own text governs wherever a wording here falls short of it.

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

## 3. The proposals of v0.1.0 and v0.1.1, and their state

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
| P11 | The reference client speaks JSON-RPC only; FOGA takes part through an optional adapter in its own repository | In force for the client; the FOGA adapter is not in R1 (A30) |
| P12 | First miners: the OG cell and cell-b, then a third party | In force as a controlled self-test (A24) |
| P13 | Settlement and audit read the chain's finalized state | In force (P27) |
| P14 | Node attestations are a later module | Confirmed (A30) |
| P15 | Paged on-chain finalization from `finalizableAt` | Replaced (A21, P19, P20) |
| P16 | G1 settlement and G1 subsidy are separate | In force, extended (A24, A25, P22-P24) |
| P17 | Instances derive from a seed captured at epoch open | In force, with the claim about unpredictability withdrawn (A22) |
| P18 | The technical loop and the economics are separate acceptances | In force (`acceptance-matrix.md`, last section) |

## 4. Proposed in this revision

Implemented in R1 on this repository's own judgment, in order to carry out the rulings above
completely. Each is in force unless vetoed; a veto changes the code, its tests and these documents
together.

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
conditions on a seed for a valuable subsidy.

## 5. Open for the next ruling

| Id | Question | This repository's suggestion |
| --- | --- | --- |
| Q9 | P22 and P24 add two conditions to the G1 subsidy that the review did not name: an admitted demander, and bridging by the tender's owner. Confirm or veto | Confirm. The demander then has to send one transaction per settled submission (`pouw bridge`), which a cell's adapter does by itself later |
| Q10 | R2 on Finchain Sepolia: the epoch duration; whether the first public epochs run as a controlled self-test (declared-related parties subsidized, labelled) or as standard epochs in which the tender between the OG cell and cell-b is recorded and not subsidized; and the pool split, now that `g0.ref` is understood to measure presence only | A short epoch for the drill; two epochs, one of each kind, so that both labels appear in public evidence; a G0 share well below the illustrative 70 percent |
| Q11 | A cap per declared operator (`genesis-mining-mvp.md` 13.4) before a third party is admitted in R3 | Yes, before R3; not needed for R2 |
| Q12 | P30: Hardhat instead of Foundry | Keep; the contracts do not depend on the choice |

## 6. Illustrative (figures used to explain, not parameters)

| Figure | Used where | Note |
| --- | --- | --- |
| 24-hour epoch | `roadmap.md` | an example duration; the policy takes any duration at deployment |
| 600-second epoch | `scripts/local-run.js` | the local run's choice, so that two epochs pass in one run |
| 1,000 test points as the first epoch's budget, halved every 8 epochs | tests, local run | an example of a decreasing schedule; a parameter version carries its own |
| 70 / 30 split between the G0 and G1 pools | tests, local run | an example split |
| 25 percent share cap per address | tests, local run | an example cap |
| GMU bases: `g0.ref` 10, `g1.tender` 50; per-worker caps 10 and 200 | tests, local run | examples; set when a profile version is registered |
| G1 rules: 0.001 ETH minimum bounty, 3 subsidized receipts per demander, 1 per pair, per epoch | tests, local run | examples; carried by the parameter version |
