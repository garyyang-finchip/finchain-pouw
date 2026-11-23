# Decisions

Three classes, kept strictly apart. **Approved** entries are rulings by the owner (with the
advisor) and bind the design. **Proposed** entries are this repository's defaults, written so that
the first round can be reviewed as one piece; each is in force only after a ruling. **Illustrative**
entries are figures used to explain a mechanism; none of them is a protocol parameter, and the
Genesis Mining MVP must run with any value in their place.

## Approved

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
| A14 | Round 1 delivers design documents only (architecture, Genesis Mining MVP, implementation roadmap, acceptance and failure matrix); no code before the architecture and the minimal scope are ruled on. The design review point is the PoUW-Upgrade-Mark of 2026-11-27. | owner, 2026-11-23 |
| A15 | First deployment and acceptance on Finchain Sepolia (the recommended reference version, the World, the OG cell and cell-b exist there); the mainnet receives the protocol as an independent module after internal and third-party acceptance. The mainnet's running acceptance (anchor, bond, Type 8, withdrawal) proceeds separately and is not delayed. | owner, 2026-11-23 |
| A16 | Cellular completeness (a cell's self-repair and replication by code) is a goal pursued across P1 to P4, not a gate for participation. | FPM01; owner, 2026-11-16 and 2026-11-23 |
| A17 | A worker's fuel (compute, model tokens) may come from the operator (stage 1), from the agent itself buying tokens with USDC through x402 (stage 2) or, in the future, from the node's own GPUs (stage 3); the protocol accepts all three and requires none. Most first-batch nodes start in stage 1. | owner, 2026-11-20 |
| A18 | Real service revenue (G1 payments between demander and worker) and simulated mining points are accounted separately and never mixed. | owner, 2026-11-23 |

## Proposed (this round; in force only after a ruling)

| Id | Proposal | Where |
| --- | --- | --- |
| P1 | Worker identity is an EVM address; an ERC-8004 agent id, an ERC-8434 AID or an ERC-8419 KYA assertion may be bound to it and raise an eligibility tier, but none is required to submit work. | architecture.md section 4 |
| P2 | A work receipt is written on chain once, is immutable, and carries the hashes of its inputs and outputs; the content itself stays off chain with the worker and the demander. Deduplication key = hash(profile, worker, task reference, input hash). | genesis-mining-mvp.md section 3 |
| P3 | G0 verification is by profile: `g0.ref` (reference computation, verified by recomputation against a committed answer set), `g0.cal` (resource calibration, verified by spot re-measurement with a tolerance), `g0.ver` (verification of other receipts, verified by agreement with the final verdict). Each profile names its verifier module and version. | genesis-mining-mvp.md section 5 |
| P4 | G1 receipts are derived from ERC-8414 acceptance: a tender taken, submitted and accepted (or settled after the judgment window) yields one receipt whose GMU is declared from the tender's terms; a dispute through the tender's own judgment path withholds the receipt until it is settled. | genesis-mining-mvp.md section 5 |
| P5 | GMU v1 = profile base x units x quality factor x tier factor, with every factor defaulting to a declared value when a measurement is missing (the Unrated / Declared / Assessed / Calibrated ladder of SIG, with only Unrated and Declared used in the MVP). | genesis-mining-mvp.md section 6 |
| P6 | Epochs have a fixed duration and a budget schedule pinned at the start of each epoch; the parameters of an open epoch cannot change; the G0 and G1 pools are separate; a per-worker share cap applies in each pool; an epoch is finalized permissionlessly by anyone once it has ended, and its result is a deterministic function of the receipts and the pinned parameters. | genesis-mining-mvp.md section 7 |
| P7 | Test points are a non-transferable balance kept by the reward contract (no ERC-20, no approval, no transfer); they are claimed per epoch by the worker (pull), once. | genesis-mining-mvp.md section 8 |
| P8 | Unclaimed or uncovered budget of an epoch is not redistributed inside the epoch; its treatment (carry forward, retire) is a parameter of the schedule and defaults to retire. | genesis-mining-mvp.md section 7 |
| P9 | Every receipt has a challenge window after verification; within it a verifier of a higher tier or a decision body (ERC-8436 profile) may overturn the verdict; after it the receipt is final. Disputes beyond that are referred through ERC-8471 in a later phase. | architecture.md section 7 |
| P10 | A deployment manifest (chain id, contract addresses, World address book reference, parameter and profile versions) is the only place a chain is named; contracts take addresses by constructor or initializer. | architecture.md section 8 |
| P11 | The reference worker client speaks JSON-RPC only and can run on any machine with the worker key; FOGA takes part through an optional adapter in the `foga` repository that calls the same interface; nothing in `foga` depends on this repository at build time. | architecture.md section 5 |
| P12 | The first miners on Finchain Sepolia are the OG cell (E06) and cell-b (E05), followed by at least one independent third-party worker that runs no Finchain node. | roadmap.md |
| P13 | Receipts and epochs are counted from the chain's finalized state when read for settlement and audit; a receipt in a reorged block does not exist. | acceptance-matrix.md |
| P14 | Node attestations for the Finchain AI Node standard (FPM01-N) - a registry linking a worker address to a verification node's identity - are a later module (P2 of the roadmap), not part of the MVP; the MVP does not reward node operation. | architecture.md section 9 |

## Illustrative (figures used to explain, not parameters)

| Figure | Used where | Note |
| --- | --- | --- |
| 24-hour epoch | genesis-mining-mvp.md section 7 | an example duration; the contract takes any duration |
| 70 / 30 split between the G0 and G1 pools | genesis-mining-mvp.md section 7 | an example split; the schedule carries the split per epoch |
| budget halving every 8 epochs | genesis-mining-mvp.md section 7 | an example of a decreasing schedule; the schedule is a table pinned per epoch |
| 25 percent per-worker cap of a pool | genesis-mining-mvp.md section 7 | an example cap |
| 1,000 test points as the first epoch's budget | genesis-mining-mvp.md section 7 | an example budget |
| GMU base values of the G0 profiles | genesis-mining-mvp.md section 6 | examples; set by the profile registry at deployment |
