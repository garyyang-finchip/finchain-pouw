# Round R2a on Finchain Sepolia: the records

The records of round R2a (`docs/roadmap.md` 3 and 4; `docs/r2-runbook.md`): the kernel of release
0.1.3 deployed on Finchain Sepolia and worked for two epochs by two wallets that one operator
holds; the host's own audits; the audits of a hosted runner; and the evidence that the two close
records are in the finalized chain. Deployment-result records are labelled
`public-testnet`, `controlled-self-test` and `operator-wallet-integration`.

This file is the index. It identifies the deployments, says what each record is and where it came
from, gives every file's SHA-256 and states what was observed. **R2a passed advisor technical
acceptance on 2026-11-24**, following review of evidence commit `b53e52f`. The accepted scope is
the active deployment, epochs 0 and 1, under public-testnet, controlled-self-test and
operator-wallet-integration. The later review outcome and its provenance are recorded in
`docs/decisions.md` 6.11; the raw records and their checksums remain unchanged.

## 1. What the round is, and what it is not

- `standard` is the mode of an epoch's parameters. The exercise as a whole is a controlled
  self-test: both wallets belong to one operator and are declared so. What epoch 1 shows is that
  the rule which keeps declared-related parties out of the G1 subsidy ran on a public chain, with
  the work recorded and measured all the same. It shows no demand from anyone else.
- The hosted runner is another machine that ran the same reference client against the same public
  endpoint. That is an independent run. It is neither an independent implementation nor another
  source of the chain's state.
- The wallets are keys made for the round. No agent's contract account and no agent's key took
  part, and FOGA was not involved. The tenders are test tenders that settle a fixed result and
  carry no task. Nothing here measures computation, and the figures are test points: values of a
  view, not issued, credited or claimable.

An agent taking part as its own account (round R2b) and the production line have acceptances of
their own (`docs/roadmap.md` 3, 7 and 8).

## 2. The deployments

Two deployments were made from the same configuration
(`deployments/finchain-sepolia-r2.config.json`), the same committed builds, the same steward and
the same two wallets. They are told apart by ledger address and genesis time, and their records
are never combined.

| | Used for the round | Left unused |
| --- | --- | --- |
| Records | `finchain-sepolia-r2/` | `finchain-sepolia-r2-unused-1/` |
| Chain | 85422, Finchain Sepolia | 85422, Finchain Sepolia |
| Ledger | `0x7180CdDA4aE494f551d196146E6fcCB717675F1a` | `0xd2B9b935e7CaDefc2bDc4D13Af2356FF456Bffb9` |
| Policy | `0x6681DC69737C434b774A89Bdcb6d5C0a6C900825` | `0xbbA769732086EC8A4b84C30d279B7F50d6945f7f` |
| Genesis time | 1795489148, 2026-11-24T02:59:08Z | 1795462480, 2026-11-23T19:34:40Z |
| Epoch length | 7200 s | 7200 s |
| Deployment record | `deployment-20261124T024437Z.json`: `ok`, 14 transactions in blocks 536789 to 536802, gas 7190533 | `deployment-20261123T192011Z.json`: `ok`, 14 transactions from block 523456, gas 7190533 |
| Steward | `0x6c3901B8865D97742166a88B953113D9418240AA` | the same |
| Parties | wallet-a `0x8808dA2Cea67590D89230E6A8Fd63f0d13fE7810` and wallet-b `0x50Bf871C120E19C129B439d7F3864d143699a1eA`, both admitted and declared under operator 1 | the same |
| Manifest in `deployments/` | `finchain-sepolia-r2.json`, byte for byte `finchain-sepolia-r2/manifest.json` | none |

Why the first deployment was left unused. Epoch 0 is the only epoch of a deployment that has the
controlled self-test parameters (`docs/r2-runbook.md`, step 4). The round's first command was not
run during the first deployment's epoch 0, so that deployment could no longer show that mode. As
the runbook says, its directory was moved aside and a second deployment was made. The audit of
its epoch 0 (`finchain-sepolia-r2-unused-1/audit-epoch-0.json`) says `ok` with no receipt: an
empty epoch recomputed, which shows nothing about the round. Nothing of that deployment is counted
in anything below.

