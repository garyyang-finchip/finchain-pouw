# PoUW Architecture

Design revision v0.1.2, after the formal review of v0.1.1. The layers of the first design stand;
the modules were reduced to what round R1 needs (`decisions.md` A30). Rulings are referred to by
id: Approved A1-A30, Proposed P1-P31.

## 1. Purpose and position

Proof of Useful Work (PoUW) is the settlement mechanism that links two sides of an AI economy on
an EVM chain: workers who produce intelligence (an autonomous cell, another agent, a model API, a
GPU operator) and demand that uses and pays for it. Useful work is done off chain; its receipt,
its verdict, its measured contribution and its reward are settled on chain, where anyone can
recompute them (A1, A7).

PoUW sits above the chain and beside the covenants. It is an economic-layer protocol: it changes
nothing in block production, derivation, proofs or settlement of the L2 (A1, A10). Finchain is
its first reference chain; the protocol names no chain (A13).

```
              real demand (G1)                    protocol work (G0)
          ERC-8414 tenders, settled by          a deterministic function on the
          the standard, confirmed by            worker's own instance, recomputed
          the tender's owner                    on chain
                    |                                   |
                    v                                   v
          +-------------------------------------------------------+
          |  Work: profiles say what counts as work and which      |
          |  module verifies or reports it          (GenesisPolicy) |
          +-------------------------------------------------------+
                                  | receipt + verdict + eligibility
                                  v
          +-------------------------------------------------------+
          |  Receipts: one immutable record per contribution,      |
          |  final when recorded                    (GenesisLedger) |
          +-------------------------------------------------------+
                                  | GMU measured, GMU subsidized
                                  v
          +-------------------------------------------------------+
          |  Measurement: totals per epoch, pool and worker, kept   |
          |  as receipts come in                    (GenesisLedger) |
          +-------------------------------------------------------+
                                  | a pure function of the totals
                                  v
          +-------------------------------------------------------+
          |  Reward: the epoch's allocation table - test points,    |
          |  a view; nothing issued or claimed      (GenesisLedger) |
          +-------------------------------------------------------+
```

## 2. Actors

| Actor | What it does | In the first deployment |
| --- | --- | --- |
| Worker | Does work from an EVM address: submits its G0 output, delivers G1 tenders through ERC-8414 | the OG cell and cell-b (FOGA), then a third party |
| Demander | Tenders real demand through ERC-8414 with an escrowed bounty, has the delivery judged, and confirms the settled submission to the ledger | the OG cell, later any admitted party |
| Module | A contract a profile names: a G0 function that the ledger calls to verify an output, or the G1 adapter that reports a settlement | `AuditV1`, `TenderAdapter8414` |
| Steward | Registers profile and parameter versions, admits addresses to the early subsidy, declares operators, can pause recording. Cannot touch a receipt, a status, a total or an allocation | the owner's account at first; a Safe or a decision body later |
| Auditor | Recomputes an epoch from the chain alone | anyone; `pouw audit` |
| Anyone | Opens an epoch, writes an ended epoch's close record | - |
| Chain | Stores receipts and totals; nothing else changes | Finchain Sepolia first (A15) |

There is no keeper and no verifier role in R1: an epoch closes by time and verification is a
contract call. Verifying the ledger - running a Finchain Chain Node - earns nothing by itself
(A8). A Finchain AI Node is a worker and a chain node on one machine with separate keys; the
protocol sees only the worker's address.

## 3. Modules as built

| Module | Role | Covers, of the R1 scope (A30) |
| --- | --- | --- |
| `GenesisPolicy` | The epoch clock (immutable genesis time and duration); versioned profiles and parameters, each in force from a later epoch; admissions and operator declarations, each in force from the next epoch; the pause; two-step stewardship | Profile and Policy |
| `GenesisLedger` | Receipts and their statuses; the seed of each epoch; GMU measured and subsidized per epoch, pool and worker with the totals; the G1 subsidy rules; the allocation as a view; the close record | Work Receipts, Epoch Rewards |
| `AuditV1` | The first G0 function: the audit of the previous epoch (`IG0Function`) | the `g0.ref` profile |
| `PrevBlockSeedSource`, `L1BlockSeedSource` | Where seed material comes from: any EVM chain, or an OP Stack chain (`ISeedSource`) | - |
| `TenderAdapter8414` | Reads one ERC-8414 contract and reports a settled submission to the ledger; only the tender's owner can call it | the ERC-8414 adapter |
| `client/pouw.js`, `client/lib/` | `status`, `work`, `bridge`, `seal`, `audit`; JSON-RPC only | Reference client and audit |

