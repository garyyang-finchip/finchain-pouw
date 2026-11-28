# Round R2b on Finchain Sepolia: the operation package

Status: **prepared with release 0.2.2, its conditions of execution completed in release 0.2.3;
rehearsed on a development network (rows L62 to L66 and `npm run local-run`); not run. Nothing in it
has been deployed, signed or sent.** It is put for review as a whole; the steps that send a
transaction or use a live key are taken one at a time, each after the step before it has been
checked, and the two permits are generated only from the deployment as verified.

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
| Software | finchain-pouw release 0.2.3, from the commit of `main` that holds it, named in the review of this package |
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
| Records | manifest `finchain-pouw.deployment/2`, record `finchain-pouw.deployment-record/2`, run `finchain-pouw.ledger-v2.run/2`, permit check `finchain-pouw.ledger-v2.permit-check/2`, endpoint reading `finchain-pouw.chain-reading/1`, probe `finchain-pouw.cell-probe/2`, audit and check as in `ledger-v2.md` 13 |

## 3. The roles

| Role | Address or key | Where | Does | Never does |
| --- | --- | --- | --- | --- |
| Operator 1 | the owner, who holds both cells | - | is the operator of record of both cells: they are declared under operator 1 and are related parties of each other | appear as two operators |
| OG | Cell Account `0x9F7647013499C44B7E0432F5E9e22E4Afd447aD1`, owner wallet `0x5Fee42D697975f6154164b29371c1c447F56fb4E` | its signer key stays on E06, the host of the OG's node. Listed there on 2026-11-28 as `~/foga-og/wallet/signer.key`, readable by its owner alone, beside `wallet.json`, which names the owner wallet; the path is read from the node's own configuration, and the key's address compared with the account's owner, before it signs (step 3) | is the worker of record of its audit jobs and the demander of record of tender 5; its owner key signs one permit | send a transaction for this round |
| cell-b | Cell Account `0x2Dd0c30383EcD6414e0b9DD6F10bf27BFe8715BB`, owner wallet `0x7dCE041276791F2371EA2e77F99119f22D32cd81` | its signer key stays on E05, the agreed exception; its path is found and its address compared the same way (step 3) | is the worker of record of its audit jobs and of tender 5, submission 1; its owner key signs one permit | send a transaction for this round |
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

| Who pays | What, in gas | Budget for the funds check |
| --- | --- | --- |
| The steward | the deployment: 10,624,795 measured, about 11,250,000 in the plan's estimate; the two close records, about 70,700 each | 11,450,000 gas in 19 transactions, and the 0.004 ETH it sends to the delegates |
| delegate-og | measured with stand-ins (row L62): opening an epoch 65,386-90,433 when it is the first to send in it; each audit job 623,132-632,596; the confirmation of tender 5 567,127 | 4,113,185 gas in 5 transactions: two openings, and each of its three entries with 700,000 added |
| delegate-cell-b | measured the same way: each audit job 537,608-564,196, and an opening when it is first | 2,709,258 gas in 4 transactions: two openings, and each of its two entries with 700,000 added |

The stand-ins are not the cells: a real Cell Account's signature rule and the guard's reading of it
cost what they cost. The ledger bounds both - it gives the account's signature check at most
200,000 gas (`SIGNATURE_GAS`) and the guard at most 500,000 (`GUARD_GAS`) - so each entry under a
permit is budgeted at its measured gas with both bounds added in full. The measured gas is not
offered as a bound of the cells' own.

**The funds check.** A transaction is taken only if its sender holds its gas limit times its fee
cap, its data fee and what it sends. `scripts/chain-reading.js` reads, at the endpoint's latest
block, the fee cap a transaction sent now would carry (`maxFeePerGas`, else `gasPrice`), the
GasPriceOracle's upper bound of the data fee of a transaction of 2,000 bytes - more than any entry
of this round, each under 1,000 bytes - and says COVERED, NOT COVERED, or NOT ESTABLISHED when the
data fee cannot be read, with a margin of 50 % on the fees:

```
node scripts/chain-reading.js --rpc https://rpc.finchain.one --chain-id 85422 --address <delegate-og> --gas 4113185 --txs 5 [--funds 0.002] --out <new file>
node scripts/chain-reading.js --rpc https://rpc.finchain.one --chain-id 85422 --address <delegate-cell-b> --gas 2709258 --txs 4 [--funds 0.002] --out <new file>
node scripts/chain-reading.js --rpc https://rpc.finchain.one --chain-id 85422 --address <steward> --gas 11450000 --txs 19 --value 0.004 --out <new file>
```

