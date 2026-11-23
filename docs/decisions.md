# Decisions

Three classes, kept strictly apart. **Approved** entries are rulings by the owner (with the
advisor) and bind the design. **Proposed** entries are this repository's own choices; each is in
force only after a ruling, and those that round R1 implements are marked so that they can be
confirmed or vetoed one by one. **Illustrative** entries are figures used to explain a mechanism;
none of them is a protocol parameter, and the kernel runs with any value in their place.

Design revision v0.1.4: a revision of the documents after the alignment of 2026-11-24. The
software is release 0.1.3, unchanged - no contract, interface, client, script, configuration or
deployment changes with it. Sections 2 and 3 record the two reviews - of v0.1.1, and of v0.1.2
with round R1 - and how each ruling was applied; section 4 records the alignment on the
production line and how it is applied; sections 5 and 6 give the state of the earlier proposals;
section 7 lists what v0.1.3 proposed; section 8 what this revision proposes on its own judgment;
section 9 holds the questions for the next ruling.

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
| A17 | A worker's supply of intelligence (compute, model tokens) may be funded and bought by its operator, bought by the agent itself within the authority its Holder gave it - with USDC through x402, for one - or, in the future, come from GPUs the node operates; the protocol accepts all three forms together and requires none. Most first-batch nodes start in the first form. Wording of 2026-11-24: this entry used to number the three forms as stages 1 to 3. The economic stages are now those of A41; the compatibility approved here stands. | owner, 2026-11-20; wording 2026-11-24 |
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
| A40 | The first production commodity. LLM token generation is the first production commodity of the economic roadmap: a supplier sells an inference service under a stated model and service specification. The protocol distinguishes three records - raw token usage, qualified intelligent delivery and economic value - and four observations: purchased quota, measured usage, accepted delivery and economic settlement. Producing more tokens establishes neither more useful work nor a larger reward. Round R1 supplies the contribution and allocation foundation; it implements no model serving, verification of usage, SIG, agent procurement or payment rail. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A41 | The economic stages. Three stages, the first in three segments: Stage 1 early, Startup; Stage 1 middle, Development; Stage 1 late, Pre-expansion; Stage 2, Expansion; Stage 3, Maturity (`architecture.md` 1.2; `genesis-mining-mvp.md` 14.1). They describe how funding, procurement and the supply of intelligence change across the network. Earlier operating forms remain available as later ones develop, and one deployment can support several at once. No date, adoption percentage, revenue threshold or mandatory move to hardware is set. This replaces the stage numbering of A17 and keeps its compatibility of forms. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A42 | Three operating dimensions, reported separately and never collapsed into one claim of autonomy or self-sufficiency: payment autonomy (who chooses, authorizes, executes and renews a purchase), operating self-sufficiency (whether earned external revenue covers the operation over a stated period, with Holder funding and subsidy shown apart) and supply control (who operates the runtime, the model and the compute). They are descriptive records, not contract fields or admission rules. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A43 | The standard complete Finchain AI Node (refines A8) combines: independent L2 state verification through a chain node; available intelligent-service supply, with its model or provider path and its service limits declared; FOGA cellular capabilities for authorized action, maintenance, self-repair, recovery and replication through code; and a PoUW interface for work, evidence, contribution and audit. It is the direction of the complete operating form - not a claim about existing nodes, and not a gate: the Work Node and the Chain Node remain. Chain verification grants no sequencing or block-production authority. A replica is a separately configured instance with its own authority, state and budget, and no private key is copied. Colocation does not merge trust boundaries; no L1 administration or sequencer key becomes a model-payment or worker key. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A44 | Production and economic roles (future design): model supplier, compute operator, agent service provider, procurement agent, router, delivery verifier, customer or Holder, payment service (`architecture.md` 2.2). One entity may perform several; records preserve which role it performed, for whom, and with what declared relationship. Separate addresses alone do not establish independence, and customer revenue and Holder funding are different economic sources. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A45 | The first service standard and the first production profile. The standard states the model and tokenizer versions, the relevant runtime conditions, the context and output limits, the usage categories, the quality checks and the service conditions. Its acceptance keeps unsolicited output from raising eligible work; cached results, retransmissions and retries have accounting rules of their own; usage that a provider reports is told from usage that was checked independently. External and self-operated suppliers qualify comparable deliveries within one service class and evidence level; an equivalence across models or tasks that is not calibrated is left unknown. The first production profile is a narrowly specified text-inference service of a bounded task class whose acceptance can be explained and repeated (working name `g1.inference`), procured in G1 by a customer or a designated test demander. A later G0 production profile may procure useful inference from a finite public budget, with a stated purpose, use, acceptance and limit. Controlled procurement validates its mechanism; claims about commercial demand need independent buyers. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A46 | Evidence. A production evidence envelope - versioned, off chain, possibly anchored by a commitment on chain - records the service, usage, acceptance, funding and settlement evidence of a delivery, with its availability and access rules (`genesis-mining-mvp.md` 14.3). A hash proves a commitment, not that evidence is available or true; content that is withheld is disclosed as not independently checkable; credentials and secrets never enter an envelope. Four evidence classes say which claim is supported - declared usage, provider-attested usage, independently evaluated delivery, execution-evidenced delivery - and are neither a ranking nor a schedule of rewards. Supplier signatures, customer acknowledgements, sampled re-execution, trusted hardware attestations and cryptographic proofs establish different properties. Inference runs off chain: the EVM does not rerun a model, and `IG0Function.evaluate` is not turned into a proof of inference. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A47 | GMU and SIG. GMU is a versioned contribution measure used by the allocation policy: not a payment asset, a model token, a capability certificate or a claim on FCT. SIG is the future standard for intelligence-production capability; capability, delivered quantity and utilization stay distinct. The transition toward SIG is the improvement of the evidence, the calibration and the comparability behind contribution accounting. Recorded receipts, GMU and allocations never change; a fixed-base receipt is never treated afterwards as standardized token production; there is no conversion from historical GMU to SIG, IPC, a stablecoin or FCT; a later analysis of old evidence states its method and its limits separately. The formula of round R1 is unchanged. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A48 | Contribution classes and their budgets (future design): intelligence production, agent fulfillment, verification, and public service such as contracted availability, routing and maintenance - each with its acceptance basis and with the party that supplies its budget (`architecture.md` 6.5; `genesis-mining-mvp.md` 14.7). Receipts identify the role, parent and child work, the funding purpose and a deduplication key: several real services can be paid, and one contribution is never repackaged to claim a subsidy twice. Rewarded verification is a later role with an assigned target, an identity, timing rules and a budget, and is never paid for copying a verdict that was public. Self-maintenance, self-repair and replication support cellular completeness and do not by themselves authorize a reward; a replica creates no independent demand and evades no operator-level rule. Installation, declared capacity or uptime alone earn nothing. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A49 | Ledgers and reports. Three linked ledgers are kept apart: the service ledger (purchases, customer payments, credits, refunds, costs), the contribution ledger (who supplied accepted work, under which version) and the reward ledger (the separately approved budget and eligibility policy). Round R1 implements the contribution records and the simulated allocation view only. Customer spending, Holder capital and subsidy keep distinct provenance; simulated points are a fourth, non-monetary record. An operating report covers a stated period and shows cash received, receivables, provider charges, liabilities, refunds, the costs of inference, verification, orchestration, chain fees and hosting, Holder contributions and subsidies, in native amounts; it tells cash flow from costs incurred and names what it omits. Aggregates say whether they measure gross volume or value added. Nothing is inferred from a token count, a GMU figure, a token price or an automatic renewal, and no emission formula, price, return or conversion is approved. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A50 | Procurement, authorization and payment. Manual purchase by a person, purchase from an agent's wallet in digital assets, and purchase through a fiat-billed account its Holder authorized are all part of the design and may coexist; each adapter declares what its provider actually supports. The purchasing policy records who funds, who may spend, the permitted providers, the boundaries, the budgets, the renewal conditions and the escalation. A payment record tells apart: authorized or reserved; initiated; pending or unknown; settled or captured; service credit available; refunded, credited or disputed. A quote is not a funding commitment, a commitment is not an authorization, an authorization or a submission is not a settlement, and credit becoming available is not a delivery. An `Accepted` ERC-8414 submission may leave a credit to withdraw: revenue is established by the transfer or the withdrawal. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A51 | Assets. Support for stablecoins or other ERC-20 assets, in payment evidence and in subsidy criteria, is a future adaptation that needs a reviewed new policy and implementation. An asset is identified by its chain and contract, with raw amounts, decimals, finality and refund handling; a symbol is not an identity; issuer-native and bridged representations are told apart in the manifest; an integration implies no deployment or endorsement by an issuer; a fiat conversion used in a report records its source and time. The G1 rule of round R1 - the native asset only, compared with `minBountyWei`, code 6 otherwise - is unchanged by this alignment. Paying in a stablecoin does not change the asset gas is paid in, and no payment flows through test points. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A52 | Recovery (future design). A production implementation recovers work and money together (`genesis-mining-mvp.md` 14.8): it declines or pauses on a shortfall without inferring credit or widening authority; switches only to a source that meets the specification, recording the actual source and revision; reconciles a lost request or payment on its stable identifier before buying or paying again; keeps incomplete, refused and rejected work with its cost and without a qualified delivery; marks a delivery whose required evidence cannot be retrieved as unauditable; resumes after a crash or a self-repair without a second purchase, recording or reward; and gives a replica its own identity and budget. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A53 | Scope and order. Economic stages are reported separately from the engineering numbers P1-P4 and R0-R4; completing a round certifies no stage. Round R2 continues first, under its approved scope: the alignment adds no gate to it, does not reopen Q9-Q12, and expands it into neither production inference nor Tokenomics. The production extension is then specified and implemented as a separately reviewable increment that starts with one bounded inference profile, a supported procurement route, its evidence envelope and an operating report; further providers, stablecoin settlement, richer verification, SIG calibration and platform economics expand from that evidence. The protocol stays in `finchain-pouw`. No FOGA release, ERC change, mainnet deployment, token issuance or change to consensus or sequencing is authorized. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |
| A54 | The next round. The executor delivers: (A) route and terms aligned across the decisions, the architecture and the roadmap, with the coexistence of the forms and their mapping to the engineering milestones; (B) the plan of the first token-production service; (C) the plan of the supply and payment interfaces, shared by manual and autonomous operation and covering exhausted quota, failed renewal, unclear payment state, duplicate requests and recovery; (D) a staged acceptance matrix covering at least the seven items of section 4.3. The proposed checks of `genesis-mining-mvp.md` 15 are all proposed and not run; a later run reports its environment, versions, data source, parties, finance mode and evidence, and says what it simulated. The next design review confirms how the first production loop lands. Its milestone: a buyer makes a real request for intelligence service; a supply node completes a standardized delivery; a FOGA cell uses or organizes the service; an independent verifier can re-check the volume of service and the acceptance; the payment completes correctly; a GMU record that can be recomputed is formed; and the actual cost of production is reported. | alignment of the owner and the advisor on the production line, relayed by the owner, 2026-11-24 |

