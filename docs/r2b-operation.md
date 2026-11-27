# Round R2b on Finchain Sepolia: the operation package

Status: **prepared with release 0.2.2 and rehearsed on a development network (row L62); not run.
Nothing in it has been deployed, signed or sent.** It is put for review as a whole; the steps that
send a transaction or use a live key are taken one at a time, each after the step before it has
been checked, and the two permits are generated only from the deployment as verified.

## 1. What the round shows, and what it does not

Round R2b shows that work can be recorded in the name of two FOGA Cell Accounts - the OG and
cell-b - while the transactions are sent by delegate keys of their own, each under one bounded
permit that the cell's owner key signs once, and that the ledger checks each entry against the
permit, the account's own signature rule (ERC-1271) and the cell guard; and that the
contributions and the allocations are recomputed from the chain alone at a finalized block, on the
host and on a hosted runner that holds no key.

It does not show that agent software decided to do the work or started it: the delegates run the
reference client, started by whoever holds the delegate keys, and the run records say so. A
stronger statement about agents running themselves would need evidence of the software's own
trigger and of the task it ran; it is not made here. It is not evidence of demand or of
computation either: both cells are the owner's, the tender is the business loop's test tender, and
the audit job measures presence. It runs no dispute and touches nothing on mainnet.

## 2. Fixed versions

| What | Value |
| --- | --- |
| Network | Finchain Sepolia, chain id 85422, RPC `https://rpc.finchain.one`, settled on Ethereum Sepolia |
| Software | finchain-pouw release 0.2.2, from the commit of `main` that holds it, named in the review of this package |
| Configuration | `deployments/finchain-sepolia-r2b.config.json`, schema `finchain-pouw.deploy-config/2` |
| Builds | `build/v2`, solc 0.8.39; the deployment reads them as committed and records the SHA-256 of each |
| `build/v2/build-record.json` | `e76cb4449d73dc3b98d3f9900020fb880b194aab6d8295d564b0b10557fe6492` |
| `build/v2/GenesisPolicyV2.json` | `b9d4ba68079f177c8c18117fdb33c3f8f6b5a7ea5f84374b408478e4c0d85710` |
| `build/v2/GenesisLedgerV2.json` | `16dbc3cd26df16e14e659bd97d2db8f7cbaf0830dbe27a2b217b802c9011c23e` |
| `build/v2/AuditV1.json` | `0c228d9288b93d8ee415476a998bba36d5c04e094d0b723b1d05c854ba97381a` |
| `build/v2/TenderAdapter8414V2.json` | `ac723522f8be4153b1f382027cf4cc74b7f1fcde6f15b7596aa2f14607264904` |
| `build/v2/L1BlockSeedSource.json` | `a865e9bf8881d832d64ac31de6ca5086367d60d6f4c6120f2203607dee36c3fd` |
| `build/v2/FogaCellGuard.json` | `156a9abe18361b29eaec7029989a3fd014d8812cd6d4ba0befd77d4f487d1001` |
| The guard's runtime code hash | `0xd8a6e1fa19c2d6a88270c28c3a91b909ef1242f4b1a162a721956a41f63214d3` (no immutable values: the code on chain is the build's, and the binding records this hash) |
| Records | manifest `finchain-pouw.deployment/2`, record `finchain-pouw.deployment-record/2`, run `finchain-pouw.ledger-v2.run/2`, permit check `finchain-pouw.ledger-v2.permit-check/1`, probe `finchain-pouw.cell-probe/2`, audit and check as in `ledger-v2.md` 13 |

## 3. The roles