Funds. Before each deployment the steward was sent 0.02 of the chain's test ETH by the chain's
deployer account, `0xA199250F15DCE1399288F967f8652A882B1947e9`, from another host: transactions
`0x5d9a71b76177abedf71dc103cda25566a2af1a8f984ff04277a2c0a33b5399cc` (block 523252) and
`0x6a781dd25552b5c74ec4b9f566bc3cf0f93961b8898cb9b72e43849e1e8967d8` (block 536783). They are
quoted from that host's console output and are not among the records below; anyone can read them
from the chain. Each deployment's steward then sent each wallet 0.005 for gas and bounties, as the
deployment records list.

Code. Each deployment record names the five builds that were deployed, with the SHA-256 of each:
they are the SHA-256 of the builds committed under `build/`. The identity checks, the
deployment records, the round records, the audits and the deployment checks name the client,
`finchain-pouw` 0.1.3. The host worked from a checkout of this repository at commit `d8c7a20`;
that is known from its console output, and no record holds it. The hosted runs are on commit
`fa765af`, which their `run.json` names. Between those two commits ten documents were revised
and the manifest was added: no contract, client, script, build or configuration file differs.

## 3. The round, in order

Times are UTC, on 2026-11-24. Epoch 0 ran from 02:59:08 to 04:59:08 and epoch 1 from 04:59:08 to
06:59:08.

| When | What | Record |
| --- | --- | --- |
| 02:44:08 | The identity check, repeated before this deployment: the two FOGA cells are contract accounts whose keys are their owner and operator; a transaction a key sends by itself would be recorded under the key, not the account (`accountsAreKeys: false`). Hence wallets made for the round, and the label `operator-wallet-integration` (A37) | `finchain-sepolia-r2/identity-check.json` |
| 02:44:37 | The deployment is recorded, with its read-back of the code, the wiring and the policy | `finchain-sepolia-r2/deployment-20261124T024437Z.json`, `manifest.json` |
| 03:00:38 to 03:01:03 | Epoch 0, controlled self-test, parameters v1. Tenders 6 and 7 are staged, settled and confirmed by their owners (receipts 1 and 2); both wallets do the audit job (receipts 3 and 4) | `finchain-sepolia-r2/round-20261124T030103Z.json` |
| 05:00:09 to 05:21:39 | Epoch 1, standard, parameters v2. Started at 05:00:08 by a background wrapper under `flock`. The close record of epoch 0 is written (block 540870). Tenders 8 and 9 are staged, settled and confirmed (receipts 5 and 6). The command waits until the finalized block has passed the end of epoch 0; then both wallets recompute epoch 0's four receipts and submit (receipts 7 and 8) | `finchain-sepolia-r2/round-20261124T052139Z.json`; `r2-step5.log` |
| 07:56:32 to 07:56:35 | After epoch 1: its close record is written (block 546161) | `finchain-sepolia-r2/round-20261124T075635Z.json` |
| 07:56:36, 07:56:37 | The host's audits of epochs 0 and 1 | `finchain-sepolia-r2/audit-epoch-0.json`, `audit-epoch-1.json` |
| 08:09:34 to 08:10:42 | Hosted run ci #2: the deployment check, the audits of epochs 0 and 1, the tests and the rehearsal | `hosted-ci-2/`; `../local-run-20261124T081042Z.json` |
| 08:52:00 to 08:52:05 | The ci #3 audit-record interval, not the full workflow duration: its deployment check and its audits of epochs 0 and 1 were made after the close record of epoch 1 had entered the finalized chain. The workflow succeeded in 1m 16s | `hosted-ci-3/` |
| 09:03:21 | The close records read from the chain and set against the finalized block | `r2a-close-evidence.json` |

The whole standard round is in epoch 1. No confirmation crossed an epoch boundary: the round's
records name eight receipts, ids 1 to 8; the audits find ids 1 to 4 in epoch 0 and ids 5 to 8 in
epoch 1.

## 4. The receipts

