# Round R2a on Finchain Sepolia: runbook

The operator-wallet integration of round R2 (`roadmap.md` 3; `decisions.md` A34, A37, A39): the
kernel of round R1, deployed on Finchain Sepolia from the committed builds and worked for two
epochs by two wallets that one operator holds. Epoch 0 is a controlled self-test, epoch 1 a
standard epoch. Afterwards a machine that holds no key recomputes both.

Every command below is rehearsed by `npm run local-run`, which runs the same scripts with the same
configuration against a development network, including a settled block that lags.

What this round is not. No FOGA cell takes part: a cell's identity is its Cell Account, and this
round uses plain keys. It is not evidence of demand or of computation: both wallets are one
party's, the tenders are test tenders that carry no task, and the audit job measures presence.
Every record it produces says so in its labels.

## Rules that are not negotiable

- The wallets are keys made for this round by `scripts/keys.js`. Never point a script here at the
  wallet of a FOGA cell or at any key that a running node sends from: two programs sending from
  one key collide on nonces, and a cell's key is its owner key.
- No FOGA node, and no chain node, is stopped, restarted or reconfigured for this round.
- Keys stay in their directory, outside the repository's checkout, on the host that made them.
  No key is typed on a command line, copied to another machine, or pasted anywhere.
- Records are copied off the host as text. `out/` holds no key.
- Run only one round process with a given set of wallets at a time. If a background wrapper is
  used, confirm that it has exited before starting a manual round. A `flock` wrapper excludes
  only other processes using the same lock; it does not lock a direct invocation of `round.js`.
  A process listing shows a process, not that the round completed: use the round's records and
  audits to establish its result.

## What is needed

- One host with Node.js 20 or later, git, and outbound HTTPS to GitHub, the npm registry and the
  chain's public RPC. It runs no part of the protocol but the client; if it is also a chain node's
  machine, the wallets' keys are apart from the node's (matrix row T4).
- 0.02 ETH on Finchain Sepolia for the steward, sent once from the chain's deployer.
- About five hours of clock time, with something to do at four moments.

```
git clone https://github.com/garyyang-finchip/finchain-pouw.git
cd finchain-pouw
npm ci --omit=dev
```

`npm ci --omit=dev` installs the client and the scripts' one dependency (`ethers`); no compiler is
needed, because a deployment is made from `build/`.

The examples keep the keys in `~/pouw-keys/finchain-sepolia-r2` and write records to
`out/finchain-sepolia-r2/`. `C` stands for `deployments/finchain-sepolia-r2.config.json` and `K`
for the keys directory:

```
C=deployments/finchain-sepolia-r2.config.json
K=~/pouw-keys/finchain-sepolia-r2
```

## Step 1. The identity check (read-only, no key)

```
node scripts/identity-check.js --config deployments/finchain-sepolia.identities.json --out out/finchain-sepolia-r2/identity-check.json
```

It reads the two cells' accounts and keys and tender 5 from the chain. Expected: both accounts are
contracts whose owner and operator is the cell's key; tender 5 is owned by the account of the OG,
submission 1 was delivered by the account of cell-b, the judge is the World's hashlock verifier;
and the conclusion that taking part with keys alone is an operator-wallet integration. This is the
record for A39, step 2. If it reads otherwise, stop: the plan of this round rests on it.

## Step 2. Keys, and gas for the steward

```
node scripts/keys.js $K steward wallet-a wallet-b
```

