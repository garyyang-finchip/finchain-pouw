# Implementation Roadmap

Design revision v0.1.3. Milestones follow the owner's four-stage route (P1 PoUW Kernel, P2 Genesis
Network, P3 SIG + IPC, P4 FCT Economy); this document details P1 and the entry into P2. Rounds are
the steps inside P1: R0 design, R1 the kernel on a local network, R2 Finchain Sepolia, R3 a third
party. Round R2 is two acceptances (`decisions.md` A37, P32): R2a with wallets an operator holds,
R2b with agents taking part as their contract accounts.

Where things stand: R0 is closed by the formal review (A19-A30). R1 has passed its review, with
conditions (A31): the kernel, its tests and the reference client. For R2a everything is built and
rehearsed on a development network with the commands and the configuration of the public
deployment (`npm run local-run`); nothing is deployed on a public chain yet. R2b waits for a
ruling on how a contract account takes part (Q13).

## 1. Reused as they are (A6)

| Existing piece | Where it lives | How the kernel uses it | Change needed |
| --- | --- | --- | --- |
| ERC-8414 Token-Bound Task Tenders: the TaskToken of the covenant World on Finchain Sepolia | `finchain` World address book; the standard in `task-token-standard` | the whole G1 path up to the settlement: tender, delivery, judgment or default, bounty from the tender's own vault. The adapter reads the result | none. The adapter only reads; the tender's owner sends one transaction to the adapter, not to the tender (A29) |
| FOGA 1.0.9 cells: the OG (E06) and cell-b (E05) | `foga`; `finchain` evidence of the M3-C business loop | not in R2a: a cell's identity is its Cell Account, and a key beside the cell is not the cell (A37). In R2b the two cells are the first agents to take part as their accounts | none for R2a, which does not touch them. For R2b by the proposed route (P35) none either: the account signs a delegation once |
| Finchain Sepolia: chain 85422, public RPC, the World, the recommended manifest `finchain-sepolia/2026.11` | `finchain` | the first deployment target (A15) | none; a deployment record here and a verified-version reference there |
| `finchain`'s evidence conventions: records with schema, environment and recordedAt; delta packages; byte-exact verification | `finchain` | the same conventions here | none |
| ERC-8004 identity root, ERC-8434 AID, ERC-8419 KYA | World address book and the standards' repositories | evidence the steward may ask for before admitting an address; not read by the contracts (A20) | none |
| ERC-8444 value registry, ERC-8436 decision bodies, ERC-8471 disputes, ERC-8454 AUF | the standards' repositories | later: registering profiles for discovery, a decision body as steward, disputes over attested work, SIG statements | none in P1 |

## 2. New in this repository

| Piece | Round | State |
| --- | --- | --- |
| Contracts: `GenesisPolicy`, `GenesisLedger`, `AuditV1`, `PrevBlockSeedSource`, `L1BlockSeedSource`, `TenderAdapter8414` | R1 | built and reviewed; Solidity 0.8.24, no proxy, no balance. Unchanged since v0.1.2 but for two comments |
| Tests: policy, G0, G1, epochs, the client and its audit, contract accounts, deployment, the round's test tender, boundaries | R1, R2 | built; `npm test`, also on a hosted runner for each version |
| Reference client `pouw`: `status`, `work`, `bridge`, `seal`, `audit`, `verify`; `--account` for a contract account | R1, R2 | built; Node.js, ethers, JSON-RPC only |
| Committed builds of the deployable contracts | R2 | built; `build/`, with a test that they are what the sources compile to |
| Deployment from a configuration file, with a manifest that records code hashes and blocks, and a read-back | R2 | built; `scripts/deploy.js` |
| The check that deployed code is this repository's build | R2 | built; `pouw verify` |
| Keys made on the host that uses them, outside the checkout | R2 | built; `scripts/keys.js` |
| An operator's round: test tenders, confirmations, audit jobs, close records, safe to run again | R2a | built; `scripts/round.js` |
| The identity check for a chain whose agents are contract accounts | R2 | built; `scripts/identity-check.js` |
| The rehearsal of round R2 and its evidence record | R2 | built; `npm run local-run` |
| The R2a configuration and runbook | R2a | built; `deployments/finchain-sepolia-r2.config.json`, `docs/r2-runbook.md` |
| The independent audit job | R2 | built; `.github/workflows/ci.yml` |
| The Finchain Sepolia manifest; evidence records of the deployment, the rounds and the audits | R2a | to do: they are made by running R2a |
| The next version of the ledger: a cap per declared operator, receipts without the demander, a delegation signed by an account | before R3 | designs kept (`genesis-mining-mvp.md` 13.4, 13.7, 13.9); to be ruled (Q13, Q16) |
| `g0.ver`, `g0.cal`, the authority at settlement, a freshness window | after rulings | designs kept (`genesis-mining-mvp.md` 13) |
| Node attestation registry (FPM01-N) | P2 | later module |

Not built, by ruling (A30): calibration records, an agreement verifier, commit-reveal, multi-level
challenges, paging, SIG, IPC, FCT, node attestations, the full FOGA adapter.

## 3. Rounds

