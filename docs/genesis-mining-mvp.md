# Genesis Mining MVP

The minimal runnable loop (A7):

```
Work  ->  Verify  ->  GMU  ->  Epoch  ->  Test Reward
 off chain   on chain,     measured     closed by time,    a table that is the value of
             deterministic per receipt  nothing to submit  a function, recomputable by anyone
```

Design revision v0.1.3. The specification was written after the formal review of v0.1.1
(`decisions.md`, A19-A30) and implemented as round R1 in this repository: the contracts under
`contracts/`, the reference client under `client/`, the tests under `test/`. The review of v0.1.2
and of round R1 (A31-A39) changed no rule; this revision states two boundaries more exactly - who
a participant is when its identity is a contract account (section 5.5), and what the self-dealing
rule reads (section 7.5) - and adds three kept designs (13.7 to 13.9). This document describes
what is built. Where it and the code differ, the code and its tests are right and this document
is to be corrected. Figures marked *illustrative* are examples (`decisions.md`, last section).

The three errors the MVP is built to prevent, in the review's words: fake compute earning a
reward, non-real demand drawing the subsidy, over-engineering blocking the MVP. The third one
shaped this revision most: R1 has two profiles, two contracts of substance, no pending state and
nothing to submit at the close.

## 1. Scope

In R1 (implemented): G0 protocol work with one profile, `g0.ref`, verified by recomputation on
chain; G1 real demand with one profile, `g1.tender`, through ERC-8414, with the subsidy decided
apart from the settlement; one receipt type; GMU measured and GMU subsidized per receipt; epochs of
a fixed clock with parameters fixed before they begin; an allocation that is a pure function of
the ledger; the reference client with a worker's job and an independent audit.

Deferred, with the designs kept (section 13): `g0.cal` and calibration records, `g0.ver` and its
commit-reveal, challenge windows and overturns, any tier or quality factor, paging, a cap per
operator, receipts without the demander, the binding of the authority at settlement, a delegation
signed by an account, node attestations, the FOGA adapter.

Out (later milestones, A9): SIG, IPC, routing, FCT, any balance, claim or token.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Profile | A versioned definition of one kind of work: its pool, the module that verifies or reports it, the GMU of one accepted unit and the per-worker cap. Named `g0.ref`, `g1.tender` |
| Parameters | A versioned set of the epoch's reward rules: budget schedule, pool split, share cap, G1 subsidy rules |
| Epoch | An interval of a clock fixed at deployment: `[genesisTime + n * epochDuration, genesisTime + (n + 1) * epochDuration)` |
| Seed | A value captured on chain the first time an epoch is used; G0 instances derive from it. It makes instances differ per epoch and per worker. It is not a source of randomness (section 5.1) |
| Instance | One G0 job as one worker has it in one epoch: `keccak256(seed, functionId, jobIndex, worker)` |
| Receipt | The immutable record of one piece of work: who, what, under which profile, in which epoch |
| Status | What was found about a receipt, in three separate answers: the verdict (accepted or rejected), the eligibility for the subsidy (eligible, or the reason it is not) and the relation class of the parties |
| Contribution id | The identity of a unit of work, independent of any profile version; one receipt per contribution, ever |
| GMU measured | The GMU of accepted work, whether or not it is subsidized: the record of work done |
| GMU subsidized | The part of the measured GMU that counts toward the epoch's allocation |
| Admission | The steward's entry of an address in the early subsidy (A3). Work by an address that is not admitted is recorded and measured and earns nothing |
| Operator | A number the steward declares for an address: which party controls it. 0 = nothing declared |
| Relation class | `none-found`: no declared relation between the parties of a G1 receipt - which is not a finding of independence; `declared-related`: the worker's declared operator is the demander's or the judge's; `attested-independent`: reserved, not produced by this version |
| Allocation | A worker's test points of an ended epoch: the value of a view function |
| Domain | `keccak256("finchain-pouw.genesis-ledger.v1", chainId, ledger address)`, computed at deployment; part of every seed and contribution id (A13) |
| Steward | The account that registers profile and parameter versions, admissions and operator declarations, and can pause recording. It cannot touch a receipt, a status, a total or an allocation |
| Settled block | The block the client treats as final: the `finalized` block on a public chain (section 12) |

## 3. Data structures

As in `contracts/GenesisTypes.sol`.

### 3.1 Profile