| Receipt | Epoch | Work | Worker | Eligibility | GMU measured / subsidized | Block | Transaction that recorded it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | `g1.tender`: tender 6, wallet-a to wallet-b | wallet-b | eligible | 50 / 50 | 537288 | `0xb4f9141bbdd1b7e9072f2aaccc6582676de671270d6d80b319f351362cbcf075` |
| 2 | 0 | `g1.tender`: tender 7, wallet-b to wallet-a | wallet-a | eligible | 50 / 50 | 537293 | `0xdc37fd6fa03fa0fff770474dc61d933f36300c9974c88d04e09c697b54722a01` |
| 3 | 0 | `g0.ref`: audit job | wallet-a | eligible | 10 / 10 | 537294 | `0xf6ead800dd394b85aa3f9f8224d99a1ec3935935eaa24dbd5ad3c3c167f1cc89` |
| 4 | 0 | `g0.ref`: audit job | wallet-b | eligible | 10 / 10 | 537295 | `0xace96bdb76dd3ef797d3de14a739d3f1d3abac24f619c96a4af34ebe7127a71a` |
| 5 | 1 | `g1.tender`: tender 8, wallet-a to wallet-b | wallet-b | declared-related-not-subsidized | 50 / 0 | 540875 | `0xe6e50928df2ab5b4a0ef70af64b573b68786e550ce7ee67c8a787562f74dfcf2` |
| 6 | 1 | `g1.tender`: tender 9, wallet-b to wallet-a | wallet-a | declared-related-not-subsidized | 50 / 0 | 540880 | `0x6923a1a163866ef721c081108e4f69454afb13106106f31c953486d093e96a73` |
| 7 | 1 | `g0.ref`: audit job, which recomputed epoch 0's four receipts | wallet-a | eligible | 10 / 10 | 541512 | `0x06a0aaec3ed1de39e709fe08cc0df94b08d65659e6106d616e387d8085466ba5` |
| 8 | 1 | `g0.ref`: audit job, which recomputed epoch 0's four receipts | wallet-b | eligible | 10 / 10 | 541513 | `0xb9eb8941a07fb49a5521b4fe1dde64c62cd7d8e3859210bfd19a172f8e92741f` |

All four tenders were judged by their owner, and every G1 receipt is `declared-related`. Receipts
5 and 6 are the point of epoch 1: the work is recorded and measured, and it is not subsidized.

## 5. The figures: expected and found

Expected is the table of `docs/roadmap.md` 4. Found is what the host's audit, ci #2's audit and
ci #3's audit each report; the three agree on every figure.

| Figure | Epoch 0, expected | Epoch 0, found | Epoch 1, expected | Epoch 1, found |
| --- | --- | --- | --- | --- |
| Mode | `controlled-self-test` | `controlled-self-test` | `standard` | `standard` |
| Parameter version | 1 | 1 | 2 | 2 |
| Budget; G0 pool; G1 pool | 1000; 100; 900 | 1000; 100; 900 | 1000; 100; 900 | 1000; 100; 900 |
| Receipts | 4 | 4 | 4 | 4 |
| GMU measured, G0 / G1 | 20 / 100 | 20 / 100 | 20 / 100 | 20 / 100 |
| GMU subsidized, G0 / G1 | 20 / 100 | 20 / 100 | 20 / 0 | 20 / 0 |
| Each wallet's test points | 250 | 250 | 25 | 25 |
| Unallocated | 500 | 500 | 950 | 950 |
| Per declared operator | 500 | 500 | 50 | 50 |

The 950 test points left unallocated in epoch 1 are the rule's result. Nothing is redistributed
to use a budget up.

| | Epoch 0 | Epoch 1 |
| --- | --- | --- |
| Digest | `0x5fcfdadf878dc2ff1aef22250df7c6f5ed93d047be0c3f177d39e5618313f6b7` | `0xc527c8111cc910ccbf87270bcb2e074935bf67f14bc87dc7fc7af6f458b0cc24` |
| Audit subject | `0x1067ec4e68fd44d94c1f72601aedd400481a8f6783172ad299db5b3a6f30882e` | `0x983bed67764425ea289483e53f331b0796a55ec441ad55149d2e47bc6e956ffc` |
| `tableHash` | `0x07ac555c836b60b3c7025e6dd7aee600766b0c80274b8e6c23eea5e5421d5340` | `0xc1a3ebed57aa9bf133d6f0850fdf7d97ea7aa46ecbcf77db9748d6fe37c2f88d` |

