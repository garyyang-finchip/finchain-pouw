# finchain-pouw

AI Proof of Useful Work (PoUW): a chain-neutral protocol and reference implementation that lets
independent AI cells and other workers do useful work, have it verified, have the contribution
measured, and be rewarded for it on an EVM chain. Finchain is the first reference deployment
chain (Finchain Sepolia first, Finchain mainnet after acceptance); the protocol itself does not
depend on Finchain.

Status: **v0.1.10 - round R1 passed with conditions; round R2a passed advisor technical
acceptance; ledger v2 is built and tested on a local network, its interfaces are frozen, its
builds are committed with their record, the client audits an epoch of it as a library, its
deployment tooling and manifest are built and rehearsed on a development network, and it is not
deployed.**
The Genesis Mining kernel runs on a local network: workers, G0 and G1 work, GMU, epochs closed by
time, and an audit from the chain alone that agrees with the ledger on every figure. The kernel's
contracts are those of v0.1.2. Release 0.1.3 added what a public deployment needs - committed
builds, a deployment that records code hashes, a check of deployed code, an operator's round, the
identity check - and rehearsed round R2 with them. Round R2a, the operator-wallet integration,
was run on Finchain Sepolia on 2026-11-24 from release 0.1.3. Its manifest is
`deployments/finchain-sepolia-r2.json` and its records are under `evidence/r2a/`, with an index
that sets what was observed against what was expected. The advisor accepted R2a on 2026-11-24
after reviewing evidence commit `b53e52f`; the scoped outcome and its provenance are recorded in
`docs/decisions.md` 6.11 and `docs/acceptance-matrix.md` 9. The strategic baseline is FPM01 /
FPM01-G v0.2 (the owner's PoUW strategy and Genesis Mining design record); `docs/decisions.md`
lists what is approved, what this repository proposes, what is still open for the owner's ruling,
and which figures are only illustrative.

Release 0.1.4, with design revision v0.1.10 (2026-11-25), is the first change of the software
since 0.1.3. It follows the owner's rulings of 2026-11-25 on how a contract account takes part,
on the next version of the ledger and on the client's audit (`docs/decisions.md` A73 to A79,
section 14). Two things are in it:

- **The reference client reads one block.** An audit and a check of a deployment take one
  finalized block and read every log, view and piece of code at it; the record names the block
  and has a canonical form with two hashes; the authority at a settlement is reported as far as
  a tender's log settles it; work that is recorded is not sent again. This runs against the
  kernel as it is deployed for round R2a.
- **Ledger v2** (`contracts/v2/`, `docs/ledger-v2.md`): a second set of contracts beside the
  kernel, with a bounded delegation that an account signs, a cap on a declared operator's
  aggregate, work facts apart from receipts and the receipt fields of the production line. It is
  written and tested on a local network. It is not deployed, no build of it is committed, and
  nothing was signed.

Release 0.1.5, with design revision v0.1.11 (2026-11-25), follows the advisor's review of that
implementation and the owner's rulings on it (`docs/decisions.md` A80 to A86, section 15). The
interfaces of ledger v2 are frozen: `contracts/v2/interfaces.frozen.json` is the record, and a
test fails when the tree differs from it. The deployable build is a separate matter and is not
made: it waits for a compile boundary of v2 with a compiler of its own. Three tools are
corrected. The signing script could overwrite its own key file when `--out` named it, directly
or through a link, and now writes to a new file only. The canonical form of a record refuses
an array with an empty slot. The second program for a record's hashes refuses a member named
twice. No contract and no compiled interface changed.

