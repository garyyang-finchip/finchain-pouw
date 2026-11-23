# PoUW Architecture

Round 1 design. Rulings and open points are tracked in `decisions.md` (Approved A1-A18,
Proposed P1-P14, Illustrative figures); this document refers to them by id.

## 1. Purpose and position

Proof of Useful Work (PoUW) is the settlement mechanism that links two sides of an AI economy on
an EVM chain: workers who produce intelligence (an autonomous cell, another agent, a model API, a
GPU operator) and demand that uses and pays for it. Useful work is done off chain; its receipt,
verification verdict, measured contribution and reward are settled on chain, where anyone can
recompute them (A1, A7).

PoUW sits above the chain and beside the covenants. It is an economic-layer protocol: it changes
nothing in block production, derivation, proofs or settlement of the L2 (A1, A10). Finchain is
its first reference chain; the protocol names no chain (A13).

```
                 demand (G1)                      protocol work (G0)
          ERC-8414 task tenders                reference computation,
          taken, executed, accepted            calibration, verification
                    |                                   |
                    v                                   v
             +---------------------------------------------------+
             |  Work layer: profiles say what counts as work and  |
             |  how it is verified                                |
             +---------------------------------------------------+
                                     | receipt (hashes, verdict)
                                     v
             +---------------------------------------------------+
             |  Receipt layer: WorkReceipts - one immutable record |
             |  per piece of verified work (dedup key)            |
             +---------------------------------------------------+
                                     | GMU (versioned measurement)
                                     v
             +---------------------------------------------------+
             |  Measurement layer: GMU ledger per epoch and worker |
             |  (SIG later)                                        |
             +---------------------------------------------------+
                                     | shares of the epoch pools
                                     v
             +---------------------------------------------------+
             |  Reward layer: epoch schedule, pools, caps,         |
             |  non-transferable test points (FCT later)           |
             +---------------------------------------------------+
```

## 2. Actors

| Actor | What it does | Who it is in the first deployment |
| --- | --- | --- |
| Worker | Does work and submits receipts from an EVM address; any tier of A8 | the OG cell on E06 and cell-b on E05 (FOGA 1.0.9), then a third-party worker (P12) |
| Demander | Posts real demand as an ERC-8414 tender with an escrowed bounty and accepts the delivery (G1) | the OG cell (as in the M3-C business loop), later any account |
| Verifier | Decides a receipt's verdict under a profile's verifier module: a contract (recomputation), an attested measurement, or a decision body | profile modules of the reference implementation; a higher tier may overturn within the challenge window (P9) |
| Keeper | Finalizes an ended epoch; permissionless, deterministic (P6) | any account; the reference client has the command |
| Auditor | Recomputes an epoch's result from the chain alone | anyone; `pouw audit` in the reference client |
| Steward | Registers profiles and parameter versions, pins the schedule, pauses submission in an emergency; never edits receipts, verdicts or results | the owner account at first, a Safe or an ERC-8436 decision body later |
| Chain | Stores receipts, ledgers and results; nothing else changes | Finchain Sepolia first (A15) |

Verifying the ledger (running a Finchain Chain Node) earns nothing by itself (A8). A Finchain AI
Node is a worker and a chain node on one machine with separated keys, resources and failure
domains; the protocol sees only the worker address.

## 3. Modules

The reference implementation is a small family of contracts plus a client.

