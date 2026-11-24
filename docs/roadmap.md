# Implementation Roadmap

Design revision v0.1.7, after the reviews of v0.1.4, v0.1.5 and v0.1.6 (`decisions.md` A55-A69).
Engineering milestones are the owner's four: P1 PoUW Kernel, P2 Genesis Network, P3 SIG + IPC, P4
FCT Economy. This document details P1 and the entry into P2. Rounds are the steps inside P1: R0
design, R1 the kernel on a local network, R2 Finchain Sepolia, R3 a third party. Round R2 is two
acceptances (A37, P32): R2a with wallets an operator holds, R2b with agents taking part as their
contract accounts.

Engineering numbers are not economic stages. The stages - Startup, Development and Pre-expansion
within Stage 1, then Expansion and Maturity (A41) - describe how funding, procurement and the
supply of intelligence change; completing a round certifies none of them (A53). Section 7 puts
the two side by side. The production extension is planned as increments that are numbered on
their own (sections 8 and 9), and nothing of it is added to round R2.

Where things stand: R0 is closed by the formal review (A19-A30). R1 has passed its review, with
conditions (A31): the kernel, its tests and the reference client. For R2a everything is built and
rehearsed on a development network with the commands and the configuration of the public
deployment (`npm run local-run`). The round itself is being run on Finchain Sepolia as this
revision is written. A first deployment, made on 2026-11-23 (UTC), was left unused because
nothing was recorded in its epoch 0, the only epoch of the controlled self-test; the round runs
on a second deployment. The manifest and the records, those of the unused deployment among them,
enter the repository when the round is complete, and nothing in this revision is evidence of it.
R2b waits for a ruling on how a contract account takes part (Q13). Neither the alignment of
2026-11-24 nor the three reviews since changed anything in this: the software is release 0.1.3,
and round R2a runs from it as it was prepared (A53, A55, A65, A68). What they add is design - the
production line, in documents. The review of v0.1.4 required corrections, applied in v0.1.5; the
review of v0.1.5 asked for conventions to be written exactly, applied in v0.1.6; the review of
v0.1.6 accepted that revision and made the running of round R2a exact (A69). On Q17 to Q29 the
advisor's recommendations are recorded and the owner's adoption of them is pending (A66); Q13 to
Q16 are open as they were.

## 1. Reused as they are (A6)

| Existing piece | Where it lives | How the kernel uses it | Change needed |
| --- | --- | --- | --- |
| ERC-8414 Token-Bound Task Tenders: the TaskToken of the covenant World on Finchain Sepolia | `finchain` World address book; the standard in `task-token-standard` | the whole G1 path up to the settlement: tender, delivery, judgment or default, bounty from the tender's own vault. The adapter reads the result | none. The adapter only reads; the tender's owner sends one transaction to the adapter, not to the tender (A29) |
| FOGA 1.0.9 cells: the OG (E06) and cell-b (E05) | `foga`; `finchain` evidence of the M3-C business loop | not in R2a: a cell's identity is its Cell Account, and a key beside the cell is not the cell (A37). In R2b the two cells are the first agents to take part as their accounts | none for R2a, which does not touch them. For R2b by the proposed route (P35) none either: the account signs a delegation once |
| Finchain Sepolia: chain 85422, public RPC, the World, the recommended manifest `finchain-sepolia/2026.11` | `finchain` | the first deployment target (A15) | none; a deployment record here and a verified-version reference there |
| `finchain`'s evidence conventions: records with schema, environment and recordedAt; delta packages; byte-exact verification | `finchain` | the same conventions here | none |
| ERC-8004 identity root, ERC-8434 AID, ERC-8419 KYA | World address book and the standards' repositories | evidence the steward may ask for before admitting an address; not read by the contracts (A20) | none |
| ERC-8444 value registry, ERC-8436 decision bodies, ERC-8471 disputes | the standards' repositories | later: registering profiles for discovery, a decision body as steward, disputes over attested work | none in P1 |
| ERC-8506 AI Inference Token Onchain: its record formats, at a pinned revision | the standard's repository, at the commit named in `production-service.md` 4.2 | agreed on the condition that the revision is pinned and the fields are mapped (A61, P59): the usage categories and the service specification of the production line are a Unit record and a Grade record of the standard; the provenance of supply and the entries for usage and verification use the vocabulary of its Source record and two members of its Receipt record. Later, its entitlement ledger for supply that is metered and prepaid (P52) | none to the standard. The first production increment has no ERC-8506 contract and no runtime dependency on it; it depends on the pinned specification |
| ERC-8454 AIFi Unit Framework: its observation record | the standard's repository | proposed (P49): the shape of a worker's operating report | none |