Release 0.1.10, with design revision v0.1.17 (2026-11-26), is the deployment of ledger v2 as
local development, as the owner's ruling A87 has it (`docs/decisions.md` 20). v2 gets its own
copies of the audit function and of the seed sources, compiled inside its boundary and held by a
test to the kernel's text and answers. `scripts/deploy-v2.js` deploys v2 from `build/v2/`; its
manifest names every contract with its code, where each log starts, the guard of each contract
account with the guard's code hash, and the deployment it supersedes; the check of a deployment
against its manifest and the audit both read that manifest. The rehearsal makes such a
deployment with the command. `scripts/cell-probe.js` reads, without a key and without sending,
what the cell guard would answer for each contract account and the gas of the guard and of the
signature check against the ledger's bounds; on 2026-11-26 it was run against the cells of OG
and cell-b on Finchain Sepolia, and both bounds hold for them. Three residual cases of the
reading of full signing records are closed. No contract of the ledger and no compiled interface
changed; nothing is deployed on a public chain and nothing is signed.

Release 0.1.9, with design revision v0.1.16 (2026-11-26), is the second correction of the audit
of ledger v2, after the advisor's review of 0.1.8 (`docs/decisions.md` 19): a profile version
that the policy replaced while it was still ahead is replayed as the policy replays it, instead
of being refused as a gap in the log; a full signing record given to the audit is read as it
is, its structure checked before its digest, and one that would need repair is unusable. The
same revision records the owner's adoption of the advisor's recommendations on P71 to P76, P69,
Q33/P70, Q32 and P68 (A87): Q32 and Q33 are ruled, and the deployment of v2 is the next
delivery. No contract, no compiled interface and no build changed.

Release 0.1.8, with design revision v0.1.15 (2026-11-26), is the small correction that the
advisor's functional review of 0.1.7 asked for (`docs/decisions.md` 18): the audit reads the
policy's log from the deployment's first block and refuses a log that does not reach back to
what it needs instead of auditing a shorter history; a transaction that is the entry's own call
is held to its receipt in full, and an invalid permit in it is a difference, not a missing one;
a signing record given to the run is read by its own domain and types, and one for another
chain or ledger, or one that contradicts itself, is listed and not used. The mutation runner
reads its verdicts from the test summary alone. Three tests are added and one bounds the gas of
its refused transactions. No contract, no compiled interface and no build changed.

Release 0.1.7, with design revision v0.1.14 (2026-11-25), is the first part of the client for a
v2 deployment (`docs/decisions.md` A86, section 17): the audit of an epoch of ledger v2, as a
library (`client/lib/audit2.js`) with its record (`client/lib/report2.js`). At one block it
re-decides every receipt whose work it can read again, holds each delegated receipt to its
permit - read from the delegate's own transaction, or given to the run - and compares every
figure with the ledger. What it cannot read again it lists as undecided, apart from the
differences. It is not yet a command: the commands take a manifest, and the manifest of a v2
deployment comes with the deployment. No contract, no compiled interface and no build changed.

Release 0.1.6, with design revision v0.1.12 (2026-11-25), gives ledger v2 a compiler of its own
(`docs/decisions.md` A82, section 16). Everything under `contracts/v2` is compiled by solc
0.8.39 and imports nothing from outside that directory; the kernel is compiled by solc 0.8.24
as before, and its six builds under `build/` are unchanged, byte for byte. Both compilers are
packages that the lock file pins, so `npm ci` installs them and nothing is downloaded at build
time. The builds of v2 are under `build/v2/`, with a record of how they were made and a record
of what the compiler's own list of known bugs held for that compiler on the day it was read.
`npm ci && npm run export-abi` writes the same bytes again. No rule of the ledger and no
compiled interface changed.

On 2026-11-25 the client of release 0.1.5, on a hosted runner and with no key, checked and
audited the deployment of round R2a on its public endpoint, at one finalized block, and found
every figure of the round (`evidence/hosted-ci-4/`). That run is a check of the client; it
reopens nothing of the round.

The contracts of the kernel and their committed builds are unchanged, byte for byte. Round R2a
ran from software 0.1.3, and its records stay as made.