It prints three addresses and no key. Send 0.02 ETH on Finchain Sepolia to the steward's address,
from the host that holds the chain's deployer key (in `finchain`: `make l2-send TO=<the steward's
address> AMOUNT=0.02 ROLE=deployer`). The steward funds the two wallets itself, with 0.005 each,
as part of the deployment.

## Step 3. Plan, deploy, verify

```
node scripts/deploy.js --config $C --keys $K --genesis +15m
```

Without `--yes` this checks everything it can and prints the plan: the steward and its balance,
the genesis time, the two parameter versions (`controlled-self-test` from epoch 0, `standard` from
epoch 1), the profiles, the two wallets with their admission and operator, and the number of
transactions (14). Nothing is sent. Read it, then:

```
node scripts/deploy.js --config $C --keys $K --genesis +15m --yes
node client/pouw.js verify --manifest out/finchain-sepolia-r2/manifest.json
```

The deployment takes about a minute and must end with `DEPLOYED:` and "read back: everything is as
configured"; `pouw verify` must print `MATCH`. The genesis time is fifteen minutes after the
moment of the command: epoch 0 runs for two hours from then, epoch 1 for the two hours after it.
The script prints both times in UTC.

The manifest is `out/finchain-sepolia-r2/manifest.json`. It is what every later command reads,
and what goes into the repository as `deployments/finchain-sepolia-r2.json` (step 7).

## Step 4. Epoch 0: the controlled self-test

Shortly after the genesis time, and in any case within the two hours of epoch 0:

```
node scripts/round.js --config $C --keys $K
```

It stages a test tender from wallet-a to wallet-b and one back - minted, funded, delivered and
accepted on the World's ERC-8414 contract - has each owner confirm its tender to the ledger, and
does both wallets' audit job. Expected: two receipts `eligible`, `declared-related`, GMU 50/50; two
receipts `accepted`, GMU 10/10; each wallet at 250 provisional test points. Run a second time, it
finds all four receipts and sends nothing.

Epoch 0 is the only epoch with the controlled self-test parameters. If it is missed, this
deployment cannot show that mode: move `out/finchain-sepolia-r2` aside and deploy again. Keep the
unused deployment's manifest and records under its own ledger address and genesis time, with
the reason it was not used for this round. Do not combine its receipts or audits with those of
the replacement deployment merely because the epoch numbers match.

## Step 5. Epoch 1: the standard epoch

Start well before the end of epoch 1:

```
node scripts/round.js --config $C --keys $K --wait
```

It writes the close record of epoch 0, stages and confirms the two tenders, and then waits: the
audit job of epoch 1 recomputes epoch 0, which it does only once the chain's `finalized` block
has passed the end of epoch 0 - on Finchain Sepolia some twenty minutes into epoch 1. While it
waits it prints how far the finalized block still has to go. Then both wallets audit epoch 0 in
full and submit. Expected: two receipts `declared-related-not-subsidized`, GMU 0/50; two audit
jobs that "audited epoch 0 (4 receipts)", GMU 10/10; each wallet at 25 provisional test points.

If the terminal session ends while it waits, first confirm that the previous round process is
no longer running, then run the command again: what is done is found on chain. Without `--wait`
the command stops with exit status 3 instead of waiting, and is run again later.

If epoch 1 is missed altogether, every later epoch is standard too, and the standard round is
worked in the epoch that is then current, epoch k:

- `--epochs n` is an upper bound: the round works in epochs 0 to n - 1, and the default is 2. In
  epoch k the command is run with `--epochs k+1`, for example `--epochs 4` in epoch 3. Without it
  the command only writes close records and reports the round as over. Substitute the calculated
  integer for `k+1`; it is notation, not a literal argument;
- the audit job of epoch k recomputes epoch k - 1. If all intervening epochs were skipped, that
  epoch is empty; the record states its actual receipt count. This is not a recomputation of
  epoch 0's four receipts, which the audits of steps 6 and 7 make;
- the budget of an epoch is counted from the first epoch of its parameter version. In this
  configuration the standard version begins in epoch 1 and halves every 8 epochs: epochs 1 to 8
  have 1000 test points, epochs 9 to 16 have 500, epochs 17 to 24 have 250, and the same schedule
  continues. Use the budget actually in force to calculate the expected figures; reaching a
  halving is no reason to deploy again;
- steps 6 and 7 then speak of epoch k wherever they say epoch 1.

If a confirmation lands in another epoch, keep the receipt under the epoch the ledger records.
The host's audits, the hosted audit and the evidence must include every epoch containing a
receipt of this round, as well as epoch 0. Do not apply the four-receipt expectation to an epoch
that received only part of the round; report the actual distribution. A split or partial round
is not a passing complete standard epoch: do not combine counts across epochs to claim that
the four-receipt acceptance was met.

## Step 6. After epoch 1: the close record and the host's own audit

After epoch 1 has ended:

```
node scripts/round.js --config $C --keys $K
```

It writes the close record of epoch 1 and reports that the round's epochs are closed. A close
record is a transaction: this command is not read-only. Where the standard round was worked in
epoch k, use the same calculated `--epochs k+1` and audit epochs 0 and k.

If a round receipt landed in a later epoch, the closing upper bound must include that epoch too.
Run the closing command only after the last epoch to be covered has ended: `--epochs` is not a
close-only option, and an invocation while the current epoch is inside that bound can start work.

The commands below are the unchanged normal path for epochs 0 and 1. In a fallback, replace epoch
1 and its output filename with the actual standard epoch and include any additional epoch
containing a receipt of the round. Run each audit once the finalized block has reached that
epoch's end; an elapsed-time estimate is not the finality condition. The audit command does not
wait automatically: if run too early, it exits with status 3 and must be run again later.

```
node client/pouw.js audit 0 --manifest out/finchain-sepolia-r2/manifest.json --out out/finchain-sepolia-r2/audit-epoch-0.json
node client/pouw.js audit 1 --manifest out/finchain-sepolia-r2/manifest.json --out out/finchain-sepolia-r2/audit-epoch-1.json
```

Every audit must say `MATCH`. For a complete round the figures to expect are the table in
`roadmap.md`, section 4, adjusted for the budget in force. A partial epoch can also audit as
`MATCH`: that verifies its actual records, not that the complete-round acceptance was met.

An audit of this release recomputes an epoch from the events up to the finalized block, and
reads the ledger's own summary of that epoch, the `sealed` flag included, at the latest block.
Made before the block of a close record is in the finalized chain, it reports the epoch as
sealed all the same. Such a report shows the figures: an epoch that has ended takes no further
receipt, and a close record changes no figure. It does not show that the close record is final
(A72).

## Step 7. The independent audit

The host's audit is the operator checking itself. The audit that counts is made by a machine that
is not the operator's (A39, step 4):

1. the manifest goes into the repository as `deployments/finchain-sepolia-r2.json`;
2. the job is started once the finalized block has reached the block of the last close record,
   which the round record of step 6 names. An audit prints the finalized block it read up to
   as `settled block` and records it as `settledBlock`: the condition is met when the hosted
   audits' `settledBlock` is not before the block of the close record. An estimate of elapsed
   time is not the condition. A run that was started too early is kept, and the job is run
   again;
3. on GitHub: Actions, the `ci` workflow, "Run workflow", with the manifest
   `deployments/finchain-sepolia-r2.json` and the actual epochs to audit: normally `0 1`, or
   `0 k` for a later standard round, with any further receipt-bearing epoch included. Substitute
   the actual epoch numbers for these placeholders. The host's audits, this input and the
   evidence name the same epochs. Auditing epoch 0 and an empty epoch 1 can produce two `MATCH`
   results while leaving the actual standard round unexamined;
4. the job installs the client only, runs `pouw verify` and `pouw audit` for the selected epochs
   against the manifest's public endpoint, and keeps `run.json` (the commit and the run),
   `verify.json` and one `audit-epoch-<number>.json` per selected epoch as the artifact `audit`;
5. the close evidence is read from the chain: for each close record the receipt of its
   transaction, the `EpochSealed` event of the deployment's ledger and the hash of its block,
   set against the block the hosted audits read up to, with that block's hash and time. Release
   0.1.3 has no command for it: round R2a used the read-only command kept in
   `evidence/r2a/close-evidence.command.txt`.

For the same deployment and epoch, the host's and the runner's audits agree when they hold the
same `tableHash`. A `tableHash` covers the workers' addresses and their allocations only, so the
reports are compared in full as well. The run passes when both of its jobs succeeded and its
records say `ok`: a job that failed uploads its artifact too. Anyone can repeat the job from a
fork of the repository.

## Step 8. The records

Everything the host produced is in `out/finchain-sepolia-r2/`: the identity check, the manifest,
the deployment record, one record per run of the round, the audits of the actual epochs. To
copy them off the host as one piece of text:

```
tar -C out -czf - finchain-sepolia-r2 | base64 -w 76
```

This archive covers the active deployment only. Keep any earlier deployment's moved-aside
directory separately, with its manifest, records and disposition; identify each deployment by
chain id, ledger address and genesis time in the evidence index.

What is submitted as the evidence of round R2a, each record labelled `public-testnet`,
`controlled-self-test` and `operator-wallet-integration`:

| Record | Made by | Shows |
| --- | --- | --- |
| identity check | step 1 | the accounts and keys of the two cells, and whose tender 5 is |
| deployment record, manifest | step 3 | what was deployed, from which builds, with which code hashes, in which transactions; the read-back |
| round records | steps 4 to 6 | every transaction of the round, with its actual epoch |
| audits of the actual epochs, and the deployment check, from the hosted runner | step 7 | that a machine with no key and no node finds the deployed code and its wiring to be this repository's - a check read at the latest block - and recomputes from the finalized chain every receipt, total and allocation as the ledger says |
| close evidence | step 7 | that each close record is in the finalized chain: the receipt of its transaction, the ledger's `EpochSealed` event, the hash of its block, and the block the hosted audits read up to |

It claims neither computation nor independent demand, and no agent took part in it.

## The clock

For a genesis time G:

| When | What |
| --- | --- |
| before G - 10 min | steps 1 to 3; the deployment refuses a genesis less than ten minutes ahead |
| G to G + 2 h | step 4, once |
| G + 2 h to G + 4 h | step 5, once; start well before the epoch ends. `--wait` waits for epoch 0 to be finalized; about G + 2 h 25 min is an estimate, not a guarantee |
| after G + 4 h | step 6, the close record |
| after about G + 4 h 25 min | step 6, the audits |
| once the finalized block has reached the block of the last close record | step 7. The condition is read from the audit records, not from the clock |

## When something goes wrong

| What happens | What it means | What to do |
| --- | --- | --- |
| `deployment refused: ...` | the plan cannot run as written; nothing was sent | read the reason; most often the genesis is too close or the steward has no gas |
| the deployment stops with an error after some transactions | a partial deployment; the list is in `deployment-failed-<time>.json` | deploy again; nothing depends on the partial one |
| `DEPLOYED, BUT THE READ-BACK DIFFERS`, or `pouw verify` prints `DIFFERS` | what is on chain is not what was configured, or not this repository's code | stop; do not run the round; keep the record |
| the round ends with exit status 3 | something waits for the finalized block | run it again later, or with `--wait` |
| an endpoint error, a timeout, a dropped connection | the command stopped part of the way | run it again: every step looks at the chain first and nothing is done twice (rows R1, R3) |
| a delivery is refused with `completions exhausted` | somebody else delivered to the test tender first and holds its one place; the round never accepts a delivery that is not its own worker's | delete `out/finchain-sepolia-r2/round-state.json` and run the round again: it stages a new tender |
| `only N s of the epoch are left: no new work is started in it` | less than five minutes remain, so no new work starts. Five minutes is a start threshold, not a guarantee of completion; closing earlier epochs, tender transactions and finality waits take time | wait for the next epoch; start an epoch's work well before its end |
| the confirmation of a tender "landed in epoch N + 1" | the epoch turned between the settlement and the confirmation; the receipt counts in the epoch it was recorded in (row R9) | keep the actual epoch in the record; include it in the host's and hosted audits and report the actual receipt distribution (steps 6 and 7) |
| a log query is refused for the size of its range | the endpoint serves fewer blocks per query than the manifest's `logChunk` says | set `POUW_LOG_CHUNK` to a smaller number, for example `POUW_LOG_CHUNK=10000`, and run the command again |
| `... can be read by others` | a key file's mode is not 600 | `chmod 600` the file |
| an audit prints `DIFFERS` | the recomputation and the ledger disagree | a finding: keep the record, run nothing on top of it |