| Field | Meaning |
| --- | --- |
| `key` | `keccak256(name)`; a name's pool never changes |
| `version`, `id` | versions count from 1 per name; `id = keccak256(key, version)` is what a receipt carries |
| `pool` | 0 = G0, 1 = G1 |
| `module` | G0: the function contract (`IG0Function`); G1: the adapter, the only address allowed to record under the profile |
| `baseGmu` | GMU of one accepted unit of work |
| `maxGmuPerWorkerPerEpoch` | subsidized GMU one worker can accrue under the profile in one epoch |
| `jobsPerEpoch` | G0: job indices per epoch; G1: 0 |
| `activeFromEpoch`, `retiredFromEpoch` | the first epoch the version applies to; the first epoch it no longer applies to |

### 3.2 Parameters

| Field | Meaning | *Illustrative* |
| --- | --- | --- |
| `activeFromEpoch` | first epoch the version applies to | - |
| `budgetBase`, `halvingInterval` | test points of the version's first epoch, halved every `halvingInterval` epochs counted from it; 0 = constant | 1,000; 8 |
| `splitG0Bps` | the G0 pool's share of the budget; the G1 pool is the rest | 7000 |
| `workerCapBps` | the largest share of a pool one address can be allocated | 2500 |
| `minBountyWei` | G1: smallest native bounty of a subsidized tender | 0.001 ETH |
| `maxSubsidizedPerDemander` | G1: subsidized receipts per demander per epoch | 3 |
| `maxSubsidizedPerPair` | G1: subsidized receipts per (demander, worker) pair per epoch | 1 |
| `subsidizeDeclaredRelated` | G1: whether declared-related parties are subsidized. True only for a controlled self-test; the audit labels such an epoch | false |

### 3.3 Receipt (never changes)

| Field | Meaning |
| --- | --- |
| `epoch` | the epoch the receipt was recorded in; it counts there and nowhere else |
| `pool`, `profileId` | the pool and the profile version the work was measured under |
| `worker` | G0: the sender; G1: the fulfiller of the submission |
| `counterparty` | G1: the demander - the tender's owner, who bridged it; G0: zero |
| `ref` | G0: the instance; G1: `keccak256(source, tokenId, submissionId)` |
| `inputHash`, `outputHash` | commitments to what was asked and what was delivered |
| `contributionId` | G0: `keccak256(domain, 0, functionId, epoch, jobIndex, worker)`; G1: `keccak256(domain, 1, source, tokenId, submissionId)` |
| `recordedAt` | block timestamp |

### 3.4 Status (set once, in the transaction that records the receipt)

| Field | Meaning |
| --- | --- |
| `verdict` | 1 accepted, 2 rejected |
| `ineligible` | 0 eligible, else the reason (section 4) |
| `relation` | the relation class (G1) |
| `gmuMeasured`, `gmuSubsidized` | section 6 |
| `verifier` | the module that produced the verdict |

### 3.5 Epoch

Per epoch the ledger keeps the seed, a rolling digest over the receipts in order
(`keccak256(previous, id, contributionId, worker, pool, verdict, ineligible, relation, gmuMeasured,
gmuSubsidized)`), the receipt count and four totals: GMU measured and GMU subsidized, for each
pool. Per epoch, pool and worker it keeps the worker's measured and subsidized GMU. Nothing else
is needed to compute any allocation, and all of it is written when receipts are recorded, never at
the close.

## 4. The life of a receipt

A receipt is final when it is recorded. There is no pending state, no window and no overturn in R1:

- G0: `submitG0` derives the worker's instance, asks the profile's function for the expected
  output, and records the receipt with its verdict in the same transaction;
- G1: the adapter reports a submission that ERC-8414 has already settled; the settlement is the
  verdict (accepted), and the ledger decides the eligibility in the same transaction.

Work identity (the receipt), acceptance (the verdict) and reward eligibility (the eligibility code
and the subsidized GMU) are three records and are never merged (A27). A receipt that earns nothing
still exists, with the reason:

| Code | Name | Meaning |
| --- | --- | --- |
| 0 | eligible | counts toward the allocation |
| 1 | rejected | G0: the output was not the expected one |
| 2 | worker-not-admitted | the worker is not admitted for this epoch |
| 3 | self-dealing | G1: the worker is the tender's owner or its acceptance authority |
| 4 | delivered-before-genesis | G1: the work was delivered before this deployment's first epoch |
| 5 | declared-related-not-subsidized | G1: declared-related parties, in an epoch that does not subsidize them |
| 6 | bounty-asset-not-native | G1: the bounty is not in the chain's native currency |
| 7 | bounty-below-minimum | G1: the bounty is below the epoch's minimum |
| 8 | demander-cap | G1: the demander's subsidized receipts of the epoch are used up |
| 9 | pair-cap | G1: the (demander, worker) pair's subsidized receipts of the epoch are used up |
| 10 | worker-cap | the worker's GMU cap under the profile is reached for the epoch |
| 11 | demander-not-admitted | G1: the tender's owner is not admitted for this epoch |