Design revisions v0.1.4 to v0.1.9 (all 2026-11-24) are revisions of the documents; v0.1.9 also
adds the records of round R2a. None of them changed the software. The runbook's normal-path
command blocks stay unchanged; its fallback and evidence instructions are made explicit.
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
points are written into the plans for the next implementation. v0.1.8 records the owner's
adoption of the advisor's recommendations on the thirteen questions of the production line (Q17
to Q29; `docs/decisions.md` A70): the plans are approved as design. Nothing of the production
line is built.

This consolidated v0.1.8 also brings the remaining document clarifications together
(`docs/decisions.md` 6.8): the full halving schedule; the same-deployment and actual-epoch rules
for audits; and the distinction between adopted design, pending implementation choices and
acceptance that has not run. Q16 is partly settled through Q26; the current R2a hosted audit
continues under P38. No new ruling or software release is made by this consolidation.

v0.1.9 records the run of round R2a and the review of that run (`docs/decisions.md` A72, 6.10):
the records of the round and their index, the first runs of the tests and of the independent
audit on a hosted runner, and the condition on the finality of the close records, which the
runbook and the acceptance of round R2 now name. It also records the review of v0.1.7 and where
the consolidated documents of v0.1.8 came from (A71, 6.9). At evidence commit `b53e52f`, acceptance
was still pending. The dated close-status addendum records the advisor's subsequent technical
acceptance (`docs/decisions.md` 6.11). This documentation update changes no software, deployment,
raw evidence or open owner decision.

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
  v2/                    ledger v2, beside the kernel: local, not deployed; interfaces frozen;
                         compiled apart from everything else, by solc 0.8.39
    interfaces.frozen.json   the record of the frozen interfaces, held by a test
    GenesisPolicyV2.sol      the policy with the operator cap, the task-unit rule and guard bindings
    GenesisLedgerV2.sol      permits checked at each use, operator aggregation, facts and receipts
    TenderAdapter8414V2.sol  a fact by anyone; a confirmation by the owner or its delegate
    guards/FogaCellGuard.sol an optional guard for FOGA cells; nothing of the kernel names it
    external/                v2's own copies of the three kernel interfaces it calls
    testing/                 fixtures of the v2 tests; never deployed
build/                 the deployable contracts of the kernel as compiled: what a deployment is made from
  v2/                    the same for ledger v2, by its own compiler, with build-record.json and
                         known-bugs-check.json
client/                the reference client: pouw.js, lib/, abi/
  lib/canonical.js       the one byte form of a record, and its two hashes
  lib/permit.js          the three signed statements of ledger v2 as typed data
  lib/ledger2.js         the encodings and the allocation of ledger v2, off chain
  lib/audit2.js          the audit of an epoch of ledger v2 at one block; a library, not yet a command
  lib/report2.js         the record of that audit
  lib/manifest2.js       the manifest of a v2 deployment, and the check of a deployment against it
test/                  the test suite; v2.*.test.js for ledger v2, vectors/ for the typed statements
scripts/               the tooling of a deployment and a round
  sign-permit.js         one statement of ledger v2, signed off line from a key file; no network;
                         its record goes to a new file and overwrites nothing
  report-hash.py         the two hashes of a record, computed again from its file
  keys.js                key files for a deployment's parties, made on the host that uses them
  deploy.js              a deployment from a configuration file and build/, with a read-back
  deploy-v2.js           a deployment of ledger v2 from a configuration file and build/v2/, with a
                         read-back; its manifest and record are created and overwrite nothing
  round.js               an operator's round: test tenders, confirmations, audit jobs, close records
  identity-check.js      who is who on a chain whose agents are contract accounts (read-only)
  cell-probe.js          what the cell guard would answer for each contract account, and the gas
                         of the guard and the signature check against the bounds (read-only)
  local-run.js           the rehearsal of round R2 on a development network
  export-abi.js          client/abi, build/ and build/v2/ from the compilers' output
deployments/           the manifest format; the configuration and the manifest of round R2a
evidence/              records, as in finchain: local-run-<time>.json, and r2a/, the records of
                       round R2a on Finchain Sepolia
