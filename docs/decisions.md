# Decisions

Three classes, kept strictly apart. **Approved** entries are rulings by the owner (with the
advisor) and bind the design. **Proposed** entries are this repository's own choices; each is in
force only after a ruling, and those that round R1 implements are marked so that they can be
confirmed or vetoed one by one. **Illustrative** entries are figures used to explain a mechanism;
none of them is a protocol parameter, and the kernel runs with any value in their place.

A recommendation of the advisor on an open question belongs to none of the three. It is recorded
beside its question with the words "advisor recommendation recorded; owner adoption pending". It
is neither approved nor in force until the owner adopts it in a statement of his own, and a
review that the owner relays is not adopted by being relayed (A66). Once adopted, it is cited by
the ruling that adopts it and stays with its question for its wording (A70; section 12).

Design revision v0.1.12, with software release 0.1.6. It applies A82 and records no new
ruling (section 16). The contracts of ledger v2 are compiled behind a boundary of their own, by
solc 0.8.39, and their builds are committed under `build/v2` with a record of how they were
made and a reading of the compiler's own list of known bugs. No rule of the ledger and no
compiled interface changes; the kernel's compiler, its settings and its six builds are
unchanged, byte for byte; nothing is deployed and nothing is signed. Two questions are put to
the owner with it (Q32 as it now stands, and Q33).

Design revision v0.1.11 came with software release 0.1.5. It recorded the owner's rulings of
2026-11-25 on the advisor's review of the local implementation of ledger v2 (A80 to A86;
section 15). The interfaces of ledger v2 are frozen (Q30). The ledger is built through the
compiler's IR pipeline, behind a compile boundary and with a compiler of its own for v2 (Q31).
The proposals P61 to P66 are adopted within stated boundaries. Release 0.1.5 corrected three
tools that the review found at fault - the signing script could overwrite its own key file,
the canonical form mishandled an array with an empty slot, and the second program for the
hashes accepted a member named twice - and the wording on statements and on facts.

Design revision v0.1.10 came with software release 0.1.4. It recorded the owner's rulings of
2026-11-25 on Q13 to Q16 and on the content of the next version of the ledger (A73 to A79;
section 14), and what was built on them. The software changed for the first time since release
0.1.3. The reference client reads one block for an audit and for a check of a deployment,
writes records with a canonical form and two hashes, reports the authority at a settlement as
far as a tender's log settles it, and does not send again what is recorded. The contracts of
ledger v2 were added in `contracts/v2/`, with their tests. The contracts of the kernel and
their committed builds stayed unchanged, byte for byte: the deployment of round R2a is checked
against the same builds as before. Nothing of v2 was deployed and no build of it was
committed; its interfaces were frozen with the revision after it (`ledger-v2.md` 11.8).

Design revision v0.1.9 was a revision of the documents that recorded the run of round R2a on
Finchain Sepolia, its evidence and the review of that run (A72), and where the consolidated
documents of v0.1.8 came from (A71); the software was release 0.1.3, unchanged. The runbook's
command blocks were unchanged: v0.1.8 as consolidated made its fallback and evidence
instructions explicit, and v0.1.9 added the condition on the finality of the close records.
The dated close-status addendum in section 6.11 records the subsequent R2a advisor technical
acceptance without a software release or a new owner ruling; A71/A72 are classified in 1.1.
Sections 2 and 3 record the two reviews of the kernel - of v0.1.1, and of v0.1.2 with round R1 -
and how each ruling was applied; section 4 records the alignment of 2026-11-24 on the production
line; sections 5 and 6 record the reviews of v0.1.4 to v0.1.7, how each is applied, the adoption
that followed, and the review of the run of round R2a; sections 7 and 8 give the state of the
earlier proposals; section 9 lists what v0.1.3 proposed, section 10 what v0.1.4 proposed and
section 11 what v0.1.5 proposed, each as it stands after the reviews and the adoption; section 12
holds the questions put to the owner - those still open, those adopted, each with the
advisor's recommendation as it was adopted, and those ruled on 2026-11-25; section 13 the
illustrative figures; section 14 the rulings of 2026-11-25 on the next version of the ledger,
who wrote and who adopted each, how each is applied, what was built and verified, and the
proposals this repository made with the implementation; section 15 the advisor's review of
that implementation, the owner's rulings on it, the three faults in tools and their
correction, and what the compiler question means for v2 and for the kernel's builds; section
16 the compile boundary of v2, its compiler, its builds, and the reading of the compiler's
known bugs for both compilers.

## 1. Approved rulings and review records