## 5. The work profiles of R1

### 5.1 The seed: what it is for and what it is not

The first time an epoch is used - by `openEpoch()` or by its first receipt - the ledger captures
`seed = keccak256(domain, epoch, material)`, where `material` comes from the seed source the
deployment was built with: the previous block's hash (`PrevBlockSeedSource`, any EVM chain), or
the latest L1 block number and hash from the `L1Block` predeploy (`L1BlockSeedSource`, OP Stack
chains).

What the seed does: it makes every worker's instance of a job different from every other worker's
and from its own in any other epoch, so that an output cannot be copied from another worker or
replayed from another epoch or deployment.

What it does not do, and is never said to do (A22): it is not secure randomness. The material is
public before it is captured; whoever sends the capturing transaction chooses the moment and knows
the seed before anyone else (the test suite does exactly that); the block producer chooses the
material. Three problems follow for any G0 function with a real cost - timing, precomputation and
the splitting of one party into many addresses - and they are to be solved before a subsidy of any
value depends on a seed (section 13.6). In R1 they are harmless because the one function has no
cost worth saving.

### 5.2 What a G0 function must satisfy

A G0 profile's module implements `IG0Function`: `functionId()` and
`evaluate(epoch, jobIndex, worker, instance) -> (inputHash, expectedOutput)`, a view the ledger
calls. To be registered, a function has: a cost that does not depend on the seed (no seed is better
than another); an output that is a 32-byte digest (no small answer space to guess); a stated use
of its result; and it reverts for a job index it does not define.

A function verified this way is recomputed on chain, so its expected output can be read by anyone.
A correct output therefore proves that the output is correct. It proves no amount of computation,
and R1 never presents it as such (A19).

### 5.3 `g0.ref`: the audit of the previous epoch (`AuditV1`)

One job per worker per epoch. In epoch N the job is the audit of epoch N-1; in epoch 0 its subject
is the deployment's configuration.

```
subject(0)      = keccak256(domain, policy, seedSource, genesisTime, epochDuration)
subject(N)      = keccak256(N-1, digest(N-1), receiptCount(N-1), measuredG0, measuredG1, subsidizedG0, subsidizedG1)
inputHash       = keccak256(functionId, N, subject(N))
expectedOutput  = keccak256(instance, inputHash)
```

The reference client does the job in full (`pouw work`): it re-decides every receipt of epoch N-1
from primary data (section 12), derives the subject from its own result and submits. Its output is
accepted only if its independent recomputation equals what the ledger holds; if the two differ it
submits nothing and reports the differences. A submission names its epoch, so one that lands after
the epoch has turned reverts and spends nothing. One attempt per instance: a wrong output for the
epoch named is recorded as rejected and the instance is spent.

What an accepted receipt shows: an address was present in the epoch and submitted the right value
for its own instance. What it does not show: that the audit was carried out (the subject can be
read off the ledger), or any amount of computation. That is why the job carries a small fixed GMU,
and why every worker's G0 contribution in an epoch is the same.

### 5.4 `g1.tender`: real demand through ERC-8414 (`TenderAdapter8414`)

ERC-8414 is used as it is: a tender is minted and funded, a fulfillment submitted, and the tender
settles it - by its judge, by its verifier contract, or by default once the judgment window has
passed in silence. The bounty is paid by the tender's own vault. Acceptance, rejection and the
default are the standard's own acceptance and dispute path, and R1 adds nothing to it (A23). Once
a submission is `Accepted` the standard never changes it.

`bridge(tokenId, submissionId)` on the adapter turns one settled submission into one receipt:

- only the tender's owner can call it. Ownership of a tender and the right to judge it can be
  handed to any address without that address agreeing, so "who owns the tender now" is not
  evidence of whose demand it was: a worker could settle a tender of its own and push it onto
  another party. The owner's own call is the statement the ledger relies on - this was my tender,
  and it was settled. The standard does not expose who funded a tender, so nothing stronger can be
  read from it;
- it reverts unless the submission is `Accepted`;
- the facts it reports are read from the tender in the same call: fulfiller, owner (the demander
  of record), acceptance authority (the judge of record), the task hash the submission cites,
  the result hash, the bounty asset and amount, the time of delivery. The owner and the judge are
  therefore those of the moment of bridging. The standard keeps no state of who held either when
  the submission settled, and both can be handed on in between (section 7.5);