`--funds 0.002` counts the funds the configuration gives a delegate that is not funded yet; without
it the address's balance is read. For orientation only: without the data fee, 0.002 ETH covers
delegate-og's budget with the margin up to a fee cap of about 0.32 gwei, and delegate-cell-b's up to
about 0.49 gwei. Stop condition: anything but COVERED. Before the deployment, a delegate not covered
has its `fundEth` raised in the configuration, and the plan is read and reviewed again before
`--yes`; once deployed, a delegate is topped up from the chain deployer's host (in `finchain`: `make
l2-send CHAIN=sepolia TO=<the delegate> AMOUNT=<eth> ROLE=deployer L2_RPC=https://rpc.finchain.one`)
and read again. The plan prints the fee cap it reads (`fees`) and refuses a steward that cannot pay
the funding and the deployment's gas at it; the data fee is the funds check's.

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
node scripts/chain-reading.js --rpc https://rpc.finchain.one --chain-id 85422 --out $O/chain-reading-preflight.json
sha256sum $O/identity-check.json $O/cell-probe.json $O/chain-reading-preflight.json
```

| Check | Expected | Stop when |
| --- | --- | --- |
| The commit | the reviewed commit | it is another |
| The identity check | both accounts are contracts whose owner is the cell's wallet; tender 5 is owned by the OG's account, submission 1 was delivered by cell-b's account and accepted | anything else |
| The corrected probe | at the finalized block, its hash asked for again at the end: each cell's AID registry readable, the guard allowing both delegated operations and succeeding with the 500,000 it is given, the foreign signature refused within its 200,000, each call's answer in the form the ledger reads | any call failing or any answer otherwise; the block replaced |
| The endpoint reading | chain 85422; the finalized block and how many seconds it is behind the latest - the finality lag, from which the genesis is chosen (step 2); the fee cap and the data fee | the endpoint gives no finalized block |

The probe measures the refusal of a signature that is not the owner's. It does not stand for the
path of a valid permit, which is checked in step 4, after the permits are signed. The identity check
reads each value at the latest block; it is a check of who is who, not a reading of one fixed block,
and the probe's, the permit check's and the audits' guarantees of one block are not claimed for it.

## 6. The run

The configuration is rehearsed through the libraries by row L62 - with stand-ins for the cells, the
tender and the seed source, and the development network's clock moved by hand - and the commands,
one by one, by `npm run local-run`. Neither waits for a public endpoint's finality, and neither
carries a signed permit from one host to another: both happen for the first time in this round.

Three rules hold for every step.

- **A wait is a wait for a block.** The settled block is the endpoint's finalized block; a step that
  depends on a transaction or on a moment starts once the finalized block holds that transaction
  or has reached that moment. `scripts/chain-reading.js` prints the finalized block's number and
  time; `pouw status` prints the epoch and when it ends. A command that reads at the finalized block
  exits 3 while what it needs is not settled there: that is a wait, and the command is run again
  later.
- **The epoch is named and checked.** `pouw work` and `pouw bridge` take `--epoch <n>` and send
  nothing unless the chain is in epoch n. A stage starts only when `pouw status` shows its epoch
  with at least 30 minutes left; nearer the end it is not started, and is planned again. Each run
  record's `epoch` - the receipt's own - is checked to be the epoch meant.
- **Every run writes a new file.** A retry gets a new name (`-r2`, `-r3`). Three outcomes are told
  apart by their messages: a run refused before anything is sent removes the empty file it had
  reserved; an output that exists is refused; a job recorded already, run again, finds its receipt
  and sends nothing.

**Step 1. Keys and the steward's gas.** `node scripts/keys.js $K steward delegate-og
delegate-cell-b` prints three addresses and no key. Send 0.02 ETH on Finchain Sepolia to the
steward from the chain deployer's host, naming the network so that nothing is taken from another
configuration on a host that also runs mainnet (in `finchain`: `make l2-send CHAIN=sepolia TO=<the
steward's address> AMOUNT=0.02 ROLE=deployer L2_RPC=https://rpc.finchain.one`). Then the funds
check of section 4 for the steward, and for the two delegates with `--funds 0.002`.

**Step 2. The genesis, chosen once; the plan; the deployment; its verification.** The genesis G is
one moment, written as an ISO-8601 time in UTC, and the plan and the deployment are given the same
G; it is never `+15m` read anew. G is chosen after the owner has fixed when the two permits will be
signed, and leaves, after the planned moment of the deployment: the deployment itself; the finality
lag of the preflight's reading, for the deployment to be finalized and verified; the review of the
two unsigned permits; the signature on each host and the return of the records through the
repository, as the owner has scheduled them; and a margin of one finality lag. Then epoch 0 is
[G, G + 2 h), epoch 1 [G + 2 h, G + 4 h) and epoch 2 [G + 4 h, G + 6 h).

```
node scripts/deploy-v2.js --config $C --keys $K --genesis <G>
```