| Role | Address or key | Where | Does | Never does |
| --- | --- | --- | --- | --- |
| Operator 1 | the owner, who holds both cells | - | is the operator of record of both cells: they are declared under operator 1 and are related parties of each other | appear as two operators |
| OG | Cell Account `0x9F7647013499C44B7E0432F5E9e22E4Afd447aD1`, owner wallet `0x5Fee42D697975f6154164b29371c1c447F56fb4E` | its signer key stays on the host of the OG's node, E06 (to be confirmed in the review) | is the worker of record of its audit jobs and the demander of record of tender 5; its owner key signs one permit | send a transaction for this round |
| cell-b | Cell Account `0x2Dd0c30383EcD6414e0b9DD6F10bf27BFe8715BB`, owner wallet `0x7dCE041276791F2371EA2e77F99119f22D32cd81` | its signer key stays on E05, the agreed exception | is the worker of record of its audit jobs and of tender 5, submission 1; its owner key signs one permit | send a transaction for this round |
| Steward | key `steward`, made for this round | `~/pouw-keys/finchain-sepolia-r2b` on E05 | deploys, registers, admits, declares, binds the guard, funds the delegates, writes the close records | sign a permit or act for a cell |
| delegate-og | key `delegate-og`, made for this round | the same directory on E05 | sends the OG's audit jobs and the confirmation of tender 5 under the OG's permit | act without a permit; be a key any FOGA node sends from |
| delegate-cell-b | key `delegate-cell-b`, made for this round | the same directory on E05 | sends cell-b's audit jobs under cell-b's permit | the same |
| Chain deployer | the finchain deployer key | its host in the finchain repository | sends the steward its gas, once | anything else in this round |
| Hosted runner | the repository's workflow `ci`, no key | GitHub Actions | recomputes the deployment and the epochs from the public endpoint | hold or use a key |

A delegate is the sender and the origin of the cell's entries; the cell's account is the
participant of record. That an account accepts its owner's signature does not show that only its
current owner could have made it.

## 4. The deployment

The configuration names: two parameter versions - epoch 0 `controlled-self-test`, which subsidizes
declared-related parties under that label, and from epoch 1 `standard`, which measures them and
does not subsidize them - with a budget of 1000 test points, G0 10 % and G1 90 %, a cap of 25 %
per address and 50 % per operator of each pool; the profiles `g0.ref` (AuditV1, 10 GMU, one job a
worker and epoch) and `g1.tender` (50 GMU, at most 200 a worker and epoch); the seed source
`L1BlockSeedSource`, the OP Stack L1 block; two-hour epochs; the ERC-8414 contract
`0xfA4ED44c3A06f9087D98BEfb99f69ff43b381908`, its log read from block 61392, the block of its
creation transaction `0x097042f33ef825a9b465280934da4bba92560c7fb024ea4c64d014178d6cd7d9` (the
plan holds this to the chain before anything is sent: no code at block 61391, or that transaction
creating that contract at or after the start); the two cells, admitted, operator 1, each behind the
cell guard; the two delegates, funded with 0.002 each; and the deployment of round R2a, which it
supersedes. `supersedes` names round R2a's ledger and the SHA-256 of its manifest as a
commitment; nothing of round R2a is read beyond its code or changed, and its evidence stays.

The 17 transactions, in the order the deployment sends them: the policy, the seed source, the
ledger, AuditV1, the tender adapter and the cell guard deployed (6); the two profiles (2);
parameter version 2 (1); for each cell, its admission, its operator and its guard binding -
version 1 from epoch 0 - (6); the two delegates funded (2). The log of the policy and of the
ledger start at the blocks of their deployment transactions, which the manifest records and `pouw
verify` holds to the chain.

| Fee | Gas (measured on the development network, row L62) | At the price the plan reads |
| --- | --- | --- |
| The deployment, by the steward | 10,624,795; the plan estimates about 11,250,000 | about 0.0113 ETH at 1 gwei, plus the rollup's data fee |
| The delegates' funds, by the steward | - | 0.004 ETH |
| delegate-og over the round | opening an epoch 65,386-90,433 when it is the first to send in it; each audit job 623,132-632,596; the confirmation of tender 5 567,127; at most about 2,010,000 in all | about 0.0020 ETH at 1 gwei |
| delegate-cell-b over the round | each audit job 537,608-564,196, and an opening when it is first; at most about 1,260,000 in all | about 0.0013 ETH at 1 gwei |
| The close records, by the steward | one small transaction each | within the steward's remainder |