- a second call for the same submission returns the receipt that exists.

A default settlement is a settlement: it is counted like an acceptance once the demander confirms
it by bridging, and the audit reports how each tender settled (`judged`, `verified`, `default`).

What a G1 receipt shows: a settlement, confirmed by the tender's owner. It is not evidence that
the demand was independent of the worker (A24): two parties who agree to pretend are not detected,
and section 7.5 says what is and is not checked.

### 5.5 Who a participant is: keys and contract accounts (A37)

To the kernel a party is an address, and the address is the sender of the call: the worker of a
G0 receipt is whoever called `submitG0`; the demander of a G1 receipt is the tender's owner, who
must be the caller of `bridge`; the worker of a G1 receipt is the fulfiller the tender recorded.
Nothing else is read.

For a participant that is a key, that is the whole of it. For an agent whose identity on chain is
a contract account - a FOGA cell, any smart account - there are two addresses, and they are two
parties to the kernel:

| The call is sent | Worker of record of a G0 receipt | Can confirm a tender the account owns |
| --- | --- | --- |
| by the account, through its `execute(target, value, data)` | the account | yes |
| by the account's key, by itself | the key's address - another worker, with another instance, admitted or not on its own | no: `NotDemander` |

The reference client can send either way (`--account`), for an account whose key it may use. Work
done with keys alone is an operator-wallet integration: it shows the protocol working and says
nothing about the agent, whose account does not appear. An agent takes part as itself only when
its account is the sender - through the agent's own software, or through a delegation the account
has signed (section 13.9). The tests show both columns of the table (`test/account.test.js`), and
`scripts/identity-check.js` reads from a chain which of the two a given party is.

## 6. GMU

```
gmuMeasured   = baseGmu(profile)            for an accepted unit, else 0
gmuSubsidized = min(baseGmu, what is left of maxGmuPerWorkerPerEpoch)   when eligible, else 0
```

A unit is one accepted G0 instance or one settled G1 submission. *Illustrative* bases: `g0.ref`
10, `g1.tender` 50.

What the formula does not contain, on purpose:

- no tier factor: identity does not raise GMU (A20). The review's "uniformly 10000" is implemented
  as the absence of the factor; bringing one back is a new profile version, subject to review;
- no quality factor: nothing in R1 assesses quality (SIG, later);
- nothing declared by a worker about itself;
- no proportion to the bounty: a tender of 100 ETH measures what a tender of 0.001 ETH measures,
  so that money moved between two addresses does not buy GMU.

GMU measured is the record of work; it is kept for everything accepted, subsidized or not, and is
the input SIG will start from. GMU subsidized is what the allocation reads.

## 7. Epochs and the allocation

### 7.1 The clock

`genesisTime` and `epochDuration` are immutable. Epochs follow from the block timestamp; nobody
starts or ends one. Everything that governs an epoch is fixed before it begins: a profile or
parameter version, an admission and an operator declaration all take effect from a later epoch.
A version that is still ahead can be replaced until its epoch begins - a mistake can be corrected
in time - and never after.

### 7.2 Opening

Nothing has to be done to open an epoch. Its seed is captured by `openEpoch()` or by the first
receipt, whichever comes first; an epoch nobody uses has no seed and an empty ledger.

### 7.3 The close

An epoch is closed by time. Receipts are recorded only in the current epoch, so once the interval
has passed nothing can be added to it and nothing in it can change: the contributions and the
denominators are frozen by the clock itself.

This is how the review's requirement is met (A21): the global eligible contributions and the
denominator are fixed first - at the boundary, by construction - and only then is anything
allocated. Because the totals were kept as the receipts came in, there is no computation left for
the close: nothing to submit, no pages, no order of settlement, no bound on participants, and no
caller whose figures could be wrong.

`seal(epoch)` writes the close record - an event with the digest, the count, the parameter
version, the budget and the four totals. Anyone may call it once the epoch has ended; the next
epoch's first use calls it for the epoch before. It takes no figures and changes none; an epoch
that is never sealed has exactly the same allocation.

### 7.4 The allocation

For an ended epoch, per pool:

```
poolBudget(G0) = budget * splitG0Bps / 10000        poolBudget(G1) = budget - poolBudget(G0)
share(worker)  = min( poolBudget * c / T ,  poolBudget * workerCapBps / 10000 )
allocation     = share in G0 + share in G1
```