docs/                  decisions, architecture, the MVP specification with the production extension
                       design, ledger v2, the plans of the first production service and of the
                       supply and payment interfaces, roadmap, acceptance matrix, the runbook of
                       round R2a
.github/workflows/     the tests and the rehearsal on a hosted runner; the independent audit
```

## Run it

Node.js 20 or later, and nothing else: the two Solidity compilers - solc 0.8.24 for the kernel,
solc 0.8.39 for ledger v2 - are the solc-js builds pinned in `package.json` and in the lock
file, so nothing is downloaded when the tests run.

```
npm ci
npm test            # the kernel, the client and its audit, deployment, ledger v2; on an in-process network
npm run local-run   # the rehearsal of round R2 on a development network; writes evidence/local-run-<time>.json
```

To run the client or to deploy - a worker, a demander, an auditor or the host of a round needs
nothing else - install without the build tools: `npm ci --omit=dev` brings in `ethers` and its
dependencies only. A deployment is made from `build/`, or for ledger v2 from `build/v2/`, and
needs no compiler.

The rehearsal starts its own development node and runs round R2 on it with the commands of a
public deployment, each as a process of its own: keys, the identity check, the deployment from
the committed builds and the configuration of round R2a, the check of the deployed code, an
operator's round over a controlled self-test epoch and a standard one - behind an endpoint whose
finalized block lags, as a rollup's does - close records and audits. It then makes a second
deployment in which two contract accounts take part as themselves, and a third, of ledger v2
from its own builds, which supersedes the first and is checked against its manifest from the
outside. Keys are made for the run outside the checkout and deleted after it. It ends with
`PASS` and the number of checks, and prints the epochs' tables as an auditor sees them.

The same tests and the same rehearsal can be run on a hosted runner from a clean checkout
(`.github/workflows/ci.yml`): Actions, `ci`, "Run workflow". It first ran there on 2026-11-24,
with success; the run, its commit and its record are in `docs/decisions.md`, section 3.

## The reference client

```
node client/pouw.js status --manifest <manifest>
node client/pouw.js verify --manifest <manifest> [--out record.json]
node client/pouw.js work   --manifest <manifest> --key-file <file> [--account <address>]
node client/pouw.js bridge <tokenId> <submissionId> --manifest <manifest> --key-file <file> [--account <address>]
node client/pouw.js seal   <epoch> --manifest <manifest> --key-file <file>
node client/pouw.js audit  <epoch> --manifest <manifest> [--out record.json]
```

It speaks JSON-RPC only and runs on any machine; the endpoint is the manifest's unless `--rpc`
names another. An audit and a check of a deployment read one block - `finalized`, or the block
`--tag` names - and nothing after it, so the endpoint must be able to serve the state of that
block; where it cannot, the client stops with exit status 4 and reads no other block. A key is read
from a file on the machine that holds it - a file only its owner can read - never from the command
line, and never leaves that machine. `verify` and `audit` need no key. `verify` checks that the
code at the manifest's addresses is this repository's build and that the contracts are wired as the
manifest says. `audit` re-decides every receipt of an ended epoch from the chain's log, recomputes
the totals and every allocation, and reports each figure in which the ledger differs. Its record
names the block it read by number, hash and time, and carries two hashes of its canonical form;
`python3 scripts/report-hash.py <record>` computes them again. `work` does the same audit of the
previous epoch before it submits, and submits nothing over a difference; `work` and `bridge` first
look for the receipt by its contribution id, and send nothing when it is recorded.

A participant is the address that sends. With `--account` the client acts through a contract
account, and the worker of record - and the owner that confirms a tender - is the account, not
the key. Do not give the client a key that a running agent node also sends from: two programs
sending from one key collide on nonces, and a key beside an agent is not the agent
(`docs/genesis-mining-mvp.md`, section 5.5).

## What the rounds show, and what they do not

Round R1 shows that the loop Work -> Verify -> GMU -> Epoch -> Test Reward runs end to end, that
an epoch closes without anyone supplying a figure, and that a party with no role can recompute
every receipt, total and allocation from the chain alone. Round R2a adds that what is deployed on
a public chain is this repository's code, and that another environment - a hosted runner, with
the same reference client and the same public endpoint - recomputes every figure from the
finalized chain. That is another run, not another implementation and not another source of the
chain's state. The round's records are under `evidence/r2a/`; the advisor's technical acceptance
is recorded in `docs/decisions.md` 6.11. R2b and production retain their own acceptance scopes.

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
| `docs/decisions.md` | Approved rulings; the two reviews of the kernel and how each ruling was applied; the alignment of 2026-11-24 and the reviews of design revisions v0.1.4, v0.1.5 and v0.1.6, and how each is applied; the owner's adoption of the advisor's recommendations on Q17 to Q29; this repository's proposals, each open to a veto; the questions put to the owner, open and adopted; illustrative figures |
| `docs/architecture.md` | Position; the first production commodity and what is implemented against what is future design; the economic stages and the three operating dimensions; actors, production roles and the complete AI Node; modules as built and future responsibilities; identity and admission; interfaces between the repositories; data flow, the three records, GMU and SIG, the ledgers; the trust and abuse model; chain neutrality |
| `docs/genesis-mining-mvp.md` | The specification of what is built (sections 1 to 12): data, the life of a receipt, the two profiles, GMU, epochs and the allocation, the complete rules for duplicates, lateness and versions, the audit. The designs kept for what is deferred (13). The production extension design and its proposed acceptance (14, 15): not implemented |
| `docs/ledger-v2.md` | Ledger v2 as built on a local network: participant, sender and origin; the permit and the two statements that end one; the check at each use; guards; ending permits and taking a key's signing right away; the receipt and the order of the reasons; the operator cap; work facts and confirmations; the authority at settlement; the frozen interfaces, with every encoding, and what the freeze leaves open; the client's audit at one block, and its audit of an epoch of ledger v2; the test matrix with its results; what is not built |
| `docs/production-service.md` | Plan, adopted as design (A70) and not built: the first production profile - its task class, published checks and enumerated task units; the pinned choices; the evidence envelope, the three identities of a piece of work with the task description behind the content key, and the pinned revision of ERC-8506 its records follow; the measurement rule; the evidence class of every claim; the contribution record and the rules that count a task unit once; three forms of supply under one profile |
| `docs/supply-and-payment.md` | Plan, adopted as design (A70) and not built: the records a worker's side keeps for supply, purchasing policy, purchases and funding; the three parts of a purchase's state - payment, service credit, adjustments - with the attempts under a purchase, and what settlement means per channel; the budget book of an agent's purchases and the recovery after a crash; failure and recovery; the customer's payment; the operating report; the later adaptations |
| `docs/roadmap.md` | What is reused, what is new, the rounds R0 to R4, round R2 as two acceptances and the figures round R2a must show; economic stages beside engineering numbers; the first production increment, the staged acceptances after it and the linked chain of evidence that closes the first production milestone; the later increments and the order |
| `docs/acceptance-matrix.md` | Every acceptance row with its state and its test; the rehearsal's checks; when round R2 is accepted; what the rounds prove and do not prove; the staged acceptance of the production extension, every row planned and not run |
| `docs/r2-runbook.md` | Round R2a on Finchain Sepolia, one command at a time, with the clock and what to do when something goes wrong |
| `deployments/README.md` | The deployment manifest, the configuration a deployment is made from, the files of this directory |
| `evidence/README.md` | The records kept in this repository and what each is |
| `evidence/r2a/README.md` | The records of round R2a on Finchain Sepolia, and their index: the two deployments, the round in order, the receipts, the figures expected and found, what each audit read and at which block, the hosted runs, the conditions of acceptance against their evidence, every file's checksum |

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