Receipts and rewards are one contract because they share every figure: the allocation reads the
totals that recording a receipt writes. Two contracts would add a trust boundary between them and
no separation of duty (P28). The policy is apart because it is the only place the steward acts.

None of the contracts is upgradeable, holds funds, or has a function that edits what was recorded.

What is on chain is small and hash-shaped. The work itself, its inputs and outputs stay with the
worker and the demander and are referenced by hash (P2), which keeps the chain footprint
independent of the size of the work and the protocol usable from an ordinary endpoint.

## 4. Identity, admission and relations

A worker is an EVM address, and so is a demander (P1). No identity binding is read by the
contracts, and none raises GMU (A20).

Two things are recorded about an address, both by the steward and both in force from the next
epoch:

| Record | Meaning | Effect |
| --- | --- | --- |
| Admission | The address is entered in the early subsidy (A3) | Only admitted workers are subsidized, and a G1 receipt only when its demander is admitted too. Work by others is recorded and measured |
| Operator | Which party controls the address; 0 = nothing declared | A G1 receipt whose worker has the demander's or the judge's declared operator is classed `declared-related` |

What these are and are not. An admission is the steward's decision, on whatever evidence it asks
for - an ERC-8004 or ERC-8434 identity, an ERC-8419 assertion, a contract with the party. A
declaration is a statement, used to label related parties. Neither is verified by the protocol:
`none-found` means that no relation was declared, not that the parties are independent, and the
class `attested-independent` is reserved for a later version in which somebody other than the
party attests it. The protocol never claims that every related party or every Sybil is detected
(A25).

## 5. Interfaces between the repositories and the participants

```
  finchain (chain)              finchain-pouw (protocol)            foga (cell)
  -----------------             ------------------------            -----------
  RPC endpoints, World          contracts + reference client        optional PoUW adapter,
  address book, manifests       deployments/<name>.json             later: calls the same
         |                               ^      ^                   interface as the client
         +----- deployment target -------+      |                           |
                                                +----- JSON-RPC only -------+
                                                |
                                     external workers and demanders: the reference
                                     client or their own code against the same ABI
```

- `finchain` provides the chain, its public RPC and the World address book, in which the ERC-8414
  TaskToken already exists. The protocol's deployment on Finchain is recorded here under
  `deployments/` and, as a verified version with its evidence, in `finchain`'s manifests (A12).
- `foga` will add, in its own repository and release cycle, an optional adapter that lets a cell
  do the G0 job and bridge the tenders it issued. Until then the reference client does both with
  the cell's key on the cell's host. `foga` builds and runs without this repository (A10, P11).
- An external participant needs an endpoint, a funded key for gas and the reference client or its
  own code. It runs no Finchain node (A8).

## 6. Data flow

G0, profile `g0.ref`:

1. The epoch begins by the clock. The first use captures its seed.
2. The worker's client re-decides the previous epoch from the chain, derives the worker's instance
   from the seed and its address, and submits the output for the epoch it names.
3. The ledger derives the same instance, asks the profile's function for the expected output, and
   records the receipt with its verdict, its eligibility and its GMU, in that transaction.

G1, profile `g1.tender`:

1. A demander mints and funds an ERC-8414 tender; a worker delivers through the tender contract;
   the tender settles the delivery by its own rules and pays the bounty from its vault. This is
   real revenue, accounted on its own (A18), and nothing of this protocol is involved in it.
2. The tender's owner calls the adapter's `bridge`. The adapter reads the facts from the tender
   and reports them; the ledger records the receipt and decides, by the epoch's rules in a fixed
   order, whether it is subsidized.

Both, after the epoch:

1. When the epoch's interval has passed, nothing can be added to it. Every worker's allocation is
   the value of a view over the stored totals.
2. Anyone can audit it: `pouw audit` re-decides every receipt from primary data and compares.

## 7. Trust and abuse model

Conservative Settlement, as R1 has it: a receipt counts only if it exists on chain, was accepted
by a deterministic rule, and is eligible under parameters fixed before its epoch began; it counts
once, in one epoch; and nothing is paid.