with `c` the worker's subsidized GMU in the pool and `T` the pool's total. Integer arithmetic,
rounded down. What the cap withholds, what rounding leaves and the budget of a pool nobody worked
in are allocated to nobody: there is no redistribution, so no worker's figure depends on another's
cap. `allocation(epoch, worker)` reverts while the epoch runs; `provisionalAllocation` gives the
same computation on a running epoch and says what it is.

The table is the same whoever reads it, in whatever order, before or after a seal. One thing does
depend on order, by design: the first-come caps of sections 6 and 7.5 are consumed in the order
the receipts were recorded - which is the chain's order, the same for every reader.

### 7.5 The G1 subsidy, apart from the settlement

A settled, bridged submission always yields a receipt with its measured GMU. Whether it is
subsidized is decided by these rules, in this order; the first that fails is the recorded reason:

| # | Rule | What it does not establish |
| --- | --- | --- |
| 1 | the worker is neither the tender's owner nor its acceptance authority, as the tender stands when it is bridged | that the worker does not control them through another address; and that the worker was not the judge when the submission settled - a worker that judged its own delivery and then handed the right to judge to somebody else passes this rule |
| 2 | the work was delivered at or after the deployment's genesis | - |
| 3 | the worker is admitted for the epoch | - |
| 4 | the demander is admitted for the epoch | that an admitted demander has demand of its own |
| 5 | the parties are not declared-related - the worker's declared operator is neither the demander's nor the judge's - or the epoch subsidizes declared-related parties | that undeclared parties are unrelated |
| 6 | the bounty is in the native currency | - |
| 7 | the bounty is at least `minBountyWei` | a cost: between two addresses of one party the bounty returns to the payer |
| 8 | the demander has fewer than `maxSubsidizedPerDemander` subsidized receipts in the epoch | - |
| 9 | the pair has fewer than `maxSubsidizedPerPair` | - |
| 10 | the worker is under the profile's GMU cap for the epoch | - |

Why admission on both sides (rule 4) and bridging by the owner (section 5.4): without them every
other rule can be passed for the price of gas by one admitted worker with fresh addresses - a
fresh address as the demander, or a settled tender pushed onto an admitted one. With them,
manufacturing demand takes two admitted parties who conceal their relation. That case is not
detected and is not claimed to be (A25); what bounds it is the fixed pool, the share cap and the
per-worker, per-demander and per-pair caps, and what guards it is the admission itself.

What rule 1 reads (A38). The owner and the judge are read when the tender is bridged, because
that is all the standard's state offers: ERC-8414 keeps no record of who held either at the
moment of settlement, and both can be transferred without the receiver agreeing. So the rule
catches a worker that still is the owner or the judge, and misses one that was the judge when it
accepted its own delivery and has handed that right on since; the tender's owner, another
admitted address, then confirms it. The test of row D17 shows that receipt being subsidized. What
bounds the case is what bounds any two parties who agree to pretend: the owner had to make the
worker the judge and had to confirm the tender, both have to be admitted, and the caps apply. The
tender's log has the whole history, and the audit reads it: for every G1 receipt
it reports who owned and who judged the tender when the submission settled, and lists as an
observation each receipt whose worker was that judge or that owner, or for which either changed
before the bridge (section 12). An observation changes no figure. With test points that cannot be
redeemed this is a stated boundary; before any subsidy of value the authority as it was at
settlement has to decide eligibility (section 13.8).

### 7.6 What the caps bind, and what they do not

Every cap binds an address. One party with several admitted addresses holds several caps: with
four it can take a whole pool against a 25 percent cap, and the tests show it (`D6`). Declaring
the addresses under one operator changes no figure in R1; it makes the concentration visible in
the audit report, which adds the table up per declared operator. An undeclared split is invisible.
The control in R1 is the admission list, and the G0 pool in particular is divided per admitted
address present, nothing finer. A cap per declared operator is a reserved design (section 13.4).

## 8. The test reward (A5, A26)

The allocation table is the whole of the reward. Test points are the value of a view function over
the ledger: no balance is kept, nothing is issued, transferred, approved, claimed, redeemed or
converted, and the contracts can neither receive nor hold funds. They simulate the Genesis Mining
schedule and carry no right to any future asset. If a later ruling ever relates them to anything,
it starts from the tables as a separate, reviewable step.

## 9. Duplicates, lateness, epochs and versions: the complete rules (A27)