The rulings of both reviews and the alignment are recorded here in condensed form from the owner's
relay of them. A review's own text governs wherever a wording here falls short of it, and for
A40-A54 the two aligned documents do: `architecture.md`, and `genesis-mining-mvp.md` 14 and 15.

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
| A31 | No contract was rebuilt. The six deployable contracts compile to the code of v0.1.2, the metadata hash aside: two comments changed (A38), and the interfaces are identical. What is new is the tooling of round R2 | `build/`; section 7 |
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

## 4. The alignment of 2026-11-24 and how it is applied

The owner relayed the record of his discussion with the advisor on the production line and, with
it, two documents that state its result: an aligned `architecture.md`, and an aligned
`genesis-mining-mvp.md` with two new sections, 14 and 15. A40-A54 condense them. Both documents
had been written against v0.1.2 and are in this repository now, merged with what v0.1.3 had
established since.

### 4.1 How the two documents were merged

| Document | Taken from the aligned document | Kept or carried over from v0.1.3 |
| --- | --- | --- |
| `architecture.md` | the whole text: the first production commodity and the table of what is implemented and what is future design (1.1), the economic stages (1.2), the three operating dimensions (1.3), the production and economic roles (2.2), the complete AI Node (2.3), the future logical modules (3.2), the account boundary (5.2), the future interface requirements (5.3), the production loop, the three records, GMU and SIG, the reward classes and the ledgers (6.2 to 6.5), the future production threats (7), the engineering position of each later responsibility (9) | the baseline named as it stands; the parties of rounds R2a and R2b (2.1); `pouw verify`, the contract-account route of the client and the tooling of round R2 (3.1); who a participant is (4) and what the check of round R2 found (5.2); the deployment check and the two threats v0.1.3 added (7); the rulings A33-A36 and the rows of the next ledger version (9); pointers to the plans |
| `genesis-mining-mvp.md` | sections 14 and 15 as delivered; in sections 1 to 13 the edits of the aligned document: the loop as a table, the scope and the production objective (1), the production-design terms (2), the wording on gas of a reverted submission (5.3, 9), on the tender's vault and the withdrawal of a credit (5.4), on what GMU does and does not measure (6), the introduction of 13 | sections 5.5, 7.5, 12 and 13.4 as v0.1.3 had them; the kept designs 13.7 to 13.9; the baseline named as it stands; in 14 a pointer to the plans, in 15 the counts of the baseline and a pointer to the matrix |

