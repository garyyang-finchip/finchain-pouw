# Round R2b on Finchain Sepolia: the records

The records of round R2b (`docs/r2b-operation.md`): ledger v2 of release 0.2.3 deployed on Finchain
Sepolia, and worked for two epochs by the delegates of two agents' Cell Accounts, OG and cell-b,
under permits their owners sign. Records are labelled `public-testnet`, `controlled-self-test` and
`cell-account-integration`.

This file is the index. It says what each record is and where it came from, and gives every file's
SHA-256. **The round is in progress: the preflight is recorded, and nothing of ledger v2 is
deployed yet.** Records are added as each step of the operation package is taken; none is
replaced.

## 1. The preflight, 2026-11-28 (`preflight-20261128/`)

Run on E05 at commit `3c484778612df82804f2e1de7f2fcc11e57170c4` (release 0.2.3), with no key read
but the round's own: the identity check, the corrected probe, the endpoint reading, the three
round keys made by `scripts/keys.js`, and the funds check of each with the funds the configuration
gives it assumed (`fundsAssumed: true`). Then the steward's gas, sent on the Mac mini; and the
deployment plan for the genesis the owner chose, 2026-11-29T03:30:00Z (11:30 UTC+8). Each JSON
record and both plans were rebuilt from the output pasted from E05 and equal, byte for byte, the
SHA-256 computed there (`host-sha256.txt`).

| File | What it is |
| --- | --- |
| `identity-check.json` | `finchain-pouw.identity-check/1`: both accounts are contracts, account version 3, owner and operator their wallets; tender 5 owned by OG's account, submission 1 delivered by cell-b's account and accepted. Values read at the latest block (716037) |
| `cell-probe.json` | `finchain-pouw.cell-probe/2`: at finalized block 715417, its hash asked for again at the end; both cells' guards allow both delegated operations within 500,000 gas, and the accounts refuse a foreign signature within 200,000. The refusal of a foreign signature, not the path of a valid permit |
| `chain-reading-preflight.json` | `finchain-pouw.chain-reading/1`: finality lag 1,242 s; fee cap 0.001000502 gwei; data fee by `getL1FeeUpperBound` |
| `funds-steward-planned.json`, `funds-delegate-og-planned.json`, `funds-delegate-cell-b-planned.json` | the funds checks, each COVERED by `getL1FeeUpperBound`, with 50 % on the fees: the steward at 32,768 bytes a transaction, 11,450,000 gas, 19 transactions and 0.004 ETH sent, the delegates at 2,000 bytes; every one with its funds assumed, the steward's 0.02 included |
| `steward-funding.transcript.txt` | the owner's terminal on the Mac mini, where the chain's deployer key is: 0.02 ETH to the steward, transaction `0x832167bfbc84d57e13d43650340b4a7fa455b604caa3faf404ccf8522b30599f`, block 716188 |
| `og-key-location.transcript.txt` | the owner's terminal on E06: the OG's Finchain cell configuration names its owner and no key; its service is started with `--wallet /home/ec2-user/foga-og/wallet`. No key was printed |
| `plan-20261129T0330Z.txt` | the deployment plan for the chosen genesis: 17 transactions; nothing sent |
| `plan-A.txt` | an earlier plan with the genesis at 09:00Z, made before the owner chose; a planning record only, not run |
| `host-sha256.txt` | the SHA-256 of the eight records above as computed on E05 |

The advisor reviewed these records and the chosen plan on 2026-11-28 and found them sound for the
deployment; that is the advisor's finding. The advisor also read the funding transaction, and the
steward's balance at block 716594, from the public endpoint; those readings are the advisor's own
and are not among these records.

## 2. The operation script (`deploy-reviewed-r2b.sh`)

The command that sends the deployment, as the advisor wrote and reviewed it on 2026-11-28, in place
of the command set in the package's step 2. It is an operation record, not part of the release:
it is copied out of the repository and run from outside it, so that the checkout stays at the
reviewed commit, which it checks. It stops unless the checkout is clean and at that commit, the
three round addresses are those reviewed, and no manifest or journal of an earlier attempt is
there; it reads the three funds checks anew into a new directory, the steward's with its actual
balance, and goes on only if each meets the reviewed role, budget and both fee conditions and the
funding block is finalized (`WAIT`, exit 3, otherwise); it then deploys with `--yes` and keeps the
deployment's exit status and its log. Nothing in it is a key.

## 3. Every file's SHA-256

```
d5f52cc722e130c263f6bf6ab6b209a8a865780d64ea24b27f0f8ba3e481523d  deploy-reviewed-r2b.sh
3be5d769c8f6302c786dfef109c987cae8d60832e56ddfe2c7609231f0ce555e  preflight-20261128/cell-probe.json
c1b2471fbee6ee59bdc93d951ba8e2a71f36440a4dcf23aa4b1b2845df7515bf  preflight-20261128/chain-reading-preflight.json
e95c8d5ce76b2dc0338efd81ce1fef884adb0b80d713e7661523da4278f39836  preflight-20261128/funds-delegate-cell-b-planned.json
f1320a61913b5f37e0a6f8042e9564dcb3e541e16dcaa87a45c757e83a6c8e00  preflight-20261128/funds-delegate-og-planned.json
dbf5ec42225f85c787d51b006057abe1be404e2c862c65534aeb9de23601bce4  preflight-20261128/funds-steward-planned.json
43c38d306f210c317b5fb0d01477a99ddbc9d96ffb5603826ee71a5350942c00  preflight-20261128/host-sha256.txt
3df75e48ddc5012519696476294a0eac35667d8cdd7c5eddaee9c3eb8e255c51  preflight-20261128/identity-check.json
1ba6148c8a506e8d58176ac411ea5bd7f33fc1b7a7cc0b73b7d1683d5a5cd5e1  preflight-20261128/og-key-location.transcript.txt
dd9c64fffca2233abb86d150632f13fc9ddd879b00e52b6bab97fb8c3491005f  preflight-20261128/plan-20261129T0330Z.txt
93e71197b81701f6a912ba892bc4a178481752033834188855462f21904bc3a8  preflight-20261128/plan-A.txt
35171260401a11366bca965015a619a993c2bb8b118fa2a67b52861e0c58a73b  preflight-20261128/steward-funding.transcript.txt
```