The first table records approved rulings. Section 1.1 separately classifies the advisor reviews
and authorized follow-up that keep their existing A71/A72 identifiers.

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
| A55 | The review of design revision v0.1.4. The direction and the merge of the aligned documents pass: the three stages with their five segments are kept whole, and so is FOGA's independence; the production plan was not put into round R2a, and no change to FOGA or to the mainnet was asked for. The first loop is supported as planned: a bounded structured-extraction task, a model's output, an acceptance that can be repeated, settlement in the native asset through ERC-8414, and records of contribution, usage and cost; stablecoins and the prepaid entitlement ledger are adapted later. The production plans need the corrections of A56 to A62 before they can serve as an implementation specification. None of them is a new gate on round R2a, which continues under its runbook. Q9-Q12 are not reopened, and Q13-Q16 are not approved by the merge of the documents. A revision of the documents applies the corrections, every new acceptance staying marked not run; the next version of the ledger and the first production increment are implemented later, against the corrected specification. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A56 | Measurement. The count of a canonical result is not declared a subset of the tokens that were generated: making a result canonical can change white space, the order of keys, the escaping and the boundaries between tokens, so that count is a standardized length of what was delivered. Recorded separately: the raw usage of generation, as the provider reported it or as the party that runs the model counted it; the delivered text as returned, and its hash; the canonical result, and its count; the canonicalization rule and the tokenizer version. The records can be linked; a subset relation is stated only where the original stream of tokens and the mapping were kept. Qualified service units are computed in integers, with fixed-point weights over a stated scale and one rounding down; the rounding rule, the scale and the counting version belong to the specification. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A57 | Deduplication binds the fixed GMU. The identity of a request is kept apart from the identity of its order on chain: the work id may stay as it is, and a request instance has an identifier fixed before the first attempt, which a retry cannot change. For a contribution the protocol defines as a duplicate, neither GMU nor eligibility for the subsidy increases again; the facts of its transaction and of its payment may stay. The fixed GMU belongs to a complete task unit defined beforehand - in the first round, fixed fixture specifications can serve - so that one delivery cut into ten does not earn ten times. Tests cover another tender, another submission, a retry and the splitting of one root task. The scope of deduplication is stated, so that a legitimate repeat purchase is not refused for ever. These rules control repeated contributions that can be recognized; they do not mean that hidden related parties or several addresses of one party are solved. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A58 | The purchase record and the budget. One purchase record for all routes is right; one single state in it is not enough. Represented separately, because they can hold together: the payment status (authorized, initiated, pending, result unknown, settled by the rule of the channel, or failed), the status of the service credit (not available, available, partly used, exhausted, lapsed) and the adjustments (partial refund, full refund, credit issued again, dispute - each with its amount). Settlement is stated per payment channel - authorization, capture, settlement and later adjustments - and the channel's own state and evidence are kept. Procurement by an agent needs an atomic budget reservation, to be specified before the second increment is implemented: atomic per account, asset and budget period; a payment whose result is unknown goes on holding its budget; a release only on a definite failure or by a stated release rule; the local purchase identifier mapped to the provider's idempotency key or to the authorization or transaction on chain. The report reconciles prepayment, consumed cost and cash paid out, and adds none of them twice. This completes a specification: there is no automatic procurement code in which a defect could exist. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A59 | The scope of the first increment and the milestone of A54. The acceptances are staged, each with evidence of its own: controlled fixtures show that the mechanism of production, acceptance, measurement and payment holds; a FOGA cell taking part shows that a cell can use or organize the service; an external supplier shows that supply from outside can connect; an external customer's own request shows that this one demand from outside exists. External supply and external demand are evidenced separately and neither stands in for the other. A customer's own request that is left for later is written as later and is not required of the controlled fixtures. One independent customer that buys a real service with real funds proves that one independent paid demand; it proves neither the size of a market nor a repeat purchase nor sustainability - and that is what the documents say, not that one customer cannot prove commercial demand. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A60 | An agent as a buyer. An agent's own thinking is not a further fulfillment to anyone. When an agent buys inference from a supplier, the agent is the buyer, and the supplier's qualified service to it can be a delivery: a mature network has cells that buy from one another, route and pay, and a buyer that is an agent is not outside the economy. Where an upstream inference and a downstream task were each really delivered, each is recorded; whether either is subsidized follows its role and the rules of deduplication, and one contribution is not packaged twice. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A61 | ERC-8506. Reusing its Unit, Grade, Source and Receipt records is supported, and the first increment needs no entitlement ledger. Stated before anything is implemented: the repository of the specification and the exact commit; the version of the schemas or sections used; the mapping of this protocol's fields to the fields upstream. The wording: the first increment has no ERC-8506 contract and no runtime dependency, and its record formats are compatible with a pinned revision of the ERC-8506 specification. That is a dependency on a specification, so "no dependency" is not said. Neither FOGA nor ERC-8506 itself has to change. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A62 | Wording made uniform. (a) The table of supply under Startup, Development and Pre-expansion compares forms of supply, or says that the forms appear step by step: in Pre-expansion much supply is still an external API. (b) Platform Tokenomics is a ruling of its own that can serve several stages; what was decided is that nothing is issued in this round, not that platform economics has to wait for Maturity. (c) Hosted CI: the workflow is in place and its first hosted run is pending; the URL, the commit and the result are added when it has run. (d) Stablecoins: they are configured by parameters only after a new policy and its implementation support them; the native-only rule is not lifted by registering an asset parameter. (e) x402: the signed nonce and the validity window are an example of one EVM payment mechanism; a payment may be on the same chain or on another supported chain; version 2 has several mechanisms and networks, and an adapter pins the one it implements. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A63 | Withdrawn in v0.1.6; the id is not used again. v0.1.5 entered the review's answers to Q17-Q24 here as approved, on the ground that the owner had relayed the review. They are the advisor's recommendations, and to relay is not to adopt (A66). They are recorded with their questions in section 12: advisor recommendation recorded; owner adoption pending | review of design revision v0.1.5, 2026-11-24 |
| A64 | A condition on receipts without the demander (A33, Q16), to be decided before the next version of the ledger is coded. A record that anyone may make first, and that is never subsidized, must not let a third party take the one contribution id of a piece of work and so leave the rightful demander's later confirmation unable to obtain eligibility. The next version either keeps the facts of the work apart from the confirmation that leads to the subsidy, or states a safe rule for a later confirmation; either way, an epoch that is frozen is never rewritten. | review of design revision v0.1.4, relayed by the owner, 2026-11-24 |
| A65 | The review of design revision v0.1.5, and the owner's instruction on it. The owner relayed the review with the instruction to carry out what it asks. v0.1.5 repaired the earlier findings in substance and the work goes on; the architecture and the scope are not opened again; round R2a continues under its runbook and is not widened. A revision of the documents, the software staying release 0.1.3: one decision status is corrected (A66), and three conventions are written exactly - which confirmation takes the one counting of a content key and what the key is made of; the attempts inside a purchase and the recovery after a crash; the one linked chain of evidence that closes A54 - together with the semantics of work facts beside receipts. The next thing to review in depth is the implementation of the new ledger and of the first production increment; the three-stage route is not written again. The instruction covers that revision. It adopts none of the recommendations on Q17-Q29. | review of design revision v0.1.5, relayed by the owner with the instruction to carry it out, 2026-11-24 |
| A66 | How a recommendation is recorded. An advisor's recommendation on an open question is not an approval, and it does not become one because the owner relays the review that holds it or because nobody objects. It is recorded as "advisor recommendation recorded; owner adoption pending" until the owner adopts it explicitly, and an adoption is cited by the owner's own statement. A63 is withdrawn on that ground: wherever it was cited the question is cited, the proposals it had marked confirmed are marked recommended, and Q17-Q24 return to the open questions. Nothing of the eight questions is discussed again by this: the advisor maintains every recommendation, and round R2a, which is approved, continues. | review of design revision v0.1.5, relayed by the owner with the instruction to carry it out, 2026-11-24 |
| A67 | ERC-8506 is a light dependency. Nothing may fail to run because that standard has not become an EIP merged into the main repository. | owner, his note in relaying the review of v0.1.5, 2026-11-24 |
| A68 | The review of design revision v0.1.6, and the owner's instruction on it. The owner relayed the review and asked for the update at once. The revision of the documents in v0.1.6 is accepted, and the main findings of the round before it are closed: the record of recommendations apart from approvals; who takes the one counting; what a content key is made of; work facts apart from receipts; attempts and the recovery of a crash; the linked chain that closes A54; the light dependency on ERC-8506 and the validation of its records at the build. The demander that a profile version names is reasonable in its scope - it binds the first controlled fixture profile and is no admission rule of the network - and stays a proposal under Q25. FOGA's independence is intact: no change or release of FOGA and no ERC-8506 contract became a condition of round R2a. Round R2a continues. After it, the next review in depth is of the implementation of the new ledger and of the first production increment. The instruction covers design revision v0.1.7. It adopts none of the recommendations on Q17-Q29. | review of design revision v0.1.6, relayed by the owner with the instruction to issue the update, 2026-11-24 |
| A69 | The running of round R2a, corrected and made exact. (a) The budget of an epoch is counted from the first epoch of its parameter version. With the configuration of round R2a the standard version begins in epoch 1 with a halving interval of 8: epochs 1 to 8 have 1,000 test points, and epoch 9 is the first with 500. The executor's operating instruction that the first halving was epoch 8 was wrong by one epoch. The contract is right and is not changed to fit an instruction; a standard round worked from epoch 9 on changes the expected figures, and neither invalidates the round nor asks for a new deployment. (b) `--epochs n` is an upper bound - the round works in epochs 0 to n - 1, by default 2 - so a standard round in epoch k is run, and closed, with `--epochs k+1`. (c) Closing an epoch sends a transaction and is not called read-only. (d) The five minutes an epoch must still have are the threshold below which nothing is started, not an assurance that what is started completes. (e) The audit job of epoch k recomputes epoch k - 1. Where that epoch is empty, the record says that an empty epoch was recomputed: that shows the procedure and is no recomputation of epoch 0's receipts. (f) The independent audit covers epoch 0 and the epoch in which the standard round was in fact worked. The host's audits, the input of the hosted job and the evidence name the same epochs, and receipts recorded across an epoch boundary are covered where they were recorded. | review of design revision v0.1.6, relayed by the owner with the instruction to issue the update, 2026-11-24 |
| A70 | The owner adopts the advisor's recommendations on Q17 to Q29, each as it is recorded with its question (12.2), its conditions included. He first asked the executor whether it had an evident objection to any of them; it had none, and it named what the adoption carries with it (6.7). The choices these questions put up - P42 to P45, P47, P48, P50, P51 and P54 to P60, as they stand after the reviews - are approved as design: the plans that carry them out are what the next version of the ledger and the production increments are built against and reviewed with. With Q26 the choice that A64 left is made: the facts of a piece of work are kept apart from the confirmation that leads to the subsidy (P60, in the place of P40). The second item of Q16 is settled by that, and work whose demander does not confirm is in no epoch's GMU, measured or subsidized. Nothing is built, deployed or spent by the adoption. Each implementation still goes design, ruling, code; the limits of A53 stand; Q13 to Q15 and the rest of Q16 are not ruled by it. | owner, 2026-11-24: his own statement to the executor, made after the executor answered that it had no evident objection |
| A73 | The owner's execution instruction of 2026-11-25, as a whole. It gives the scope and the direction of the work. The seven items of the executor's memo on Q13, Q14 and Q16 are mapped onto it one by one and are not one gate for all later work: an open matter holds up the work that depends on it and no other. Round R2a is recorded as accepted technically by the advisor on 2026-11-24, within its stated scope, with the source, the date, the evidence commit and the scope kept; the pending state at `b53e52f` stays as history, and no separate statement of a technical acceptance by the owner himself is needed to close the documents (6.11). A71 and A72 keep their ids and are classed as review records and authorized follow-up, not as a blanket approval of other open design (1.1). The correspondence of the deployed Cell Accounts' code with the published bundle is cited with its boundary - it was not recompiled independently - and is no longer listed as without evidence. The scripts, the pinned versions and the result records of the tests and of the account checks are kept, and not only the counts. Deployment, signing with a live key and operations with funds are handled by concrete operation packages within existing authority. The mainnet's work stays separate: its readiness is read first, and a planned time is not written as a condition met. | owner, 2026-11-25: the execution instruction, drafted by the advisor and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A74 | Q13: a bounded signed delegation, with the direct entry kept. The next version of the ledger gets a bounded delegation signed by the account (route A), designed and implemented locally. The account's own `execute` stays a legitimate, compatible entry and is not described as infeasible at the level of the contracts. Generating a limited authorization on the host where the original key is, with a reviewed one-time script at a pinned version, is accepted in principle; it is not an export of a cell's key to a second worker. The script, the format of the authorization, the local tests and the operating notes are done now. A live key is used only when the new ledger's identity, the readable typed data, the digest and the exact authority are fixed and have been reviewed as a concrete operation package; no broad permit is signed for a ledger that is not known. Seven conditions: (1) a permit binds the chain, the ledger, the account, the delegate, the operations, the validity and an authorization version or nonce; G0 submission and tender confirmation are named separately; it gives no arbitrary execution, no transfer or approval of assets and no further delegation. (2) The original key enters no command line, log, archive, copy or worker configuration; the signing process sends no transaction and takes over no nonce of a running service; everyday operation uses the separate delegate key only. (3) A single permit can be revoked or an authorization version invalidated, and a revoked permit cannot be restored by registering it again. (4) The effect of a change of owner or operator is stated and verified: a signature that was checked once at registration cannot be said to follow the account's ownership. (5) A delegation does not, by default, go around the cell's safety suspension and its AID rules for the operation: a successful ERC-1271 check of the owner is not those checks, the consumer has an explicit guard, and the paths that revoke and invalidate stay usable. (6) What is specific to FOGA sits in a separate, optional policy or adapter; the kernel names no address of FOGA or of Finchain. (7) Participant, sender and gas payer are recorded apart, with the run that initiated the work; an owner's authorization of a delegate does not show that the agent's runtime initiated the work, or who ran a model. The local tests cover a wrong domain, an excess of authority, replay, expiry, revocation, a rotation of the owner, a safety suspension, a repeated submission, an unknown answer of the endpoint and recovery after a restart. Replacing the operator slot is not the default shortcut; if it is ever chosen, its effect on the running service, on authority and on recovery is stated separately. | owner, 2026-11-25: the execution instruction, drafted by the advisor and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A75 | Q14 and Q16: one minimal, complete new version of the ledger, on which round R2b runs. The deployment of round R2a and all of its evidence are kept, and a versioned manifest links the two. (a) The operator cap: per epoch and pool, the operator's aggregate share is computed and capped first and then divided among its addresses in proportion to their eligible GMU, the address cap being kept where it is needed; integers round down, and what rounding and the caps leave is not allocated again. The attribution of an address to an operator is fixed, for its epoch, when the contribution is accrued: a later reorganization changes no past allocation, and an old epoch is never read with the present declaration. The early subsidy of the new version requires a declared operator; an undeclared participant keeps measured GMU where the confirmation is rightful and the other conditions of measurement hold, and has no subsidy-eligible GMU. That is a condition of the early subsidy and no rule of admission to the network. It is said that the cap on the aggregate does not remove every gain from several addresses; operator-level GMU caps, or counters per demander and per pair at the level of the operator, are a separate enhancement and no part of the meaning of A35. The percentages, the budget and the epoch parameters of a test are configuration, and the example values of round R2a do not become permanent. (b) Work facts and receipts, as adopted with P60 and Q26: a fact takes no contribution id, content key, cap or GMU; a confirmation needs no fact and is not hindered by one that a third party recorded first; a confirmation does the checks of rightfulness, the test and the taking of the content key, the recording of the receipt and the accrual in one transaction; the same source again is idempotent, and another source with the same controlled task is not measured twice. The adopted fields - role, work id, parent, envelope commitment, content key - are kept, with their encoding and version stated. A frozen epoch is not rewritten. (c) The authority at settlement: rounds R2b and R3 stay within test points that cannot be redeemed and keep, disclosed, the limit of A38. Before any PoUW subsidy of value a complete mechanism for the history of authority and its evidence is required; the direction to study first is that the evidence is verified before a formal receipt exists, and recording contributions first and deciding rewards later needs a reward settlement layer designed on its own. A deduction in the next epoch after a later verification is not put into a receipt that cannot change or into an epoch that is frozen. A customer's bounty and a PoUW subsidy stay apart, and neither is made a precondition of the other. | owner, 2026-11-25: the execution instruction, drafted by the advisor and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A76 | Q15, and the client's audit. Round R2b keeps the independent recomputation on a hosted runner that holds no participant key. A second endpoint and a second implementation are enhancements, each named with its own value and scope; they do not reopen round R2a. The client's logs and all of its reads of state are fixed to one finalized block; that block's number, hash and timestamp are recorded; the close record and the events are verified within that cutoff; the block's time and the time of the actual observation are recorded apart. This work proceeds now, and the part that depends on the new interfaces is connected when they are fixed. | owner, 2026-11-25: the execution instruction, drafted by the advisor and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A77 | The six choices on the open points of the design of ledger v2, and the six corrections of its first revision (14.2). O1: for both delegated operations the guard for FOGA cells requires a satisfied safety verdict and, where an AID registry exists, an ACTIVE anchor, together with the completeness of the presented bindings or an equivalent proof for a fixed registry. O2: the steward binds a guard and the permit confirms it as well, with a binding version that only rises, so that a rebinding from A to B and back to A does not restore an old permit. O3: a new condition of the early G1 subsidy - worker and demander both have a declared operator; work that does not meet it keeps its rightful measured record and has no subsidized GMU; the condition is not widened into a rule of admission or a proof of independence, and no condition on the judge is added with it. O4: the origin may be recorded in an event, as the top-level sender of the transaction only; nobody is thereby held to have borne the fee. O5: the audit at one pinned finalized block is built at once, as already required, without a silent fallback to the latest block. O6: the names stand in principle; the interfaces and the typed statements are fixed with the revised fields and meanings. The corrections, to be completed before the interfaces are frozen: (1) no general promise that a rotation of the owner ends an old permit at once - a check at each use shows only that the account accepts the signature now - with a test of the counter-example in which the former owner stays a signing operator, and the procedure of revocation, minimum nonce and rotation stated; (2) revocation in the namespace of an account, the typed `Revoke` and `RaiseNonce` statements written out with their domain, and a test of revocation under suspension that names the path it uses: that the ledger asks no guard is not that FOGA's `execute` can be called; (3) the G1 adapter verifies the delegate against its own real caller and the permit's account against the tender's owner; no caller states a sender, and the origin takes no part in authorization; (4) the `duplicateOf` field and the zero pointer of `not-a-task-unit`; one occupancy of a controlled content key per ledger, across profiles, specifications and epochs, taken by the first rightful measured receipt even when it draws no subsidy, and never by an invalid fixture, a wrong demander, a fragment of a task or a public fact; (5) a narrower statement of what the audit of a past authority shows - the registered authority that the events make visible apart from the actual executor of a verification - with `unknown` or `evidence-insufficient` recorded where it cannot be determined, the complete proof of history before any subsidy of value staying in its stage; (6) the zero denominators, the relation of the cap parameters, the meaning of a zero in the query of the operator history, the precedence of the reasons, the key of a G0 instance and the encoding of the report hash. | owner, 2026-11-25: the choices and corrections, drafted by the advisor in its walk-through of revision 1 and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A78 | The five closing corrections, and the baseline of the implementation. Revision 2 of the design is the baseline of the local implementation. The main directions are not opened again; code and tests proceed; the complete interfaces are fixed when the closing items are done, and no round of text alone comes first. (1) Ending an old permit is told from taking away an old key's signing authority. A former owner that is still a signing operator can sign a new permit that meets a raised minimum nonce. Where the aim is that the old key leaves PoUW authorization, its signing right is first taken away with the account's own management functions; then the old permits are dealt with, and it is verified that the old key cannot sign a usable new permit. Both cases are in the tests: raising the nonce alone still allows a new permit, and after the signing right is taken away a new permit is refused. (2) The wording on `execute` under a suspension is narrowed: FOGA has a de-risk path that passes when its conditions hold, and the local check showed a refusal for one test configuration and one target call, not for every target. The signed revocation, the signed raising of the nonce and the delegate's renouncing stay as designed, with the note that a signed path depends on the account accepting the signature at that time. A local reproduction of the on-chain configuration is not recorded as a transfer of ownership of a deployed cell. (3) Before the interfaces are frozen: `FactData`, `G1Extra`, `Receipt`, `Status` and `Profile` in full, the necessary events and errors, the guard's binding in force and pending, the exact encoding of the ledger's and the facts' domains; the complete typed statements `Permit`, `Revoke` and `RaiseNonce`, the compiled interfaces, and fixed test vectors on which the contract and the off-line signing agree. A binding version is not reused when a binding is changed again for the same epoch that has not begun. (4) The complete canonical encoding of a report is fixed, RFC 8785 being advised, with large integers kept exact from the read on, by schema. Row L35 compares one report body recomputed by two implementations; two runs with different times of observation have different hashes of the whole report, and that is as it should be. (5) The audit of a past authority judges a change by the same source, the same token and the acceptance's transaction; it keeps the registered address that the events show apart from the state of the evidence for the actual verifier, and records `evidence-insufficient` where that cannot be shown. The next delivery, on the base of commit `16d8bb6`: the local implementation, the complete interfaces with their encodings, the actual results of the 35 rows of the test matrix, the client's audit at one pinned block and a reviewable difference; the account check and the ledger's tests, which have not run, are recorded apart and neither stands in for the other. How an adoption is recorded: on the owner's explicit statement, with its actual source, the date of sending and the scope of the adoption; never on the ground that the owner did not object. | owner, explicit statement of 2026-11-25 (14.1); the five corrections drafted by the advisor in its review of revision 2 |
| A79 | Work that proceeds in parallel and is no precondition of the ledger. (a) The independent components of the first production increment start without a further confirmation, Q17 to Q29 being adopted: the structured-extraction specification, its instruction, output schema, canonicalization rule and fixture set; the format, grounding and reference checks, reported apart; the metering interface, the evidence envelope and the off-line recount; local copies of the schemas of the pinned ERC-8506 revision, with the validation of concrete records; the operating report and the reconciliation of prepaid service credit. The model, the tokenizer, the template and the serving configuration are pinned when they are actually chosen; what is not pinned yet is an interface and a statement of candidates, and no count or execution evidence is invented. Fixed GMU, qualified service units, model usage, the customer's payment and the actual cost stay apart. (b) Two discussion drafts are started: a plan for the replication of nodes and for the first operators, and a framework for platform Tokenomics with its points for ruling. Both are design and simulation; the ruling on token parameters, the implementation, the deployment and any issuance stay steps of their own. The figures of their scenarios remain assumptions and are no approved places, prices, configurations or rights; historical test points stay unredeemable, and no promise of a later exchange is added. Replication creates new identities and copies neither a chain-administration or sequencer right nor an existing cell's key. Neither draft is a precondition of the ledger's implementation. (c) Finchain, FOGA and this repository stay separate; the three repositories stay public; credentials, personal configuration and customers' private data stay apart. | owner, 2026-11-25: the execution instruction, drafted by the advisor and sent by the owner; his ruling by his explicit statement of the same day (14.1) |
| A80 | The review of the local implementation of ledger v2 (release 0.1.4, commit `b3e07df`). Its main technical review is passed, with three corrections of tools still to be closed (A84). The advisor ran the 131 tests and the rehearsal of 41 checks again on its own, and found the five new compiled interfaces equal to a fresh compilation (15.2). `main` is at `b3e07df` and its whole tree is the delivery; the next delivery has that commit as its base, and the package of 52 files is not uploaded again. The main directions of the design are not opened again. The tests that pass are evidence of a local implementation and are not recorded as an acceptance of round R2b. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A81 | Q30: the interfaces of ledger v2 are frozen - the interfaces of the contracts, the complete types, the encodings of the three signed statements and the fixed vectors, as they stand at commit `b3e07df`. The freezing of the interfaces and the finalizing of the deployable bytecode are recorded apart: the first is done by this ruling, the second waits for A82. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A82 | Q31 and P66: the v2 ledger is built through the compiler's IR pipeline. The results of the tests and of the size with solc 0.8.24 are kept, and that build is not taken as the final build of a deployment. The v2 contracts get a compile boundary of their own. solc 0.8.39 is verified first and then locked; the check of the official list of known bugs, the compiler's complete version and its settings are recorded; the existing v2 tests, the fixed vectors and the size gate are run again, and then the build is made. The kernel's compile boundary and its six committed builds are not touched, the compiler is not replaced for the whole repository, and no release of Finchain or of FOGA is required. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A83 | P61 to P65. P61 is adopted as the interface for task units; the module that actually shows membership and the issuer is delivered in its later scope. P62 is adopted as the rule of bounded checks of the local implementation; the behaviour of real cells and the gas margin are measured in the step already set for it. P63 is adopted with its semantics corrected: a statement can be submitted once it is signed, and the state of the ledger changes when the transaction succeeds; a signed entry verifies the present authority every time, and a repeat is idempotent only after that check has passed. P64 is adopted once the two corrections of input handling of A84 are made. P65 is adopted for the recovery of a transaction that is already recorded. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A84 | Three corrections of tools, delivered first and as a small delta. (1) `scripts/sign-permit.js`: `--out` creates its file exclusively and refuses to overwrite a file that exists. Regressions cover the same path, an output that exists, a symbolic link and a hard-link alias, and show that the bytes of the input key are unchanged after the refusal; a new output path succeeds as before. (2) `client/lib/canonical.js` refuses an array with an empty slot explicitly; `scripts/report-hash.py` refuses a JSON key given twice, nested objects included; a regression for each. (3) The wording of P63 is made exact (A83), and leftovers of wording are corrected with it, among them that a public fact is not made automatically. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A85 | The hosted run of the existing workflow, started by hand once the small delta is uploaded and checked: manifest `deployments/finchain-sepolia-r2.json`, epochs `0 1`. It is recorded as the new client's verification of the existing deployment, on a public endpoint and with an audit at a pinned block. The commit, the link of the run, the exit results and the reports are kept. Each report records its own snapshot as it was. Round R2a is not reopened and its original evidence is not changed. The run does not wait for the build of v2. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |
| A86 | The next delivery, and what stays. Its main line is the reproducible build of v2 with the deployment tooling, the client for v2 with its audit, and the run record. The production module and the two discussion drafts proceed in parallel. A signature with a real key, a deployment and an operation on a chain continue to follow their own operation packages. Finchain, FOGA and this repository stay independent. | owner, explicit statement of 2026-11-25, 04:22 UTC+8 (15.1); the points drafted by the advisor in its review of the implementation |

### 1.1 Review and authorized follow-up records

A71 and A72 retain their identifiers for existing references. They classify advisor reviews
and owner-authorized document/evidence follow-up; they are not additional owner rulings on
open design choices. Their former placement in the Approved table did not adopt those choices.
The subsequent R2a technical acceptance is recorded separately in section 6.11.

| Id | Review and follow-up record | Source |
| --- | --- | --- |
| A71 | The review of design revision v0.1.7, and the consolidated documents of v0.1.8. The review accepts v0.1.7 and closes three matters of the round before: the fallback of the runbook of round R2a, as it is written; the rightful delegate of a named demander, in the plan and in row S25; the budget that fees belong to, as rule 12 of `supply-and-payment.md` 4.3 with row F26. It finds that the record kept the review's acceptance apart from the owner's adoption. Its principle for what follows: a matter that is still open holds up the work that depends on it and no other - Q13 to Q29 are not one gate for all later work, a necessary upgrade of the ledger does not wait for every production field, and the providers of the second increment are chosen when it opens. At the owner's request the advisor then wrote the consolidated documents of v0.1.8: the nine documents, with the executor's v0.1.8 and the remaining clarifications, as one set. The owner relayed them with the instruction to walk through, take in and update; the executor checked the nine files against the advisor's checksums and took them as the repository's documents (6.9). | review of design revision v0.1.7 and the advisor's consolidated documents, relayed by the owner with the instruction to walk through, take in and update, 2026-11-24 |
| A72 | The review of the run of round R2a, and what closes the round. The review rebuilt the host's two record archives from the text they were sent as and found their hashes and the manifest's as stated; found the five builds of the deployment record to be the committed ones; and recomputed both epochs' totals, caps and allocations from the receipts: they are as reported. It supports the manifest as the input of the hosted audit and finds nothing in the kernel that has to be done again. One matter is to be closed with evidence. An audit of release 0.1.3 reads the receipts up to the finalized block and the `sealed` flag at the latest block, so that a report whose finalized block is before a close record does not show that the close record is final. The figures are not in question: an epoch that has ended cannot change, and a close record changes no figure. The round is closed on conditions read from the chain and not on an estimate of time: (1) the finalized block the hosted audit reads up to is not before the close record's block; (2) that block's number, hash and time are on record; (3) so are the receipt of the close transaction and the `EpochSealed` event of the right ledger, with the receipt's block hash equal to the chain's and its block within the finalized block read; (4) the same for epoch 0. An earlier report stays as it was made, with the mixed reading said. The hosted run passes when both of its jobs succeeded - an artifact is also uploaded by a job that failed - its `run.json` names the repository, the commit, the manifest and the epochs, its deployment check and both audits say `ok` for the right chain and ledger, the reports agree with the host's in full, and the table hashes are equal; a table hash covers the workers' addresses and their allocations and nothing else. What the round then establishes, and no more: the kernel ran both parameter modes on Finchain Sepolia as a controlled self-test of one operator's wallets, and another environment, with the same reference client and the same public endpoint, checked the deployed code and wiring and recomputed the finalized history. The deployment check reads at the latest block and is described so. Recording the block and the source of each read is for the next version of the client. What the review names as next, once the round is closed: to converge Q13, Q14 and the rest of Q16, the parts of the first production increment that need no new ledger going on beside that. That is an order of work it recommends, and it rules on none of those questions. | review of the run of round R2a, relayed by the owner for the executor to go through, 2026-11-24 |