| Case | Rule | Test |
| --- | --- | --- |
| The same G0 instance submitted twice | the second reverts (`AlreadySubmitted`); one receipt | D1 |
| A wrong output, then the right one | the wrong one is recorded as rejected and the instance is spent | D4 |
| Another worker's correct output | not this worker's instance: rejected | D4 |
| A G0 submission that lands after its epoch | reverts (`WrongEpoch`); nothing is spent | R10 |
| An output computed for a past epoch, submitted for the current one | not the current instance: rejected | R10 |
| The same settled submission bridged again, in the same or a later epoch | the existing receipt is returned; nothing is added | D2 |
| The same submission under a later profile version or a new adapter | the contribution id does not depend on the profile: the existing receipt is found, not recorded again | V6 |
| A settled submission never bridged under the old version | it can be bridged once under the version in force, and is measured under that version | V6 |
| Work delivered in one epoch, accepted in another, bridged in a third | one receipt, in the epoch it is recorded in, under that epoch's rules; earlier epochs do not change | R9 |
| Work delivered before the deployment's genesis | recorded, measured, not subsidized | D15 |
| A profile retired while work is under way | receipts recorded stay as they are; new submissions revert | V2 |
| A parameter or profile change during an epoch | applies from the next epoch; the running epoch keeps what it started with | V1, V3 |
| The same transaction replayed against another deployment or chain | another domain: other instances, other contribution ids | D3 |
| A second deployment beside the first | a separate ledger with its own history; the first is paused when the second takes over, so that no settlement is counted in both | V4 |
| A reorganization | the client reads logs up to the settled block and audits an epoch only once that block is past the epoch's end | R4 |

## 10. Policy changes, defaults, recovery, emergency, upgrade (A11)

| Concern | Rule |
| --- | --- |
| Defaults | an address with no admission is not admitted; an address with no declaration has operator 0; an epoch nobody uses is empty and allocates nothing |
| Versions | profiles and parameters are versioned; a version applies from a later epoch; one still ahead can be replaced until its epoch begins; one in force is never edited |
| Idempotency | recording is idempotent on the contribution id; `openEpoch` and `seal` do nothing the second time |
| A worker restarts | it runs the job again: accepted once, refused afterwards; nothing is counted twice |
| Nobody seals | nothing depends on it |
| The steward is gone | recording, sealing and auditing continue under the versions in force; nothing new can be registered or admitted. If the ledger was paused at that moment it stays paused, and the recovery is a new deployment |
| A module fails | a G0 function that reverts yields no receipt for its profile; other profiles are unaffected |
| Emergency | the steward can pause recording, immediately, and nothing else. While paused, G0 jobs of the running epoch cannot be submitted; settled tenders can be bridged afterwards |
| Upgrade | no proxy, no in-place upgrade: a new protocol version is a new deployment with its own manifest; the old one keeps its history |

## 11. Interfaces as built

```solidity
// GenesisLedger
function openEpoch() external returns (uint64 epoch);
function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash) external returns (uint256 id);
function recordG1(bytes32 profileKey, G1Facts calldata facts) external returns (uint256 id, uint8 ineligible); // the profile's adapter only
function seal(uint64 epoch) external;
function allocation(uint64 epoch, address worker) external view returns (uint256);            // ended epochs
function provisionalAllocation(uint64 epoch, address worker) external view returns (uint256);
function epochSummary(uint64 epoch) external view returns (EpochSummary memory);
function auditSubject(uint64 epoch) external view returns (bytes32);
function receipt(uint256 id) external view returns (Receipt memory);
function status(uint256 id) external view returns (Status memory);
function receiptOfContribution(bytes32 contributionId) external view returns (uint256);

// GenesisPolicy (state-changing functions: the steward only)
function registerProfile(string name, uint8 pool, address module, uint64 baseGmu, uint64 maxGmuPerWorkerPerEpoch, uint32 jobsPerEpoch, uint64 activeFromEpoch) external returns (bytes32 id);
function retireProfile(bytes32 key, uint64 fromEpoch) external;
function registerParams(Params calldata p) external returns (uint32 version);
function setAdmission(address worker, bool admitted) external;      // from the next epoch
function declareOperator(address party, uint32 operator) external;  // from the next epoch
function setPaused(bool paused) external;
function transferStewardship(address newSteward) external;  function acceptStewardship() external;

// TenderAdapter8414
function bridge(uint256 tokenId, uint256 submissionId) external returns (uint256 receiptId, uint8 ineligible); // the tender's owner only

// IG0Function (AuditV1)
function functionId() external view returns (bytes32);
function evaluate(uint64 epoch, uint32 jobIndex, address worker, bytes32 instance) external view returns (bytes32 inputHash, bytes32 expectedOutput);
```