## 2. New in this repository

| Piece | Round | State |
| --- | --- | --- |
| Contracts: `GenesisPolicy`, `GenesisLedger`, `AuditV1`, `PrevBlockSeedSource`, `L1BlockSeedSource`, `TenderAdapter8414` | R1 | built and reviewed; Solidity 0.8.24, no proxy, no balance. Unchanged since v0.1.2 but for two comments |
| Tests: policy, G0, G1, epochs, the client and its audit, contract accounts, deployment, the round's test tender, boundaries | R1, R2 | built; `npm test`. The workflow that runs them on a hosted runner is in place; its first hosted run is pending (`decisions.md` 3) |
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
| The Finchain Sepolia manifest; evidence records of the deployment, the rounds and the audits | R2a | being made: round R2a is under way, and they enter the repository when it is complete |
| The next version of the ledger: a cap per declared operator, receipts without the demander, a delegation signed by an account | before R3 | designs kept (`genesis-mining-mvp.md` 13.4, 13.7, 13.9); to be ruled (Q13, Q16, Q26) |
| `g0.ver`, `g0.cal`, the authority at settlement, a freshness window | after rulings | designs kept (`genesis-mining-mvp.md` 13) |
| The production line: the first specification with its evaluator, counter, canonicalization rule and committed fixture set; the `g1.inference` profile and its adapter; the reference worker, demander and recount; the operating report; the rehearsal of the increment | the first production increment | designed, not built (`production-service.md`, `supply-and-payment.md`). On Q17 to Q29 the advisor's recommendations are recorded; the owner's adoption is pending (`decisions.md` 12) |
| The budget book and the procurement adapters for an agent's wallet and for a fiat-billed account; an operated model as a source of supply | the second and third increments | outlined; the records an adapter is built to are specified (`supply-and-payment.md` 3, 4, 11) |
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

The rounds are not renumbered by the alignment. Production work is not a round: it is a series of
increments beside them (section 8), so that "R" always names an engineering step of the kernel and
of the network, and never a stage of the economy.

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

Where the standard round is worked in a later epoch k (`r2-runbook.md`, step 5), the second
column holds for epoch k: the budget is counted from the first epoch of the standard version,
which is epoch 1, so that epochs 1 to 8 have 1000 test points. From epoch 9 the budget of this
configuration is 500: the pools, each wallet's test points, the unallocated part and the
operator's total halve with it, and the receipts and the GMU are as in the column (A69).

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

