# Deployment manifests

A deployment of the protocol is described by one manifest. It is the only place where a chain is
named: the contracts take every address through their constructors, and the ledger derives its
domain from the chain id and its own address when it is deployed (`docs/decisions.md`, A13).

The reference client is given a manifest and an endpoint and nothing else. It reads the policy and
the seed source from the ledger itself and refuses a manifest whose chain id, policy or seed source
do not agree with what the chain says, so a wrong manifest cannot point it at contracts that do
not belong together.

## Format (`finchain-pouw.deployment/1`)

```json
{
  "schema": "finchain-pouw.deployment/1",
  "name": "finchain-sepolia-r2",
  "environment": "public-testnet",
  "labels": ["controlled-self-test", "operator-wallet-integration"],
  "chainId": 85422,
  "rpc": "https://...",
  "logChunk": 50000,
  "deployBlock": 0,
  "protocol": "0.1.3",
  "contracts": {
    "GenesisPolicy": "0x...",
    "SeedSource": "0x...",
    "GenesisLedger": "0x...",
    "AuditV1": "0x...",
    "TenderAdapter8414": "0x..."
  },
  "code": {
    "GenesisLedger": { "contract": "GenesisLedger", "codeHash": "0x...", "deployTx": "0x...", "block": 0 }
  },
  "external": {
    "taskToken8414": { "address": "0x...", "deployBlock": 0, "codeHash": "0x..." }
  },
  "clock": { "genesisTime": 0, "epochDuration": 7200 }
}
```

| Field | Meaning |
| --- | --- |
| `schema` | fixed; the client refuses any other value |
| `name` | the deployment's name, copied into every record made from it |
| `environment` | `local-devnet`, `public-testnet` or `mainnet`, copied into every record, the way `finchain` labels its evidence |
| `labels` | optional; what kind of exercise the deployment is, copied into every record: `controlled-self-test` when every party belongs to one operator, `operator-wallet-integration` when the parties are keys an operator holds and no agent's account takes part, `contract-account-integration` when the parties are contract accounts. A label describes the deployment as a whole; an epoch's `mode` is a separate field of its audit |
| `chainId` | checked against the endpoint |
| `rpc` | optional public endpoint; `--rpc` or `POUW_RPC` take precedence. Never an endpoint that carries an access key |
| `logChunk` | optional; the largest range of blocks the chain's public endpoint serves in one log query. The client reads logs in ranges of this size unless told otherwise |
| `deployBlock` | the block of the first contract of the deployment: where the client starts reading the ledger's and the policy's logs |
| `protocol` | the version of this repository the contracts were deployed from |
| `contracts.GenesisLedger` | required; the one address the client trusts the manifest for |
| `contracts.GenesisPolicy`, `contracts.SeedSource` | must equal what the ledger reports. An audit can do without them; `pouw verify` cannot |
| `contracts.AuditV1`, `contracts.TenderAdapter8414` | the modules as deployed. For an audit, the modules in force are read from the policy's own events, per epoch; `pouw verify` requires both and checks that the profiles in force name them |
| `code.<role>` | for each of the five contracts: the build it was deployed from (`build/<contract>.json`), the hash of the code at its address, the deployment transaction and its block. `pouw verify` compares the code on chain with the build, the immutable values aside, and with this hash; a manifest that leaves one of the five out fails the check, because nothing would then be known about that contract |
| `external.taskToken8414` | the ERC-8414 contract the adapter reads: its address, the block it was deployed in - no tender's history begins earlier - and the hash of its code when the adapter was pointed at it |
| `clock` | the genesis time and the epoch length. They are immutable in the policy; `pouw verify` checks them |

What a manifest is not: it holds no key, no parameter and no profile. Parameters, profiles,
admissions and operator declarations are on chain, versioned by epoch, and the client replays them
from the policy's events.

A later version of the contracts is another deployment with another manifest, which names the
deployment it supersedes; the earlier manifest stays, because the earlier ledger stays readable
and auditable (`docs/decisions.md`, A35). That field is specified with the version that needs it.

## Making a deployment

A deployment is made by `scripts/deploy.js` from a configuration file and the builds committed
under `build/`; the host that deploys needs no compiler. The configuration
(`finchain-pouw.deploy-config/1`) says what a manifest does not: the epoch length, the seed
source, the parameter versions and from which epoch each applies, the profiles, the parties with
their admission and declared operator, and what the steward sends each party for gas. The script
checks what it can before sending anything, sends nothing without `--yes`, and afterwards reads
everything back - the code against the builds, the wiring, and the policy as an auditor will
replay it. It writes the manifest and a deployment record (`finchain-pouw.deployment-record/1`)
that lists every transaction and the hash of every build used. `docs/r2-runbook.md` has the steps.

## Files in this directory

| File | What it is |
| --- | --- |
| `finchain-sepolia-r2.config.json` | the configuration of round R2a on Finchain Sepolia: two-hour epochs, a 10 / 90 split, epoch 0 as a controlled self-test and a standard version from epoch 1, two wallets of one operator (`docs/decisions.md`, A34) |
| `finchain-sepolia.identities.json` | public addresses for `scripts/identity-check.js`: the two FOGA cells on Finchain Sepolia, each with its Cell Account and its key, and the tender of their recorded business loop |

No manifest of a public deployment yet: `finchain-sepolia-r2.json` is written by the deployment
of round R2a. The rehearsal (`npm run local-run`) writes its manifests under `out/local-run/` and
embeds them in its evidence record.
