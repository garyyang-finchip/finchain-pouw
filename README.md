# finchain-pouw

AI Proof of Useful Work (PoUW): a chain-neutral protocol and reference implementation that lets
independent AI cells and other workers do useful work, have it verified, have the contribution
measured, and be rewarded for it on an EVM chain. Finchain is the first reference deployment
chain (Finchain Sepolia first, Finchain mainnet after acceptance); the protocol itself does not
depend on Finchain.

Status: **round 1 - design only (v0.1.1, revised after the first review)**. This repository holds
the first-round design documents for review by the owner and the advisor. No code is written until the architecture and the minimal
scope of the Genesis Mining MVP are ruled on. The strategic baseline is FPM01 / FPM01-G v0.2
(the owner's PoUW strategy and Genesis Mining design record); `docs/decisions.md` lists what is
approved, what is proposed here, and which figures are only illustrative.

## What this repository is for

| Repository | Responsibility |
| --- | --- |
| `finchain` | The EVM Layer 2: OP Stack configuration, deployment, operation, the covenant World, manifests and running evidence. It integrates verified PoUW versions, configurations and deployment evidence; it does not develop the PoUW economics. |
| `foga` | The autonomous AI cell (Finch OG Agent): an independent implementation that runs on any EVM chain. It takes part in PoUW through an optional adapter and never depends on this repository or on Finchain. |
| `finchain-pouw` (this one) | The PoUW work protocol: Genesis Mining, work receipts, the GMU contribution ledger, epoch rewards, later SIG, IPC and the FCT economy, with a reference implementation and its tests. Protocol independent, chain-native integration. |

The protocol is written to be chain-neutral: no chain id, FOGA identity or FCT address is hard
coded; a deployment is described by a manifest (chain, addresses, parameters, versions). Finchain
is the first complete reference chain, not the only chain that may adopt the protocol.

## Documents

| Document | Content |
| --- | --- |
| `docs/decisions.md` | Approved rulings, proposed defaults awaiting a ruling, illustrative parameters - kept strictly apart |
| `docs/architecture.md` | PoUW architecture: actors, layers, modules, interfaces between the chain, the cells and external workers, dependencies, security model, chain neutrality |
| `docs/genesis-mining-mvp.md` | Genesis Mining MVP: the minimal loop Work -> Verify -> GMU -> Epoch -> Test Reward, data structures, state machine, G0 / G1 profiles, GMU and epoch rules, defaults, versioning, recovery |
| `docs/roadmap.md` | Implementation roadmap: what is reused (ERC-8414, ERC-8444, FOGA, the World), what is new, and the minimal order of implementation |
| `docs/acceptance-matrix.md` | Acceptance and failure matrix: normal operation, third-party participation, duplicate rewards, disconnection and recovery, version upgrades, adversarial cases |

## Principles (from FPM01)

- **Progressive Standardization**: start from incomplete, non-standard conditions and build the
  unified measurement of intelligence production step by step (GMU now, SIG later).
- **Open Participation**: a third-party miner takes part with FOGA, another agent, a GPU or a model
  API, over RPC, without running a Finchain full node.
- **Conservative Settlement**: work verification, contribution measurement and reward distribution
  are evidenced, recomputable, recoverable and never paid twice.

## Hard boundaries

The protocol does not change the chain's consensus or sequencing; it does not block the mainnet
or M5 security work of `finchain`; FOGA stays independent and cross-chain; existing covenants
(the twelve Finchain ERCs) are used through optional adapters and modular interfaces, never
modified; every module has defaults, version pinning, idempotent operations, failure recovery and
a reviewable upgrade path; real service revenue and simulated mining points are accounted
separately; early test points carry no right to future FCT; nothing requires a GPU, a complete
SIG rating or a complete FOGA cell; access stays free and open, with independent commercial
deployment and operation services allowed later.

## License

Apache-2.0. See `LICENSE`.
