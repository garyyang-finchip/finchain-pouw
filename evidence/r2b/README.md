# Round R2b on Finchain Sepolia: the records

The records of round R2b (`docs/r2b-operation.md`): ledger v2 of release 0.2.3 deployed on Finchain
Sepolia, and worked for two epochs by the delegates of two agents' Cell Accounts, OG and cell-b,
under permits their owners sign. Records are labelled `public-testnet`, `controlled-self-test` and
`cell-account-integration`.

This file is the index. It says what each record is and where it came from, and gives every file's
SHA-256. **The round is in progress: ledger v2 is deployed and verified, and both permits are
signed; no work has been sent under them, and no epoch has begun.** Records are added as each step
of the operation package is taken; none is replaced.

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

## 3. The deployment, 2026-11-28 (`deploy-20261128/`)

Run on E05 at 15:34 UTC+8 by the script of section 2, taken from main `ad95cf1` with the checkout at
`3c484778612df82804f2e1de7f2fcc11e57170c4`. The three funds checks read anew were each COVERED by
`getL1FeeUpperBound`, the steward's with its actual balance of 0.02 ETH, and the script passed
them. The steward then sent 17 transactions, nonces 0 to 16, in blocks 718288 to 718306, with
10,696,715 gas in all, and read everything back as configured; the deployment record holds 61
checks, all passed. Ledger `0xA37C344559cebC73086DBfAe8fF8c7a7dFd5577C`; genesis
2026-11-29T03:30:00Z (11:30 UTC+8), epochs of 7200 s; round R2a's ledger
`0x7180CdDA4aE494f551d196146E6fcCB717675F1a` named as superseded, and nothing of it read or changed.

| File | What it is |
| --- | --- |
| `manifest.json` | `finchain-pouw.deployment/2`: the six contracts with their code hashes, deployment transactions and blocks, the log starts, the guard of each account and the deployment it supersedes. The same bytes are `deployments/finchain-sepolia-r2b.json` |
| `deployment-20261128T073445Z.json` | `finchain-pouw.deployment-record/2`: every transaction, the hash of every build used, the 61 checks of the reading back, and a copy of the manifest |
| `deployment-20261128T073405Z.journal.jsonl` | the journal, one line per event: the plan, each transaction submitted and confirmed, and `finished` |
| `predeploy-20261128T073402Z-ItQ2eX/` | the directory the script made for this attempt: the three funds checks it read (`funds-steward.json`, `funds-delegate-og.json`, `funds-delegate-cell-b.json`), their SHA-256 as it wrote them (`funds.sha256.txt`), and `deploy.log`, the deployment's output |
| `deploy-run.transcript.txt` | the owner's terminal on E05: the script taken from the repository and checked against its reviewed SHA-256, its readings, its pass, the deployment and `exit 0`. Its lines from `finchain-sepolia-r2b (public-testnet` to the line before `Deployment command succeeded` are `deploy.log` |

The owner's paste of these records lost its beginning. The journal came through whole. The
manifest and the record were rebuilt from the journal's last line, `finished`, which carries both;
the end of the record that came through, 26 KB, equals the end of the rebuilt one. The owner then
computed on E05 the SHA-256 of the manifest, the record, the journal and `deploy.log`, and
confirmed that they equal those in section 5. The three funds checks equal, byte for byte, the
SHA-256 in `funds.sha256.txt`; that file is the three lines as pasted, and its own SHA-256 was not
computed on E05.

## 4. The verification and the permits, 2026-11-28 (`permits-20261128/`)

On E05 at 22:53 UTC+8 the endpoint was read (finalized block 730812, 1,284 s behind the latest), the
finalized block was found to hold block 718306, and `pouw verify` found the deployment a MATCH at
finalized block 730812: 53 checks, all `ok`. The two unsigned permits were generated from the
verified manifest, and then signed where the owner keys are, each by the key its node's service is
started with, located from that start command:

| Permit | Account | Delegate | Scope | Epochs | Nonce | Guard, binding | Digest | Signer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OG, signed on E06 | `0x9F7647013499C44B7E0432F5E9e22E4Afd447aD1` | delegate-og `0x928Fa5F1155d05E23c827bd31CdF42E5f621ff92` | 3: submit-g0, confirm-tender | 0 to 2 | 0 | `0x898644471a222Fd8EDd6aaB54476dE37ACE3a730`, 1 | `0x1c0e5ec865dba3a7dedc3b05618b17919a9c6d9030cb5ff4637ebf6a5e3b1b73` | `0x5Fee42D697975f6154164b29371c1c447F56fb4E` |
| cell-b, signed on E05 | `0x2Dd0c30383EcD6414e0b9DD6F10bf27BFe8715BB` | delegate-cell-b `0x1d7823CFb6891bb2aDc5F6D86081FD37C818b63E` | 1: submit-g0 | 0 to 2 | 0 | `0x898644471a222Fd8EDd6aaB54476dE37ACE3a730`, 1 | `0xc5e867116fe59e87cb3cd11dc5f61baa311e86528239573c50f1f1fce38acd5c` | `0x7dCE041276791F2371EA2e77F99119f22D32cd81` |

Both are typed data of the domain `PoUW Genesis Ledger`, version `2`, chain 85422, verifying
contract the ledger; the ledger, the guard and its binding are the manifest's, and the delegates
are the round keys of the plan. Before each signature the key's address was checked against the
owner wallet, and after it the record's digest and signer against the reviewed ones. The signer
recovered from each signature and its typed data, apart from the signing script, is the owner
wallet named, and each digest is that of its unsigned record. No transaction was sent by either
signature, and no FOGA service was stopped or restarted.