These are all the functions that change state (`test/boundaries.test.js`). Events carry everything
an auditor needs: `EpochOpened(epoch, seed, seedMaterial, paramsVersion)`, `ReceiptRecorded(id,
epoch, worker, receipt)`, `ReceiptStatus(id, status)`, `EpochSealed(...)`, `TenderBridged(tokenId,
submissionId, receiptId, ineligible)`, and the policy's `ProfileRegistered`, `ProfileRetired`,
`ParamsRegistered`, `AdmissionSet`, `OperatorDeclared`, `PausedSet`.

## 12. The audit

`pouw audit <epoch>` needs a manifest and an endpoint; no key, no node of its own. For an ended
epoch it:

1. replays the policy from the policy's events as it applied to the epoch: parameters, profiles,
   admissions, operators;
2. reads the epoch's receipts and statuses from the ledger's events;
3. re-decides every receipt from primary data - G0: the instance from the captured seed, the
   expected output from the previous epoch's subject; G1: the tender's own log (who owned it, who
   judged it and which task it was bound to at the moment of bridging; that it was settled, and
   how), the immutable parts of the tender, and the rules of section 7.5 in order;
4. recomputes the digest, the totals, the subject and every worker's allocation;
5. compares each figure with the ledger and reports every difference. `ok` means none.

The report also says what the figures alone do not: the epoch's mode (`standard` or
`controlled-self-test`), the table added up per declared operator, the G1 receipts by relation
class and by the way they settled, and its observations. An observation is something the tender's
log shows and the ledger's rules cannot read (section 7.5): the worker judged its own delivery,
the worker owned the tender when it settled, or the judge or the owner changed between the
settlement and the bridge. Observations are listed per receipt, with whether the receipt was
subsidized; they are not differences and do not change `ok`.

A record names what it is in three fields that are kept apart: `environment` - `local-devnet`,
`public-testnet` or `mainnet`; `labels`, taken from the manifest, which say what kind of exercise
the deployment is (`controlled-self-test`, `operator-wallet-integration`); and the epoch's `mode`.
A standard epoch on a deployment whose parties all belong to one operator is still part of a
controlled self-test, and its record says both.

`pouw verify` is the check that comes before any audit means anything: that the contracts at the
manifest's addresses are this repository's code. For each of the deployment's five contracts it
compares the code on chain with the committed build (`build/`), the immutable values aside, and
with the code hash the manifest records; a manifest that leaves one of them out fails. It checks
that the contracts point at one another and at the manifest's ERC-8414 contract, that the clock is
the manifest's, and that the profiles in force name the manifest's two modules - so a module
registered later needs a manifest of its own. It reports, without judging it, who the steward is
and whether recording is paused. It needs no key.

How the chain is read. An epoch's figures can only be changed by transactions in blocks whose
timestamp lies inside the epoch. The client therefore asks one thing of finality: the settled
block - `finalized` by default - must be at or past the epoch's end; until then it stops with
"not settled yet". Logs are read up to that block. State is read at the latest block, and only
values the settled history has frozen. No call asks for an old state, so an ordinary full node is
enough. A public endpoint serves a log query over a limited range of blocks: the client reads in
ranges of the size the manifest names for its endpoint (`logChunk`), and reads a tender's history
from the block the tender was minted in, which it finds from the newest range backwards.

Two auditors who agree hold the same `tableHash`. The audit is a check: the ledger's view is the
source, and an audit that differs is a finding about the ledger or about the auditor's endpoint.

## 13. Deferred, with the designs kept for later rulings

Nothing below is implemented or tested in R1.

### 13.1 `g0.ver`: verification work

The design of v0.1.1 had a verifier commit during the challenge window of the receipt it verified
and reveal after it - while the verdict became final when that same window closed, so a finding
could never bear on the verdict it was about. The kept design removes the conflict instead of
tuning the window. Attested work goes through four disjoint intervals: work is submitted; sampled
verifiers commit their findings, and no verdict exists yet; findings are revealed; the verdict is
then computed once from what was revealed. A receipt has no verdict before the fourth interval
and is counted in the epoch in which that interval ends; there is no overturn, because nothing was
final before. Verifiers are assigned, do not choose their targets, and never verify work of their
own declared operator.

### 13.2 `g0.cal`: calibration