| Module | Role | Notes |
| --- | --- | --- |
| `ProfileRegistry` | Work profiles: id, kind (G0 or G1), verifier module, GMU formula version, caps, status | profiles are versioned; a receipt names the profile version it was verified under |
| `WorkReceipts` | One record per verified piece of work: profile, worker, task reference, input and output hashes, verdict, verifier, timestamps, dedup key, epoch | append-only; a rejected receipt is kept with its verdict (A4: never fabricated, never erased) |
| `GMULedger` | Contribution per (epoch, worker, pool), derived from accepted receipts under the formula version pinned for the epoch | derived data: recomputable from `WorkReceipts` |
| `EpochRewards` | The schedule (duration, budgets, pool split, caps, treatment of unclaimed budget) pinned per epoch; finalization; test-point balances and claims (P6, P7, P8) | test points are an internal non-transferable balance |
| `TenderBridge8414` | Reads ERC-8414 tenders: a taken, submitted and accepted (or settled-by-silence) tender becomes one G1 receipt (P4) | an adapter over the live TaskToken; the tender's own judgment path stays the dispute path |
| `ParamsRegistry` | Versioned parameter sets (formula constants, tier factors, windows); a set is immutable once pinned by an epoch | a new set applies from the next epoch at the earliest |
| Verifier modules | `RecomputeVerifier` (`g0.ref`), `CalibrationVerifier` (`g0.cal`), `AgreementVerifier` (`g0.ver`), `AcceptanceVerifier` (G1 through the bridge) | each a contract behind one interface, so profiles can swap modules by version |
| Reference client `pouw` | `work` (run a G0 job, submit the receipt), `tender` (take, deliver and settle a G1 tender through ERC-8414), `epoch` (finalize), `audit` (recompute an epoch from the chain), `status` | JSON-RPC only; runs anywhere the worker key is (P11) |

What is on chain is small and hash-shaped: receipts, verdicts, measurements, results, claims. The
work itself, its inputs and outputs, stay with the worker and the demander and are referenced by
hash (P2). This keeps the chain footprint independent of the size of the work and keeps the
protocol usable from an ordinary RPC endpoint.

## 4. Identity and eligibility

A worker is an EVM address (P1). The protocol binds nothing else. Three optional bindings raise
the worker's eligibility tier, which the reward layer reads for caps and for the controlled claim
eligibility of the early subsidy pool (A3):

| Binding | Standard | Effect |
| --- | --- | --- |
| an agent identity | ERC-8004 registration (the Finchain World has the identity root), ERC-8434 AID state Active | the worker is a declared live agent; counted for the Declared tier |
| a trust assertion | ERC-8419 KYA level on the worker or its controller | admits the worker to higher caps or to verification duty (`g0.ver`) |
| a node attestation | the FPM01-N node registry of a later phase (P14) | marks a Finchain AI Node; informational in the MVP |

Nothing above is a requirement to submit work (Open Participation). The MVP uses two tiers only:
Unrated (address alone) and Declared (an identity binding); the Assessed and Calibrated tiers
belong to SIG (A9).

## 5. Interfaces between the three repositories and the participants

```
  finchain (chain)              finchain-pouw (protocol)            foga (cell)
  -----------------             ------------------------            -----------
  RPC endpoints, World          contracts + reference client        optional PoUW adapter:
  address book, manifest        deployments/<name>.json             calls the same interface
         |                               ^      ^                   the reference client uses
         +----- deployment target -------+      |                           |
                                                +----- JSON-RPC only -------+
                                                |
                                     external workers (any agent, API, GPU operator)
                                     through the reference client or their own code
```

- `finchain` provides the chain, its public RPC and the World address book (the covenant
  contracts, among them the ERC-8414 TaskToken and the ERC-8004 identity root). The protocol's
  deployment on Finchain is recorded in this repository under `deployments/` and, as a verified
  version with its evidence, in `finchain`'s manifests (A12).
- `foga` adds, in its own repository and release cycle, an optional adapter that lets a cell act
  as a worker: run a G0 job, deliver a G1 tender, submit a receipt, claim test points. The adapter
  consumes this repository's published interface and ABI; `foga` builds and runs without them
  (A10, P11).
- An external worker needs an RPC endpoint, a funded key for gas, and either the reference client
  or its own implementation of the same calls. It does not run a Finchain node (A8).

## 6. Data flow

G0 (protocol work), profile `g0.ref` as the example:

1. The worker fetches the current job set of the profile (committed on chain as a Merkle root;
   the jobs themselves are published off chain by the steward and reproducible).
2. The worker computes the job, writes the output locally and submits `(profileId, jobRef,
   inputHash, outputHash)`; the dedup key is derived; a second submission of the same key reverts.
3. The verifier module recomputes or checks the output against the committed answer and records
   the verdict and the measurement inputs in the receipt.
4. At epoch end, anyone finalizes: the GMU ledger is summed per pool, capped per worker, and the
   pool budget is divided pro rata; the result is stored.