`tableHash` commits to the workers' addresses, in order, and to each one's allocation - and to
nothing else: not to the receipts, the GMU, the eligibility or the close. Equal hashes are a
necessary check and not the whole comparison. The reports were therefore compared field by field:
for each epoch the host's report, ci #2's and ci #3's are identical in every field except
`recordedAt` and `settledBlock`.

## 6. What each audit read, and at which block

| Audit | Recorded | Finalized block read up to | That block's time | Includes the close record of epoch 1, block 546161 | Result |
| --- | --- | --- | --- | --- | --- |
| The host's, epochs 0 and 1 | 07:56:36, 07:56:37 | 545532 | 07:35:36 | no | `ok`, no finding |
| ci #2, epochs 0 and 1 | 08:09:40, 08:09:43 | 545910 | 07:48:12 | no | `ok`, no finding |
| ci #3, epochs 0 and 1 | 08:52:03, 08:52:05 | 547050 | 08:26:12 | yes | `ok`, no finding |

What an audit of release 0.1.3 reads at the finalized block, and what it does not. It refuses to
run until the finalized block has passed the end of the epoch, and it replays the receipts and
the events from the logs up to that block. The ledger's own figures that it compares the replay
with - the epoch's summary, the audit subject, each allocation - and the `sealed` flag it reports
are view calls without a block tag: they are answered at the latest block
(`client/lib/genesis.js`, `auditEpoch`).

For the figures that makes no difference. Once an epoch has ended nothing can be added to it or
changed in it: receipts are recorded in the current epoch only, a change of parameters applies
from a later epoch, and a close record takes no figure and changes none
(`docs/genesis-mining-mvp.md` 7.3 and 9). Every audit here was made after the end of the epoch
it audits was in the finalized chain, so its figures are those of finalized history.

For the `sealed` flag it does make a difference. In the host's audit and in ci #2's, the value
`true` for epoch 1 was answered from a block later than the audit's finalized block: the close
record of epoch 1 is in block 546161, and those audits read up to blocks 545532 and 545910. By
themselves those two reports do not show that the close record of epoch 1 is in the finalized
chain. They are kept as they were made.

What does show it:

1. ci #3's audits read up to finalized block 547050, which is after block 546161;
2. `r2a-close-evidence.json`, read from the chain at 09:03:21 when the finalized block was 547405,
   records block 547050 with its hash and time; the receipt of each close transaction - status
   1, sent by wallet-a to the ledger; the `EpochSealed` event the ledger emitted in it, whose
   digest, receipt count, parameter version, budget and four totals equal the audits'; and that
   each receipt's block hash is the hash of that block on the chain;
3. its seventeen checks all say `ok`, among them that blocks 540870 and 546161 are not after
   block 547050, and that block 547050 is not after the finalized block.

| Close record | Transaction | Block | Block time | Block hash |
| --- | --- | --- | --- | --- |
| Epoch 0 | `0xca1be2382ebb89ce403934d0945788937f6422224803698cc6fc0960357eec2f` | 540870 | 05:00:12 | `0x78054eab55ff69b53a05715417794ae885970797656032a373fffdce09d5606d` |
| Epoch 1 | `0x11f2a7e2afb6416d5fd9093153a46c5243c46a6a45be73f52d3993acc3712257` | 546161 | 07:56:34 | `0x512f4c2ed2abf9aa682ccec9c9f9ebae95233f710dee7114a52ba60fad7b1fc8` |

The close evidence was made by a one-off read-only command on the host of the round, not by a
command of release 0.1.3 and not by the hosted runner. The command is kept as it was run in
`close-evidence.command.txt`. It reads the public endpoint and holds no key, and anyone can
repeat it or read the same transactions and blocks from the chain.