The rulings of the reviews and of the alignment are recorded here in condensed form from the
owner's relay of them. A review's own text governs wherever a wording here falls short of it, and
for A40-A54 the two aligned documents do: `architecture.md`, and `genesis-mining-mvp.md` 14 and
15. A55-A62 and A64 condense what the review of design revision v0.1.4 required, A65-A67 the
review of v0.1.5 and A68-A69 the review of v0.1.6, each with the owner's instruction on it. What
a review recommends on an open question is not in this table: it is with its question in section
12 until the owner adopts it (A66). A70 is such an adoption, and so are A73 to A79, of
2026-11-25: who drafted and who sent each of them, and the statement of the owner on which they
rest, are in 14.1. It rests on the owner's own
statement, and the recommendations it adopts stay worded with their questions (12.2). A71
condenses the review of v0.1.7 and says where the consolidated documents of v0.1.8 came from;
A72 condenses the review of the run of round R2a. The owner relayed that review for the executor
to go through, and himself made the second hosted run and the close evidence that it asks for.
Neither entry records the later R2a acceptance; that outcome is in section 6.11. Their
classification does not change A70 or reopen the production choices it adopted.

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
dependencies could not be installed in the reviewer's environment in time. Since v0.1.3 the tests
and the rehearsal can be run on a hosted runner, from a clean checkout, by starting one job
(`.github/workflows/ci.yml`), so that a reader does not depend on an installation of their own.
The workflow first ran on a hosted runner on 2026-11-24: run ci #2,
`https://github.com/garyyang-finchip/finchain-pouw/actions/runs/45353665914`, on commit
`fa765af13f16f2f2b024a2576f665c9b8785ba7e`, status success. Its `test` job ran `npm test` and the
rehearsal from a clean checkout; the rehearsal's record is
`evidence/local-run-20261124T081042Z.json`, 37 checks. Run ci #3 repeated it on the same commit,
also with success. A ci #1 is listed as failed: it belongs to the commit in which the workflow
file was created empty, and an empty workflow file has no job to run (`evidence/r2a/README.md`
7).

### 3.1 The rulings

| Ruling | Applied as | Where |
| --- | --- | --- |
| A31 | No contract was rebuilt. The six deployable contracts compile to the code of v0.1.2, the metadata hash aside: two comments changed (A38), and the interfaces are identical. What is new is the tooling of round R2 | `build/`; section 9 |
| A32 | P19 to P31 are in force by ruling, with the notes of the ruling | section 8 |
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

As the plans stand after the reviews of v0.1.4 and of v0.1.5 (sections 5 and 6), which corrected
how A47, A48, A50 and A54 were applied.

| Ruling | Applied as | Where |
| --- | --- | --- |
| A40, A45 | The first production profile is planned as one bounded task class with published checks, procured through ERC-8414 by a designated test demander, with its usage recorded by category | `production-service.md` 1 to 5 |
| A41, A42 | The stage names and the three dimensions are used as delivered, everywhere. The stage numbering of A17 is replaced in its wording; its compatibility of forms stands. Each dimension is recorded in a place of its own | `architecture.md` 1.2, 1.3; `supply-and-payment.md` 2; A17 |
| A43, A44 | Recorded; nothing built. The plans name which role each party of the first increment performs | `architecture.md` 2.2, 2.3; `production-service.md` 8 |
| A46 | The envelope's groups are filled in for the first profile; the evidence class of every claim is stated with what it does not establish; three availability cases are told apart | `production-service.md` 4, 6 |
| A47 | The kernel's formula and every recorded figure stay. The first increment keeps a fixed GMU for each task unit that is delivered, accepted and counted, and records qualified units beside it for observation and recomputation - not as a SIG calibration (P45, A57; Q20) | `genesis-mining-mvp.md` 6; `production-service.md` 5, 7 |
| A48, A49 | Roles, parent and child work and the deduplication key - the content key by which a profile counts a task unit once (P55) - are designed into the receipt of the next ledger version (P50); the operating report is specified (P49) | `production-service.md` 7, 8; `supply-and-payment.md` 8 |
| A50, A52 | One purchase record, shared by the manual and the agent routes, whose three parts - payment, service credit, adjustments - keep the six state meanings apart (A58, P56); the failure rows with the handling proposed | `supply-and-payment.md` 3 to 6 |
| A51 | The native-asset rule stays. A design for listed assets is kept as a later adaptation and is in no increment yet | `supply-and-payment.md` 7, 9 |
| A53 | Round R2 and its documents are untouched: nothing of its tooling, configuration or runbook changed in v0.1.4. The production work is planned as increments beside the rounds (P51) | `roadmap.md` 7 to 9 |
| A54 | Deliverable A: this record, the architecture, the roadmap. B: `production-service.md`. C: `supply-and-payment.md`. D: the staged matrix. The fourteen proposed checks carry identifiers and are marked proposed and not run. The milestone is reached through acceptances that are evidenced one by one and is closed by one linked chain of evidence (A59, P58) | `acceptance-matrix.md` 11 to 14; `roadmap.md` 8 |

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

## 5. The review of design revision v0.1.4, and how it is applied

The owner relayed the advisor's review of design revision v0.1.4: the documents of the alignment
as this repository merged and extended them. Its verdict is A55; its corrections are A56 to A62;
it puts a condition on an older question, A64; and it gives the advisor's recommendations on the
eight questions of v0.1.4 (5.3). Design revision v0.1.5 applied the corrections, in documents
only. It also entered the recommendations as approved, under A63; that entry is withdrawn (A66,
section 6).

### 5.1 What the review checked, and what it did not

It compared the package of v0.1.4 with the two aligned documents and with what this repository
had said of it: the hash of the package; eight Markdown files and no contract, client, script,
configuration or runbook among them; the architecture and sections 14 and 15 of the specification
merged without loss, the differences being pointers and the note on the baseline's counts; the
design revision told apart from the software release; every new acceptance marked proposed and
not run. It did not hold the tree of this repository as it was before the package: that the
package applied to that tree gives the tree of v0.1.4 remains this repository's own verification.
It ran no code and contacted no node. These limits are the review's own statement.

### 5.2 The rulings

| Ruling | Applied as | Where |
| --- | --- | --- |
| A55 | Round R2a and everything it runs from are untouched. The corrections are made in the documents; the new rows of the matrix are proposed and not run; nothing of the next ledger version or of the production line is built | v0.1.5; `roadmap.md` |
| A56 | The usage records are `input_tokens`, `cached_input_tokens` and `generated_tokens`. The delivered text and the canonical result are kept, each with its hash; `canonical_delivery_tokens` is the count of the canonical result and is stated as a part of no other count. The formula is in integers, with `weightScale` 1,000,000 and one division rounded down; a measurement version fixes the scale, the weights, the limits, the counter, the template, the canonicalization rule and the rounding | `production-service.md` 5; rows S6, S15, S16 |
| A57 | Three identities: a request id fixed before the first attempt, the work id of an order on chain, and a content key (P54). The task units of profile version 1 are the members of a fixture set committed by one root; a task unit counts once; a later accepted delivery of the same content is recorded as a duplicate and adds no units, no GMU and no eligibility; a part of a fixture is not a task unit; the scope belongs to this profile version and is not inherited (P55). What the rules do not identify is said beside them | `production-service.md` 2, 4.1, 7; rows S5, S17 to S21 |
| A58 | A purchase record has three parts - payment, service credit, adjustments - and the six meanings of A50 stay apart across them; what "settled" means is tabled per channel, with the channel's own state kept (P56). The budget book and its rules of reservation, for the second increment (P57). The report has lines for prepaid credit, reconciles them exactly and counts one movement of money once; its example is corrected | `supply-and-payment.md` 3, 4, 6, 8; rows F4, F17 to F22 |
| A59 | The first increment is the controlled fixtures, and its acceptance is the mechanism. Three further acceptances follow, each with evidence of its own: a FOGA cell taking part, a supplier that is not the operator's, a customer's own request. The customer's own request comes after the first increment and needs a later version of the profile. When the milestone of A54 is met is proposed (P58, Q27). The wording on what one customer shows is corrected | `roadmap.md` 8; `production-service.md` 10, 11; `acceptance-matrix.md` 11, 14 |
| A60 | The sentence is replaced: an agent that buys is a customer, and the supplier's qualified service to it is a delivery; the agent's own thinking is not a further one | `production-service.md` 8; row S14 |
| A61 | The pin - the repository, the commit, the hash of the specification and of four schema files, the sections used - and the mapping, which says for each record what is claimed: a conformant Unit and a conformant Grade; from the Source and the Receipt a vocabulary and the format of two members, and not those records (P59). The wording on the dependency is corrected wherever it stood | `production-service.md` 4.2; `roadmap.md` 1, 6; `architecture.md` 3.2 |
| A62 | (a) The table compares forms of supply and names the segment in which each first appears. (b) Tokenomics has a row of its own beside the stages, with no stage attached. (c) The wording on the hosted run, in four places. (d) The order: a policy, its implementation, then parameters. (e) One mechanism of x402 as an example, the adapter's pin, the same chain or another | `production-service.md` 9; `roadmap.md` 2, 7; section 3, `acceptance-matrix.md`, `README.md`; `supply-and-payment.md` 9 |
| A63 (withdrawn) | The recommendations are recorded in 5.3 and with their questions. The plans follow them as proposals; Q17 to Q24 stay open until the owner adopts them | 5.3; section 12 |
| A64 | A design that keeps the facts of the work apart from the receipt is proposed for the ruling (P60) and put with the questions on the next ledger version (Q26). The kept design 13.7 points to it | `genesis-mining-mvp.md` 13.7; row D18 |

### 5.3 The advisor's recommendations on the eight questions of v0.1.4

Recorded as the advisor gave them (A66); the review of v0.1.5 maintains each of them. The owner
adopted them on 2026-11-24 (A70), and the plans carry them out in the places named.

| Question | The advisor's recommendation | Where the plans follow it |
| --- | --- | --- |
| Q17 The task class of the first production profile and its three checks (P42) | Agree, as the first controlled profile. Format, grounding and reference each keep the boundary of what they verify | `production-service.md` 2 |
| Q18 The record formats of ERC-8506 (P43) | Agree on a condition: the source, the pinned version and the mapping of the fields are stated, and the dependency is said to be on the specification only (A61) | P59; `production-service.md` 4.2 |
| Q19 Published weights and a public tokenizer; the model chosen at the build round (P44) | Agree. The model, the tokenizer, the template and the serving configuration are all pinned by version. A specification for the provider a FOGA node calls may be registered separately | `production-service.md` 3 |
| Q20 A fixed GMU first (P45) | Agree. First the scale of the measurement, the deduplication of requests and the boundary of a task unit are fixed (A56, A57). Service units serve observation and recomputation and are not presented as a completed SIG calibration | `production-service.md` 5, 7 |
| Q21 Public controlled fixtures (P47) | Agree. Content, versions, commitments, the procedure of the re-check and the statement of availability are published together | `production-service.md` 4.3 |
| Q22 One version of the next ledger with the production fields (P50) | One design is preferred. The rules of authorization and of receipt state of Q13 and Q16 converge first, and a necessary upgrade of the ledger is not held back while the production design is incomplete. With it, the condition of A64 | section 12, Q26; `roadmap.md` 5 |
| Q23 The increments beside rounds R2b and R3; the third party as the first customer (P51) | Agree, once the scope of the first increment and the milestone of A54 no longer conflict (A59). A third party may also be the customer; each piece of evidence says which role it had: supply, purchase or audit | `roadmap.md` 8, 9 |
| Q24 The providers of the second increment (P48) | Agree: chosen when it opens. Fixed now: the capability interface, the authorization, the budget, the idempotency and the reconciliation. No provider is presumed to support a top-up without a person | `supply-and-payment.md` 3, 4.3 |

Q9-Q12 are not reopened. Q13-Q16 are approved neither by the merge of the documents nor by this
review, and stay open (section 12); the second item of Q16 has since been settled with Q26 (A70).

### 5.4 Corrections the review required

| What v0.1.4 said | Correction |
| --- | --- |
| `production-service.md` 5: `output_delivered` is "included in `output_generated`" | Not so: a canonical result is counted in its own right, and nothing makes it a part of the stream that was generated (A56) |
| The same section: the units are a weighted sum "/ 1,000,000", beside an example that uses the weights 0.25 and 1 | The formula and the example differed by a scale that was never defined; as written, the example rounds down to zero. Weights of 250,000 and 1,000,000 over a `weightScale` of 1,000,000 give its 1,810 (A56) |
| The same document, 4, 5 and 7, and matrix row S5: a repeated request has no units; every accepted delivery has the fixed GMU; the work id contains the tender and the submission | Together they left a gap: the same request issued again as another tender has another work id, and nothing said that it earns no second fixed GMU (A57) |
| `supply-and-payment.md` 3 and 4: a purchase has one `state`; "Settlement is money leaving the payer" | Three records; and settlement by the rule of the channel (A58) |
| The same document, 5: the worker checks that the policy has room, and buys | For a purchase by an agent the room is a reservation, made atomically (A58) |
| The same document, 8: 5.00 bought, 0.41 and 0.07 consumed, and no line for what is left | Lines for prepaid credit, and the reconciliation (A58) |
| `roadmap.md` 8: a customer's own task as the third acceptance of the first increment, met by "a customer ... or a supplier"; `production-service.md` 10: customers' own tasks left out of the first increment | The two contradicted each other, and a supplier stood in for a customer. Four acceptances, each evidenced on its own (A59) |
| `roadmap.md` 8: "commercial demand: one party is one party"; `acceptance-matrix.md` 14: "commercial demand, from one customer" | One independent customer that pays with real funds proves that one independent paid demand, and no more (A59) |
| `production-service.md` 8: an agent's own use of a model "has no buyer and no acceptance of its own" | True of its thinking only. An agent that buys is a buyer (A60) |
| `production-service.md` 4, `roadmap.md` 1 and 6, and the suggestion under Q18: the first increment adds "no contract and no dependency" | No contract and no runtime dependency; a dependency on a pinned specification (A61) |
| `production-service.md` 9: a table of supply headed Startup, Development, Pre-expansion | Forms of supply, with the segment in which each first appears (A62) |
| `roadmap.md` 7: "An autonomous operating economy; FCT", first needed in Stage 3 | Two rows: the economy of Maturity; and Tokenomics as a ruling of its own, tied to no stage (A62) |
| Section 3 of this document, the matrix, the roadmap and the README: the tests are run on a hosted runner "for each version" | The workflow is in place and its first hosted run is pending (A62) |
| `supply-and-payment.md` 9: "The kernel's rule stays until a new policy replaces it", followed by a parameter version that lists assets | A policy, its implementation, and only then parameters (A62) |
| The same section: payments by x402 "are usually made on another chain" | On the same chain or on another supported one; the mechanism described is one example, and an adapter pins its own (A62) |

## 6. The reviews of v0.1.5 to v0.1.7, the adoption, and the review of the run of round R2a

The owner relayed the advisor's review of design revision v0.1.5 with the instruction to carry
out what it asks. Its verdict and the scope of the revision that applied it, v0.1.6, are A65; the
correction of a decision status is A66; the owner's own note on ERC-8506 is A67. On Q25 to Q29 it
gives the advisor's recommendations, which are recorded with the questions (section 12) and are
not approvals. Design revision v0.1.6 changed documents only (6.1 to 6.3).

The owner then relayed the review of v0.1.6 and asked for the update. That review accepts v0.1.6
(A68) and makes the running of round R2a exact (A69). Design revision v0.1.7 applies it, again in
documents only (6.4 to 6.6).

On the same day the owner adopted the advisor's recommendations on Q17 to Q29 (A70). Design
revision v0.1.8 records the adoption, in documents only (6.7).

The advisor's review of v0.1.7 and the consolidated documents of v0.1.8 followed (A71; 6.8 and
6.9). Round R2a was then run and its run reviewed (A72; 6.10). Design revision v0.1.9 records
both, with the records of the round under `evidence/r2a/`.

### 6.1 What the review checked, and what it did not

It took the package of v0.1.5 and found the hash this repository had stated; eight Markdown
files, each replacing an existing one; LF line ends, no other language and no attribution. It
fetched the eight documents of the baseline from GitHub itself and found them identical, byte for
byte, to the v0.1.4 it had reviewed. It fetched the pinned commit of ERC-8506 itself - the
specification and the four schema files - and found all five hashes as pinned. It did not check
the whole tree of this repository: that the baseline with the package gives the tree of v0.1.5,
file for file, remains this repository's own verification. It did not run the tests: that they
pass is this repository's result. These limits are the review's own statement.