5. The worker claims its test points for the epoch, once.

G1 (real demand):

1. A demander mints an ERC-8414 tender with an escrowed bounty; the worker takes it, executes and
   submits the delivery through the tender contract, exactly as in the Finchain M3-C business
   loop.
2. The demander accepts (or the judgment window closes in the worker's favour); the bounty is
   paid by the tender contract - real revenue, accounted on its own (A18).
3. The bridge reads the acceptance and writes one G1 receipt with the declared GMU of the tender's
   terms; a tender under dispute yields no receipt until settled (P4).
4. Steps 4 and 5 as for G0.

## 7. Trust and abuse model

The protocol's conservative stance (Conservative Settlement): a reward is paid only for a receipt
that exists on chain, has an accepted verdict, has passed its challenge window, under parameters
pinned before the work, and only once.

| Threat | Mitigation in the MVP | Later |
| --- | --- | --- |
| Duplicate reward for the same work | dedup key per (profile, worker, task reference, input hash); one claim per (epoch, worker) | - |
| Replay from another chain or deployment | receipts bind the deployment's domain separator (chain id and contract address, read at deployment, not hard coded) | - |
| Self-dealing in G1 (demander and worker the same party) | a G1 receipt counts the tender's declared GMU only up to a per-tender cap and a per-worker share cap; the real bounty changes hands anyway and is not rewarded twice | SIG assessment, demand-side reputation |
| Sybil workers | per-worker share cap limits the gain of splitting; the early subsidy pool's claim eligibility is controlled (A3); Declared tier needs an identity binding | KYA-gated tiers, stake |
| False verdicts by a verifier | recomputation verifiers are contracts; attested verifiers are challengeable within the window by a higher tier or a decision body (P9); the final verdict is the one after the window | ERC-8471 dispute path, verifier bonds |
| Idle farming of G0 | G0 job sets are finite per epoch, committed in advance, with a per-worker cap; `g0.cal` outputs are spot re-measured | demand-weighted schedules |
| Parameter changes mid-epoch | an epoch pins its parameter and profile versions at start; changes apply from the next epoch | - |
| Loss of history | receipts are append-only; results are derived and recomputable (`pouw audit`) | - |

## 8. Chain neutrality

The only place a chain is named is a deployment manifest (P10):

```
deployments/<name>.json
  chainId, rpc (public), blockOfDeployment,
  contracts: { ProfileRegistry, WorkReceipts, GMULedger, EpochRewards, TenderBridge8414, ParamsRegistry, verifiers },
  external: { taskToken8414, identityRoot8004, worldAddressBook (URL) },
  versions: { protocol, profiles[], params },
  evidence: deployment transaction, verification of source
```

Contracts receive every external address through their constructor or initializer; the reference
client receives the manifest by path or URL. A second chain is a second manifest. The receipt's
domain separator is derived from the chain id and the deployment at construction time, never
written as a constant (A13).

## 9. Later modules (not in the MVP)

| Module | Milestone | Depends on |
| --- | --- | --- |
| Node attestations (FPM01-N): a worker address bound to a verification node identity; informational, then eligible for infrastructure-service rewards defined later | P2 Genesis Network | the chain's node identity (op-node peer id) and an attestation format |
| SIG: the standardized measurement of intelligence-production capability; the Assessed and Calibrated tiers | P3 | a body of receipts to assess against |
| IPC: redeemable intelligence-production credits with service rights, term, quality, verification and redemption | P3 | SIG |
| Router: matching and conditional redemption across GPU, model, service providers and cells | P3 | IPC |
| FCT economy: the real asset, early decreasing incentive plus a growth-linked supplement, explicit funding source and issuance constraints | P4 | an owner ruling on Tokenomics; nothing here presumes it |

## 10. Boundaries restated

No change to the OP Stack consensus or sequencing (A1, A10); no interference with the mainnet or
M5 (A15); FOGA independent and cross-chain (A10); covenants used through adapters, never modified
(A6); defaults, version locking, idempotency, recovery and reviewable upgrades everywhere (A11);
real revenue and test points apart (A18); no GPU, SIG rating or cell completeness required
(A8, A16); free and open access.