The deployment check has the same limit. `pouw verify` reads the code and the wiring at the
latest block; the `settledTag` in its record is the client's setting and does not mean that every
check was made at one finalized block. What the hosted runs establish is therefore this: a hosted
environment checked the deployed code and the wiring against this repository's builds, and
recomputed the finalized history of both epochs independently of the host.

## 7. The hosted runs

Both are runs of `.github/workflows/ci.yml`, started by hand by the repository's owner on commit
`fa765af13f16f2f2b024a2576f665c9b8785ba7e` of `main`, with the manifest
`deployments/finchain-sepolia-r2.json` and the epochs `0 1`.

| | ci #2 | ci #3 |
| --- | --- | --- |
| Run | `https://github.com/garyyang-finchip/finchain-pouw/actions/runs/45353665914` | `https://github.com/garyyang-finchip/finchain-pouw/actions/runs/45359832829` |
| Started, from `run.json` | 08:09:34 | 08:52:00 |
| Status on the run page | Success, 1m 27s; jobs `test` 1m 21s and `audit` 20s | Success, 1m 16s |
| Artifact `audit`, on the run page | 6.37 KB, `sha256:53e826b0d0ca3fbab8f4a4b669849799b4ee6dcf4c115a0924a13e6b6412a3e4` | 6.37 KB, `sha256:79ba49dc058cfb31b4f319d19665f21947f3a204aa7d224ff1b468d5e19d23dd` |
| Artifact `local-run`, on the run page | 45.2 KB, `sha256:0d323bacc651f9edfc29aea562d62a7b1745324da255dbbc6e1b766d3dca8512` | 45.2 KB, `sha256:cdbd4ef8976f40eee2b6602e83677e8b119fe170aa49addd1ff412dba81a319c` |
| Downloaded | both artifacts; each archive has the digest the page shows | `audit`; the archive has the digest the page shows. `local-run` was not downloaded |
| Deployment check | `ok`: 22 checks | `ok`: the same 22 checks with the same results |
| Audits | `ok` for epochs 0 and 1, read up to block 545910 | `ok` for epochs 0 and 1, read up to block 547050 |

An artifact is uploaded whether its job succeeded or not, so an artifact that can be downloaded
is not a pass. What is relied on here is the status of the run - success, which both jobs, `test`
and `audit`, have to reach - together with what the records in the artifact say.

The `test` job runs `npm test` and the rehearsal from a clean checkout. ci #2 is the first run of
that job on a hosted runner. Its rehearsal record is `../local-run-20261124T081042Z.json`: 37
checks, `ok`, and the hashes of the 51 source files it names are those of the commit.

The list of runs also shows a ci #1, failed. It belongs to commit `e7aa763`, in which the
workflow file was created empty so that its directory existed; the content arrived in the next
commit, eleven seconds later. An empty workflow file has no job to run and is listed as a failed
run.

## 8. The conditions of `docs/acceptance-matrix.md` 9, and where each is evidenced