| Round | Deliverable | Acceptance |
| --- | --- | --- |
| R0 | the four design documents; the reviews of v0.1.0 and v0.1.1 | closed: the scope was ruled on (A30) |
| R1 | the kernel, its tests, the reference client; a local run of two workers through G0 and G1 work, GMU, two epochs closed by time, and an audit by a separate process from the chain alone | passed, with conditions (A31): the account identities (A37) and the boundary of the self-dealing rule (A38), both taken up in v0.1.3 |
| R2a | Operator-wallet integration. The kernel of R1 deployed on Finchain Sepolia from the committed builds, with a manifest of addresses, code hashes and blocks; two wallets the operator holds, admitted and declared under one operator; epochs of two hours, pools 10 / 90; epoch 0 as a controlled self-test, epoch 1 standard; in each, both wallets do the `g0.ref` job and a test tender goes each way on the World's ERC-8414 contract; the epochs close; a hosted runner that holds no key verifies the deployment and recomputes both epochs at finalized state | the matrix rows marked "Sepolia, round R2a", and the audit's figures equal to the expected ones (section 4). What it shows: the kernel on a public chain, its code checked, its epochs recomputed by a machine that is not the operator's. What it does not show: demand, computation, or an agent. Both wallets are one party and no cell takes part; every record is labelled `public-testnet`, `controlled-self-test` and `operator-wallet-integration` (A39) |
| R2b | Contract-account integration. The OG and cell-b take part as their Cell Accounts: the accounts are the admitted parties, the workers of record and the owners that confirm the tenders the cells themselves made | the matrix rows marked "Sepolia, round R2b". Needs the ruling of Q13; by the proposed route (P35) it runs on the next version of the ledger. Until then the rehearsal shows the mechanics with test accounts, and that is all it is |
| R3 | one independent party, running no Finchain node, admitted as a worker on the next version of the ledger (A35): it does the G0 job and delivers a tender; a second auditor recomputes the epoch; the failure drills of the matrix on Sepolia | the entry into P2 Genesis Network. The first G1 receipt between parties with different declared operators - which is `none-found`, not a finding of independence |
| R4 | the design round for SIG and IPC, documents first; a Tokenomics ruling requested from the owner; a mainnet deployment of the kernel only after the owner's separate decision | - |

Nothing in R1 to R3 touches the chains' operation: contracts are deployed through the public RPC
by a funded key, as the identity root and the World were.

## 4. Round R2a: what it needs and what it must show

The steps, one command each, are in `r2-runbook.md`. In short:

1. the identity check, read-only, from any machine: the record that says the cells' accounts and
   keys are different addresses and that a cell's tender is its account's (A37, A39 step 2);
2. on one host that runs no part of the protocol but the client: keys for a steward and two
   wallets, made there and kept outside the checkout; gas for the steward from the chain's
   deployer;
3. the deployment, planned first and then sent, at least ten minutes before the genesis time it
   names; `pouw verify`;
4. the round command once in epoch 0, once in epoch 1 - where it waits until epoch 0 is settled -
   and once after epoch 1 for the close record;
5. the manifest into `deployments/`, and then the audit job of the hosted runner: `pouw verify`
   and `pouw audit` of both epochs, with the manifest's public endpoint and nothing else;
6. the records into `evidence/`; a verified-version reference in `finchain`'s manifests (A12).

What the audits must show, from the configuration (`deployments/finchain-sepolia-r2.config.json`):

| | Epoch 0 | Epoch 1 |
| --- | --- | --- |
| Mode | `controlled-self-test` | `standard` |
| Budget; G0 pool; G1 pool | 1000; 100; 900 | 1000; 100; 900 |
| Receipts | 4: two audit jobs, two tenders | 4: two audit jobs, two tenders |
| GMU measured, G0 / G1 | 20 / 100 | 20 / 100 |
| GMU subsidized, G0 / G1 | 20 / 100 | 20 / 0: the tenders are `declared-related` and not subsidized |
| Each wallet's test points | 250 = 25 + 225, the capped quarter of either pool | 25 |
| Unallocated | 500 | 950 |
| Per declared operator | one operator, two addresses, 500: twice what the cap allows an address | one operator, 50 |

The last row is the reason for A35: the cap binds an address, and one party with two declared
addresses holds two caps. R2a shows it in public figures; the cap per declared operator comes
with the next version of the ledger.

Why two wallets and not the cells' keys (P33): a cell's key is not the cell, a running node's key
cannot be shared with a second program, and the key of a one-key cell is its owner key. R2a
therefore leaves the two FOGA nodes exactly as they are.

## 5. The next version of the ledger, before R3

By ruling (A35) the contracts get a second version before a third party is admitted, deployed
beside the first and named by a manifest that says which deployment it supersedes. What is put up
for it (Q16): the cap per declared operator; receipts that need no demander and are never
subsidized (A33); the delegation by which a contract account names a key that works in its name
(P35), which is what R2b would run on. The authority at settlement (A38) needs the verification
work and comes with it, before any subsidy of value. None of this is built.

## 6. Dependencies and what does not block what

- The mainnet running acceptance of `finchain` (anchor, bond, Type 8, withdrawal; then M5) runs on
  its own clocks; nothing here needs it or delays it (A15, A29, A39).
- FOGA releases are not a condition, and R2a does not involve FOGA at all. R2b by the proposed
  route needs no FOGA release either.
- The FPM01 / FPM01-G v0.2 record is the design source for terms and for the later milestones;
  the approved decisions in `decisions.md` are enough for R1 and R2, and differences in terms are
  listed when the record arrives (A29).
- Tokenomics is not designed here; R4 asks for the ruling. Test points are a simulation and
  create no obligation (A5, A26).
- The steward of R2a is a key in a file on the host that deploys: acceptable for a test deployment
  that holds nothing and issues nothing. A deployment whose admissions matter to third parties
  needs a steward that is not one key in a file (`architecture.md` 7).