Without `--yes` nothing is sent. Expected: 17 transactions; the genesis G and the ends of epochs 0
and 1 as chosen; the tenders' log from block 61392 with how that block was held to the chain; the
replaced deployment `finchain-sepolia-r2` named and not read; both cells with "the cell guard would
allow it now"; the fee cap read; the steward's balance above the estimate. Then the same command,
the same G, with `--yes`. The deployment refuses a genesis less than ten minutes ahead of the latest
block: if G has come that near, nothing is sent, and a later G is chosen and planned again.
Expected: `DEPLOYED` with the read-back as configured, and a journal beside the manifest whose last
`confirmed` line - the funding of delegate-cell-b - names its block.

The verification waits for that block to be finalized: before it, the finalized block holds no
ledger, and `pouw verify` says "no contract at the ledger's address" - a wait, not a failed
deployment. Once `scripts/chain-reading.js` shows a finalized block at or above it:

```
node client/pouw.js verify --manifest $O/manifest.json --out $O/verify.json
```

Expected: `MATCH` at the finalized block. Stop on anything else, and follow section 9; never deploy
again over a deployment that stopped.

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
two working epochs and one in reserve; after epoch 2 the permit is void.

Then each is signed once on its own host - the OG's on E06, cell-b's on E05 - in that host's
checkout of this repository at the reviewed commit, in three steps.

First, the key file is located from the cell node's own configuration. Of the fields whose names
mention a wallet, a key, a signer, an owner or a path, this prints the value only where it is an
address or a file path, and `<not shown>` for anything else - a key, a keystore, a URL:

```
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const show=(v)=>typeof v==="string"&&(/^0x[0-9a-fA-F]{40}$/.test(v)||(/^[~/.]/.test(v)&&!v.includes(":")&&v.length<200))?v:"<not shown>";const w=(o,p)=>{for(const[k,v]of Object.entries(o)){const q=p?p+"."+k:k;if(v&&typeof v==="object")w(v,q);else if(/wallet|key|signer|path|dir|owner/i.test(q))console.log(q,"=",show(v))}};w(j,"")' <the cell's configuration file>
```

On E06 the configuration of the OG's Finchain cell is `~/foga-og-finchain/cell.config.json`; that
of the OG on Sepolia, `~/foga-og/og.config.json`, names the same owner wallet. The cell's directory
is not taken for its wallet's: the path used is the one the configuration names, and it is written
into the step's record. Second, the key's address, and nothing else: `node scripts/sign-permit.js
address --key-file <that file>`. Expected: the cell's owner wallet, and the owner the identity check
reads for the account, run again on E05 the same day. Stop on any difference: nothing is signed.
Third, the signature: the command of the unsigned record with `--key-file <that file>` and `--out <a
new file>`. It prints `signer`, which is the address of the second step.

The script reads the key file where it is, opens no network connection and sends nothing; it takes
no nonce of a running node's. A record leaves a host by `cat`; it reaches E05 through a repository
pull.

**Step 4. The permits, checked read-only.** Once the finalized block's time has reached G - not the
clock, and not the latest block - and before any work:

```
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-og.json> --operation submit-g0 --out $O/permit-check-og-submit.json
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-og.json> --operation confirm-tender --out $O/permit-check-og-confirm.json
node client/pouw.js check-permit --manifest $O/manifest.json --permit <permit-cell-b.json> --operation submit-g0 --out $O/permit-check-cell-b-submit.json
```

Expected: `ACCEPTED` at the finalized block, epoch 0, the account with code, the signature key the
cell's wallet, the guard allowing it, the hash asked for again after every read. No key is read.
Exit 3 says the block is before the genesis and records nothing: a wait. Exit 4 says the endpoint
could not serve a read at that block: the check is made again at a later finalized block, never at
`latest` in its place; it is not a refusal. Exit 2 is the ledger's refusal: no work is sent under
that permit. An acceptance is of its block: it reserves no later moment, and the work of epoch 0
is still sent inside epoch 0.

**Step 5. Epoch 0, the controlled self-test.** When `pouw status` shows epoch 0 with at least 30
minutes left, and the funds check of each delegate, read now, says COVERED:

```
node client/pouw.js work --epoch 0 --manifest $O/manifest.json --permit <permit-og.json> --key-file $K/delegate-og.key --out $O/run-work-og-0.json
node client/pouw.js work --epoch 0 --manifest $O/manifest.json --permit <permit-cell-b.json> --key-file $K/delegate-cell-b.key --out $O/run-work-cell-b-0.json
node client/pouw.js bridge 5 1 --epoch 0 --manifest $O/manifest.json --permit <permit-og.json> --key-file $K/delegate-og.key --out $O/run-bridge-og-0.json
node client/pouw.js work --epoch 0 --manifest $O/manifest.json --permit <permit-og.json> --key-file $K/delegate-og.key --out $O/run-work-og-0-repeat.json
```