| Condition | Evidence | Observed |
| --- | --- | --- |
| 1. The identity check has been made and recorded, and the deployment is labelled as it says (T7) | `finchain-sepolia-r2/identity-check.json`; the labels of the manifest | the cells are contract accounts and a key alone is not the agent; the deployment is labelled `operator-wallet-integration` |
| 2. The deployment record says `ok`, and `pouw verify` run by the hosted runner finds the code at the manifest's addresses to be this repository's (M1) | `finchain-sepolia-r2/deployment-20261124T024437Z.json`; `hosted-ci-2/verify.json`, `hosted-ci-3/verify.json` | `ok`; 22 checks `ok` in each run. The five builds the deployment record names have the hashes of the builds committed under `build/` |
| 3. Epoch 0 and the standard epoch hold the expected receipts and both are closed; any further epoch holding a receipt of the round is recorded and closed too; each close record is shown to be in the finalized chain (N1, N2, D9, D10, N3; A72) | the three round records; the audits; `r2a-close-evidence.json` | receipts 1 to 4 in epoch 0 and 5 to 8 in epoch 1, none elsewhere; close records in blocks 540870 and 546161, both within the finalized chain (section 6) |
| 4. The hosted runner's audits at finalized state say `ok` for epoch 0 and the standard epoch; the figures are the expected ones; the host's and the runner's audits of the same deployment and epoch hold the same `tableHash`; the host's audits, the input of the hosted job and the evidence name the same epochs (N5, T5, A69) | `hosted-ci-3/`, `hosted-ci-2/`; `finchain-sepolia-r2/audit-epoch-0.json`, `audit-epoch-1.json` | `ok`; the figures of section 5; equal `tableHash`, and equal reports field by field except `recordedAt` and `settledBlock`; epochs 0 and 1 throughout |
| 5. Deployment-result records are labelled `public-testnet`, `controlled-self-test` and `operator-wallet-integration` (M6) | the records | the manifest, the deployment record, the round records, the audits, the deployment checks and the close evidence carry the environment and both labels. Two kinds of record carry none, by what they are: the identity check, which is made before any deployment and names the chain only, and `run.json`, which describes a run of the workflow. `round-state.json`, the round command's working note, is no record and carries none either |

A listing of processes, the exit status of the background wrapper and a `MATCH` over an empty
epoch are not among the evidence: none of them shows that a round was completed.

## 9. Where the files came from, and their checksums

- **The host's directories.** On the host each was packed with `tar -czf`, printed as base64 and
  pasted. The archives rebuilt from the pasted text have the SHA-256 the host printed:
  `0dfd9ffbe1b58c35647a3d933d7a2425b344bec0fef349a4975a7ad2b6afa343` for the nine files of
  `finchain-sepolia-r2/` and `8d37def61ca710747e504c8db0bbc72a574cb9fc693624ac5d60598399cf9436`
  for the four of `finchain-sepolia-r2-unused-1/`. The archives are not kept: their content is,
  file for file. `round-state.json` is the round command's own note of its tenders.
- **`r2-step5.log`.** The output of the background wrapper that ran the round in epoch 1,
  rebuilt from the terminal text pasted during the round. Its SHA-256 is the one the host printed
  for the file.
- **`r2a-close-evidence.json`.** The output of the command in `close-evidence.command.txt`,
  rebuilt from the pasted terminal text. Its SHA-256 is the one the host printed for the file.
- **`hosted-ci-2/`, `hosted-ci-3/`.** The content of the `audit` artifacts, downloaded from the
  run pages by the repository's owner.
- **`../local-run-20261124T081042Z.json`.** From ci #2's `local-run` artifact, which also holds
  the two records that were in `evidence/` already, unchanged.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `close-evidence.command.txt` | 3435 | `10a8771ca296e036e24f5435e2287e1c8af30ef9b4d5a951beeeecda7a9f5eff` |
