# Implementation Roadmap

Design revision v0.1.2. Milestones follow the owner's four-stage route (P1 PoUW Kernel, P2 Genesis
Network, P3 SIG + IPC, P4 FCT Economy); this document details P1 and the entry into P2. Rounds are
the steps inside P1: R0 design, R1 the kernel on a local network, R2 Finchain Sepolia with the two
existing cells, R3 a third party.

Where things stand: R0 is closed by the formal review (`decisions.md` A19-A30). R1 is built in
this repository: contracts, tests, the reference client, and a local run of two workers through
G0 and G1 work, GMU, two epochs and an independent audit, with its evidence record.

## 1. Reused as they are (A6)

| Existing piece | Where it lives | How the kernel uses it | Change needed |
| --- | --- | --- | --- |
| ERC-8414 Token-Bound Task Tenders: the TaskToken of the covenant World on Finchain Sepolia | `finchain` World address book; the standard in `task-token-standard` | the whole G1 path up to the settlement: tender, delivery, judgment or default, bounty from the tender's own vault. The adapter reads the result | none. The adapter only reads; the tender's owner sends one transaction to the adapter, not to the tender (A29) |
| FOGA 1.0.9 cells: the OG cell (E06) and cell-b (E05) | `foga`; `finchain` evidence of the M3-C business loop | the first two workers, and the first demander; they already run the ERC-8414 path on Finchain Sepolia | none for round R2: the reference client runs beside each cell with the cell's key. An optional adapter in `foga` later (P11) |
| Finchain Sepolia: chain 85422, public RPC, the World, the recommended manifest `finchain-sepolia/2026.11` | `finchain` | the first deployment target (A15) | none; a deployment record here and a verified-version reference there |
| `finchain`'s evidence conventions: records with schema, environment and recordedAt; delta packages; byte-exact verification | `finchain` | the same conventions here | none |
| ERC-8004 identity root, ERC-8434 AID, ERC-8419 KYA | World address book and the standards' repositories | evidence the steward may ask for before admitting an address; not read by the contracts (A20) | none |
| ERC-8444 value registry, ERC-8436 decision bodies, ERC-8471 disputes, ERC-8454 AUF | the standards' repositories | later: registering profiles for discovery, a decision body as steward, disputes over attested work, SIG statements | none in P1 |

## 2. New in this repository

| Piece | Round | State |
| --- | --- | --- |
| Contracts: `GenesisPolicy`, `GenesisLedger`, `AuditV1`, `PrevBlockSeedSource`, `L1BlockSeedSource`, `TenderAdapter8414` | R1 | built; Solidity 0.8.24, no proxy, no balance |
| Tests: policy, G0, G1, epochs, the client and its audit, boundaries | R1 | built; `npm test` |
| Reference client `pouw`: `status`, `work`, `bridge`, `seal`, `audit` | R1 | built; Node.js, ethers, JSON-RPC only |
| The local run and its evidence record | R1 | built; `npm run local-run` |
| Manifest format | R1 | built; `deployments/README.md` |
| Deployment script, the Finchain Sepolia manifest, the check that deployed code is the published source | R2 | to do |
| Evidence records: deployment, epochs, audits from a machine that runs no node | R2, R3 | to do |
| FOGA PoUW adapter | after R2, in `foga` | optional; the client covers its function until then |
| `g0.ver`, `g0.cal`, a cap per operator, a freshness window | after rulings | designs kept (`genesis-mining-mvp.md` 13) |
| Node attestation registry (FPM01-N) | P2 | later module |

Not built, by ruling (A30): calibration records, an agreement verifier, commit-reveal, multi-level
challenges, paging, SIG, IPC, FCT, node attestations, the full FOGA adapter.

## 3. Rounds

| Round | Deliverable | Acceptance |
| --- | --- | --- |
| R0 | the four design documents; the reviews of v0.1.0 and v0.1.1 | closed: the scope was ruled on (A30) |
| R1 | the kernel, its tests, the reference client; a local run of two workers through G0 and G1 work, GMU, two epochs closed by time, and an audit by a separate process from the chain alone | every row of `acceptance-matrix.md` marked "passes"; the local run's record says `ok` |
| R2 | deployment on Finchain Sepolia with a manifest and a check of the deployed code; the OG cell and cell-b admitted and declared under one operator; both do the `g0.ref` job; the OG cell tenders, cell-b delivers, the OG cell confirms; epochs close; the audit is run from a machine that runs no node | the matrix rows marked "Sepolia, round R2". What it shows: the kernel on a public chain, driven by two cells. What it does not show: demand. The two cells are one party, so the tender between them is either recorded and not subsidized, or subsidized in an epoch whose parameters say so and whose every audit is labelled `controlled-self-test` (A24). Either way it satisfies formal conditions and is no evidence of external demand |
| R3 | one independent party, running no Finchain node, admitted as a worker: it does the G0 job and delivers a tender of the OG cell; a second auditor recomputes the epoch; the failure drills of the matrix on Sepolia | the entry into P2 Genesis Network. The first G1 receipt between parties with different declared operators - which is `none-found`, not a finding of independence |
| R4 | the design round for SIG and IPC, documents first; a Tokenomics ruling requested from the owner; a mainnet deployment of the kernel only after the owner's separate decision | - |

Nothing in R1 to R3 touches the chains' operation: contracts are deployed through the public RPC
by a funded deployer key the owner holds, as the identity root and the World were.

## 4. What round R2 needs

Decisions (`decisions.md`, section 5): the two additions to the G1 rules (Q9); the epoch duration
on Sepolia, the kind of the first public epochs and the pool split (Q10); the toolchain (Q12).

Resources and steps, in order:

1. a deployer key with Sepolia-chain gas on the host that holds it; the same key is the steward
   at first;
2. deployment with `L1BlockSeedSource` and the World's TaskToken as the adapter's source; the
   manifest `deployments/finchain-sepolia.json`; the check of deployed code against this
   repository's build;
3. the two profiles, the admissions and the operator declarations, registered before the genesis
   time;
4. on each cell's host, the reference client with the cell's key: `pouw work` once per epoch, and
   on the demander's host `pouw bridge` for each settled submission of a tender it issued;
5. after each epoch: `pouw audit` from a machine that runs no node; its record into `evidence/`;
6. a verified-version reference with the evidence in `finchain`'s manifests (A12).

## 5. Dependencies and what does not block what

- The mainnet running acceptance of `finchain` (anchor, bond, Type 8, withdrawal; then M5) runs on
  its own clocks; nothing here needs it or delays it (A15, A29).
- FOGA releases are not a condition: round R2 runs with the reference client beside the cells.
- The FPM01 / FPM01-G v0.2 record is the design source for terms and for the later milestones;
  the approved decisions in `decisions.md` are enough for R1 and R2, and differences in terms are
  listed when the record arrives (A29).
- Tokenomics is not designed here; R4 asks for the ruling. Test points are a simulation and
  create no obligation (A5, A26).
