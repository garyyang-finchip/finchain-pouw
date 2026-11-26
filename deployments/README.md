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
and auditable (`docs/decisions.md`, A35). That field, `supersedes`, comes with the manifest of
ledger v2 below.

## The manifest of a ledger v2 deployment

A deployment of ledger v2 (`docs/ledger-v2.md`) has a manifest of schema
`finchain-pouw.deployment/2`, written by `scripts/deploy-v2.js`. Its members beside those of the
table above, whose meaning stays:

| Field | Meaning |
| --- | --- |
| `contracts`, `code` | the roles `GenesisPolicyV2`, `SeedSource`, `GenesisLedgerV2`, `AuditV1`, `TenderAdapter8414V2`, and `FogaCellGuard` where the deployment binds it; every build from `build/v2/`, the seed source being v2's own copy of `L1BlockSeedSource` or `PrevBlockSeedSource` |
| `deployBlock`, `policyDeployBlock` | the block of the policy, the first contract: the policy's log is read from it |
| `ledgerDeployBlock` | the block of the ledger: its log is read from it |
| `tenderDeployBlock` | the block of the ERC-8414 contract, which the configuration must state: the tenders' log is read from it |
| `guards` | for each contract account bound to a guard: the guard, the build where it is the deployment's own, the guard's code hash as the policy recorded it, the binding version and its first epoch |
| `supersedes` | the deployment this one supersedes: its name, chain and ledger, and the SHA-256 of its manifest file. Nothing of it is read beyond its code, and nothing of it is changed |

`client/lib/manifest2.js` checks a deployment against such a manifest at one block, and the audit
of an epoch of ledger v2 connects from it. Its configuration is of schema
`finchain-pouw.deploy-config/2`: that of the kernel with an operator cap in each parameter
version, the start of the tenders' log, a guard per contract account, and `supersedes.manifest`,
the path of the superseded manifest relative to the configuration. Its record is
`finchain-pouw.deployment-record/2`. The manifest and the record are created and never replace a
file. No v2 deployment exists on a public chain yet; the rehearsal makes one on a development
network.

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
| `finchain-sepolia.identities.json` | public addresses for `scripts/identity-check.js` and `scripts/cell-probe.js`: the two FOGA cells on Finchain Sepolia, each with its Cell Account and its key, and the tender of their recorded business loop |
| `finchain-sepolia-r2.json` | the manifest of round R2a on Finchain Sepolia, byte for byte as `scripts/deploy.js` wrote it on the host of the round: chain 85422, ledger `0x7180CdDA4aE494f551d196146E6fcCB717675F1a`, genesis time 1795489148 (2026-11-24T02:59:08Z). It is the input of the hosted audit (`docs/r2-runbook.md`, step 7). An earlier deployment from the same configuration was left unused; its manifest is not here, and its records are submitted apart from this deployment's |

`finchain-sepolia-r2.json` is the first manifest of a public deployment here. A manifest says
where a deployment is and what was deployed. It is not evidence that a round passed: that is
what the audits of the round are for, and their acceptance. The rehearsal (`npm run local-run`)
writes its manifests under `out/local-run/` and embeds them in its evidence record.
