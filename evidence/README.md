# Evidence

Deployment-result records follow the `finchain` convention: JSON with `schema`, `environment`
and `recordedAt`, and an explicit result where applicable. Local rehearsals identify the source
files they exercised through `sources`. Identity checks and workflow metadata keep their own
schemas; the index explains their provenance without adding fields to the originals.

| Record | Schema | Version | What it is |
| --- | --- | --- | --- |
| `local-run-20261123T120814Z.json` | `finchain-pouw.local-run/1` | 0.1.2 | Round R1 on a development network: two workers, G0 and G1 work, GMU, two epochs closed by time, an audit from the chain alone. 16 checks. This is the run the review of round R1 had before it; its `sources` are the files of v0.1.2 |
| `local-run-20261123T160631Z.json` | `finchain-pouw.local-run/2` | 0.1.3 | The rehearsal of round R2 on a development network, with the commands and the configuration of the public deployment: keys, deployment from the committed builds, the check of the deployed code, an operator's round over a controlled self-test epoch and a standard one behind an endpoint whose finalized block lags, close records, audits; then two contract accounts taking part as themselves on a deployment of their own. 37 checks |
| `local-run-20261124T081042Z.json` | `finchain-pouw.local-run/2` | 0.1.3 | The same rehearsal, made by a hosted runner from a clean checkout of commit `fa765af`: the `test` job of run ci #2 of `.github/workflows/ci.yml`, the first run of the tests and of the rehearsal on a hosted runner. 37 checks |
| `local-run-20261124T194742Z.json` | `finchain-pouw.local-run/2` | 0.1.4 | The same rehearsal with release 0.1.4, made from a clean copy of the tree that the release was delivered as: the kernel's contracts and builds are those of 0.1.3, and the client reads one block. Its audit and deployment-check records are of schema 2 - each names the block it read by number, hash and time and carries its two hashes - and the `sources` of the run include the contracts of ledger v2, which the rehearsal does not deploy. 41 checks: the 37 of release 0.1.3, one of them changed - a second `pouw work` finds its receipt and sends nothing - and four new ones, two per epoch: the audit read one block with the close record within it, and an audit repeated at that block has the same result hash |
| `local-run-20261124T204343Z.json` | `finchain-pouw.local-run/2` | 0.1.5 | The same rehearsal with release 0.1.5, made from a clean copy of the tree that the release was delivered as. The contracts and the builds it deploys are those of 0.1.3, unchanged; of the client's code that the rehearsal runs, the canonical form of a record changed - an array with an empty slot is refused - and the records of this run hold none. 41 checks, the same as with release 0.1.4. The record of 0.1.4 above stays as it was made: its source hashes are those of commit `b3e07df` |
| `local-run-20261125T035116Z.json` | `finchain-pouw.local-run/2` | 0.1.6 | The same rehearsal with release 0.1.6, made from a clean copy of the tree that the release was delivered as. The rehearsal deploys the kernel alone: its contracts, its compiler and its builds are those of 0.1.3, unchanged, and the code of the client is that of 0.1.5. What differs is among the sources the record names: the contracts of ledger v2 now state their own compiler and import nothing outside `contracts/v2`, and four fixtures moved there. 41 checks, as before |
| `r2a/` | several; `r2a/README.md` is the index | 0.1.3 | Round R2a on Finchain Sepolia (`docs/r2-runbook.md`): the identity check, the deployment record and manifest, the round records, the host's audits, the deployment checks and audits of two hosted runs, the evidence that the close records are in the finalized chain, and the records of an earlier deployment that was left unused |

`environment` is `local-devnet` for the six `local-run` records: none of them is evidence of
anything on a public chain. The deployment-result records under `r2a/` are those of a public test
network, labelled `public-testnet`, `controlled-self-test` and `operator-wallet-integration`. They
are tied to this repository by the client's version, by the manifest's code hashes and the builds
the deployment record names, and by the commit in each hosted run's `run.json`. Their index says
what was observed and records the advisor's technical acceptance on 2026-11-24 after evidence commit
`b53e52f` (`docs/decisions.md` 6.11). This status update preserves all raw records and checksums and
does not widen the round's scope.

What no record here claims: an amount of computation, independent demand, or the participation of
anyone but the operator who ran it.