Each of the first three records has `epoch` 0. The fourth is B5 of the acceptance table: the
OG's job again, in the same epoch, to a new file. Expected: `alreadyRecorded` true, the
`receiptId` and the `contributionId` of `run-work-og-0.json`, and an empty `transactions`. An
output refused because it exists is not B5's evidence.

**Step 6. Epoch 1, standard.** When `pouw status` shows epoch 1 with at least 30 minutes left, the
finalized block's time has reached the end of epoch 0 (G + 2 h), and the funds check says COVERED:
the two `work` commands of step 5 with `--epoch 1` and `-1` in the names of their records. Each
first recomputes epoch 0 at the finalized block and sends nothing unless the recomputation agrees
with the ledger and is complete. Before the finalized block has reached the end of epoch 0 it exits
3: a wait. Exit 2 or 5: stop. Expected: `epoch` 1, the audit of epoch 0 with its 3 receipts.

**Epoch 2, the reserve.** Epoch 2 is the permits' last epoch, a window for work that could not be
done; it does not stand in for epoch 0 or 1. Work done in it is recorded as epoch 2's, its records
carry `-2`, and the figures of section 7 are read for the epochs the receipts are in. What was done
in epochs 0 and 1 stays as it is; nothing is relabelled.

**Step 7. After epoch 1.** Once epoch 1 has ended: `node client/pouw.js seal 0 --manifest
$O/manifest.json --key-file $K/steward.key` and the same for epoch 1; each prints its transaction
and block. Once the finalized block is at or above the later of the two blocks:

```
node client/pouw.js audit 0 --require-sealed --manifest $O/manifest.json --out $O/audit-epoch-0.json
node client/pouw.js audit 1 --require-sealed --manifest $O/manifest.json --out $O/audit-epoch-1.json
```

With `--require-sealed` an epoch with no close record at the block read is a difference; read at a
finalized block that holds both close records, each audit names it in `sealed`.

**Step 8. The records.** The manifest, the deployment record, the journal, the permits signed and
unsigned, the permit checks, the run records with the repeat of step 5, the endpoint readings, the
probe, the verification and the audits leave E05 by `cat` and are committed under `evidence/r2b/`,
each with its SHA-256 computed on the host; the manifest is also committed as
`deployments/finchain-sepolia-r2b.json`.

**Step 9. The hosted runner.** With the manifest in the repository, the workflow `ci` run by hand
with that manifest, the epochs `0 1` and `require_sealed` set: it verifies the deployment and audits
both epochs from the public endpoint with no key, each with its close record. Its records go under
`evidence/r2b/hosted-ci/`.

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
| B4 | The route | sender and origin the cell's delegate; authorization the digest of the cell's permit; the guard binding in force the manifest's; the permit checks of step 4 `ACCEPTED` at a finalized block before the first entry; each run record's epoch the one its `--epoch` named |
| B5 | No double entry | `run-work-og-0-repeat.json`: the OG's job run again in epoch 0, to a new file, `alreadyRecorded`, the same receipt and contribution id as the first run, no transaction |
| B6 | The figures | section 7, in the ledger and in the audits |
| B7 | The audits | `pouw audit --require-sealed` of epochs 0 and 1 at a finalized block that holds both close records exit 0 - agrees, complete and sealed. Exit 5 is a re-decision that is not complete and is not a pass; exit 3 or 4 is run again at a block that is settled and served, never at `latest` in its place |
| B8 | The independent recomputation | the hosted runner's verification and audits, with `require_sealed`, with the same table hashes and each epoch sealed |

## 9. When something goes wrong

- **A refusal before a transaction is taken.** Nothing was sent. The cause is read from the
  message; the step is taken again once it is removed, to a new output file.
- **Exit 3, or "no contract at the ledger's address" before the deployment is finalized.** The
  finalized block has not reached what the step needs. Nothing is wrong; the step is taken again
  once it has.
- **Exit 4.** The endpoint could not serve state at the block taken. Nothing is read at another
  block in its place; the step is taken again at a later finalized block.
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
- **An epoch passes without its work, or a receipt falls in another epoch than the one meant.** The
  epoch is recorded as it is, and nothing is relabelled; the permits allow one reserve epoch, epoch
  2, under the rule of step 6.
- **A funds check not covered.** Nothing is sent; the delegate is funded as section 4 says, and the
  check is read again.

## 10. What the round changes nothing of

Round R2a, its ledger and its evidence; any FOGA node or chain node, which is not stopped,
restarted or reconfigured; the keys of the cells, which sign one permit each where they are and
send nothing; the contracts, the frozen interfaces and the builds.
