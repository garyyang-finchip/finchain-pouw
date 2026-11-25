# Hosted run ci #4: the client of release 0.1.5 against the deployment of round R2a

Made on 2026-11-25. Times are UTC unless a line says otherwise.

This directory is the record of one run: the first time the client that reads one block
(release 0.1.4 on, here 0.1.5) checked and audited a deployment on a public endpoint. The
owner agreed to it and said what it is recorded as (`docs/decisions.md` A85): the new client's
verification of the existing deployment, on a public endpoint and with an audit at a pinned
block.

It is not a part of round R2a and reopens nothing of it. The round's acceptance and its records
under `../r2a/` are as they were; no file there was changed. The deployment that was read is
the round's deployment because that is the deployment that exists.

## 1. The run

| | |
| --- | --- |
| Workflow | `.github/workflows/ci.yml`, started by hand by the repository's owner |
| Run | ci #4, `https://github.com/garyyang-finchip/finchain-pouw/actions/runs/45546136600` |
| Commit | `d8363aba0d427d0e377692ab241641721308779c` of `main`: release 0.1.5 |
| Inputs | manifest `deployments/finchain-sepolia-r2.json`, epochs `0 1` |
| Runner, from `run.json` | Linux/X64, Node v22.23.5 |
| Started, from `run.json` | 2026-11-25T04:20:51.416Z (12:20:51 in Singapore) |
| Status on the run page | Success, 1m 44s; jobs `test` 1m 40s and `audit` 12s; no annotation |
| Artifact `audit`, on the run page | 7.57 KB, `sha256:ff9d619c5641d08532d0cad8e7b2fa55a8cb74a79df66edd8cb7bab44a98f8b3` |
| Artifact `local-run`, on the run page | 112 KB, `sha256:cb85ac31019c0edff1ead5dfff869f82567c473c69834cbc14b936cc1caa0d9f` |
| Downloaded | both artifacts, by the owner; each archive has the digest the page shows |

The exit status of each command is not in a record of its own, and the logs of the run can be
read only when signed in; they were not read. What is relied on is the status of the run -
success, which both jobs have to reach, and the `audit` job stops at the first command that
fails - together with what the three reports say. An artifact is uploaded whether its job
succeeded or not, so an artifact that can be downloaded is not a pass.

The `audit` job installs the client alone, without the development dependencies, holds no key
and sends no transaction.

## 2. The three reports, each with its own block

Each command connected by itself and took the endpoint's finalized block at that moment. The
three reports name the same block: the endpoint's finalized block did not move in the three
seconds between the first and the last connection. That is what the reports show; nothing made
it so.

| Report | Command | Connected (`observedAt`) | Block read | `ok` |
| --- | --- | --- | --- | --- |
| `verify.json` | `pouw verify` | 04:20:51.518Z | 582204 | true: 23 checks, none failed |
| `audit-epoch-0.json` | `pouw audit 0` | 04:20:52.310Z | 582204 | true: no finding |
| `audit-epoch-1.json` | `pouw audit 1` | 04:20:54.339Z | 582204 | true: no finding |

Block 582204, as the endpoint `rpc.finchain.one` gave it: hash
`0x02e21749f2c99cb5fe529a213045590111031822aaaa793bec6bada4bcb4a9df`, timestamp 1795579080
(2026-11-25T03:58:00Z), asked for and reported as `finalized`. It was 22 minutes and 51 seconds
old when the first command connected, and lies in epoch 12 of the deployment's clock.

## 3. What the reports say

**The deployment.** At that block the code at each of the manifest's five addresses is this
repository's build, and each code hash is the one the manifest records - the same five hashes
as in the round's records. The 22 checks of the round's hosted runs are all there with the same
results; the client of 0.1.4 on adds one, that the ledger answers at the pinned block as it did
when the connection was made.

**The two epochs.** Every figure is the figure of round R2a. Set against each of the round's
three sets of audit records - the host's, ci #2's and ci #3's - these members are equal for
both epochs: the audit subject, the table and its hash, what was allocated and what was not,
the measured and subsidized GMU of both pools, the digest, the seed, the parameters, the
budget, the pools, the operators, the number of receipts, the mode and the bounds of the epoch.

| | Epoch 0 | Epoch 1 |
| --- | --- | --- |
| Mode | controlled self-test | standard |
| Receipts | 4 | 4 |
| Subsidized GMU, G0 and G1 | 20 and 100 | 20 and 0 |
| Allocated; unallocated | 500 and 500 test points | 50 and 950 test points |
| Table hash | `0x07ac555c836b60b3c7025e6dd7aee600766b0c80274b8e6c23eea5e5421d5340` | `0xc1a3ebed57aa9bf133d6f0850fdf7d97ea7aa46ecbcf77db9748d6fe37c2f88d` |
| Audit subject | `0x1067ec4e68fd44d94c1f72601aedd400481a8f6783172ad299db5b3a6f30882e` | `0x983bed67764425ea289483e53f331b0796a55ec441ad55149d2e47bc6e956ffc` |
| Close record, within the block read | block 540870 | block 546161 |