| `finchain-sepolia-r2-unused-1/audit-epoch-0.json` | 2890 | `25ffc9c17dbbd3a902bdc967dec6dc788fa69999045edcbe809571c016d67dea` |
| `finchain-sepolia-r2-unused-1/deployment-20261123T192011Z.json` | 13968 | `511dfa102d9d06e151c28525609bf8d99a6caa9ddf1414b4933fd48184cea707` |
| `finchain-sepolia-r2-unused-1/identity-check.json` | 4388 | `8e33c0b6521ac69f250f7dc9eeeb12abed0eb33309962bdd7568a1d9ab4b9a93` |
| `finchain-sepolia-r2-unused-1/manifest.json` | 2302 | `1945d195bffc37fe331057f7ee4cfc1b14e07cce4bca123db6a581dc0921413d` |
| `finchain-sepolia-r2/audit-epoch-0.json` | 7351 | `968123f9d0b98c9aebee05c75d3127a07efc0848de9a7dfd1104e26519f16065` |
| `finchain-sepolia-r2/audit-epoch-1.json` | 7263 | `087ec6bc3453296afeb4c50da4bbd6fc07d27eb486ea2d253e8aabd6a2fa5573` |
| `finchain-sepolia-r2/deployment-20261124T024437Z.json` | 13968 | `62537820763815707990dbc665cea7384933eae7108b0b03b04e42b8afaec6c0` |
| `finchain-sepolia-r2/identity-check.json` | 4388 | `ebf8a8b16e317c1234b7ac382194765d1fc21f6353531fd458095713fb9cedef` |
| `finchain-sepolia-r2/manifest.json` | 2302 | `9f54bf479a98db7739ad760b2c5bf07dfc634b36b6dd596cfa955de76d912f4a` |
| `finchain-sepolia-r2/round-20261124T030103Z.json` | 5097 | `e03279aa367202f315bec813eef5860d4bd48f6abf9369b54d8dabc6e31c829f` |
| `finchain-sepolia-r2/round-20261124T052139Z.json` | 5394 | `3334ebbf400e63c88fed63845a3ba3d9147f927c6cf740015344ca97cba22774` |
| `finchain-sepolia-r2/round-20261124T075635Z.json` | 1323 | `a7e455f199a59976bd45c89217147d53462a994f11198a0894b7ec29c9a79129` |
| `finchain-sepolia-r2/round-state.json` | 688 | `612154d2643906d0af69252cbd47f03cb6e356dcd16bc91b77cbf6e489f9703e` |
| `hosted-ci-2/audit-epoch-0.json` | 7351 | `10be0829ef82b90526b87b2f53bdc35906c032ef3a9b4986df6e59a1403d6430` |
| `hosted-ci-2/audit-epoch-1.json` | 7263 | `c86eebaaeb976df60fcc0f12520534c4359756bacde9f0b00f3cdad4b053049a` |
| `hosted-ci-2/run.json` | 408 | `c86c4c86465bba58aba10bb0cbbb168b3494f1b5192ae21fec5d51e6734129cd` |
| `hosted-ci-2/verify.json` | 5156 | `68cb66ad0acd7b337ef06e0806b56301d89408a28090235156a55b1b556c642d` |
| `hosted-ci-3/audit-epoch-0.json` | 7351 | `5a621c5ad89f65352c82671e54641fb439d90b19a4852fa012fb65860434ecd1` |
| `hosted-ci-3/audit-epoch-1.json` | 7263 | `0120cdef23c027295cb46f9a30a5569ee49aacebe3436ca5ac8387a0324b6480` |
| `hosted-ci-3/run.json` | 408 | `ebc9bba7f19319e495d461d0f12bbd4cff64cd3f648b45aedd3d92efda2f419a` |
| `hosted-ci-3/verify.json` | 5156 | `560d4a969cd29cc0b7c4504d29f19f0963c044458b634631dc2089d5d82933b3` |
| `r2-step5.log` | 2638 | `843fac3273b3af14541176b6156ebcf670b0b2006ed85701c5836d97daf389d1` |
| `r2a-close-evidence.json` | 5659 | `a3747af2880d75c23811ecd353ec7fe56463d41a8911e0b4e0337eae486f4331` |
| `../local-run-20261124T081042Z.json` | 110408 | `3bec5f59d527cd381e9b8685f128d21af5bdec6b2a64aa60320a9f50351d6e5d` |

## 10. What is not claimed

An amount of computation; demand from anyone but the operator; the participation of an agent or
of a FOGA cell; any value, issue or claim behind a test point; an independent implementation of
the audit; R2b or R3 completion; or approval of the next-ledger choices. The advisor's scoped R2a
technical acceptance is recorded separately from what each raw record establishes.

## 11. What the round showed about the client, for its next version

None of this is changed in release 0.1.3, and none of it altered a figure of the round.

- An audit should read the ledger's views at the block it replays the logs to, or say in its
  record at which block each was read; and it should record that block's hash and time.
- The record should say where the `sealed` flag was read, or the audit should read the
  `EpochSealed` event within the finalized block and report that.
- `pouw verify` should record the block of its reads.
- The close evidence should be a command of the client and a step of the hosted job, so that no
  one-off command is needed and the runner, not the host, makes the record.
- `tableHash` covers addresses and allocations only. Either a hash of the whole report is added,
  or reports go on being compared in full.