Sections 1 to 13 of the specification keep their numbers, and no data structure, receipt rule,
allocation formula or interface changed. The architecture keeps the numbers of its ten sections.

### 4.2 How each ruling is applied

| Ruling | Applied as | Where |
| --- | --- | --- |
| A40, A45 | The first production profile is planned as one bounded task class with published checks, procured through ERC-8414 by a designated test demander, with its usage recorded by category | `production-service.md` 1 to 5 |
| A41, A42 | The stage names and the three dimensions are used as delivered, everywhere. The stage numbering of A17 is replaced in its wording; its compatibility of forms stands. Each dimension is recorded in a place of its own | `architecture.md` 1.2, 1.3; `supply-and-payment.md` 2; A17 |
| A43, A44 | Recorded; nothing built. The plans name which role each party of the first increment performs | `architecture.md` 2.2, 2.3; `production-service.md` 8 |
| A46 | The envelope's groups are filled in for the first profile; the evidence class of every claim is stated with what it does not establish; three availability cases are told apart | `production-service.md` 4, 6 |
| A47 | The kernel's formula and every recorded figure stay. The first increment keeps a fixed GMU per accepted delivery and records qualified units beside it, as material for SIG (P45) | `genesis-mining-mvp.md` 6; `production-service.md` 5 |
| A48, A49 | Roles, parent and child work and the deduplication key are designed into the receipt of the next ledger version (P50); the operating report is specified (P49) | `production-service.md` 7, 8; `supply-and-payment.md` 8 |
| A50, A52 | One purchase record with the six state meanings, shared by the manual and the agent routes; the failure rows with the handling proposed | `supply-and-payment.md` 3 to 6 |
| A51 | The native-asset rule stays. A design for listed assets is kept as a later adaptation and is in no increment yet | `supply-and-payment.md` 7, 9 |
| A53 | Round R2 and its documents are untouched: nothing of its tooling, configuration or runbook changes in this revision. The production work is planned as increments beside the rounds (P51) | `roadmap.md` 7 to 9 |
| A54 | Deliverable A: this record, the architecture, the roadmap. B: `production-service.md`. C: `supply-and-payment.md`. D: the staged matrix. The fourteen proposed checks carry identifiers and are marked proposed and not run | `acceptance-matrix.md` 11 to 14 |

