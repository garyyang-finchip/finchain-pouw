# Evidence

Records, as in `finchain`: each is a JSON file with `schema`, `environment` and `recordedAt`, and
says of itself whether it passed (`ok`). A record is tied to a state of this repository by the
hashes of the files it exercised (`sources`).

| Record | Schema | Version | What it is |
| --- | --- | --- | --- |
| `local-run-20261123T120814Z.json` | `finchain-pouw.local-run/1` | 0.1.2 | Round R1 on a development network: two workers, G0 and G1 work, GMU, two epochs closed by time, an audit from the chain alone. 16 checks. This is the run the review of round R1 had before it; its `sources` are the files of v0.1.2 |
| `local-run-20261123T160631Z.json` | `finchain-pouw.local-run/2` | 0.1.3 | The rehearsal of round R2 on a development network, with the commands and the configuration of the public deployment: keys, deployment from the committed builds, the check of the deployed code, an operator's round over a controlled self-test epoch and a standard one behind an endpoint whose finalized block lags, close records, audits; then two contract accounts taking part as themselves on a deployment of their own. 37 checks |
| `local-run-20261124T081042Z.json` | `finchain-pouw.local-run/2` | 0.1.3 | The same rehearsal, made by a hosted runner from a clean checkout of commit `fa765af`: the `test` job of run ci #2 of `.github/workflows/ci.yml`, the first run of the tests and of the rehearsal on a hosted runner. 37 checks |
| `r2a/` | several; `r2a/README.md` is the index | 0.1.3 | Round R2a on Finchain Sepolia (`docs/r2-runbook.md`): the identity check, the deployment record and manifest, the round records, the host's audits, the deployment checks and audits of two hosted runs, the evidence that the close records are in the finalized chain, and the records of an earlier deployment that was left unused |

`environment` is `local-devnet` for the three `local-run` records: none of them is evidence of
anything on a public chain. The records under `r2a/` are those of a public test network,
labelled `public-testnet`, `controlled-self-test` and `operator-wallet-integration`. They are
tied to this repository by the client's version, by the manifest's code hashes and the builds
the deployment record names, and by the commit in each hosted run's `run.json`. Their index says
what was observed, and leaves the acceptance of the round to its reviewers and the owner.

What no record here claims: an amount of computation, independent demand, or the participation of
anyone but the operator who ran it.