A calibration job earns the fixed GMU of doing the job and nothing for what it reports; the
reported capability is kept as a record apart from GMU, as input for SIG. It needs `g0.ver` to
mean anything, and follows it.

### 13.3 Paging

If allocations ever have to be written rather than read - to issue something, at P4 - the order is
the one the review gave: totals first, then allocation. In this design the totals are already
fixed at the boundary, each worker's figure is a pure function of them, and writing one worker's
figure can never change another's; a written-once marker per worker is all a paged procedure
would add.

### 13.4 A cap per declared operator (A35)

Ruled: before round R3. Keep, at accrual, the subsidized GMU per (epoch, pool, operator) for
addresses with a declared operator. Allocation: the operator's share is capped as an address's is
today, and divided among its addresses in proportion to their contributions. It stays a pure
function, O(1) per reading. It binds declared operators only: addresses of one party that are not
declared under one operator are not identified, by this cap or by anything else in the protocol.

The ledger cannot be upgraded, so the cap arrives with a new version of the contracts, deployed
beside the old ones: a new ledger with a new domain, its own manifest, and in that manifest the
name of the deployment it supersedes. The old ledger and every record made from it stay as they
are and stay auditable; nothing is migrated, because nothing is held.

### 13.5 A freshness window for bridging

A settled submission can be bridged at any later time and counts in the epoch it is bridged in.
Timing it is bounded by the per-epoch caps. A parameter limiting the age of a delivery at
recording is the kept option if that proves too loose.

### 13.6 A seed fit for a valuable subsidy

Before any G0 function with a real cost, or any subsidy of value: material that no party -
including the block producer - can know or choose before the work is committed (a beacon verified
on chain, or a commit-reveal among the participants); a capture time set by rule rather than by
whoever sends first; work that cannot be done before the capture; and an answer to one party
holding many addresses that does not rest on the admission list alone.

### 13.7 Receipts without the demander (A33)

In R1 and R2 a settled submission becomes a receipt only when the tender's owner confirms it. The
reservation of the ruling: work that has settled should be able to leave a receipt even when the
demander does nothing. The kept design gives the adapter a second entry, open to anyone, that
records a settled submission as a receipt which is measured and can never be subsidized, under an
eligibility code of its own; the owner's confirmation stays the only way to the subsidy. One
contribution still has one receipt: a receipt recorded without the demander is the receipt of that
submission, so the design has to say whether a later confirmation may raise its eligibility - the
one place where a recorded status would change - or whether an unconfirmed receipt is final as it
stands. That choice is the ruling to ask for.

### 13.8 The authority as it was at settlement (A38)

Before any subsidy of value, eligibility has to rest on who owned and who judged a tender when the
submission settled. State on chain cannot supply it: the standard keeps the present owner and
judge only. The evidence is the tender's own log, which has every change in order and which the
audit already reads (section 7.5). Two designs are kept. In the first, the confirmation states the
judge and the owner at settlement, the verification work of the following epoch checks every such
statement against the log, and a false statement loses the subsidy: it needs the verification
work of 13.1, and a verdict that is not final when recorded. In the second, only submissions
settled by a verifier contract from a registered set are subsidized: the submission's own record
says that it was machine-settled, which is fixed at delivery, but not by which contract, so this
too needs the log for the identity of the verifier. Neither is a rule a contract can apply by
itself; the first is the general one.

### 13.9 A delegation signed by an account (A37)

How an agent whose identity is a contract account takes part as itself without its key being
given to a second program. The account's owner signs one typed statement (EIP-712, bound to the
chain, the ledger and the account): this key may, until this epoch, submit my G0 work and confirm
my settled tenders. Anyone may register the statement; the ledger checks the signature - by
ERC-1271 when the account is a contract - and from then on a G0 submission and a confirmation
sent by the delegated key are recorded with the account as the worker and as the demander. The
delegated key can do those two things and nothing else: it holds none of the account's assets,
cannot make the account call anything, and pays its own gas. The delegation ends at its epoch and
can be ended earlier by the account or by a second signed statement. The one signature is the
owner's act: it is made once, offline, with whatever signs typed data for that key, and the key
is used for nothing else here - no transaction, so no nonce of a running node is touched.

What it does not change: an admission is still an address's, and the address is the account; a
relation is still declared per address; one instance per worker per epoch is the account's
instance, whoever sends. What it is not: a statement about the agent's software. The receipt says
that the account's owner authorized the work to be submitted in the account's name, not that the
agent's node did it. The fullest form - the agent's own software sending through the account,
within its own authorization and budget - needs nothing from this protocol and remains open to
any agent that builds it.