The steward is sent 0.02 ETH, as in round R2a. The plan prints the endpoint's gas price and the
steward's balance before anything is sent. Stop condition: if the gas price makes the delegates'
largest total above 0.002 ETH - above about 1 gwei - the delegates' funds are raised in the
configuration and the plan is reviewed again before `--yes`.

## 5. The read-only preflight

On E05, in the repository's checkout, at the reviewed commit. No key is read in this section.

```
git pull --ff-only && git rev-parse HEAD
npm ci --omit=dev
C=deployments/finchain-sepolia-r2b.config.json
K=~/pouw-keys/finchain-sepolia-r2b
O=out/finchain-sepolia-r2b
node scripts/identity-check.js --config deployments/finchain-sepolia.identities.json --out $O/identity-check.json
node scripts/cell-probe.js --config deployments/finchain-sepolia.identities.json --out $O/cell-probe.json
sha256sum $O/identity-check.json $O/cell-probe.json
```

| Check | Expected | Stop when |
| --- | --- | --- |
| The commit | the reviewed commit | it is another |
| The identity check | both accounts are contracts whose owner is the cell's wallet; tender 5 is owned by the OG's account, submission 1 was delivered by cell-b's account and accepted | anything else |
| The corrected probe | at the finalized block, its hash asked for again at the end: each cell's AID registry readable, the guard allowing both delegated operations and succeeding with the 500,000 it is given, the foreign signature refused within its 200,000, each call's answer in the form the ledger reads | any call failing or any answer otherwise; the block replaced |

The probe measures the refusal of a signature that is not the owner's. It does not stand for the
path of a valid permit, which is checked in step 4, after the permits are signed.

## 6. The run

Every command is rehearsed by the test of row L62 and, at the command line, by `npm run
local-run`; the expected records are those below.