### 4.3 The seven items of the staged acceptance (A54)

1. A model service bought by a person: the agent produces, the delivery is accepted, and the
   contribution is recorded.
2. The Holder funds or authorizes: the agent buys and renews within a budget.
3. Both kinds of participant work under one work protocol.
4. An external model service and a self-operated model are accepted under one specification.
5. A third party re-checks the usage, the delivery, the billing and the contribution.
6. The Holder's input, the customers' revenue, the protocol's subsidy and the cost of production
   are told apart.
7. A cell recovers after a failure, and a replicated deployment still obeys the rules of work
   deduplication and attribution.

### 4.4 Terms, as the alignment uses them

| Term | Meaning here |
| --- | --- |
| Holder | the party that owns an agent or a cell and supplies its capital or its authority to spend. ERC-8506 calls *holder* the account that holds units of a series; where the two could be confused the documents write "the agent's Holder" and "the holder of the units" |
| Stage, segment | Stage 1 has three segments - Startup, Development, Pre-expansion; Stage 2 is Expansion; Stage 3 is Maturity. A stage is not an engineering number |
| Production increment | a separately reviewable step of the production extension (A53). Increments are numbered on their own, beside the rounds R0-R4, so that an engineering round is never read as an economic stage |
| Service ledger, contribution ledger, reward ledger | the three ledgers of A49. `GenesisLedger` is the contribution ledger and, with its allocation view, a simulated reward ledger |