Proposed in v0.1.4 (P50). The review recommends one design of that version, with the production
line in view (Q22; the owner's adoption is pending). A receipt would also carry the role of the
contribution, the work id, the parent work, the commitment to an evidence envelope and the content
key by which a profile counts a task unit once (P55), so that the first production profile arrives
as a profile and an adapter and not as a third ledger.

The order the review asks for: first the rules of authorization and of receipt state - Q13, and
the condition on receipts without the demander (A64), for which work facts apart from receipts
are proposed and are supported by the review of v0.1.5 (P60, Q26) - and then the version. A
necessary upgrade of the ledger is not held back by a production design that is not finished: if
the production fields are not ruled when the ledger is, the ledger is built without them and they
follow by the same versioned switch.

## 6. Dependencies and what does not block what

- The mainnet running acceptance of `finchain` (anchor, bond, Type 8, withdrawal; then M5) runs on
  its own clocks; nothing here needs it or delays it (A15, A29, A39).
- FOGA releases are not a condition, and R2a does not involve FOGA at all. R2b by the proposed
  route needs no FOGA release either.
- The FPM01 / FPM01-G v0.2 record is the design source for terms and for the later milestones;
  the approved decisions in `decisions.md` are enough for R1 and R2, and differences in terms are
  listed when the record arrives (A29).
- Tokenomics is not designed here; R4 asks for the ruling. It is a ruling of its own and is tied
  to no economic stage (A62). Test points are a simulation and create no obligation (A5, A26).
- The steward of R2a is a key in a file on the host that deploys: acceptable for a test deployment
  that holds nothing and issues nothing. A deployment whose admissions matter to third parties
  needs a steward that is not one key in a file (`architecture.md` 7).
- The production increments hold up no round, and no round holds them up beyond the next version
  of the ledger, which both need. Round R2a needs nothing from them.
- The first increment needs no ERC-8506 contract and has no runtime dependency on that standard;
  it follows a pinned revision of its specification (A61). That dependency is a light one (A67):
  the schema files are copied here, nothing fetches the standard, and nothing waits for it to
  become an EIP merged into the main repository. The increment needs no asset but the native one,
  no FOGA release and no model that the operator cannot buy with an ordinary account.

## 7. Economic stages and engineering numbers

The two are reported separately (A53). The table says which engineering deliverable supports
which capability, and in which stage that capability is first needed. It certifies no stage: a
stage describes what the network's participants do, not what the repository contains, and a
deployment can support several operating forms at once (A41).

| Capability | First needed in | Engineering deliverable | Milestone, round or increment | State |
| --- | --- | --- | --- | --- |
| Contribution records and an allocation that anyone can recompute | every stage | the kernel | P1: rounds R1, R2a | built; R2a prepared |
| An agent that takes part as its own account | every stage | the route for a contract account | P1: round R2b, on the next ledger version | to be ruled (Q13) |
| Parties that are not the operator's; a cap per declared operator | every stage | the next ledger version; round R3 | P2 | after R2 (A35, A39) |
| A published service specification; usage recorded by category; a delivery qualified by published checks; a contribution linked to its evidence and counted once per task unit | Stage 1, Startup | the first specification, the `g1.inference` profile, the evidence envelope, the recount | first production increment | designed |
| A model service that a person bought, recorded as input and never as production; pause, resume and switch of a source | Stage 1, Startup | the supply and purchase records on the manual route | first production increment | designed |
| Holder funding, customer revenue, subsidy and cost told apart | Stage 1, Startup | the operating report | first production increment | designed |
| An agent that buys and renews within a delegated budget, from a wallet or through a fiat-billed account; a budget that two purchases cannot both spend; reconciliation of a payment whose state is unknown | Stage 1, Development | the budget book; one adapter of each route | second production increment | outlined; its records specified |
| Manual and autonomous operation side by side | Stage 1, Development | nothing new in the protocol: the same records, two routes | second production increment | outlined |
| An operated model accepted under the specification an external service is accepted under | Stage 1, Pre-expansion | an operated source of supply; the evidence that exists for its mode | third production increment | outlined |
| Payment and subsidy criteria in assets other than the native one | when a ruling asks for it | a reviewed asset policy, a version of the contracts that implements it, and then the parameters that configure it (A51, A62) | a later adaptation | design kept |
| Verification as paid work; public procurement of useful inference | Stage 1 into Stage 2 | `g0.ver` and a G0 production profile, with a seed fit for them | P2 into P3 | designs kept |
| Supply that is metered and prepaid; delegated budgets enforced on chain | Stage 2 | the entitlement ledger of ERC-8506 with an adapter that reads it | a later adaptation | design kept |
| Capability measured and compared: SIG; IPC; routing | Stage 2 | P3 | P3 | later |
| An autonomous operating economy | Stage 3 | P4 | P4 | later |
| Platform Tokenomics; FCT | no stage: a ruling of its own, which can serve several stages (A62) | the owner's ruling on Tokenomics; then P4 | R4 asks for the ruling | not designed here. Decided so far: nothing is issued in this work (A5, A53) |

No date, share or threshold is attached to a stage (A41).

## 8. The first production increment, and the acceptances after it

What the increment is (A53): one bounded inference profile, one supported procurement route, its
evidence envelope and an operating report. The plans are `production-service.md` and
`supply-and-payment.md`; this section says what the increment has to produce and how the
production line is accepted. All of it is proposed (P51, P58) and none of it is run.

What it builds, in this repository: the first specification with its instruction, schema,
evaluator, counter, canonicalization rule and committed fixture set; the next version of the
ledger with the `g1.inference` profile and its adapter; a reference worker, a reference demander
and the recount; the four records of the manual route; the operating report; a rehearsal of the
whole on a development network, with a deterministic stand-in for the model service, as round R2
was rehearsed.

The review's correction (A59): the acceptances are staged, each has evidence of its own, and none
stands in for another. The first increment is the first of them and nothing more. v0.1.4 listed a
customer's own task among the acceptances of the first increment while the plan left customers'
own tasks out of it, and let a supplier stand where a customer was asked for. Both are withdrawn.

| Acceptance | Who takes part | What it shows | What it does not show | When |
| --- | --- | --- | --- | --- |
| 1. The mechanism: controlled fixtures | a worker and a designated test demander that the operator holds; a model service a person bought; a machine that is not the operator's for the audit and the recount | that production, acceptance, measurement and payment work as specified: a specification published; fixtures delivered, checked and accepted; usage recorded with the origin of every counter; counts and checks repeated from public content; a task unit counted once; a contribution recomputed from the chain; a report that tells the cost of the model service from the bounty and from the Holder's funding | demand, an agent, supply from outside, or that the named model ran. Labelled `public-testnet`, `controlled-self-test` and `controlled-procurement` | the first increment |
| 2. A FOGA cell takes part | the same, with a FOGA cell as the worker or as the demander, through the capabilities the cell has or an adapter of its own | that a cell can use or organize the service as its own account | demand; supply from outside | after the first; on FOGA's cycle, waiting for nothing in this repository |
| 3. An external supplier | a worker that the operator does not hold, delivering under the published specification | that supply from outside can connect: another party's deliveries are accepted and recounted under the same specification | demand: its tasks can still be fixtures. Nothing about that supplier's hardware or model beyond what its evidence classes say | when such a party is admitted; the third party of round R3 may be it |
| 4. An external customer's own request | a customer that the operator does not hold, with a task of its own and funds of its own | that this one request from outside exists and was served; where it was paid with funds of value, that this one independent paid demand exists | the size of a market, a repeat purchase, or sustainability | after the first increment: it needs a later version of the profile (`production-service.md` 2) |

Acceptances 3 and 4 are different evidence: a supplier from outside shows nothing about demand,
and a customer from outside shows nothing about supply. One party may be both (Q23); each piece
of evidence then says which role - supply, purchase or audit - that party had in it.

The milestone of A54 names a buyer's real request, a standardized delivery, a cell that uses or
organizes the service, an independent re-check, a payment that completes, a GMU record that can
be recomputed and a report of the actual cost. Proposed (P58, Q27): it is met when acceptances 1,
2 and 4 have each been evidenced, and by nothing less. Acceptance 3 is not among its conditions
and is reported for what it shows.

The acceptances can be completed one by one. To close A54 they also have to meet in one place: at
least one complete chain of business evidence, its links joined by request and work ids or by
parent and child, that runs from an external customer's request through a cell that uses or
organizes the service, a standardized delivery, an independent re-check and the state of the
payment to the GMU record and the actual cost. Demonstrations that cannot be joined so do not
close it. This asks nothing more of the first increment: the controlled fixtures need no external
customer, and no external supplier becomes a condition.

Every run reports its environment, the versions, the source of its data, the parties, the finance
mode and the evidence, and says which facts were simulated. A mocked provider, a sandbox bill or
a test asset can establish a technical behaviour; none of them establishes revenue, a live payment
integration, demand or self-sufficiency (A54).

## 9. The later increments, and the order

| Increment | Adds | Accepted when |
| --- | --- | --- |
| Second | procurement by the agent: the budget book with its atomic reservation; one adapter for a wallet in digital assets, one for a fiat-billed account its Holder authorized, each with its declaration; the purchasing policy enforced by the agent; reconciliation of payments whose state is unknown | an agent buys and renews within its policy without a person acting; a purchase beyond the policy is declined; two purchases that need the same room in a budget are not both made; a lost answer is reconciled without a second payment and without freeing its budget; a worker of the manual route and one of an agent route deliver under the same specification in one epoch |
| Third | an operated model as a source of supply | deliveries from an external service and from an operated model are assessed against one specification, each with its source and its evidence classes stated |

The order, as the review recommends it (Q23):

1. Round R2a, now, on the software as released. Nothing below is a condition of it.
2. The owner's rulings: on the next version of the ledger (Q13, Q16, Q26), and the adoption of
   the recommendations on the production plans (Q17 to Q25, Q27 to Q29). They may come together or
   apart.
3. The next version of the ledger. Round R2b and round R3 run on it, as ruled (A35, A39).
4. The first production increment, beside R2b and R3: the mechanism. It needs no third party and
   no cell. The three further acceptances follow as their parties are there, in no fixed order.
5. The second and third increments, each opened by a ruling of its own.

Not in any increment yet, by ruling (A51, A53): settlement in stablecoins, richer verification,
SIG calibration and platform economics. They expand from the evidence the increments produce.
Platform Tokenomics is a ruling of its own and waits for no economic stage (A62).