**Step 1. Keys and the steward's gas.** `node scripts/keys.js $K steward delegate-og
delegate-cell-b` prints three addresses and no key. Send 0.02 ETH on Finchain Sepolia to the
steward from the chain deployer's host (in `finchain`: `make l2-send TO=<the steward's address>
AMOUNT=0.02 ROLE=deployer`).

**Step 2. The plan, then the deployment.**

```
node scripts/deploy-v2.js --config $C --keys $K --genesis +15m
```

Without `--yes` nothing is sent. Expected: 17 transactions; the tenders' log from block 61392 with
how that block was held to the chain; the replaced deployment `finchain-sepolia-r2` named and not
read; both cells with "the cell guard would allow it now"; the steward's balance above the
estimate. Then the same command with `--yes`, and `node client/pouw.js verify --manifest
$O/manifest.json --out $O/verify.json`. Expected: `DEPLOYED` with the read-back as configured, a
journal beside the manifest, and `MATCH` at the finalized block. Stop on anything else, and follow
section 9; never deploy again over a deployment that stopped.

**Step 3. The permits.** Generated from the verified manifest - its chain id, its ledger, the guard
`contracts.FogaCellGuard` and its binding version 1 - first without a key, for review:

```
node scripts/sign-permit.js permit --chain-id 85422 --ledger <contracts.GenesisLedgerV2> --account 0x9F7647013499C44B7E0432F5E9e22E4Afd447aD1 --delegate <delegate-og> --scope submit-g0,confirm-tender --not-before-epoch 0 --not-after-epoch 2 --nonce 0 --guard <contracts.FogaCellGuard> --guard-binding-version 1 --out $O/permit-og.unsigned.json
node scripts/sign-permit.js permit --chain-id 85422 --ledger <contracts.GenesisLedgerV2> --account 0x2Dd0c30383EcD6414e0b9DD6F10bf27BFe8715BB --delegate <delegate-cell-b> --scope submit-g0 --not-before-epoch 0 --not-after-epoch 2 --nonce 0 --guard <contracts.FogaCellGuard> --guard-binding-version 1 --out $O/permit-cell-b.unsigned.json
```

Each prints the statement in words, the typed data - domain `name`, `version`, `chainId`,
`verifyingContract`; the eight fields of `Permit`: `account`, `delegate`, `scope`,
`notBeforeEpoch`, `notAfterEpoch`, `nonce`, `guard`, `guardBindingVersion` - and the digest. The
two records are reviewed against the manifest before any key is named. The epochs 0 to 2 are the
two working epochs and one in reserve; after epoch 2 the permit is void. Then each is signed once
on its own host, with the same arguments and `--key-file <the cell's signer key file>` and `--out
<a new file>`: the OG's on its host, cell-b's on E05. The script reads the key file where it is,
opens no network connection and sends nothing. A record leaves a host by `cat`; it reaches E05
through a repository pull.

**Step 4. The permits, checked read-only.** After the genesis - before it the ledger takes no
permit, and the check says `NotStarted()` - and before any work:

```
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-og.json> --operation submit-g0 --out $O/permit-check-og-submit.json
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-og.json> --operation confirm-tender --out $O/permit-check-og-confirm.json
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-cell-b.json> --operation submit-g0 --out $O/permit-check-cell-b-submit.json
```

Expected: `ACCEPTED` at the finalized block, the account with code, the signature key the cell's
wallet, the guard allowing it, the block's hash asked for again. No key is read. Stop on a
refusal: no work is sent under a permit the ledger refuses.

**Step 5. Epoch 0, the controlled self-test.**

```
node client/pouw.js work --manifest $O/manifest.json --permit <permit-og.json> --key-file $K/delegate-og.key --out $O/run-work-og-0.json
node client/pouw.js work --manifest $O/manifest.json --permit <permit-cell-b.json> --key-file $K/delegate-cell-b.key --out $O/run-work-cell-b-0.json
node client/pouw.js bridge 5 1 --manifest $O/manifest.json --permit <permit-og.json> --key-file $K/delegate-og.key --out $O/run-bridge-og-0.json
```

**Step 6. Epoch 1, standard.** The two `work` commands again, with `-1` in the names of their
records. Each first recomputes epoch 0 from the chain and sends nothing unless the recomputation
agrees with the ledger and is complete (exit 2 or 5: stop).

**Step 7. After epoch 1.** `node client/pouw.js seal 0 --manifest $O/manifest.json --key-file
$K/steward.key`, the same for epoch 1, then `node client/pouw.js audit 0 --manifest
$O/manifest.json --out $O/audit-epoch-0.json` and the same for epoch 1, at the finalized block.

**Step 8. The records.** The manifest, the deployment record, the journal, the permits signed and
unsigned, the permit checks, the run records, the probe, the verification and the audits leave E05
by `cat` and are committed under `evidence/r2b/`, each with its SHA-256 computed on the host; the
manifest is also committed as `deployments/finchain-sepolia-r2b.json`.

**Step 9. The hosted runner.** With the manifest in the repository, the workflow `ci` run by hand
with that manifest and the epochs `0 1`: it verifies the deployment and audits both epochs from the
public endpoint with no key. Its records go under `evidence/r2b/hosted-ci/`.

## 7. The expected figures

From row L62, which works the same configuration with stand-ins for the cells and the tender:

| Epoch | Mode | Receipts | GMU measured G0 / G1 | GMU subsidized G0 / G1 | Each cell | Allocated | Unallocated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | controlled-self-test | 3: two audit jobs, one confirmation, all delegated | 20 / 50 | 20 / 0 | 10 GMU in G0; 25 points | 50 of 1000 | 950 |
| 1 | standard | 2: two audit jobs, delegated | 20 / 0 | 20 / 0 | 10 GMU in G0; 25 points | 50 of 1000 | 950 |

Each cell's share of the 100 points of G0 would be 50; the cap of 25 % per address binds, and the
two together are at the operator's cap of 50 %. The confirmation of tender 5 is recorded in the
OG's name as demander, with cell-b as worker, the relation `declared-related` and the eligibility
`delivered-before-genesis`: the tender settled on 2026-11-13, before this deployment, so it is
measured (50 GMU) and earns nothing, and G1's 900 points stay unallocated. Every entry carries the
label `delegated-by-owner-permit`, the cell as participant, the delegate as sender and origin, and
the permit's digest as authorization.

## 8. The acceptance table

| Row | What is accepted | On what evidence |
| --- | --- | --- |
| B1 | The preflight | the identity check and the corrected probe as section 5 expects, with their SHA-256 |
| B2 | The deployment | `DEPLOYED` with the read-back as configured; the journal with every transaction confirmed; `pouw verify` `MATCH` at a finalized block, the tenders' log start held to the chain |
| B3 | The account identities | the participant of every entry is the cell's account; the operator stored for each cell in each epoch is 1 |
| B4 | The route | sender and origin the cell's delegate; authorization the digest of the cell's permit; the guard binding in force the manifest's; the permit check of step 4 `ACCEPTED` before the first entry |
| B5 | No double entry | a second run of a job in the same epoch finds the receipt by its contribution id and sends nothing |
| B6 | The figures | section 7, in the ledger and in the audits |
| B7 | The audits | `pouw audit` of epochs 0 and 1 at a finalized block exit 0 - agrees and complete. Exit 5 is a re-decision that is not complete and is not a pass; exit 3 or 4 is run again at a block that is settled and served, never at `latest` in its place |
| B8 | The independent recomputation | the hosted runner's verification and audits with the same table hashes |

## 9. When something goes wrong

- **A refusal before a transaction is taken.** Nothing was sent. The cause is read from the
  message; the step is taken again once it is removed.
- **The deployment stops after sending.** The journal and the standard error list every
  transaction taken, confirmed, failed or of unknown outcome, with hash, sender and nonce. What is
  confirmed stays on chain. A transaction of unknown outcome is looked up by its hash before
  anything is sent again; a party is never funded twice. The deployment is not made again over it:
  a new one is a new name, reviewed again, and its configuration funds no party that was funded.
- **The journal cannot be written.** Nothing more is sent; the transactions taken are on the
  standard error. They are looked up by hash, and the records are written again from the chain.
- **A work or confirmation transaction of unknown outcome.** It is looked up by its hash. The same
  command run again finds a recorded receipt by its contribution id and sends nothing.
- **An output that cannot be written.** The place of `--out` is taken before anything is sent; a
  run that stops after sending leaves the journal of its transactions in that file, and shows each
  on the standard error.
- **A permit refused at the check.** No work is sent under it. If the permit is wrong, the cell's
  owner key signs its revocation (`sign-permit.js revoke`) or a raise of the account's minimum
  nonce above 0 (`sign-permit.js raise-nonce`), and any key enters the statement with the ledger's
  `revokePermitBySig` or `raiseMinNonceBySig`; the client of this release has no command for that
  entry, which is part of the operation package of that event. A corrected permit is then
  generated, reviewed and signed again. A change of the cell's owner is not relied on to void a
  permit.
- **A delegate key lost or exposed.** The cell's permit is revoked or its minimum nonce raised, a
  new delegate key is made, and a new permit is generated, reviewed and signed.
- **The guard refuses an entry.** Nothing is recorded for it; the cell's state is read with the
  probe, and the round continues in the reserve epoch if the cell is restored.
- **An epoch passes without its work.** The epoch is recorded as it is; the permits allow one
  reserve epoch, epoch 2.

## 10. What the round changes nothing of

Round R2a, its ledger and its evidence; any FOGA node or chain node, which is not stopped,
restarted or reconfigured; the keys of the cells, which sign one permit each where they are and
send nothing; the contracts, the frozen interfaces and the builds.
