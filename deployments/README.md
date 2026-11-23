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
  "name": "finchain-sepolia",
  "environment": "public-testnet",
  "chainId": 85422,
  "rpc": "https://...",
  "deployBlock": 0,
  "protocol": "0.1.2",
  "contracts": {
    "GenesisPolicy": "0x...",
    "GenesisLedger": "0x...",
    "SeedSource": "0x...",
    "AuditV1": "0x...",
    "TenderAdapter8414": "0x..."
  },
  "external": {
    "taskToken8414": { "address": "0x...", "deployBlock": 0 }
  }
}
```

| Field | Meaning |
| --- | --- |
| `schema` | fixed; the client refuses any other value |
| `name` | the deployment's name, copied into every record made from it |
| `environment` | `local-devnet`, `public-testnet` or `mainnet`, copied into every record, the way `finchain` labels its evidence |
| `chainId` | checked against the endpoint |
| `rpc` | optional public endpoint; `--rpc` or `POUW_RPC` take precedence. Never an endpoint that carries an access key |
| `deployBlock` | the block of the first contract of the deployment: where the client starts reading the ledger's and the policy's logs |
| `protocol` | the version of this repository the contracts were built from |
| `contracts.GenesisLedger` | required; the one address the client trusts the manifest for |
| `contracts.GenesisPolicy`, `contracts.SeedSource` | optional; if present they must equal what the ledger reports |
| `contracts.AuditV1`, `contracts.TenderAdapter8414` | informational: the modules in force are read from the policy's own events, per epoch |
| `external.taskToken8414` | the ERC-8414 contract the adapter reads, and the block it was deployed in: where the client starts reading a tender's history |

What a manifest is not: it holds no key, no parameter and no profile. Parameters, profiles,
admissions and operator declarations are on chain, versioned by epoch, and the client replays them
from the policy's events.

## Manifests in this directory

None yet. The local run (`npm run local-run`) writes its manifest to `out/local-run/manifest.json`
and embeds it in its evidence record. The Finchain Sepolia manifest is written by the deployment of
round R2 (`docs/roadmap.md`).