**What differs from the round's records, and why.** Set against ci #3's records, 31 of the 37
members that both have are equal. The other six are the schema, the time of the record, the
client's version, and three members in which the client of 0.1.4 on says more:

- Each G1 receipt has `tender.authority` where it had `tender.judgeAtSettlement`. The address
  is the same one; with it comes that the authority did not change in the acceptance's own
  transaction, and the evidence state `registered-authority-visible`, for all four tenders.
  `g1.byAuthorityEvidence` counts them.
- `reading` has two more lines: what a tender's log does and does not establish, and that
  everything was read at the one block named.
- New members: `snapshot` with its tag and finality, `observedAt`, `closeRecord`, and the two
  hashes. `settledTag` and `settledBlock` are gone: the block read is the `snapshot`.

**The hashes.** `scripts/report-hash.py`, run on the three files as they were downloaded,
computes the report hash and the result hash that each file states.

| Report | Result hash | Report hash |
| --- | --- | --- |
| `verify.json` | `ded1ffd459fdc60a4d0e274d6fed669e62166e8bb8bfa9fcb68fe7694d61374d` | `cf27880dcff6029f2c209d8c75669615c5e3f7ef7e43b7b92d03d13852b91c1b` |
| `audit-epoch-0.json` | `3ddba0af6f45ec2900264fb513ec59c71bfedc6a9e74f44652dca38a5506ed42` | `f119d3b3317c92baa720a8eeb0aeced9fa5941295dfda58e037355f5f36eb9bf` |
| `audit-epoch-1.json` | `95694abda03111d0b19cb492bacfe9585eb7b09a886c3813135cec679b722724` | `6086092dea927bdf814dc335859774844900890b3d83b5626d7d8f831b952ac1` |

A result hash is the same for any run that reads the same block and finds the same; a second
run at block 582204 can be set against these.

## 4. The tests and the rehearsal on the hosted machine

The `test` job ran `npm test` and the rehearsal from a clean checkout of the same commit. Its
rehearsal record is `../local-run-20261125T042225Z.json`: 41 checks, `ok`, and the hashes of the
76 source files it names are those of the commit. The checks and the source hashes are the
same as in `../local-run-20261124T204343Z.json`, the rehearsal of release 0.1.5 that was made
before the release was uploaded. The artifact also holds the five rehearsal records that the
commit has; they are byte for byte the committed ones.

## 5. What this shows, and what it does not

It shows that on 2026-11-25 the public endpoint of the deployment served the state of its
finalized block, 23 minutes back, to a client that asks for every view, every code and every
log at that one block; that the client of release 0.1.5, installed alone on a hosted machine,
ran against a real deployment; and that it found what the client of 0.1.3 had found.

It does not show:

- anything lasting about the endpoint. This is one run. An endpoint that keeps less state, or
  the same endpoint on another day, is another observation;
- that block 582204 has that hash on any other node. The hash is the endpoint's word, as in
  the round's hosted runs, and was not read from a second node;
- anything about ledger v2. The deployment is the kernel of release 0.1.3; no contract of v2
  is deployed anywhere, and the client for a v2 deployment is not built;
- an acceptance of anything. No round is opened, closed or reopened by this record.

## 6. Where the files came from, and their checksums

The owner downloaded the two artifacts from the run's page and passed the two archives to the
executor on 2026-11-25 at 13:59 (Singapore). The archive of `audit` has the SHA-256 that the
page shows for it, and so has the archive of `local-run`. The four files of this directory and
the rehearsal record are the files of those archives, byte for byte.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `audit-epoch-0.json` | 8661 | `12885b9463f9b8ba600aa02fd873a168ad3dd5dcd21825cd5d5474ce510dc01c` |
| `audit-epoch-1.json` | 8573 | `2244dd472a57b90d00b7ec957724e351ca157011b6ba00b5e9032db1d2676b1e` |
| `run.json` | 408 | `d358814cbb025c82da8ef7b3aba700ec4564a515322d1059c2bf16f60da42f41` |
| `verify.json` | 5681 | `03574feff99fcb49304ef5612d8ca08a0567b44ee245af481542c5aeedaee9ec` |
| `../local-run-20261125T042225Z.json` | 119226 | `f7c12c51dafd2345935e22d982ad9382dfcdb4274cc3b71718c6c2da0fef7f09` |