What it found repaired in v0.1.5, and closes: the count of the canonical result apart from the
generated tokens; the fixed-point formula and its example; duplicates that add no units, no GMU
and no eligibility; payment, credit and adjustments recorded apart; the budget reserved
atomically and held while a payment is unknown; the prepaid credit reconciled in the report; the
acceptances evidenced one by one; an agent as a buyer; Tokenomics tied to no stage; the wording
on the hosted run; and the order policy, implementation, parameters for other assets.

### 6.2 The rulings

| Ruling | Applied as | Where |
| --- | --- | --- |
| A65 | Round R2a is untouched. The matters the review names are written out in the plans and in the kept design 13.7 (6.3); every new row of the matrix is proposed and not run; nothing is built | v0.1.6 |
| A66 | A63 is withdrawn and its id is kept unused. The recommendations on Q17 to Q24 stand beside their questions under the words "advisor recommendation recorded; owner adoption pending"; the proposals that v0.1.5 marked confirmed are marked recommended; wherever a document cited A63 it cites the question. What a recommendation is, is said at the head of this document. The recommendations of this review on Q25 to Q29 are recorded in the same way | the head of this document; 5.3; sections 10 and 12; `production-service.md`, `supply-and-payment.md`, `roadmap.md` |
| A67 | The pin names the owner's repository and a commit, and depends neither on the standard's status nor on its being merged into the EIP repository. The schema files are copied here when the increment is built, and no build, test or run fetches the standard. The envelope, the task description and the rules of the plan are this protocol's own | `production-service.md` 4.2; `roadmap.md` 6; row S26 |

### 6.3 The conventions the review asked to have written exactly

Each is part of a proposal (section 11) and of a recommendation (section 12), which the owner
has since adopted (A70).

| Matter | What v0.1.5 left open | Written as | Where |
| --- | --- | --- | --- |
| Which delivery takes the one counting of a content key (Q25) | "The first accepted delivery" - but a receipt exists only when the demander confirms, so acceptance on the tender and confirmation on the ledger can come in different orders | The first rightful confirmation that the ledger records takes the counting, in the transaction that records its receipt; the order of acceptance does not decide. It is a rule that one contract can carry out with certainty, and is said not to be a reward for finishing first; protecting the earliest settlement would be another rule. Binding an answer to its worker before it is public is a separate requirement, and both are built | `production-service.md` 7; rows S22, S23, S25 |
| What a content key is made of (Q25) | "The commitment to the input": the document alone, the document with its instruction and schema, or the input as one model's template wraps it | The hash of a canonical task description: task class, instruction, schema, document. The same document under another instruction or schema is another task. The model, its template, its tokenizer and the limits never enter the key, and neither do the worker, the demander, the tender, the request or the epoch | `production-service.md` 2, 4.1; rows S18, S24 |
| The attempts inside a purchase (Q28) | `purchaseId` one to one with the channel's identifier; `failed` final; a retry under the same `purchaseId`: three statements that real payments cannot satisfy together | Three levels: the purchase as an intent, the attempt, and the attempt's record on its channel. An unknown result is reconciled or sent again as the same attempt; a new attempt only after a definite failure, with the budget tested again; at most one payment settles, and what failed attempts cost is cost. At a start every reservation that is not finished is taken up, a purchase still showing `authorized` included | `supply-and-payment.md` 3, 4, 4.3, 6; rows F21, F23 to F25 |
| The evidence that closes A54 (Q27) | Acceptances that could each be met without the parts ever having worked together | Besides the acceptances, at least one chain of business evidence joined by request and work ids or by parent and child: the external customer's request, the cell, the delivery, the re-check, the payment, the GMU record, the cost | `roadmap.md` 8; row L1 |
| Work facts and receipts (Q26) | That a fact "does not take the contribution id" said nothing of a fact's own identity, of the content key, or of how a confirmation finds the same work | A table of the two records. A fact has a stable id and is recorded once; it consumes nothing a reward depends on, the production content key included; a confirmation is linked by the work's source, needs no fact and is not blocked by one. The trade-off is stated: without the demander's confirmation the work is in no epoch's GMU | `genesis-mining-mvp.md` 13.7; rows D18 to D21 |

Two things the review asks to keep as they are. Counting a fixture once is the reward policy of
a finite set, and says nothing against the value of a second service of the same content. And
the records of ERC-8506 are validated when they exist: what is established now is the source of
the pin, and that the mapping can hold (Q29).

### 6.4 The review of v0.1.6: what it checked, and what it closes

The owner relayed the advisor's review of design revision v0.1.6 and asked for the update at once
(A68). The review took the package and found the hash this repository had stated, eight files
that all replace existing ones, and no change to the software: `package.json` still says 0.1.3,
and no contract, client, script, configuration or runbook was in the package. It compared the
eight documents of the baseline on GitHub with v0.1.5 and found them the same. It read the
contract, the configuration, the round script, the client and the runbook as sources. It did not
run the tests, ran no command on a node, read no wallet and sent no transaction; that the tests
pass is this repository's result. These limits are the review's own statement.

It closes the main findings of the review of v0.1.5, each as v0.1.6 wrote it: the record of
recommendations apart from approvals (A66); who takes the one counting of a content key, and what
the key is made of; work facts apart from receipts; the attempts inside a purchase and the
recovery of a crash; the linked chain of evidence that closes A54; the light dependency on
ERC-8506 and the validation of its records at the build. On Q25 to Q29 its support was a
recommendation, which the owner has since adopted (A70; 12.2).

### 6.5 The rulings of the review of v0.1.6

| Ruling | Applied as | Where |
| --- | --- | --- |
| A68 | Design revision v0.1.7, in documents only. Nothing of the software changes, and nothing is asked of FOGA or of ERC-8506 | v0.1.7 |
| A69 | The runbook's fallback is worded exactly: `--epochs k+1` for the work and for the close of a standard round in epoch k; the audits of epochs 0 and k, on the host and in the hosted job; the close named as a transaction; the five minutes as a threshold for starting; what the audit job of epoch k recomputes; and the budget schedule of this configuration, with its first halving in epoch 9. The acceptance of round R2a and the table of expected figures speak of the standard epoch that was in fact worked. No command of the runbook's main path changes | `r2-runbook.md` steps 5 to 7; `acceptance-matrix.md` 9; `roadmap.md` 4 |

What was wrong, for the record. In the operating instructions of 2026-11-24 the executor told the
owner that the budget halves from epoch 8, and set a deadline by it. The contract computes
`(epoch - activeFromEpoch) / halvingInterval`, and the standard version of the configuration is
active from epoch 1: the first halving is epoch 9. The specification says the same
(`genesis-mining-mvp.md` 3.2). The error was in the instruction; no document of this repository
carried it, and it changed nothing that was run.

### 6.6 Two points for the next implementation

They hold up neither v0.1.6 nor round R2a, and are written into the plans now so that the
implementation finds them there.

| Point | Written as | Where |
| --- | --- | --- |
| The demander that a profile version names, and a rightful delegate (Q25) | The check is of the demander that is represented. A confirmation by a named demander and one by its rightful delegate have the same outcome: a delegate is not another demander, and a contract account that confirms through a delegate is not refused for it. The test confirms both ways | `production-service.md` 7; row S25 |
| The budget that fees belong to, in a purchase by an agent (Q28) | Principal and fees each have a stated budget. A fee that was incurred and cannot be recovered is consumption of its budget. Before a new attempt is opened, and before a transaction is sent again at a higher fee, the reservation for fees is raised to cover what the fee can now reach | `supply-and-payment.md` 3, 4.3; row F26 |

### 6.7 The owner's adoption of the recommendations on Q17 to Q29

On 2026-11-24, with the thirteen questions explained to him, the owner asked the executor whether
the advisor's recommendations on them all made sense to it, and said that, if it had no evident
objection, they were to be carried out as recommended. The executor answered that it had none.
It added that most of the designs were its own proposals, on which the advisor had put
conditions, so that its agreement was not a second independent opinion; and it named what the
adoption carries with it:

| Adopted with | What it carries with it |
| --- | --- |
| Q26 | Work whose demander does not confirm leaves a public work fact and is in no epoch's GMU, measured or subsidized. That is acceptable while the demanders are named. In an open network a demander could keep a worker's GMU from being recorded by not confirming, the bounty being paid all the same, and a rule for that would have to be made then |
| Q25 | A task unit counts once, and the order in which the named demander's confirmations are recorded decides for whom - not who finished first. The rule binds the first controlled fixture profile and is not inherited by a later one |
| Q19, Q21 | The first specification takes a model with published weights and a public tokenizer, and its fixtures are public and finite. The first increment therefore shows the mechanism, and neither demand nor revenue |
| Q27 | The first increment does not close A54 by itself. A cell taking part, which needs the ruling of Q13, and an external customer's own request are needed as well, joined in one chain of evidence |
| Q22 | The next version of the ledger can be designed as one. What it still waits for is the ruling of Q13 and of the rest of Q16 |

How the adoption is applied:

| Ruling | Applied as | Where |
| --- | --- | --- |
| A70 | Q17 to Q29 leave the open questions and are listed as adopted, each with the recommendation as it was adopted. The proposals they put up are marked adopted. The plans say that their choices are approved as design, that what they add in carrying the choices out is reviewed with the implementation, and that nothing is built. The kept design of work facts says what the adoption rules on. No acceptance row is run by it, and nothing of the software changes | sections 9 to 12; `production-service.md`; `supply-and-payment.md`; `roadmap.md`; `architecture.md`; `genesis-mining-mvp.md` 13.7 and 14; `acceptance-matrix.md`; `README.md` |

### 6.8 Document consolidation of v0.1.8

This consolidation carries A70 and the earlier review corrections into one set of documents. It
adds no ruling, changes none of A1-A70, and leaves software release 0.1.3 unchanged. Historical
recommendations and the proposals they replaced remain identifiable as historical records.

The current status is made explicit: Q17-Q29 are adopted as design; Q16 is partly settled by
P60; Q13 and Q14 remain open. Q15 does not reopen the in-force hosted-runner route of R2a
(P38, implementing A39). The requirements of A35 and A38 remain in force while their remaining
implementation and staging choices await decision. A requirement for R3 or for a subsidy of
value is not extended to every test-point exercise.

The operational clarifications are kept together in `r2-runbook.md`, `roadmap.md` and
`acceptance-matrix.md`: the actual standard epoch, its configured budget, the bound of
`--epochs`, closing transactions and the epochs covered by the independent audit. They state
what the existing implementation does and what evidence a run must retain; they add no new
deployment or acceptance result. Production acceptance is labelled planned and not run. The
fee-budget rule in P57 is already part of the adopted design; concrete budget assignments and
limits are configuration work for the second increment, not a fresh approval of the rule.

### 6.9 The review of v0.1.7, and where the consolidated documents came from

The review of design revision v0.1.7 (A71) took the package and found the hash this repository
had stated; seven files, each replacing an existing one; the software still 0.1.3, and no
contract, client, script or configuration in the package. It fetched commit 9fdd1ce from GitHub
itself and compared the files one by one. It found the eleven command blocks of the runbook
unchanged, word for word, and what was added to be instructions for a later standard round. It
compared the commit the host of round R2a ran from, d8c7a20, with 9fdd1ce and found only
documents between them, so that uploading the revision changed neither the deployed contracts
nor the running programs. It did not run the tests: that 83 pass is this repository's result.
These limits are the review's own statement.

It closes three matters and asks for one wording. The consolidated documents carry all four:

| Matter | State after the review of v0.1.7 | Where |
| --- | --- | --- |
| The fallback of the runbook of round R2a (A69) | closed: written as the software behaves | `r2-runbook.md` steps 5 to 7 |
| The rightful delegate of a named demander (6.6) | closed: in the plan and in the acceptance | `production-service.md` 7; row S25 |
| The budget that fees belong to (6.6) | closed as design: rule 12 is part of the adopted design, and what is left is configuration | `supply-and-payment.md` 4.3; row F26; section 11 |
| The halving, as the roadmap worded it | said by ranges of epochs, so that "from epoch 9" is not read as for ever | `roadmap.md` 4; `r2-runbook.md` step 5 |

The consolidated documents of v0.1.8 (6.8) were written by the advisor at the owner's request,
from commit 274aafa and the executor's v0.1.8 package: nine documents as one set, with the
checksum of each. The owner relayed them with the instruction to walk through, take in and
update. The executor found the archive's SHA-256 and the nine files' as the advisor had listed
them; the Approved table and the head of this document unchanged, word for word; one subsection
added, 6.8; the runbook's eleven command blocks unchanged; and no file outside the nine different
from the repository's. It took the nine files as they were. On reading them it noted four
points, which this revision corrects where it changes the document concerned:

| Point | Corrected as | Where |
| --- | --- | --- |
| The head of this document still said that v0.1.8 changed no runbook: true of the executor's package, not of the consolidated set | the head says what each revision did to the runbook | the head of this document |
| The recommendation on Q28, as adopted, still ends "to be settled when it is coded", beside the statement that the fee-budget rule is adopted design | the cell keeps the recommendation's words and points to the later state | 12.2, Q28 |
| Four prose lines were longer than the hundred characters the documents are wrapped to | the two in this document are wrapped; those in `architecture.md` and in `genesis-mining-mvp.md` wait for a revision that changes those documents | sections 8 and 12 |
| 6.8 did not say who wrote the consolidated documents, and the review of v0.1.7 was not recorded with what it checked | this subsection, and A71 | 6.9 |

### 6.10 The review of the run of round R2a, and how it is applied

Historical state at evidence commit `b53e52f`; the subsequent technical acceptance is in 6.11.

The run is recorded under `evidence/r2a/`, whose index sets what was observed against what was
expected. The review (A72) had the host's records, the manifest package and this repository at
commit 9e40033, and no hosted run; what it checked is in A72. Run ci #2 had been made when the
review reached the executor. Run ci #3 and the close evidence were made afterwards, as the
review asks.

| Requirement of the review | Carried out as | Where |
| --- | --- | --- |
| The hosted audit reads up to a finalized block that is not before the close record of epoch 1; an estimate of time is not the condition | Run ci #2 had been started before that block was final: its audits read up to block 545910, and the close record is in block 546161. It is kept, and a second run was made. Run ci #3's audits read up to block 547050 | `evidence/r2a/README.md` 6, 7 |
| The cut-off block's number, hash and time; the receipts of the close transactions; the `EpochSealed` events of the right ledger; block hashes equal to the chain's; the blocks within the finalized block read - for epoch 1 and for epoch 0 | One record, read from the chain by a one-off read-only command on the host of the round, with seventeen checks, all `ok`. The command is kept beside it | `evidence/r2a/r2a-close-evidence.json`, `close-evidence.command.txt` |
| The earlier reports stay as made, with the mixed reading said | The host's audits and ci #2's are kept unchanged; the index says which block each read up to and that their `sealed` flag was read later | `evidence/r2a/README.md` 6 |
| The hosted run is judged by more than two `MATCH` lines | The run pages' status, `run.json`, the deployment check, both audits compared with the host's field by field, the table hashes; an artifact alone is not taken as a pass | `evidence/r2a/README.md` 7, 8 |
| What a table hash covers; what the deployment check reads | Said where the hashes and the check are reported, and in the runbook | `evidence/r2a/README.md` 5, 6; `r2-runbook.md` steps 7 and 8 |
| The three limits of what the round shows: a controlled self-test whatever the mode of an epoch; another environment, not another implementation or another source of the chain's state; wallets, not agents, and no production task | Said at the head of the index and in what the rounds show | `evidence/r2a/README.md` 1, 10; `README.md` |
| The condition, for later rounds | The runbook and the acceptance of round R2 name the finality of the close records | `r2-runbook.md` steps 6 to 8; `acceptance-matrix.md` 9 |
| The client records the block and the source of each read | Not in release 0.1.3: noted for the next version of the client | `evidence/r2a/README.md` 11 |

What the executor had said, for the record. It had asked the owner to start the hosted job after
a stated time of day: an estimate of when the close record of epoch 1 would be final, and not a
condition read from the chain. Run ci #2 was started before that time. Before the review
arrived, the executor then told the owner that this run need not be repeated, because no figure
depends on the close record. The figures do not depend on it. The finality of the close record
still has to be shown by itself, as the review requires, and the second run was made.

The state of round R2a after this revision: run, with its records in the repository. Its
acceptance is for the reviewers and the owner to give, and is not recorded here.

### 6.11 R2a advisor technical acceptance: 2026-11-24

After reviewing evidence commit `b53e52f22f73d4a011846e8db7a3398d56c4c828`, the advisor accepted
R2a technically. This dated addendum records that subsequent review outcome; it does not claim
that acceptance had already been recorded in the pinned commit or that another chain run was
performed for this documentation update.

