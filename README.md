# finchain-pouw

AI Proof of Useful Work (PoUW): a chain-neutral protocol and reference implementation that lets
independent AI cells and other workers do useful work, have it verified, have the contribution
measured, and be rewarded for it on an EVM chain. Finchain is the first reference deployment
chain (Finchain Sepolia first, Finchain mainnet after acceptance); the protocol itself does not
depend on Finchain.

Status: **v0.1.3 - round R1 reviewed and passed with conditions; round R2 prepared.** The Genesis
Mining kernel runs on a local network: workers, G0 and G1 work, GMU, epochs closed by time, and an
audit from the chain alone that agrees with the ledger on every figure. The kernel's contracts
are those of v0.1.2. This version adds what a public deployment needs - committed builds, a
deployment that records code hashes, a check of deployed code, an operator's round, the identity
check - and rehearses round R2 with them. Round R2a is being run on Finchain Sepolia as design
revision v0.1.7 is written; its manifest and its records enter this repository when the round is
complete (`docs/roadmap.md`, `docs/r2-runbook.md`). The strategic baseline is FPM01 / FPM01-G
v0.2 (the owner's PoUW strategy and Genesis Mining design record); `docs/decisions.md` lists what
is approved, what this repository proposes, what the advisor recommends and the owner has not yet
adopted, and which figures are only illustrative.

Design revisions v0.1.4 to v0.1.7 (all 2026-11-24) are revisions of the documents. The software
is release 0.1.3, unchanged: no contract, interface, client, script, configuration or deployment
changes with any of them, nor any command of the runbook, and round R2 runs from it as it was
prepared.
v0.1.4 records the alignment of the owner and the advisor on the production line - model-token
generation as the first production commodity, the economic stages, the three operating
dimensions, the complete AI Node, production roles, evidence, procurement and payment - and adds
the plans for carrying it out. v0.1.5 applies the review of those plans: the measurement, the
rules that count a task unit once, the state of a purchase and the budget of an agent, the staged
acceptances, and the pinned revision of ERC-8506 the records follow. v0.1.6 applies the review of
v0.1.5: the advisor's recommendations are recorded as recommendations until the owner adopts
them, and four conventions are written exactly - what a content key is made of and which
confirmation takes the one counting of a task unit, the attempts inside a purchase, work facts
beside receipts, and the one linked chain of evidence that closes the first production milestone.
v0.1.7 applies the review of v0.1.6: the fallback of the runbook of round R2a is worded exactly -
which epochs the round works in, which epochs are audited, when the budget first halves - and two
points are written into the plans for the next implementation. Nothing of the production line is
built.

## What this repository is for

| Repository | Responsibility |
| --- | --- |
| `finchain` | The EVM Layer 2: OP Stack configuration, deployment, operation, the covenant World, manifests and running evidence. It integrates verified PoUW versions, configurations and deployment evidence; it does not develop the PoUW economics. |
| `foga` | The autonomous AI cell (Finch OG Agent): an independent implementation that runs on any EVM chain. A cell takes part in PoUW as its Cell Account, by a route that keeps its key inside its own software (`docs/decisions.md`, A37), and never depends on this repository or on Finchain. |
| `finchain-pouw` (this one) | The PoUW work protocol: Genesis Mining, work receipts, the GMU contribution ledger, epoch rewards, later SIG, IPC and the FCT economy, with a reference implementation and its tests. Protocol independent, chain-native integration. |

The protocol is written to be chain-neutral: no chain id, FOGA identity or FCT address is hard
coded; a deployment is described by a manifest. Finchain is the first complete reference chain,
not the only chain that may adopt the protocol.

## What is here

```
contracts/             the kernel
  GenesisPolicy.sol      the epoch clock; versioned profiles and parameters; admissions, operators; the pause
  GenesisLedger.sol      receipts, GMU, the epoch's allocation as a view
  TenderAdapter8414.sol  reports a settled ERC-8414 submission; only the tender's owner can call it
  functions/AuditV1.sol  the first G0 function: the audit of the previous epoch
  seed/                  where an epoch's seed material comes from (any EVM chain; OP Stack)
  interfaces/            the kernel's interfaces and the part of ERC-8414 it reads
  testing/               contracts used by the tests and the rehearsal only
  vendor/erc8414/        the ERC-8414 reference contracts, pinned byte for byte, as test fixtures
build/                 the deployable contracts as compiled: what a deployment is made from
client/                the reference client: pouw.js, lib/, abi/
test/                  the test suite
scripts/               the tooling of a deployment and a round
  keys.js                key files for a deployment's parties, made on the host that uses them
  deploy.js              a deployment from a configuration file and build/, with a read-back
  round.js               an operator's round: test tenders, confirmations, audit jobs, close records
  identity-check.js      who is who on a chain whose agents are contract accounts (read-only)
  local-run.js           the rehearsal of round R2 on a development network
  export-abi.js          client/abi and build/ from the compiler's output
deployments/           the manifest format; the configuration of round R2a; no public manifest yet
evidence/              records, as in finchain: local-run-<time>.json
docs/                  decisions, architecture, the MVP specification with the production extension
                       design, the plans of the first production service and of the supply and
                       payment interfaces, roadmap, acceptance matrix, the runbook of round R2a
.github/workflows/     the tests and the rehearsal on a hosted runner; the independent audit
```

## Run it

Node.js 20 or later, and nothing else: the Solidity compiler is the solc-js build pinned in
`package.json`, so nothing is downloaded when the tests run.

```
npm ci
npm test            # the kernel, the client and its audit, deployment; on an in-process network
npm run local-run   # the rehearsal of round R2 on a development network; writes evidence/local-run-<time>.json
```

To run the client or to deploy - a worker, a demander, an auditor or the host of a round needs
nothing else - install without the build tools: `npm ci --omit=dev` brings in `ethers` and its
dependencies only. A deployment is made from `build/` and needs no compiler.

The rehearsal starts its own development node and runs round R2 on it with the commands of a
public deployment, each as a process of its own: keys, the identity check, the deployment from the
committed builds and the configuration of round R2a, the check of the deployed code, an operator's
round over a controlled self-test epoch and a standard one - behind an endpoint whose finalized
block lags, as a rollup's does - close records and audits. It then makes a second deployment in
which two contract accounts take part as themselves. Keys are made for the run outside the
checkout and deleted after it. It ends with `PASS` and the number of checks, and prints the
epochs' tables as an auditor sees them.

The same tests and the same rehearsal can be run on a hosted runner from a clean checkout
(`.github/workflows/ci.yml`): Actions, `ci`, "Run workflow". The workflow is in place and its
first hosted run is pending; the run's URL, its commit and its result are recorded in
`docs/decisions.md`, section 3, when it has run.

## The reference client

```
node client/pouw.js status --manifest <manifest>
node client/pouw.js verify --manifest <manifest> [--out record.json]
node client/pouw.js work   --manifest <manifest> --key-file <file> [--account <address>]
node client/pouw.js bridge <tokenId> <submissionId> --manifest <manifest> --key-file <file> [--account <address>]
node client/pouw.js seal   <epoch> --manifest <manifest> --key-file <file>
node client/pouw.js audit  <epoch> --manifest <manifest> [--out record.json]
```

It speaks JSON-RPC only and runs on any machine; an ordinary full node behind the endpoint is
enough, and the endpoint is the manifest's unless `--rpc` names another. A key is read from a
file on the machine that holds it - a file only its owner can read - never from the command line,
and never leaves that machine. `verify` and `audit` need no key. `verify` checks that the code at
the manifest's addresses is this repository's build and that the contracts are wired as the
manifest says. `audit` re-decides every receipt of an ended epoch from the chain's log, recomputes
the totals and every allocation, and reports each figure in which the ledger differs. `work` does
the same audit of the previous epoch before it submits, and submits nothing over a difference.

A participant is the address that sends. With `--account` the client acts through a contract
account, and the worker of record - and the owner that confirms a tender - is the account, not
the key. Do not give the client a key that a running agent node also sends from: two programs
sending from one key collide on nonces, and a key beside an agent is not the agent
(`docs/genesis-mining-mvp.md`, section 5.5).

## What the rounds show, and what they do not

Round R1 shows that the loop Work -> Verify -> GMU -> Epoch -> Test Reward runs end to end, that
an epoch closes without anyone supplying a figure, and that a party with no role can recompute
every receipt, total and allocation from the chain alone. Round R2a, once run, adds that what is
deployed on a public chain is this repository's code and that a machine which is not the
operator's recomputes every figure from the finalized chain.

Neither shows computation (an accepted G0 receipt is evidence of presence and of a conforming
submission), demand (a settled tender is evidence of a settlement confirmed by its owner; the
parties of the rehearsal and of round R2a are one party, and its tenders carry no task), an agent
(round R2a is worked by wallets an operator holds; no cell takes part), the absence of
self-dealing (the rule reads a tender as it stands when it is bridged), resistance to one party
holding several admitted addresses, an unpredictable seed, or an economy. Test points are the
value of a view function: nothing is issued, held or claimable, and they carry no right to any
future asset. `docs/acceptance-matrix.md`, section 10, has the full list.

## Documents

| Document | Content |
| --- | --- |
| `docs/decisions.md` | Approved rulings; the two reviews of the kernel and how each ruling was applied; the alignment of 2026-11-24 and the reviews of design revisions v0.1.4 and v0.1.5, and how each is applied; this repository's proposals, each open to a veto; the open questions, with the advisor's recommendations recorded beside them until the owner adopts them; illustrative figures |
| `docs/architecture.md` | Position; the first production commodity and what is implemented against what is future design; the economic stages and the three operating dimensions; actors, production roles and the complete AI Node; modules as built and future responsibilities; identity and admission; interfaces between the repositories; data flow, the three records, GMU and SIG, the ledgers; the trust and abuse model; chain neutrality |
| `docs/genesis-mining-mvp.md` | The specification of what is built (sections 1 to 12): data, the life of a receipt, the two profiles, GMU, epochs and the allocation, the complete rules for duplicates, lateness and versions, the audit. The designs kept for what is deferred (13). The production extension design and its proposed acceptance (14, 15): not implemented |
| `docs/production-service.md` | Plan, not built: the first production profile - its task class, published checks and enumerated task units; the pinned choices; the evidence envelope, the three identities of a piece of work with the task description behind the content key, and the pinned revision of ERC-8506 its records follow; the measurement rule; the evidence class of every claim; the contribution record and the rules that count a task unit once; three forms of supply under one profile |
| `docs/supply-and-payment.md` | Plan, not built: the records a worker's side keeps for supply, purchasing policy, purchases and funding; the three parts of a purchase's state - payment, service credit, adjustments - with the attempts under a purchase, and what settlement means per channel; the budget book of an agent's purchases and the recovery after a crash; failure and recovery; the customer's payment; the operating report; the later adaptations |
| `docs/roadmap.md` | What is reused, what is new, the rounds R0 to R4, round R2 as two acceptances and the figures round R2a must show; economic stages beside engineering numbers; the first production increment, the staged acceptances after it and the linked chain of evidence that closes the first production milestone; the later increments and the order |
| `docs/acceptance-matrix.md` | Every acceptance row with its state and its test; the rehearsal's checks; when round R2 is accepted; what the rounds prove and do not prove; the staged acceptance of the production extension, every row proposed and not run |
| `docs/r2-runbook.md` | Round R2a on Finchain Sepolia, one command at a time, with the clock and what to do when something goes wrong |
| `deployments/README.md` | The deployment manifest, the configuration a deployment is made from, the files of this directory |

## Principles (from FPM01)

- **Progressive Standardization**: start from incomplete, non-standard conditions and build the
  unified measurement of intelligence production step by step (GMU now, SIG later). Token usage,
  qualified delivery, capability, contribution and economic value keep separate meanings and
  separate evidence on the way.
- **Open Participation**: a third-party miner takes part with FOGA, another agent, a GPU or a model
  API, over RPC, without running a Finchain full node.
- **Conservative Settlement**: work verification, contribution measurement and reward distribution
  are evidenced, recomputable, recoverable and never counted twice.

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

Apache-2.0. See `LICENSE`. The files under `contracts/vendor/erc8414/` are CC0-1.0 and come from
the ERC-8414 reference repository; see the `NOTICE` there.
