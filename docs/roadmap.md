# Implementation Roadmap

Round 1 design. The roadmap answers three questions: what existing code and contracts the MVP
reuses, what must be new, and the minimal order of implementation. Milestones follow the owner's
four-stage route (P1 PoUW Kernel, P2 Genesis Network, P3 SIG + IPC, P4 FCT Economy); this document
details P1 and the entry into P2.

## 1. Reused as they are (A6)

| Existing piece | Where it lives | How the MVP uses it | Change needed |
| --- | --- | --- | --- |
| ERC-8414 Token-Bound Task Tenders (the live TaskToken on Finchain Sepolia, part of the covenant World) | `finchain` World address book; standard in `task-token-standard` | the whole G1 path: tender, take, deliver, accept or settle by silence, bounty paid from the tender's own escrow; the bridge reads the settlement | none to the standard or the deployed contract; one adapter contract here |
| ERC-8444 ARD Onchain value registry | World address book; `ard-onchain-framework` | optional: a G0 job set or a PoUW profile is registered as a registry entry so that agents discover it the way they discover other value records | none; one registration per profile by the steward |
| ERC-8004 identity root, ERC-8434 AID | World address book; `aid-standard` | the Declared tier (P1, section 4 of the architecture) | none |
| ERC-8419 KYA assertions | `kya-standard` | eligibility for verification duty and higher caps, from P2 on | none |
| ERC-8436 ACDF decision bodies | `acd-framework` | the overturning body of the challenge window when more than a tiered verifier is wanted (P9) | none; a body policy registered for PoUW verdicts |
| ERC-8471 dispute resolution | `ai-dispute-resolution-framework` | disputes beyond the challenge window, from P2 on | none |
| ERC-8454 AIFi Unit Framework | `aifi-unit-framework` | measurement statements of SIG later carry the AUF assertion envelope; workers and job sets are economic units | none in the MVP |
| FOGA 1.0.9 cells: the OG (E06, `og.finchain.one`) and cell-b (E05) | `foga`; `finchain` evidence of the M3-C business loop | the first two miners; they already run the G1 path end to end on Finchain Sepolia | an optional PoUW adapter in `foga` (P11), released on FOGA's own cycle |
| Finchain Sepolia: chain 85422, public RPC, the World, the recommended manifest `finchain-sepolia/2026.11` | `finchain` | the first deployment target (A15) | none; a deployment record here and a verified-version reference there |
| `finchain`'s evidence conventions (records with schema, environment, recordedAt; delta packages; byte-exact verification) | `finchain` | the same conventions for PoUW evidence | none |

## 2. New in this repository

| Piece | Round | Notes |
| --- | --- | --- |
| Contracts: `ProfileRegistry`, `WorkReceipts`, `GMULedger`, `EpochRewards`, `ParamsRegistry`, `TenderBridge8414`, verifier modules `RecomputeVerifier`, `CalibrationVerifier`, `AgreementVerifier`, `AcceptanceVerifier` | R1 | Solidity, Foundry tests, interfaces of `genesis-mining-mvp.md` section 10; no upgradeable proxies |
| Reference client `pouw` (`work`, `tender`, `epoch finalize`, `audit`, `status`, `claim`) | R1 | Node.js, JSON-RPC only, manifest-driven; runs anywhere the worker key is |
| G0 job-set tooling: generate a job set, commit its root, publish it, produce the answer set | R1 | steward tooling; the first job sets are deterministic and reproducible |
| Deployment manifest format and the Finchain Sepolia manifest | R2 | `deployments/finchain-sepolia.json` |
| Evidence records: deployment, first epoch, audit recomputation, third-party participation | R2-R3 | schema-tagged JSON like `finchain`'s |
| FOGA PoUW adapter | R2 (in `foga`) | optional; calls the same interface as the reference client |
| Node attestation registry (FPM01-N) | P2 | later module |

## 3. Minimal order

| Round | Deliverable | Acceptance (see `acceptance-matrix.md`) |
| --- | --- | --- |
| R0 (this round) | the four design documents; rulings on `decisions.md` P1-P14 | the owner and the advisor rule on the architecture and the minimal scope |
| R1 | contracts + tests + reference client + job-set tooling; a local run (Anvil) of two workers through one epoch with G0 and G1 receipts, finalization, claims and an audit that matches | all matrix rows marked "local" pass |
| R2 | deployment on Finchain Sepolia (manifest, source verification, evidence); profiles registered; job set 0 committed; the OG cell and cell-b mine epoch 0 (G0 jobs; one G1 tender between them as in M3-C); finalization by a third account; audit recomputed from the public RPC on a machine that is not a node | the P1 milestone of the owner's route: two existing cells complete one round of mining and scoring with an independent recomputation |
| R3 | one independent third-party worker (no Finchain node, RPC only) joins with the reference client; a second epoch; the failure drills of the matrix (restart, duplicate, replay, parameter change) run on Sepolia | the entry into P2 Genesis Network |
| R4 | SIG and IPC design round (documents first, as in R0); Tokenomics ruling requested from the owner; mainnet deployment of the kernel only after the owner's separate decision | - |

Nothing in R1-R3 touches the chains' operation: contracts are deployed through the public RPC by a
funded deployer key the owner provides, like the ERC-8004 identity root and the World were.

## 4. Dependencies and what does not block what

- The mainnet running acceptance of `finchain` (anchor, bond, Type 8, withdrawal; then M5) runs on
  its own clocks; R0-R3 here need none of it (A15).
- FOGA releases are not a condition: R2 can run with the reference client driving the two cells'
  worker keys if the adapter is not released yet; the adapter makes the cells self-driving.
- The 97-page FPM01 / FPM01-G v0.2 record is the design source for the review of R0; the
  approved decisions already in `decisions.md` are enough to build R1 while the record is read.
- Tokenomics (FCT) is not designed here; R4 asks for the ruling. Test points of the MVP are a
  simulation and create no obligation (A5).

## 5. Estimates

Rough sizes for the owner's planning, not commitments: R1 about one week of implementation with
tests; R2 a few days once Sepolia gas and the two cells are at hand; R3 depends on the third
party's availability; each round ends with a delta package and a verified upload, as in
`finchain`.