| File | What it is |
| --- | --- |
| `verify-and-unsigned-permits.transcript.txt` | the owner's terminal on E05: the endpoint reading, the verification with its 53 checks, and the two unsigned permits made |
| `permit-og.unsigned.json`, `permit-cell-b.unsigned.json` | `finchain-pouw.signed-statement/1`, each with its typed data and digest and no signature: what was reviewed before signing |
| `og-signing.transcript.txt` | the owner's terminal on E06: a clone at `3c48477` apart from the FOGA services, the address check, the signature, the check of digest and signer, the record's SHA-256 and the record |
| `permit-og.json` | the OG's permit, signed |
| `cell-b-key-location.transcript.txt` | the owner's terminal on E05: `foga-cell-b.service`, its user and its start command with `--wallet /home/ec2-user/foga-cell-b/wallet`, no environment file and no FOGA variable; and the identity check of the evening |
| `identity-check-signing-20261128T150031Z.json` | `finchain-pouw.identity-check/1` at block 731679: both accounts are contracts, account version 3, owner and operator their wallets, as in the preflight |
| `cell-b-signing.transcript.txt` | the owner's terminal on E05: the wallet directory listed, the address check, the signature, the check of digest and signer, the SHA-256 and the record |
| `permit-cell-b.json` | cell-b's permit, signed |

Each JSON record here was rebuilt from the output pasted from its host and equals, byte for byte,
the SHA-256 computed there, which each transcript shows. The JSON records of the endpoint reading
and of the verification are added with the records of the run; their SHA-256 on E05 is in
`verify-and-unsigned-permits.transcript.txt`:

```
35119d8c1250565c4e4b1ddcf828d7276abdff2fa623c8d87830f2e4c39956cd  chain-reading-20261128T145301Z.json
5930e363d7777680654c3c59a80d61887daed340db21898dd466c8c269c2924b  verify-20261128T145301Z.json
```

## 5. Every file's SHA-256

```
b6680c516efe76b372b7ff59a4ae1ed40ae8747ed96a7d092ecc7e7b458c8580  deploy-20261128/deploy-run.transcript.txt
2ad401a081d46d2a4ac88bb57c39ebb127a67207985f90005b8341adb5958d14  deploy-20261128/deployment-20261128T073405Z.journal.jsonl
0598f4c1fea2f014f30778059a38e296ae958bc30ada42d04d52f4c47e3a6f0a  deploy-20261128/deployment-20261128T073445Z.json
0845e85c7a7555fdbb30c798b5491ed57d1343fbb80ef351b7185368b5a69804  deploy-20261128/manifest.json
9583e82c765ea84f0833a275683528f31667712ee451c017fd2d21a39b1b4922  deploy-20261128/predeploy-20261128T073402Z-ItQ2eX/deploy.log
dd5beb3fb37705382799cb4d55447a9b5b15911efc33a037a08cf3f14eb3fa43  deploy-20261128/predeploy-20261128T073402Z-ItQ2eX/funds-delegate-cell-b.json
77895d37d9ac0f2f1af081edd8bb7ec9b5ba6dcb671c151b92dd1162520b0a58  deploy-20261128/predeploy-20261128T073402Z-ItQ2eX/funds-delegate-og.json
dbe595c83b8fc11e332129a715f9c274b60afc3b261006750575fcbdd574f72e  deploy-20261128/predeploy-20261128T073402Z-ItQ2eX/funds-steward.json
1ddce94ca4bafbdddb9e1c396b688c635a4901a2eb39ccab7cdd4ccb51edcabd  deploy-20261128/predeploy-20261128T073402Z-ItQ2eX/funds.sha256.txt
d5f52cc722e130c263f6bf6ab6b209a8a865780d64ea24b27f0f8ba3e481523d  deploy-reviewed-r2b.sh
407ebb017934e3e7d16cb40af2bf70419ba38638aece74a54acbeef807e9bbe8  permits-20261128/cell-b-key-location.transcript.txt
af601b03df62121d6c362103222c916a540815f3aa7ab65b14393249582f7609  permits-20261128/cell-b-signing.transcript.txt
3351a38c0d20a31e7cb45d80b98cf45c14e27950b83601fcfa66348be1196637  permits-20261128/identity-check-signing-20261128T150031Z.json
230d21c9f63a1b2dc909aeb75e139b6c6a7fce82ba884723223d8ceb75e8833e  permits-20261128/og-signing.transcript.txt
87d82dfdecdf193d42f85273b9ca2aec95339bb09fde6328215893739218831e  permits-20261128/permit-cell-b.json
1eb958c6c1e26383513563566ee4f018a3a10a827ff6fbd1e938b36f55afd38a  permits-20261128/permit-cell-b.unsigned.json
4ca1abdc18e595296e99d54cf2076e42ed4430dbf1936717b26591c4b0202fea  permits-20261128/permit-og.json
f6e0f74ff1c38b87dc6695129bb376b59f7a8147ed6834f29ddc46802fd036dc  permits-20261128/permit-og.unsigned.json
673c011685465eef0db2347c1b5a09d5653fad725072ff6c2ccfab18f4f5740c  permits-20261128/verify-and-unsigned-permits.transcript.txt
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