| Threat | What R1 does | What it does not do |
| --- | --- | --- |
| Fake compute: correct answers without the work | no committed answers; a per-worker, per-epoch instance, so an output cannot be copied or replayed; a small fixed GMU | prove computation. An on-chain recomputable output can be read by anyone; R1 says so and gives `g0.ref` no more weight than presence (A19) |
| Declared capability earning reward | nothing declared by a worker enters GMU; no tier factor (A20) | measure capability (SIG, later) |
| A wrong epoch summary by whoever closes | nobody closes: the allocation is a function of totals fixed by time; `seal` takes no figures (A21) | - |
| Duplicate reward for the same work | one receipt per contribution, across epochs and profile versions; nothing to claim, so nothing claimed twice | - |
| Replay from another chain or deployment | the domain is in every seed and contribution id | - |
| Non-real demand: self-dealing | the worker is neither owner nor judge of the tender | see the next three rows |
| Non-real demand: a fresh address as demander | the demander must be admitted (P22) | - |
| Non-real demand: a settled tender pushed onto an admitted party | only the tender's owner bridges (P24) | stop an owner who confirms what was handed to it |
| Non-real demand: two admitted parties who conceal their relation | declared relations are classed and not subsidized; minimum bounty; caps per demander, per pair and per worker; a fixed pool | detect it. Not claimed (A25) |
| One party, many addresses | admission; the audit adds the table up per declared operator | bind the share cap to a party: it binds an address (`genesis-mining-mvp.md` 7.6) |
| A predictable seed, a chosen capture time | a function with no cost worth saving | provide randomness. Conditions for any valuable subsidy: `genesis-mining-mvp.md` 13.6 |
| Receipts sent only to fill the ledger | anyone may submit one G0 output per epoch, and it is recorded whether or not the sender is admitted; each costs its sender gas and earns nothing | bound the number of such receipts, which an audit has to read. A limit or a fee per epoch is the later option, to be weighed against open participation |
| Parameter changes during an epoch | impossible: every version applies from a later epoch | - |
| A steward who abuses its powers | it can register a bad version, admit its own addresses or pause; all of it is on chain before it takes effect, and none of it reaches a recorded figure | prevent it. A Safe or a decision body is the later answer |
| A module that lies | the audit re-decides G0 from the published function and G1 from the tender's own log | verify that a deployed module is the published source: a deployment check, done in round R2 |
| The ERC-8414 contract itself | the adapter is pointed at one contract, immutably, and the manifest names it | audit that contract: the standard's own business |
| Loss of history | receipts are never edited; every figure can be recomputed from the log | - |

## 8. Chain neutrality

The only place a chain is named is a deployment manifest (`deployments/README.md`). Contracts take
every address through their constructors; the ledger computes its domain from the chain id and
its own address at deployment (A13). A second chain is a second deployment and a second manifest.

One part depends on the chain family and is chosen at deployment: the seed source. On an OP Stack
chain it reads the `L1Block` predeploy; on any other EVM chain the previous block's hash. Both are
described as what they are (A22).

The client is given the manifest and an endpoint. It needs logs and current state only, so a
public endpoint of an ordinary full node is enough (P27).

## 9. Not in R1

| Module | When | Depends on |
| --- | --- | --- |
| `g0.ver` verification work, `g0.cal` calibration with its records, challenge and overturn | after a ruling on the kept design (`genesis-mining-mvp.md` 13.1, 13.2) | a seed fit for it (13.6) |
| A cap per declared operator; a freshness window for bridging | before round R3, if ruled (Q11) | - |
| The FOGA adapter | on FOGA's own cycle, after round R2 | the published ABI |
| Node attestations (FPM01-N) | P2 Genesis Network | a node identity and an attestation format |
| SIG: the standardized measurement of intelligence-production capability | P3 | a body of measured receipts |
| IPC, the router | P3 | SIG |
| The FCT economy | P4 | an owner ruling on Tokenomics; nothing here presumes it |

## 10. Boundaries restated

No change to the chain's consensus or sequencing (A1, A10); no interference with the mainnet or M5
(A15, A29); FOGA independent and cross-chain (A10); ERC-8414 and the other covenants used as they
are, through an adapter that only reads (A6, A29); defaults, version locking, idempotency,
recovery and reviewable upgrades everywhere (A11); real revenue and test points apart (A18); no
GPU, SIG rating or cell completeness required (A8, A16); no balance, claim or token (A26).