| Item | Accepted scope or supporting evidence |
| --- | --- |
| Software and environment | Software 0.1.3; Finchain Sepolia, chain ID 85422; public-testnet, controlled-self-test and operator-wallet-integration |
| Deployment | Ledger `0x7180CdDA4aE494f551d196146E6fcCB717675F1a`, policy `0x6681DC69737C434b774A89Bdcb6d5C0a6C900825`; `deployments/finchain-sepolia-r2.json` |
| Epochs | 0 and 1, with the full reports agreeing except `recordedAt` and `settledBlock` |
| Hosted CI | Run [45359832829](https://github.com/garyyang-finchip/finchain-pouw/actions/runs/45359832829), source commit `fa765af13f16f2f2b024a2576f665c9b8785ba7e`; the advisor checked successful `test` and `audit` jobs |
| Seal evidence | `evidence/r2a/r2a-close-evidence.json`, SHA-256 `a3747af2880d75c23811ecd353ec7fe56463d41a8911e0b4e0337eae486f4331`; seventeen predicates checked and the nine event fields of each seal agreeing with the audit |
| Finality relation | Seal blocks 540870 and 546161, CI #3 cutoff 547050, witness finalized head 547405: `540870 < 546161 <= 547050 <= 547405` |

Source of the acceptance outcome: the advisor's review on 2026-11-24 after `b53e52f`, preserved
in the owner-supplied `Finchain_PoUW_Progress_2026-11-24.md`, section 7.1 (SHA-256
`a2dd7a548dfa184b3ad89ee5f073c74e0e510242fa7eff830179d8a914384f8f`). The review outcome is
separate from the evidence index's descriptions of what its raw records establish.

The accepted record closes the earlier seal/finality evidence gap. It requires no additional
seal, rerun or redeployment for this status update. CI #2, the unused deployment, the host's
original reports, all original metadata and the mixed-read explanation are preserved. Software
0.1.3 still has the documented mixed-block read limitation; a consistently pinned audit remains
next-version work.

This acceptance covers neither R2b nor R3, autonomous Cell Account participation, inference
production, independent demand, valuable rewards nor a sustainable economy. Q17-Q29 remain
adopted as design under A70. Q13, Q14, Q15's broader arrangement and Q16's remaining mechanisms
and packaging retain their existing open status; Q15 does not reopen the completed R2a audit.
The next work is the concrete Q13/Q14/Q16 memo and independent first-production components,
with Finchain, FOGA and this repository remaining separate.

## 7. The proposals of v0.1.0 and v0.1.1, and their state

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

## 8. Proposed in v0.1.2, and ruled on

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
| P27 | The client reads logs up to the settled block and only frozen state at the latest block; it never asks for an old state. Replaced from release 0.1.4 by A76: an audit and a check of a deployment read one finalized block, logs and state alike, and an endpoint must be able to serve the state of that block (`ledger-v2.md` 13; the third finding of section 14.4 below) | An audit must run against an ordinary full node and a public endpoint | `genesis-mining-mvp.md` 12 |
| P28 | Two contracts of substance: `GenesisPolicy` (profiles, parameters, parties, the clock) and `GenesisLedger` (receipts, GMU, the allocation). Work Receipts and Epoch Rewards of A30 are one contract | They share every figure; two contracts would add a trust boundary and no separation of duty | `architecture.md` 3 |
| P29 | GMU does not scale with the bounty | Money moved between two addresses of one party must not buy GMU | `genesis-mining-mvp.md` 6 |
| P30 | Tests and build use Hardhat with the solc-js compiler pinned in `package.json`; tests are JavaScript | The Foundry binaries could not be installed in the build environment. Nothing is downloaded at test time | `README.md` |
| P31 | The ERC-8414 reference contracts are copied byte for byte, pinned to the commit the World locks, as test fixtures | The adapter is tested against the standard itself, not a stand-in | `contracts/vendor/erc8414/NOTICE` |

Kept for later rulings at that revision, not implemented (`genesis-mining-mvp.md` 13): the
`g0.ver` state machine, `g0.cal`, the paging rule, a cap per declared operator, a freshness
window for bridging, the conditions on a seed for a valuable subsidy, receipts without the
demander, the binding of the settlement-time authority, the delegation signed by an account. For
work without demander confirmation, the current design is P60, adopted under A70 in place of
P40.

## 9. Proposed in v0.1.3

On this repository's own judgment, to carry out the rulings of section 3. P32, P33, P34, P37, P38
and P39 are implemented and in force unless vetoed. P35, P36 and P41 remain designs put up for
a ruling; nothing of them is built. The table also preserves P40's original proposal, now
superseded. Neither the alignment of 2026-11-24 nor the review of v0.1.4 ruled on these designs:
round R2 continues as approved (A53, A55), with the current decision status in section 12.1.
The review of v0.1.4 put a condition on P40 (A64); P60 was proposed to meet
it, the review of v0.1.5 supported that, and the owner adopted it with Q26 (A70). P60 therefore
stands in the place of P40: work that settles without its demander's confirmation leaves a work
fact, and not a receipt.

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
| P40 | Historical proposal from v0.1.3, superseded by P60 under A70. Original proposal: with the next ledger version, anyone may record a settled submission as a receipt that is measured and never subsidized; the subsidy still takes the owner's confirmation | A33; superseded by A70 | `genesis-mining-mvp.md` 13.7 |
| P41 | For ruling, with the next ledger version - the cap per declared operator of 13.4, and a manifest field that names the deployment a new one supersedes. The old ledger stays readable and auditable, as every ledger does | A35 | `genesis-mining-mvp.md` 13.4; `deployments/README.md` |

## 10. Proposed in v0.1.4, and their state after the reviews

On this repository's own judgment, to carry out the alignment of section 4. All of it is design:
nothing is built. Where an entry and `genesis-mining-mvp.md` 14 or 15 differ, those sections
govern. The first table has the proposals as v0.1.4 made them; the second says where each stands
after the reviews of v0.1.4 and of v0.1.5 (sections 5 and 6) and after the owner's adoption of
2026-11-24 (A70). A proposal that a review recommends is still a proposal until the owner adopts
it (A66); those marked adopted are approved as design. Where the two tables differ, the second
governs.

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

| Id | State after the reviews of v0.1.4 and of v0.1.5, and after the adoption (A70) |
| --- | --- |
| P42 | Adopted as the first controlled profile (Q17; A70). Added: the task units are enumerated as a committed fixture set, each with a task description (P55) |
| P43 | Adopted on the condition that P59 carries out (A61; Q18, Q29; A70). Narrowed by the mapping: a conformant Unit and a conformant Grade; from the Source and the Receipt a vocabulary and the format of two members. The wording is: no ERC-8506 contract and no runtime dependency, and a light dependency on a pinned specification (A67) |
| P44 | Adopted (Q19; A70). The template and the serving configuration are pinned as the model and the tokenizer are |
| P45 | The fixed GMU is adopted (Q20; A70). Corrected in the measurement (A56): the count of the canonical result is a count of its own, and the formula has a stated scale. Corrected in what the fixed GMU attaches to (A57): a task unit, counted once by the order of confirmation (P55), not every accepted delivery |
| P46 | Stands for the work id and for the correspondence of envelope, tender and receipt. Extended: the request id and the content key are identities of their own, the key being the hash of a task description (A57, P54) |
| P47 | Adopted (Q21; A70), with what is published together |
| P48 | The records and the routes stand. Corrected (A58): the state of a purchase is three records, not one state machine, with the attempts under it (P56); a purchase by an agent reserves its budget (P57). That what an adapter declares is fixed before providers are chosen, and that the providers are chosen when the second increment opens, is adopted (Q24; A70) |
| P49 | Stands. The report gains the lines and the reconciliation of prepaid credit, and its example is corrected (A58) |
| P50 | One design is adopted, to be written once Q13 and the rest of Q16 are ruled (Q22; A70). Extended by the content key and by the two reasons of P55, and designed together with P60 (Q25, Q26; A70) |
| P51 | The increments and their own numbering stand; running them beside rounds R2b and R3 is adopted (Q23; A70). Corrected (A59): the first increment has one acceptance, the mechanism; three further acceptances are evidenced one by one, and A54 is closed by one linked chain (P58) |
| P52 | Stands, as designs kept. The wording on assets and on x402 is corrected (A62) |
| P53 | Stands. In the terms of P58: the first increment needs nothing from FOGA, and the acceptance with a cell waits for nothing in this repository |

## 11. Proposed in v0.1.5, as revised in v0.1.6 and v0.1.7, and adopted

On this repository's own judgment, to carry out the reviews of sections 5 and 6. All of it is
design, and nothing is built. The review of v0.1.5 supports each of them, several on conditions
that v0.1.6 wrote in (6.3). The review of v0.1.6 finds them written so and names two points for
the implementation, which v0.1.7 writes in (6.6). That support was a recommendation, recorded
with the questions in section 12. The owner adopted it on 2026-11-24 (A70): P54 to P60 are
approved as design, with the conditions recorded there. The fee-budget rule of P57 is included
in that adoption: principal and fees have stated budgets, fees already incurred consume their
budget, and sufficient fee reservation precedes a retry or a fee increase. Concrete budget
assignments and limits are specified when the second increment is configured (Q28); they do
not require the rule to be adopted again.

| Id | Proposal | Why | Where |
| --- | --- | --- | --- |
| P54 | Three identities of a piece of work, and the task description. The request id names one request instance of one demander: it is derived from the demander, the specification, the content key and a salt the demander chose, is fixed before the first attempt, and is carried by the tender's task document and by the envelope of every attempt. The work id names one order on chain and is unchanged (P46). The content key names the task that the profile counts as one contribution: the hash of a canonical task description - task class and version, instruction, schema, document. Two tasks are the same exactly when their descriptions are equal; the model, its template, its tokenizer, the limits, the worker, the demander, the tender, the request and the epoch never enter the key. Recovery and the reconciliation of payments go by the request id; a receipt and the payment records of one delivery carry the work id; deduplication reads the content key | A57: the identity of a request apart from that of its order. A retry, a second submission and a second tender keep the request id and get another work id; a third identity is needed because a demander who makes a new request for the same task has a new request id as well. The review of v0.1.5 (Q25): "the commitment to the input" could be read as the document alone, which would make two tasks on one document one contribution, or as the input in one model's template, which would let another model go around the rule | `production-service.md` 2, 4.1 |
| P55 | Task units and the one counting, in profile version 1. The work is enumerated beforehand: a fixture set committed by one root in the profile version, each member a task description with a committed reference; the profile version names the demanders that issue its fixtures. A delivery counts only for a member that such a demander issued, shown to be one when the contribution is recorded; a part of a fixture is not a task unit (reason `not-a-task-unit`). A task unit counts once per deployment of the ledger, and the order of confirmation decides: the first rightful confirmation the ledger records - by the tender's owner or its delegate, meeting every condition of a receipt under the profile - takes the counting of the content key, tested and marked in the transaction that records the receipt. The demander that is checked is the demander that is represented: a rightful delegate confirming for a named demander is not another demander. Any other accepted delivery of the key is recorded with the reason `duplicate-contribution` and the receipt that took the counting; its transaction and its payment stay as facts; it adds no qualified units, no GMU and no eligibility. A fixture whose reference has been revealed is not committed again. Counting once is the reward policy of a finite fixture set: it says nothing against the value of a second service of the same content, and a later version for customers' own tasks states its own scope | A57. A fixed GMU per delivery would pay for the same work as often as it was wrapped again; and the first acceptance of a fixture makes its reference public, so that a later delivery of it shows nothing under any model. The review of v0.1.5 (Q25): "first accepted" left open who counts when acceptance and confirmation come in different orders. The order of confirmation can be carried out with certainty by one contract; it is not a ranking of who finished first, and the plan says so | `production-service.md` 2, 7 |
| P56 | The state of a purchase. Three parts that move independently: `payment.status` (`authorized`, `initiated`, `pending`, `unknown`, `settled`, `failed`), `credit.status` (`not-available`, `available`, `partly-used`, `exhausted`, `lapsed`) and a list of adjustments (`partial-refund`, `full-refund`, `credit-reissued`, `dispute`), each with its amount. Under the purchase, its attempts: the purchase is one intent with a stable `purchaseId`; each try at paying for it is an attempt with an `attemptId`, mapped one to one to what makes it unique on its channel - an idempotency key, the nonce of a signed authorization, or the sending account with its nonce - and with a record of everything the channel returned for it, every transaction hash included. An attempt that failed is final as an attempt, and a purchase has at most one attempt that settles. The six meanings of A50 stay apart across the three parts. What `settled` means is the declared rule of the adapter's channel; three kinds of channel are tabled with their stages - authorization, capture, settlement, later adjustment - and the channel's own state is kept beside the status, as returned | A58. The three parts and their values are the review's; the transitions, the mapping from the six meanings and the table of channels are this repository's. The review of v0.1.5 (Q28): one identifier per purchase, a final `failed` and a retry under the same purchase cannot all hold. A transaction replaced at the same nonce has several hashes and is one try; a try after a definite failure needs a new nonce and is not a second purchase | `supply-and-payment.md` 3, 4 |
| P57 | Adopted with Q28 (A70). The budget book, for a purchase by an agent: one book per boundary, asset or currency and budget period; a reservation that tests the room and holds the amount in one operation; then, before each sending, the attempt written durably with its identifiers on the channel; the reservation held through all the attempts and while a payment is pending or unknown. An unknown result is reconciled, or sent again as the same attempt, and never doubled by a second one; a new attempt only after a definite failure, with the budget tested again; at most one payment settles, and what failed attempts cost is cost. Principal and fees each have a stated budget: a fee that was incurred and cannot be recovered is consumption of its budget, and the reservation for fees is raised before a new attempt or a resending at a higher fee. Released when the purchase closes without a payment or by the release rule the adapter declares; consumed at the amount settled, in the period it was made in; a refund returning nothing unless the policy says so. At every start every reservation that is not finished is taken up, a purchase still showing `authorized` included. What an adapter declares - operations, channel, idempotency, release, authorization - is fixed before any provider is chosen | A58; Q24 and Q28. A process can send a payment and stop before it notes that it did: the attempt is therefore written before the sending, and recovery does not trust the status. Rule 12 of `supply-and-payment.md` 4.3 is adopted design; concrete fee-budget assignments and limits are configuration choices before the second increment is implemented, not another approval of the rule. Nothing of it belongs to the first increment | `supply-and-payment.md` 3, 4.3, 6 |
| P58 | The acceptances of the production line. The first increment is the controlled fixtures and has one acceptance, the mechanism. Three further acceptances follow it, each with evidence of its own and none standing in for another: a FOGA cell taking part; a supplier that is not the operator's; a customer's own request, which needs a later version of the profile. The milestone of A54 is met when the mechanism, a cell taking part and a customer's own request have each been evidenced, and when at least one chain of business evidence joins them: linked by request and work ids or by parent and child, from the external customer's request through the cell, the delivery, the re-check and the payment to the GMU record and the cost. An external supplier is not among its conditions and is reported for what it shows | A59. A54 names a buyer's real request, a standardized delivery, a cell, an independent re-check, a completed payment, a GMU record and a cost report. It names no external supplier. The review of v0.1.5 (Q27): acceptances met apart would not show that the parts worked together in one business | `roadmap.md` 8; `acceptance-matrix.md` 11 |
| P59 | The pin of ERC-8506 for the first specification: `garyyang-finchip/ai-inference-token` at commit `2b62b6171a504dc504cbb89a1b2b5d13520e1595`, the specification and four schema files by their SHA-256, the sections used. The mapping: the usage categories with their counter are a conformant Unit; the count of a canonical result is a second conformant Unit, with no relation declared to the first; the model, its configuration, the requirements and the evidence of each claim are a conformant Grade; from the Source record its vocabulary of origin and of authorization, and from the Receipt record its `claim` and `evidence` members, without the envelope being called either record. A light dependency (A67): the schema files are copied, nothing fetches the standard, and nothing depends on its status or on its being merged. The records are validated against the pinned schemas when they are written, at the build. A later revision of the standard is adopted by a new pin, in a new version of the specification | A61. A Source states the grounds on which units are issued and a Receipt describes a request on a home ledger; the first increment has neither, so that claiming those two records would claim more than is there. The review of v0.1.5 fetched the pinned files itself and found the five hashes (Q29); what that establishes is the source and that the mapping can hold, not the validity of records that do not exist yet | `production-service.md` 4.2 |
| P60 | Adopted with Q26 (A70), for the next ledger version - work facts apart from receipts; it settles the choice that P40 left open. Anyone may record, through the adapter, that a submission settled: a work fact, which holds what the adapter read from the tender and no measure. It has an id of its own, derived from the work's source in a domain apart from the contribution id, and is recorded once. It consumes nothing that a reward depends on: not the contribution id, not a production content key, no cap and no counter. A receipt - the record that is measured, has an eligibility and counts in an epoch - is made only by the confirmation of the tender's owner or of its delegate (P35). It is linked to the same work by that source, needs no fact and is not blocked by one, and counts in the epoch in which it is recorded. No recorded status changes, and no epoch that is frozen is rewritten. The trade-off: work whose demander never confirms has a public fact and is in no epoch's GMU | A64: a third party must not take the contribution id before the rightful demander confirms. The other answer the review of v0.1.4 names - a rule by which a later confirmation raises the eligibility of a receipt already recorded - is the one place where a recorded status would change, and it would put eligible GMU into an epoch other than the one that measured it. The review of v0.1.5 supports the separation and asks for the fact's identity, for the content key to be out of its reach and for the link to the work (Q26). Whether a fact outside the totals is what the reservation of A33 asks for was part of the ruling: the adoption takes it so, in the first of the two ways that A64 allows (A70) | `genesis-mining-mvp.md` 13.7 |

## 12. The questions put to the owner: open, and adopted

Q13 to Q16 were ruled by the owner on 2026-11-25 (A74 to A77) and are listed in 12.3, each with
the ruling on it and with where it is applied. On Q17 to Q29 the advisor gave recommendations,
in the reviews of v0.1.4, of v0.1.5 and of v0.1.6. Each was recorded as it was given - advisor
recommendation recorded; owner adoption pending - and none was an approval (A66). The owner
adopted all thirteen on 2026-11-24, in a statement of his own (A70); they are listed in 12.2 as
adopted. What is adopted there is design, and nothing of the production line is built. Q30 and
Q31, which the implementation of ledger v2 raised, were ruled on 2026-11-25 (A81, A82) and are
listed in 12.4. Open now are the two questions of 12.1.

### 12.1 Open for the owner's ruling

| Id | Question | This repository's suggestion | Recorded advice and current status |
| --- | --- | --- | --- |
| Q32 | Whether the kernel's six committed builds of release 0.1.3, from which the deployment of round R2a was made, are checked against the known bugs of their compiler, solc 0.8.24 (P67; 15.5, 16.3) | No rebuild and no change of round R2a: its deployment carries test points only, and A82 keeps the kernel's builds as they are. The compiler's list has seven entries for 0.8.24. Three need the IR pipeline, which the kernel does not use; three need a construct that the kernel's sources do not have or cannot reach; one - the bug of the Yul optimizer that A82 answers for v2 - cannot be excluded by reading the sources. A check of that one, if it is wanted, by a method the compiler's maintainers describe, recorded as a check and as nothing more | None recorded |
| Q33 | What a deployment of ledger v2 takes for its G0 function and its seed source (P70; 16.4). Both are contracts of the kernel - `AuditV1`, and `L1BlockSeedSource` or `PrevBlockSeedSource` - and their builds are those of solc 0.8.24 | Give v2 its own copies of the two sources inside `contracts/v2`, compiled by the v2 compiler, so that every contract of a v2 deployment comes from one boundary and one build record. The kernel's files and builds stay as they are. The alternative is to deploy v2 with the kernel's builds of these two contracts, on the record; for round R2b, which carries test points only, either is defensible | None recorded |

### 12.2 Adopted by the owner on 2026-11-24 (A70)

Each question is adopted as the advisor recommended it, with the conditions that the
recommendation names. The third column is kept for the record: it is what this repository had
suggested before the recommendation was given.

| Id | Question | This repository's suggestion | The advisor's recommendation, as adopted |
| --- | --- | --- | --- |
| Q17 | The task class of the first production profile and its three checks (P42) | Confirm structured extraction, or name another bounded class. The plan changes in section 2 of `production-service.md` only | Agree, as the first controlled profile. Format, grounding and reference each keep the boundary of what they verify (review of v0.1.4) |
| Q18 | Whether the specification, the provenance of supply and the usage records follow the record formats of ERC-8506 (P43) | Confirm, at the pin and with the mapping of P59: no contract, no runtime dependency, a light dependency on a pinned specification | Agree on a condition: the source, the pinned version and the mapping of the fields are stated, and the dependency is on the specification only (review of v0.1.4). See Q29 |
| Q19 | The model of the first specification (P44): published weights and a public tokenizer; and whether a specification for the provider a FOGA node calls today is registered beside it | Confirm the criteria and choose the model at the build round, from what can be bought then. Register the second specification when a cell is to take part with the model it has | Agree. The model, the tokenizer, the template and the serving configuration are all pinned by version; the specification of the provider a FOGA node calls may be registered separately (review of v0.1.4) |
| Q20 | The reward rule of the first increment (P45): a fixed GMU for each task unit that is counted, with the units recorded and recounted - or GMU proportional to units from the start | Fixed first. Proportional when a recount has shown, on real records, that the counts hold | Agree, once the scale of the measurement, the deduplication of requests and the boundary of a task unit are fixed. Service units serve observation and recomputation and are not presented as a completed SIG calibration (review of v0.1.4) |
| Q21 | Availability of evidence in the first increment (P47): public fixtures | Confirm. Controlled access comes with customers' own tasks | Agree. Content, versions, commitments, the procedure of the re-check and the statement of availability are published together (review of v0.1.4) |
| Q22 | The next version of the ledger (P50): one version with the items of Q16 and the production fields, or two versions | One, if this ruling comes with that of Q16. Otherwise two, and neither waits for the other | One design is preferred. The rules of authorization and of receipt state of Q13 and Q16 converge first, and a necessary upgrade of the ledger is not held back by a production design that is not finished (review of v0.1.4) |
| Q23 | The order after round R2a (P51): the first increment beside R2b and R3, worked by parties the operator holds and labelled so; and whether the third party of R3 may also be the first customer that is not the operator's | Yes to each. A third party is better invited to work that is real than to a test tender | Agree, the scope of the first increment no longer conflicting with A54. A third party may also be the customer; each piece of evidence says which role it had: supply, purchase or audit (review of v0.1.4) |
| Q24 | The routes of the second increment (P48): which provider for the agent-wallet route and which for the fiat-billed account | Decide when the second increment is opened; one adapter of each kind | Agree: chosen when it opens. Fixed now: the capability interface, the authorization, the budget, the idempotency and the reconciliation. No provider is presumed to support a top-up without a person (review of v0.1.4) |
| Q25 | The identities of a piece of work, and the rules of task units and of the one counting in profile version 1 (P54, P55): a request id, a work id and a content key; a committed fixture set; one counting per fixture and per deployment of the ledger, taken by the first rightful confirmation; a scope that a later profile version does not inherit | Confirm for version 1 of the profile | Support on conditions, and only for the first controlled fixture profile. The content key is defined on stated content, so that another worker, model or tender does not change it and a change of the task is judged by a stated rule. The counting goes to the record that meets the conditions of acceptance, is submitted by the rightful confirming party and is the first to be confirmed in the ledger; this is said not to be a ranking of who finished first; a case with acceptance and confirmation in opposite orders is among the tests. The policy is not narrowed against later repeat purchases, evaluations of other models or recomputations (review of v0.1.5). Both conditions are written into P54 and P55. The review of v0.1.6 finds them met as written, and the demander a profile version names reasonable in scope: it binds the first controlled fixture profile only; its check is of the demander that is represented, so that a rightful delegate is not refused |
| Q26 | The next version of the ledger as one design (Q22): the items of Q16; for the production line, the role, the work id, the parent, the envelope commitment and the content key in a receipt, with the two reasons of P55; and work facts apart from receipts (P60) | Decide Q13 and P60 first: they fix who may record what, and with what state. Then one version. If the production fields are not ruled by then, the ledger is built without them and they follow by the same versioned switch | Support for work facts apart from receipts. A fact has a stable id and its own rule against duplicates; a fact cannot consume the production content key; a confirmation is linked to the same work, is possible without a fact and is never blocked by one, adds nothing when repeated and rewrites no frozen epoch. The trade-off is to be said plainly: without the demander's confirmation the work is in no epoch's GMU (review of v0.1.5). Written into P60; the review of v0.1.6 finds it written so |
| Q27 | When the milestone of A54 is met (P58): the mechanism, a cell taking part and a customer's own request, each evidenced on its own; a customer's own request after the first increment, with a later version of the profile | Confirm. An external supplier is evidenced when there is one - the third party of round R3 may be it - and is not a condition of A54 | Agree: the mechanism, a cell taking part and an external customer's request together form A54, and an external supplier need not be a condition. When A54 is closed there is at least one complete chain of business evidence, linked by request and work ids or by parent and child (review of v0.1.5). Written into P58; the review of v0.1.6 finds it written so |
| Q28 | The purchase record in three parts and the budget book (P56, P57), as the specification the second increment is built to | Confirm the records now. The providers are chosen when the second increment is opened (Q24) | Holds in the main. Before the second increment is coded: the purchase is kept apart from its attempts and from each attempt's record on its channel; an unknown result is reconciled or sent again as the same attempt; a new attempt only after a definite failure; at most one payment that succeeds, the fees of failed attempts being cost; a start takes up every reservation that is not finished, `authorized` included (review of v0.1.5). Written into P56 and P57. The review of v0.1.6 finds the main gaps closed; to be settled when it is coded: the budget that fees belong to, and the raising of the fee reservation before a resending at a higher fee. Both were then written as rule 12 of `supply-and-payment.md` 4.3 (v0.1.7), and the review of v0.1.7 closes the matter: the rule is adopted design, and the concrete budgets and limits are configuration (A71; section 11) |
| Q29 | The pin and the mapping of ERC-8506 (P59): two records conformant, two used for a vocabulary and two members | Confirm. If the standard has moved when the increment is built, the owner chooses whether the pin moves with it, in a new version of the specification | Support for the pin and for the limited reuse; the review fetched the pinned files and found the five hashes. The instances are validated against the schemas when the model is chosen and they are written; until then the source is verified and the mapping can hold, and no more is said (review of v0.1.5). Maintained by the review of v0.1.6 |

### 12.3 Ruled by the owner on 2026-11-25 (A74 to A77)

The third column is kept for the record: it is what this repository had suggested.

| Id | Question | This repository's suggestion | The ruling | Applied in |
| --- | --- | --- | --- | --- |
| Q13 | How a Cell Account mines as itself (A37): the delegation signed by the account, in the next ledger version (P35), or another route | P35. FOGA stays as it is and the cell's key stays inside FOGA | A74: the bounded signed delegation, on seven conditions; the account's own `execute` stays a legitimate entry; the operator slot is not replaced by default. A77 (O1, O2): the guard and its binding | `ledger-v2.md` 2 to 6, 12; `contracts/v2/`; `scripts/sign-permit.js`. Built and tested locally; nothing is signed |
| Q14 | Whether round R2b is run on the present kernel | No. R2a on the present kernel; R2b on the next ledger version | A75: round R2b uses the next version of the ledger; the deployment of round R2a and its evidence are kept and linked by a versioned manifest | `ledger-v2.md` 1; `roadmap.md` 5. The v2 deployment, its manifest and the round's package are not built |
| Q15 | The independent machine of R2: a hosted CI runner (P38) | Keep the in-force R2a route; decide its application to R2b in that round's scope | A76: round R2b keeps the hosted runner without a participant key; further endpoints or implementations are separate enhancements; the client reads one finalized block. A77 (O5): at once, without a fallback | `ledger-v2.md` 13; the client of release 0.1.4. The audit of a v2 deployment follows the freeze of the interfaces |
| Q16 | The content of the next ledger version, before R3: the declared-operator cap (A35, P41), work facts apart from receipts (P60, adopted), the delegation (P35), and settlement-time authority (A38, P36) | One version with the first three; the fourth together with the verification work, before any subsidy of value | A75: one minimal, complete version with the operator cap, the attribution fixed at accrual, the declared-operator condition of the early subsidy, facts apart from receipts with an atomic confirmation, and the adopted fields; the authority at settlement stays within the disclosed limit of A38 for rounds R2b and R3 and is completed before any subsidy of value. A77 (O3, O4, and the corrections) | `ledger-v2.md` 7 to 10; `contracts/v2/`. Built and tested locally |

### 12.4 Ruled by the owner on 2026-11-25, on the review of the implementation (A81, A82)

The third column is what this repository had suggested; the fourth is the advisor's
recommendation in its review of the implementation, which the owner adopted (15.1).

| Id | Question | This repository's suggestion | The advisor's recommendation | The ruling | Applied in |
| --- | --- | --- | --- | --- | --- |
| Q30 | Whether the interfaces of ledger v2 are frozen as `ledger-v2.md` 11 has them, with this repository's choices P61 to P65 (14.5) | Freeze them after the review of the implementation. The committed builds, the deployment tooling and the client for a v2 deployment follow the freeze | Freeze. The five compiled interfaces equal a fresh compilation, and no finding of the review needs a change of an interface. The reference is, together: the complete Solidity types and interface sources, the five compiled interfaces, the typed statements with the domain's encoding and the fixed vectors, and the version or commit. The interfaces can be final now; the deployable bytecode waits for the compiler | A81: frozen as they stand at commit `b3e07df`; the interfaces and the deployable bytecode are recorded apart | `ledger-v2.md` 11.8; `contracts/v2/interfaces.frozen.json`; `test/v2.frozen.test.js` |
| Q31 | The build of the v2 ledger (P66): through the compiler's IR pipeline, at 21,674 bytes, or a smaller ledger under the kernel's settings, which leave it 34 bytes under a chain's limit | The IR pipeline, with a test that holds the code 1,024 bytes under the limit. A smaller ledger would, for one, store a commitment to a fact in place of its content | The IR pipeline; 34 bytes of room are too few to maintain a contract in, and no adopted function of the ledger is cut for the sake of the old settings. Not the present build as the deployment build: solc 0.8.24 is inside the range of a known bug of the optimizer, fixed in 0.8.38. A compiler of its own for v2, 0.8.39 verified first; the kernel's boundary and its six builds kept | A82 | 15.5; `ledger-v2.md` 1. The compile boundary and the build are not made: they are the first item of the next delivery |

## 13. Illustrative (figures used to explain, not parameters)

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
| Measurement weights of 250,000 for input and 1,000,000 for the canonical result over a scale of 1,000,000 - a quarter and one; limits of 8,000 input tokens and 1,000 tokens of canonical result; a fixture of 6,000 input tokens, 1,150 generated tokens and a canonical result of 310; a `baseGmu` of 50 for `g1.inference` | `production-service.md` 5 | examples of a measurement version and of a profile; nothing of it is registered |
| A period of 12 deliveries, 21,700 qualified service units and 0.006 of the native asset received; 5.00 of a fiat currency paid by the Holder to a provider, 0.48 of it consumed and 4.52 left as prepaid credit | `supply-and-payment.md` 8 | an example of the report's shape; no figure of it was observed |

## 14. The rulings of 2026-11-25 on the next version of the ledger, and how they are applied

### 14.1 Who wrote what, and on what the record rests

The times are those of Singapore (UTC+8), where the owner wrote; all are of 2026-11-25. The
owner writes in Chinese: what is given here of his words is a translation.

| When | What | Drafted by | Sent by | Standing in this record |
| --- | --- | --- | --- | --- |
| 00:43 | The execution instruction: the closing of round R2a's documents, the directions on Q13, on Q14 and Q16, on Q15 and the client's audit, the work that runs in parallel, and the next delivery | the advisor, in the owner's voice | the owner | the owner's ruling: A73 to A76 and A79, by his statements of 01:52 and 02:33 |
| 01:52 | The advisor's walk-through of the executor's first delivery: six corrections of revision 1 of the design and six choices, O1 to O6, under the words "I confirm: the execution instruction I forwarded is my ruling" | the advisor | the owner, who added a line saying that the text was the advisor's reply | A77. The added line left open whether the text was adopted or relayed |
| 02:33 | "I confirm that the execution instruction I forwarded, the mapping of the seven items and the choices O1 to O6 are my ruling, and I adopt the following corrections of this round. Record it by its actual source, date of sending and scope of adoption, on the ground of this explicit statement" - with five corrections, the baseline of the implementation and the next delivery | the advisor, as a text for the owner to adopt | the owner, as his own message | the owner's explicit adoption: the ground on which A73 to A79 are rulings, and the content of A78 |
| 02:33 | The advisor's review of the executor's discussion draft on platform Tokenomics: recommendations on its twelve points for ruling and seven revisions asked for | the advisor | the owner, as an attachment that his statement does not name | advisor recommendation recorded; owner adoption pending. The draft and its revisions are kept outside this repository; nothing of them is a parameter or a rule here |

Three things are kept apart in what follows, as the owner asked: what the advisor advised, what
the owner adopted, and what the executor built and verified (14.4). The first two are the
sources of the rulings; the third is evidence of the implementation and rules on nothing.

After the message of 01:52 the executor asked whether the text had been adopted or relayed, and
proposed to record an adoption if no answer came. That proposal was contrary to A66 - nobody
objecting is not an adoption - and is withdrawn; the advisor pointed it out. The record rests on
the owner's statement of 02:33 and on nothing else.

The mapping of the seven items is a table the executor delivered to the owner on 2026-11-25: the
seven items of its memo of 2026-11-24 on Q13, Q14 and Q16, each set against the instruction and
against the walk-through. It is written in Chinese and is kept outside this repository; what it
holds is in A74 to A77, in 12.3 and in 14.2.

### 14.2 From revision 1 to revision 2 of the design

Revision 1 was the executor's draft of 2026-11-25 for the instruction. The advisor's
walk-through found the following; the owner adopted the corrections and made the six choices
(A77). Revision 2 applied them. Neither revision entered this repository: `ledger-v2.md` enters
it as revision 3, with the implementation.

| Point | Revision 1 | Revision 2 |
| --- | --- | --- |
| Owner rotation | "a permit signed by the former owner stops verifying" | no such promise: the account's signature rule decides; the counter-example and a rotation procedure are stated |
| Revocation | a mark per digest, in a namespace the draft did not define: it did not say whose mark a revocation is. Nothing was built on it | per account; `Revoke` and `RaiseNonce` are typed statements of their own |
| Sender of a G1 confirmation | not said | the adapter reads its own caller and checks the permit's account against the tender's owner |
| Suspended accounts | "revoke, renounce and raise the nonce all succeed" | the signed paths and the renouncing do; a direct call through a gated account is not assumed to |
| Duplicates | named in prose only | `duplicateOf` in the status; reasons 14 and 15 defined apart; one occupancy per ledger; what can and cannot take a key |
| Authority at settlement | the audit "reports every receipt" that differs | the last registered authority that is visible, and `evidence-insufficient` where the log cannot settle it |
| Guard binding (O2) | the address in the permit | the address and a version that only rises |
| Guard for FOGA cells (O1) | verdict and anchor | also the completeness of the presented bindings; a failing registry call refuses |
| G1 demander (O3) | open | needs a declared operator for the early subsidy; no condition on the judge |
| Origin (O4) | "paid its fee" | the top-level sender; a record only |
| The audit's block (O5) | planned | built at once, without a fallback to the latest block |
| Names (O6) | proposed | stand in principle; fixed with the interfaces |
| Allocation | the formula | the zero cases, the range of the caps and their relation |
| Operator history | stored at subsidized accrual | stored for every receipt, with a flag |
| G0 instance | "one instance per participant per epoch" | the dimensions of 0.1.3, with the participant for the sender |
| Reasons | listed | one fixed order for chain and audit |
| Report hash | "a hash over the whole report" | a fixed serialization; the field leaves itself out |

Two of the walk-through's findings were checked by the executor before revision 2 was written.
The counter-example on rotation was reproduced with the released bytecode of the FOGA account
on a local network. The boundary of the authority audit was read off the vendored source of the
ERC-8414 reference contract: it calls a verifier before it emits the acceptance, by a call that
can change state, and the right to judge can be handed on without a reentrancy guard.

### 14.3 The five closing corrections, and where each is applied

Adopted by the owner on 2026-11-25 (A78), from the advisor's review of revision 2. The ids L1
to L35, here and in A78, are the rows of the test matrix in `ledger-v2.md` 14; they are not row
L1 of `acceptance-matrix.md`.

| # | Correction | Applied in | Tests |
| --- | --- | --- | --- |
| 1 | Ending an old permit is not taking away an old key's signing authority | `ledger-v2.md` 6: the two purposes, "raising the nonce does not retire a key", and a rotation that takes the signing right away first | L10: with the signing right left in place, the old key signs a new permit at the raised minimum and it is accepted; with it taken away, that permit and every later one are refused |
| 2 | The wording on `execute` under a suspension is narrowed | `ledger-v2.md` 5: a direct call is the account's own gate's matter, in both directions; a signed path depends on the account accepting the signature in that state | L15: the direct revocation is refused, and passes once the account's owner has allowed that call under a suspension; an operator's statement is refused while suspended |
| 3 | The interfaces are completed before they are frozen | `ledger-v2.md` 11: every struct, function, event and error; domains and ids as encodings; the three statements; the binding in force and pending. `client/abi/`; `test/vectors/permit-v2.json` | the vectors, computed three ways and signed by the script; L14 for a binding changed again before its epoch |
| 4 | The canonical encoding of a report is fixed | `client/lib/canonical.js`: RFC 8785 with the integer restriction; `ledger-v2.md` 13 | L35: one record, hashed twice, by a second implementation and by a second program; two runs at one block have one result hash and two report hashes |
| 5 | The audit of a past authority: by source, token and acceptance transaction; the registered address apart from the state of the evidence | `client/lib/genesis.js` (`authorityAtSettlement`); `ledger-v2.md` 10 | L32 |

On the second correction the executor's own earlier wording is corrected with it: revision 2
said that a suspended cell "cannot send a direct call through `execute` at all", and a note of
the account check said "to any target". The check showed a refusal for one configuration and
one target. The published account has a path that lets marked calls through under a suspension.

### 14.4 What was built, and what the executor verified

Everything here is evidence of an implementation on a local network. None of it is on a public
chain, none of it is an acceptance, and no key of a participant was used.

| What | Result |
| --- | --- |
| The tests | 131 pass, none fails (Node 22.23.5, Hardhat 2.29.2, solc 0.8.24): the 83 of the kernel of 0.1.3 and 48 new ones |
| The test matrix of `ledger-v2.md` 14 | 35 rows, each with at least one test that carries its id and passed; the limits of what a pass covers are stated there |
| The kernel's contracts and builds | unchanged: the six files under `build/` are byte for byte those of release 0.1.3 |
| The rehearsal (`npm run local-run`) | 41 checks, all passed, of which 4 are new - an audit names the one block it read, with the close record within it, and a second run at that block has the same result hash - and one is changed: a second `pouw work` finds its receipt and sends nothing |
| The tests against changes that should break them | 29 changes, each breaking one rule of the contracts or of the client; every one made at least one test fail. The first run found one test that did not notice a rule being broken - the bound on the gas given to a signature check - and the test was strengthened |
| The FOGA account's own behaviour | checked apart with its released bytecode, on a local network; review records kept outside this repository, and not part of these tests |

Three tests of the kernel were adapted, because the client's behaviour changed and the
contracts' did not: two expected a second `pouw work` to be refused by the ledger, where the
client now finds the receipt and sends nothing - the ledger's own refusal is still tested, by a
call that is sent all the same; and one read the judge at settlement from a field that is now
the authority record of `ledger-v2.md` 10.

Three findings came out of the work:

1. **The compiler override of release 0.1.3 was not in effect.** `hardhat.config.js` named the
   settings of the ERC-8414 reference contract as an override beside a single compiler version.
   Hardhat reads overrides only beside a list of compilers and otherwise drops them without a
   word, so the reference contract was compiled for the tests with the kernel's settings and
   not "the way its own repository compiles it", as the comment said. Nothing deployed was
   affected: nothing under `contracts/vendor` is ever deployed from here, the tender contract
   of round R2a is the one already on the chain, and the kernel's builds are unchanged. The
   configuration now has the form in which overrides apply.
2. **The v2 ledger is close to the size a chain allows.** With the kernel's settings it comes
   to 24,542 bytes, 34 under the limit. It is compiled through the compiler's IR pipeline, at
   21,674 bytes, and a test holds it 1,024 bytes under the limit (P66; Q31).
3. **An endpoint has to keep the state of the block it calls finalized.** The audit of 0.1.3
   read state at the latest block so that any full node would do (P27). Reading one finalized
   block, as A76 rules, gives that up: an endpoint that keeps recent state only, and whose
   finalized block lies further back, cannot serve the audit, and the client then fails with
   that reason. Reads at the finalized block were served by the endpoint of round R2a when the
   Cell Accounts were read on 2026-11-24 and 2026-11-25; the audit itself has not been run
   there with release 0.1.4.

### 14.5 This repository's proposals made with the implementation

On this repository's own judgment, where the rulings left a choice to the implementation. The
owner ruled on all six on 2026-11-25 (A82, A83): each row begins with how it was adopted.

| Id | Choice | Why | Where |
| --- | --- | --- | --- |
| P61 | Adopted as the interface for task units (A83); the module that shows membership and the issuer is delivered in its own scope. A profile version says that it counts task units with `countsUnits` and two commitments, to its task units and to the demanders it names; the profile's module shows membership and states the result; the receipt records it as `unit` | A78 asks how the task-unit rule is represented. The kernel stays without knowledge of any set of tasks, and an audit can read from a receipt why it was no task unit | `ledger-v2.md` 7 |
| P62 | Adopted as the rule of bounded checks of the local implementation (A83); the behaviour of real cells and the gas margin are measured before round R2b. The account's signature check is given 200,000 gas and the guard 500,000; one word of either answer is read; an ECDSA signature has one accepted form; an address with code at the time of use is a contract account, an externally owned account with a code delegation included | A check that fails, or never returns, must not take the call with it, and a refusal must cost a bounded amount | `ledger-v2.md` 4, 5 |
| P63 | Adopted with its semantics corrected (A83). A `Revoke` or `RaiseNonce` statement has no expiry and no nonce of its own, and can be submitted once it is signed; the state of the ledger changes when the transaction succeeds. A signed entry verifies the account's signature every time it is called, and once that check has passed an ending done again changes nothing. The zero address unbinds a guard and takes a version number like any binding. As proposed, this row said that doing any ending again "changes nothing and does not fail": that left the check out, and a statement sent again is rightly refused when the account no longer accepts its signature | They only take authority away, and a relayer can send one twice without harm while the account accepts the signature | `ledger-v2.md` 3, 6, 11.6 |
| P64 | Adopted with the two corrections of input handling (A83, A84), which release 0.1.5 makes. A record has two hashes: `resultHash` over what was found, and `reportHash` over the whole record. Records carry schema 2; the client's exit status 4 is "no state at the block"; `--require-sealed` makes a missing close record a difference | A78 says that two runs rightly differ in the hash of the whole report; the result hash is the one value by which two runs at one block are compared | `ledger-v2.md` 13 |
| P65 | Adopted for the recovery of a transaction that is already recorded (A83). `pouw work` and `pouw bridge` look for the receipt by its contribution id before they send; for a confirmation, only when the caller is the tender's owner | The recovery that row L33 asks for, without hiding the adapter's refusal from anybody else | `ledger-v2.md` 13 |
| P66 | Adopted with Q31 (A82): the IR pipeline, behind a compile boundary and with a compiler of its own for v2; the build with solc 0.8.24 is evidence of the local tests and no deployment build. The v2 ledger is compiled through the compiler's IR pipeline, with the kernel's optimizer runs | Its size (14.4, finding 2). The alternative is a smaller ledger under the kernel's settings | `ledger-v2.md` 1 |

### 14.6 What is not built, and what comes next

`ledger-v2.md` 16 lists what is not built and is needed before round R2b: the builds of the v2
contracts and the deployment from them, the client for a v2 deployment with its audit, the run
record, the module of the first production profile, the configuration and the runbook of the
round with the operation package of the one signature, and a measurement against the deployed
cells. None of it is started by this revision, and nothing is deployed or signed by it.

A first use of the new client on a public endpoint needs no key and changes nothing: the
hosted workflow, started by hand with the manifest of round R2a, checks that deployment and
audits its two epochs, each command at a finalized block of its own. It would show whether the
endpoint serves such a block, and whether the new client agrees with the ledger there as the
old one did. The owner agreed to it on 2026-11-25 (A85; 15.6). It is run once release 0.1.5 is
uploaded and checked and has not been run; it reopens nothing of round R2a, whose records stay
as made.

## 15. The review of the local implementation of ledger v2, and the rulings on it

### 15.1 Who wrote what, and on what the record rests

The times are those of Singapore (UTC+8); all are of 2026-11-25. The owner writes in Chinese:
what is given here of his words is a translation.

| When | What | Drafted by | Sent by | Standing in this record |
| --- | --- | --- | --- | --- |
| 04:07 | The upload of release 0.1.4, delivered as 52 files against commit `16d8bb6`: one commit, `b3e07df`, made by the owner through the web interface | the executor (the files) | the owner (the commit) | evidence of the implementation (14.4). The executor compared `main` with its own copy, file by file, and found them equal |
| 04:22 | The advisor's review of that delivery: what it checked on its own, three faults in tools, its opinion on Q30 and on Q31, a recommendation on each of P61 to P66, and an order for the next work | the advisor | the owner, as an attachment | the advisor's review (15.2). It is adopted as far as the owner's statement in the same message names its points, and no further |
| 04:22 | "I adopt the following opinions of the advisor in this round; record it by the actual date of sending of this message and by the scope of the adoption" - with seven numbered points | not stated in the message; the points follow the advisor's review | the owner, as his own message | the owner's explicit adoption: the ground on which A80 to A86 are rulings |

As in section 14, three things are kept apart: what the advisor advised and checked (15.2),
what the owner adopted (15.3), and what the executor reproduced, corrected and verified (15.4
to 15.7). The first two are the sources of the rulings; the third is evidence and rules on
nothing. The advisor's review of the discussion draft on platform Tokenomics keeps its
standing of 14.1: advisor recommendation recorded; owner adoption pending.

### 15.2 What the advisor's review checked on its own, and what it did not

As the review states it. The executor did not witness these checks and repeats none of them as
its own.

| Check | The advisor's result |
| --- | --- |
| The package and its checksum list | the package's hash and all 52 file hashes as stated |
| Against commit `16d8bb6` | 33 files new, 19 replaced, none deleted; a whole tree of 138 files |
| GitHub | the tree at `b3e07df` equal to the delivery, file by file |
| The kernel | its contracts unchanged; the six files under `build/` byte for byte |
| `npm test` | 131 pass, none fails |
| The rows L1 to L35 | all 35 ids appear in the advisor's own test output and pass; the main assertions were read against the implementation |
| `npm run local-run` | 41 of 41 checks |
| The five new compiled interfaces | each equal to a fresh compilation |
| The runtime size of the v2 ledger | recomputed: 24,542 bytes through the legacy pipeline, 21,674 through the IR pipeline |
| The rehearsal record that came with the delivery | its 75 source hashes equal the delivered files; the two hashes of each of its four records recomputed - eight comparisons, all equal |

The advisor's environment was Node 24.22.3 with Hardhat 2.29.2, solc 0.8.24 and ethers 6.17.0.
The executor's Node is 22.23.5: the advisor's run is a reproduction in another environment and
not a copy of the executor's output. The advisor read the script and the results of the 29
changes that should break the tests and did not run them; that part stays the executor's
evidence and is not recorded as checked independently.

### 15.3 The rulings, point by point

| The owner's point | Ruling | Where it is applied |
| --- | --- | --- |
| 1. The review passes in the main; three corrections of tools stay to be closed; the next delivery has `b3e07df` as its base | A80 | this section; the delta of release 0.1.5 has that base |
| 2. Q30: the interfaces are frozen; the interfaces and the deployable bytecode are recorded apart | A81 | `ledger-v2.md` 11.8; `contracts/v2/interfaces.frozen.json`; `test/v2.frozen.test.js` |
| 3. A small delta first, with three corrections | A84 | 15.4; release 0.1.5 |
| 4. Q31 and P66: the IR pipeline, a compile boundary and a locked compiler for v2, the kernel's boundary untouched | A82 | 15.5; `ledger-v2.md` 1. Not built in this revision |
| 5. P61 to P65, each with its boundary | A83 | 14.5; `ledger-v2.md` 3, 6, 11.7, 13 |
| 6. The hosted run, once the small delta is uploaded and checked | A85 | 15.6. Not run |
| 7. The next delivery and what stays | A86 | 15.7 |

The owner's statement adopts P61 to P65 in the short form of A83. The advisor's review words
some of their boundaries more finely, and those wordings are recorded here with the proposals
they belong to. Where one only narrows a claim that a document made, the document is narrowed
accordingly, on this repository's judgment; none of them is recorded as a ruling.

| Proposal | The advisor's boundary, as its review words it | Applied |
| --- | --- | --- |
| P61 | What is adopted is the interface: `countsUnits`, the two commitments, the module that classifies, the ledger that applies. The module that proves membership and the issuer is not delivered | `ledger-v2.md` 7, 16, which say so |
| P62 | 200,000 and 500,000 gas are not said to suit every account. The behaviour and the margin of real FOGA cells are measured before the operation package of round R2b. The strict form of a signature of an externally owned account does not restrict the formats that an account's own ERC-1271 check accepts | `ledger-v2.md` 11.7 |
| P63 | "In force when signed" becomes "can be submitted once signed; the mark or the minimum changes after the transaction has succeeded". "A repeat does not fail" becomes "after the present authority has been verified, a repeat changes no state": when the old key has lost its signing right, `BadSignature` for the old signature sent again is the right behaviour, and the check is not passed over to let a repeated call succeed | `ledger-v2.md` 3, 6; a test in `v2.guard`; no change of a contract, which verified first already |
| P64 | The empty slots of arrays and the repeated keys are corrected. Exit status 4 says that this read of state at the pinned block failed; it does not by itself show that an endpoint never serves past state | `client/lib/canonical.js`, `scripts/report-hash.py`; `ledger-v2.md` 13 |
| P65 | It covers the recovery after an answer was lost for work that is recorded. The deduplication by contribution id and the check of the owner stay as they are; it is not widened into a promise that several processes never send at once | `ledger-v2.md` 13, unchanged |
| P66 | As Q31; the results with solc 0.8.24 stay evidence of the local tests | `ledger-v2.md` 1 |

Two leftovers of wording that the review named are corrected with them. Work that its demander
does not confirm can have a public fact - one exists when somebody recorded it - and does not
have one automatically (`ledger-v2.md` 9, `genesis-mining-mvp.md` 13.7, `acceptance-matrix.md`
row D21). And the fault of the first revision's revocation was a namespace left undefined; the
table of 14.2 had it as "one global mark per digest", which read as if a global revocation had
once been delivered. None was.

### 15.4 The three faults in tools: as reported, as reproduced, as corrected

Each was reproduced by the executor on the tree of `b3e07df` before anything was changed.

| Tool | The fault, as the review reported it | Reproduced | Correction | Tests |
| --- | --- | --- | --- | --- |
| `scripts/sign-permit.js` | `--out` replaced whatever its path named. Given the path of the key file, a symbolic link to it or a second hard link of it, the script read the key, signed, wrote the record over the key file and ended with status 0 | all three cases, with the public test key in a temporary directory: status 0, and the key file held the record | the output path is looked at before the key file is opened - the link itself, not what it points to - and anything that has the name is a refusal; the write then creates the file exclusively, so that the guarantee does not rest on the look. Paths are not compared as text | `v2.permit`: seven taken paths - the key file, the same file spelled another way, a symbolic link to it, a second hard link, a link to nothing, another file, a directory - each refused, nothing printed, the key file's bytes and mode unchanged; the refusal precedes the reading of the key file; a new path is written and holds the printed record; the same path again is refused; the exclusive write tested on its own |
| `client/lib/canonical.js` | an array was serialized with `map`, which passes over an empty slot: `new Array(1)` gave `[]`, and `[1, , 2]` gave text that is not JSON | both | an array is walked by index, and a slot without a value is refused with its position | `snapshot`: five such arrays, through `canonicalize`, `sealed` and `resultHash`; complete arrays as before |
| `scripts/report-hash.py` | a member named twice in one object was read as its last value: a file could state one figure and be hashed with another | at the top and nested: status 0, hashes printed | every object is read member by member, and a name given twice is refused at any depth; no hash is printed | `snapshot`, in the second test of row L35: four files, one of them an audit's record with a member repeated; the same name in different objects is accepted |

What the first fault was and was not: a wrong argument could destroy a key file. It gave
nobody an authority on a chain, and the script had been run with test keys only - the step
that would use a live key is not prepared (`ledger-v2.md` 12). It is closed before that step
exists. None of the three corrections changes a contract, a compiled interface or the form of
a signature. The records of release 0.1.4 hold complete arrays and no repeated member; they
are not made again.

Each new test was run against the fault put back in, and each then failed (15.7).

One thing is named and not changed. The same way of writing a record - replacing whatever the
path names - is in the client's `--out` for `pouw audit` and `pouw verify`, in
`scripts/identity-check.js`, and in the record writers of the deployment and round scripts.
None of those commands opens a key file, and a round that is run again writes to the paths of
its first run by design (`acceptance-matrix.md` rows R1 and R3). A path typed wrongly can
still replace a file that matters there, a key file included.

| Id | Proposal | Why | Status |
| --- | --- | --- | --- |
| P68 | From the client for a v2 deployment on, the client's `--out` creates its file and refuses a path that exists. The scripts that write into a directory of their own keep replacing their own records. Release 0.1.5 leaves both as they are | The fault of this section was the replacing, and it is as easy to mistype a path there. Changing it now would change commands that the runbook of round R2a and the hosted workflow use as they are, and the owner asked for three corrections | Proposed; to be ruled with the next delivery |

### 15.5 The compiler, and the kernel's builds

The review stated that solc 0.8.24 is inside the range of a known bug of the compiler's
optimizer - `SOL-2026-7`, fixed in 0.8.38 - that the official description includes optimized
code generated through the IR pipeline, with no inline assembly of a project's own needed, and
that the official list by version named no known bug for 0.8.39 when the advisor read it. The
review observed no miscompilation of this project and said that passing tests cannot exclude
one. A82 rules on that.

The executor read the compiler maintainers' note on the bug, dated 2026-10-22, on 2026-11-25,
and found the range and the fix as the review has them: versions 0.8.19 to 0.8.37, fixed in
0.8.38. By that note the bug needs the Yul optimizer enabled; with the IR pipeline any code can
be concerned; the maintainers rate its severity low and an occurrence very unlikely. The
executor has not read the list by version for 0.8.39. That check, with its date and with the
compiler's complete version, belongs to the build record that A82 asks for.

One thing follows that the review did not raise. It is stated because it is true of what is
deployed. The kernel of release 0.1.3 - the six committed builds from which the deployment of
round R2a was made - was compiled with solc 0.8.24 as well, with the optimizer enabled and
without the IR pipeline. That is inside the same range of versions. For builds made without
the IR pipeline the maintainers' note narrows what can be concerned: to helper functions that
the compiler itself generates as Yul, and to inline assembly that refers to no Solidity
variable. The kernel has no inline assembly. No fault of the kernel was observed in the tests,
in the rehearsals or in round R2a, whose two epochs an independent run recomputed from the
chain. A82 keeps the kernel's compiler and its builds as they are, and nothing here changes
them.

| Id | Proposal | Why | Status |
| --- | --- | --- | --- |
| P67 | The kernel's builds and the deployment of round R2a stay as they are and are not rebuilt; the fact above is recorded with them. No deployment that carries value is made from the kernel's sources with a compiler inside the range of the bug. Whether the six builds are checked by a method the maintainers describe is the owner's choice | The deployment of round R2a carries test points that cannot be redeemed, and round R2b runs on ledger v2 (A75). A check is possible without touching a build; it shows less than a build with a fixed compiler would, and such a build would be another deployment | Proposed; Q32 |

### 15.6 The hosted run of the new client (A85)

Not run. It is started by hand once release 0.1.5 is on `main` and compared with the delivery:
the existing workflow, with the manifest `deployments/finchain-sepolia-r2.json` and the epochs
`0 1`. It needs no key and sends no transaction.

It is recorded as the new client's verification of the existing deployment of round R2a on a
public endpoint, with an audit at a pinned block. Kept: the commit, the link of the run, the
exit status of each command and the three reports - the check of the deployment and the audits
of the two epochs. Each of the three commands takes a block of its own, so each report names
its own block, hash and time; that the whole run read one block is said only if the three
reports show it. The workflow also runs the tests and the rehearsal on the hosted machine.

The run reopens nothing of round R2a. Its acceptance (6.11) and its records stay as they are,
and no file under `evidence/r2a/` is changed. It does not wait for the build of v2.

### 15.7 What the executor verified, and what comes next

Everything here is on a local network, as in 14.4. No key of a participant was used.

| What | Result |
| --- | --- |
| The tests | 137 pass, none fails (Node 22.23.5, Hardhat 2.29.2, solc 0.8.24): the 131 of release 0.1.4 and six new ones - the signing script's output path, a statement verified at each submission, an array with an empty slot, and three that hold the frozen interfaces. The refusal of a repeated member is added to an existing test |
| The contracts, the compiled interfaces, the vectors and the kernel's builds | unchanged from `b3e07df`, byte for byte; the test of the freeze holds the first three to their hashes at that commit |
| The rehearsal | 41 checks, all passed, with release 0.1.5 from a clean copy; its record is under `evidence/` |
| The tests against changes that should break them | 38 changes: the 29 of 14.4 and nine new - the three faults put back, in five forms; a statement sent again and not verified, for a revocation and for a raising of the nonce; and two changes of a frozen code. Every one made at least one test fail |

The next delivery (A86), in this order: the compile boundary of v2 with its locked compiler and
its build record, then the reproducible builds, the deployment tooling and a manifest that
names what it supersedes; the client for a v2 deployment, with work and confirmation through a
delegate, its audit and its run record. Beside it and no precondition of it: the module that
shows task units and their issuer, with the other components of the first production
increment, and the two discussion drafts, which stay drafts. A signature with a live key, a
deployment and any operation on a chain are steps of their own operation packages; none is
part of this revision or follows from it without one.

## 16. The compile boundary and the builds of ledger v2

### 16.1 What this revision is

It applies A82 and holds no new ruling. Release 0.1.5 was uploaded on 2026-11-25 at 11:33
(UTC+8) as one commit, `d8363aba0d427d0e377692ab241641721308779c`, made by the owner through
the web interface; the executor compared `main` with its own copy file by file and found them
equal. This revision has that commit as its base. The hosted run of A85 is the owner's to
start on that commit; its record is not part of this revision.

### 16.2 What was done

| Part | What it is now | Held by |
| --- | --- | --- |
| The boundary | the directory `contracts/v2`. Every file in it states `pragma solidity 0.8.39;` and imports files of that directory only; every file of the kernel states `0.8.24` as before and imports nothing of v2 | the compiler itself, which refuses a file whose imports state another version; `test/v2.build.test.js`, which also reads from the compiler's records that no compilation held files of both sides |
| The three interfaces v2 calls | `ISeedSource`, `IG0Function` and `ITaskTender8414` have copies in `contracts/v2/external/`, under the same names and with the same declarations. The two sides share them as ABIs and as nothing else | a test: the ABI of each copy equals the kernel's, and the text of each copy is the kernel's text with another pragma and a note that it is a copy |
| Fixtures | the four that import v2 - the ERC-1271 accounts, the switchable guard, the mock cell, the test module - moved from `contracts/testing/` to `contracts/v2/testing/` | the same test: nothing under a `testing` directory is among the sources of a build |
| The reference contracts of ERC-8414 | they state `^0.8.24`, so each is pinned by name to the kernel's compiler and compiled as before | the same test |
| The compiler of v2 | solc 0.8.39 as the package `solc@0.8.39`, installed beside the kernel's `solc@0.8.24` and pinned by the lock file's integrity hash; full version `0.8.39+commit.ce47f2c8.Emscripten.clang` | `build/v2/build-record.json`, and a test that asks the installed compiler for its version and hashes its file |
| Settings | the kernel's: optimizer enabled, 200 runs, EVM version `cancun`. The ledger through the IR pipeline; the policy, the adapter and the cell guard through the legacy pipeline | the build record; a test on the configuration and on each build |
| Builds | `build/v2/`: the policy, the ledger, the adapter and the cell guard, each with its pipeline and with the hash of every source file it is made of, as the compiler wrote them into the contract's metadata | a test: each committed build is what a fresh compilation gives |
| Build record | `build/v2/build-record.json`: the compiler as installed, each contract's settings, sizes and hashes | the same test |
| The reading of known bugs | `build/v2/known-bugs-check.json` (16.3) | a test fails when the v2 compiler is no longer the compiler the reading is about |

Not changed: a rule of the ledger, a compiled interface, a type, a code, a vector; the kernel's
sources, compiler, settings and six builds; the client. The four frozen source files differ
from the commit of the freeze in their pragma line alone, which the freeze allows.

### 16.3 The compiler's own list of known bugs, as read on 2026-11-25

Read by the executor from the compiler's repository, `https://github.com/argotorg/solidity`,
branch `develop`, whose head was `096eb79bf8c06634965637247e3c7ddb505fad1a`: the files
`docs/bugs_by_version.json` and `docs/bugs.json`. Their hashes, and what they held for the
three versions below, are in `build/v2/known-bugs-check.json`.

| Compiler | Released | Entries in the list |
| --- | --- | --- |
| 0.8.39, for v2 | 2026-11-19 | none |
| 0.8.38, considered | 2026-10-22 | two, of one bug: `SOL-2026-8` |
| 0.8.24, the kernel's | 2024-01-25 | seven |

So 0.8.39 is the first version with an empty entry, as the advisor's review had read it, and
0.8.38 is not. An empty entry says that no bug was known on the day of the reading. A bug found
later is added for every version it concerns; the compiler was six days old on that day.

The seven entries for 0.8.24, set against the kernel's builds - legacy pipeline, optimizer
enabled. Section 15.5 named one of them, from the maintainers' note on it, before the list
itself was read. This is the whole list.

| Id | Entry | What it needs | The kernel's sources and builds |
| --- | --- | --- | --- |
| `SOL-2026-8` | a copy between overlapping recursive structs in storage corrupts data (legacy pipeline) | a struct that holds a dynamic array of its own type, and a copy in storage whose target contains its source | no struct of the kernel refers to its own type |
| `SOL-2026-8` | the same, through the IR pipeline | the IR pipeline | not used |
| `SOL-2026-7` | the Yul optimizer keeps stale knowledge of a memory or storage location | the Yul optimizer. Without the IR pipeline, by the maintainers' note: helper functions that the compiler generates as Yul, or inline assembly that refers to no Solidity variable | the optimizer is enabled and the kernel has no inline assembly; generated helpers are part of every build. Reading the sources does not exclude it |
| `SOL-2026-5` | `delete` of one element of a `bytes` array in memory clears a whole word | that `delete`, in the legacy pipeline | the kernel has no `delete` |
| `SOL-2026-4` | two functions in mutual recursion are given one spill slot | the IR pipeline | not used |
| `SOL-2026-2` | a variable of a function in mutual recursion is moved to a fixed memory offset | the IR pipeline | not used |
| `SOL-2025-1` | a write is lost on an array that wraps past the last slot of storage | an array whose slots straddle the end of storage | the kernel lays out no storage by hand; the data of its three arrays lies where a hash puts it |

What this shows and what it does not: for six of the seven the kernel either does not use the
pipeline or does not have the construct, by a reading of its sources. For the seventh nothing
was observed and nothing can be excluded by reading. No build was changed or checked beyond
this reading; P67 and Q32 stand as they were, with this fuller ground.

### 16.4 Findings, and this repository's choices

1. **With solc 0.8.39 the ledger does not fit through the legacy pipeline.** It comes to 24,705
   bytes there, 129 over a chain's limit, and to 21,855 through the IR pipeline. Under solc
   0.8.24 the legacy pipeline left 34 bytes of room. The IR pipeline that A82 rules is, with
   this compiler, the only way the ledger as adopted can be deployed.
2. **The compiled interfaces came out unchanged.** The five files of `client/abi/` for v2 are
   byte for byte the frozen ones under the new compiler, and all 137 tests of release 0.1.5
   pass on the new builds with no change to a test.
3. **Hardhat 2.29.2 prints a notice for solc 0.8.39**: "not fully supported yet". The notice
   names features of Hardhat itself, such as stack traces. The tests do not rely on them.
4. **A deployment of v2 is not made of v2 contracts alone.** It needs a G0 function and a seed
   source, and those are contracts of the kernel, built by solc 0.8.24 (Q33).

| Id | Proposal | Why | Status |
| --- | --- | --- | --- |
| P69 | The shape of the boundary as 16.2 has it: the directory as the boundary; v2's own copies of three interfaces under the kernel's names; the fixtures that import v2 inside the boundary; the reference contracts pinned to the kernel's compiler; each compiler a package pinned by the lock file; the ledger alone through the IR pipeline; the kernel's optimizer runs and EVM version for v2 | A82 asks for a boundary of its own and leaves its shape open. The names are kept because a compiled interface records them and the compiled interfaces are frozen. The settings are kept so that the compiler is the one thing that changes between the builds that were tested before and the builds that are tested now | Implemented in release 0.1.6; to be confirmed or changed with the review of this delivery |
| P70 | v2 gets its own copies of `AuditV1` and of the seed sources inside `contracts/v2`, compiled by the v2 compiler, so that every contract of a v2 deployment comes from one boundary and has one build record. The kernel's files and builds stay as they are | Otherwise a deployment of v2 holds two contracts built by a compiler that A82 moved v2 away from. They are small and without storage of their own to corrupt, and round R2b carries test points only, so deploying the kernel's builds of them is defensible as well | Proposed; not built; Q33 |

### 16.5 What was verified

On a local network, as before. No key of a participant was used and nothing was sent to a
public chain.

| What | Result |
| --- | --- |
| The tests | 143 pass, none fails (Node 22.23.5, Hardhat 2.29.2; the kernel by solc 0.8.24, v2 by solc 0.8.39): the 137 of release 0.1.5, unchanged and now on the builds of the v2 compiler, and six new ones on the boundary and the builds |
| The rows L1 to L35 | every row has a passing test that carries its id, on the new builds |
| The fixed vectors and the frozen interfaces | unchanged, byte for byte; their tests pass |
| The size gate | the ledger's build is 21,855 bytes, 2,721 under the limit; the test asks for 1,024 |
| The kernel | its six builds and its five compiled interfaces are byte for byte those of `d8363ab` |
| A second build | `npm ci` and `npm run export-abi` in a clean copy wrote the four builds and the build record byte for byte as committed |
| The rehearsal | 41 checks, all passed, with release 0.1.6 from a clean copy; its record is under `evidence/` |
| The tests against changes that should break them | 40 changes: the 38 of 15.7 on the new builds, and two new - a copied interface that no longer declares what the kernel's declares, and a build left stale after a source changed. Every one made at least one test fail |
| Gas | each figure of `ledger-v2.md` 11.7 measured again on the new builds: within 2,500 gas of the figure under solc 0.8.24 |

### 16.6 What comes next

In the order of A86: the deployment of v2 from the builds of `build/v2`, with a manifest that
names what it supersedes and holds the code hashes of the guards - which needs the answer to
Q33 first; then the client for a v2 deployment with work and confirmation through a delegate,
its audit and its run record. Beside it: the module that shows task units and their issuer,
and the two discussion drafts. The builds of this revision are candidates for a deployment.
One of them becomes the build of a deployment when that deployment's operation package names
it by commit and by the hashes of its record, and not before.