## 5. The proposals of v0.1.0 and v0.1.1, and their state

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

## 6. Proposed in v0.1.2, and ruled on

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

## 7. Proposed in v0.1.3

On this repository's own judgment, to carry out the rulings of section 3. P32, P33, P34, P37, P38
and P39 are implemented and in force unless vetoed. P35, P36, P40 and P41 are designs put up for
a ruling; nothing of them is built. The alignment of 2026-11-24 ruled on none of them: round R2
continues as approved (A53), and the questions Q13 to Q16 stay open.

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

## 8. Proposed in this revision

On this repository's own judgment, to carry out the alignment of section 4. All of it is design:
nothing is built, and each entry is in force only after a ruling. Where an entry and
`genesis-mining-mvp.md` 14 or 15 differ, those sections govern.

| Id | Proposal | Why | Where |
| --- | --- | --- | --- |
| P42 | The first profile's task class is structured extraction: a text document in, one JSON object under a published schema out. Three published checks: format (canonical JSON, valid against the schema, within the limit); grounding (span values occur in the input, typed values parse); and, for a controlled fixture, equality with a reference answer committed when the task was issued. No partial acceptance in version 1; the reasons for rejection are enumerated; what each check leaves as a trust assumption is stated | A45: an acceptance that can be explained and repeated. The schema bounds the output, so a longer answer is not a larger delivery; the checks are deterministic programs that a third party can run again | `production-service.md` 2, 3 |
| P43 | The service specification, the provenance of supply and the usage records are written in the record formats of ERC-8506 (AI Inference Token Onchain): a Unit for what is counted and how, a Grade for the model and what is promised and how it is evidenced, a Source for who answers for the supply and on what ground, and the claim and evidence entries of its Receipt record for usage and verification. Compatibility at the level of records; the first increment needs no ERC-8506 contract | A6, extended to the owner's standard for this commodity. Its records already make the distinctions the alignment asks for: categories with stated overlap, a promise apart from a measurement, an upstream's authorization stated, and for every piece of evidence what it does not show | `production-service.md` 4 |
| P44 | The first specification names one model revision whose weights are published and whose tokenizer is public. A specification tied to one vendor's service - the API a FOGA node calls today is one - may be registered beside it by ruling, labelled opaque, with its usage as attested by the provider | A45: only such a model can be supplied by a hosted service and by an operator of GPUs under one specification, and only its counts can be made again by a third party from the content | `production-service.md` 3 |
| P45 | Measurement rule version 1: usage categories with their overlap stated; the delivered output is the canonical accepted result; qualified service units are zero unless the delivery was accepted and are bounded by the request's limits; a retry, undelivered output and a repeated input are not counted. The reward rule of the first increment: a fixed GMU per accepted qualified delivery, as the kernel has it, with the qualified units recorded in the envelope and recomputed by a recount. A GMU rule proportional to units is a later version with its own specification | A45, A47: no reward for verbosity or repetition; no count that only two parties stated moves a reward; the first increment produces the usage records with acceptance evidence that a move toward SIG needs before any rule depends on them | `production-service.md` 5 |
| P46 | How envelope, tender and receipt correspond. The work id is `keccak256(chainId, tender contract, tokenId, submissionId)` and is carried by the envelope, the receipt and every payment record. The tender's task binding cites the specification; the submission's result hash commits to the delivered output; the worker states the envelope's hash and the demander's confirmation names the same; a parent work is named in both | A46 asks for exactly this correspondence, and A48 for a deduplication key and parent links | `production-service.md` 4 |
| P47 | Availability of evidence is one of three stated cases: public, controlled access, commitment only. In the first increment the fixtures are documents made for the test and their content is public. A delivery whose required evidence cannot be retrieved is unauditable under its profile | A46: a hash is not availability. The milestone asks that an independent party re-check the volume and the acceptance, which needs the content | `production-service.md` 4, 6 |
| P48 | The worker's side keeps four records - supply source, purchasing policy, purchase, funding - and one state machine for a purchase with the six state meanings of A50. The records are the same on the manual route and on the two agent routes; an adapter implements a route and declares the operations its provider supports | A50, A54 (C): one interface for the startup and the development forms. On the manual route the states are entered from what the person reports and what the quota reads back | `supply-and-payment.md` 3 to 6 |
| P49 | The operating report is shaped as the observation record of ERC-8454 (AIFi Unit Framework): stocks and flows per asset, flows by port, an exact reconciliation, missing values listed and never zeroed, no sum across assets. Every line carries its evidence: on chain, a receipt by reference, or self-reported | A49, and A6: the owner's standard already requires of an observation what the alignment requires of the report | `supply-and-payment.md` 8 |
| P50 | The next version of the ledger, which A35 requires before round R3, is designed once with the production line in view: a receipt also carries the role of the contribution, the work id, the parent work and the commitment to the evidence envelope. `g1.inference` then arrives as a profile and an adapter. The native-asset rule and the GMU formula do not change | A48. A second new version for the production profile alone would be a third ledger; the four fields cost little and bind nothing that is not ruled | `production-service.md` 7; `roadmap.md` 5 |
| P51 | The production extension is built in increments numbered on their own, beside the rounds. First: one bounded inference profile, the manual route, the envelope, the operating report. Second: procurement by the agent, from a wallet and through a fiat-billed account. Third: an operated model under the same specification. The first increment has three acceptances that are kept apart, as round R2 has two: worked by parties the operator holds; with a FOGA cell taking part; with a party that is not the operator's | A53: a separately reviewable increment, and no engineering round read as an economic stage. A37: what shows the mechanism does not show the agent, and neither shows demand | `roadmap.md` 7 to 9 |
| P52 | Designs kept for later adaptations, in no increment yet: a list of accepted assets per parameter version; the agent-wallet route by signed stablecoin transfer, as x402 does it; metered and prepaid supply on the entitlement ledger of ERC-8506, where an authorization up to a ceiling is a Holder's delegated budget; a G0 production profile and paid verification as the content of the kept designs `g0.cal` and `g0.ver`; the sponsoring of gas | A51, A45, A48: each needs its own review. Writing the designs down keeps the first increment from closing a door | `supply-and-payment.md` 9; `genesis-mining-mvp.md` 13.1, 13.2 |
| P53 | The reference worker, the reference demander, the evaluator and the recount of the first profile are programs of this repository's client. FOGA is not modified: a cell takes part through the capabilities it has - it issues and fulfills tenders today - or through an adapter of its own, on its own cycle | A29, A53. The first acceptance of the first increment therefore needs nothing from FOGA, and the second waits for nothing in this repository | `production-service.md` 10 |

