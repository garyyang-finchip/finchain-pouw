# Evidence

Records, as in `finchain`: each is a JSON file with `schema`, `environment` and `recordedAt`, and
says of itself whether it passed (`ok`). A record is tied to a state of this repository by the
hashes of the files it exercised (`sources`).

| Record | Schema | Version | What it is |
| --- | --- | --- | --- |
| `local-run-20261123T120814Z.json` | `finchain-pouw.local-run/1` | 0.1.2 | Round R1 on a development network: two workers, G0 and G1 work, GMU, two epochs closed by time, an audit from the chain alone. 16 checks. This is the run the review of round R1 had before it; its `sources` are the files of v0.1.2 |
| `local-run-20261123T160631Z.json` | `finchain-pouw.local-run/2` | 0.1.3 | The rehearsal of round R2 on a development network, with the commands and the configuration of the public deployment: keys, deployment from the committed builds, the check of the deployed code, an operator's round over a controlled self-test epoch and a standard one behind an endpoint whose finalized block lags, close records, audits; then two contract accounts taking part as themselves on a deployment of their own. 37 checks |

`environment` is `local-devnet` for both: neither is evidence of anything on a public chain. The
records of round R2a on Finchain Sepolia - the identity check, the deployment record and
manifest, the round records, and the audits made by the hosted runner - are added when that round
has been run (`docs/r2-runbook.md`, step 8), labelled `public-testnet`, `controlled-self-test` and
`operator-wallet-integration`.

What no record here claims: an amount of computation, independent demand, or the participation of
anyone but the operator who ran it.