## 9. Open for the next ruling

| Id | Question | This repository's suggestion |
| --- | --- | --- |
| Q13 | How a Cell Account mines as itself (A37): the delegation signed by the account, in the next ledger version (P35), or another route | P35. FOGA stays as it is and the cell's key stays inside FOGA |
| Q14 | Whether round R2b is run on the present kernel. That is possible only by driving a cell's `execute` with the cell's own key from the reference client, with the cell's node stopped for the duration | No. R2a now, on the present kernel; R2b on the next ledger version |
| Q15 | The independent machine of R2: a hosted CI runner (P38) | Confirm. A further audit from any other machine costs nothing and can be added |
| Q16 | The content of the next ledger version, before R3: the cap per declared operator (A35, P41), receipts without the demander (A33, P40), the delegation (P35), and what is decided about the authority at settlement (A38, P36) | One version with the first three; the fourth together with the verification work, before any subsidy of value |
| Q17 | The task class of the first production profile and its three checks (P42) | Confirm structured extraction, or name another bounded class. The plan changes in section 2 of `production-service.md` only |
| Q18 | Whether the specification, the provenance of supply and the usage records are written in the record formats of ERC-8506 (P43) | Confirm. It adds no contract and no dependency to the first increment |
| Q19 | The model of the first specification (P44): published weights and a public tokenizer; and whether a specification for the provider a FOGA node calls today is registered beside it | Confirm the criteria and choose the model at the build round, from what can be bought then. Register the second specification when a cell is to take part with the model it has |
| Q20 | The reward rule of the first increment (P45): a fixed GMU per accepted qualified delivery with the units recorded and recounted - or GMU proportional to units from the start | Fixed first. Proportional when a recount has shown, on real records, that the counts hold |
| Q21 | Availability of evidence in the first increment (P47): public fixtures | Confirm. Controlled access comes with customers' own tasks |
| Q22 | The next version of the ledger (P50): one version with the items of Q16 and the four production fields, or two versions | One, if this ruling comes with that of Q16. Otherwise two, and neither waits for the other |
| Q23 | The order after round R2a (P51): the first increment beside R2b and R3, its first acceptance worked by parties the operator holds and labelled so; and whether the third party of R3 may also be the first customer that is not the operator's | Yes to each. A third party is better invited to work that is real than to a test tender |
| Q24 | The routes of the second increment (P48): which provider for the agent-wallet route and which for the fiat-billed account | Decide when the second increment is opened; one adapter of each kind |

## 10. Illustrative (figures used to explain, not parameters)

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
| Measurement weights of 0.25 for input and 1 for delivered output; limits of 8,000 input and 1,000 delivered tokens; a fixture of 6,000 input, 1,150 generated and 310 delivered tokens; a `baseGmu` of 50 for `g1.inference` | `production-service.md` 5 | examples of a measurement version and of a profile; nothing of it is registered |
| A period of 12 deliveries, 21,700 qualified service units, 0.006 of the native asset received and 5.00 of a fiat currency bought by the Holder | `supply-and-payment.md` 8 | an example of the report's shape; no figure of it was observed |
