# Genesis Mining MVP

The minimal runnable loop (A7) records work, verifies it, measures GMU, closes the epoch by time,
and exposes a recomputable test allocation.

| Step | R1 behavior |
| --- | --- |
| Work | The client performs work off chain and submits or bridges its result |
| Verify | G0 checks the reference output; G1 reads ERC-8414 acceptance; receipt eligibility is deterministic |
| GMU | Measured and subsidized GMU are recorded per receipt |
| Epoch | The clock freezes the contributions; no closing figures are submitted |
| Test reward | An allocation table is the value of a function, recomputable by anyone |

Implemented baseline: the kernel of design revision v0.1.2 and round R1, following the formal
review of v0.1.1 (`decisions.md`, A19-A30), as released in v0.1.3 with the tooling of round R2.
The review of v0.1.2 and of round R1 (A31-A39) changed no rule; v0.1.3 stated two boundaries more
exactly - who a participant is when its identity is a contract account (section 5.5), and what the
self-dealing rule reads (section 7.5) - and added three kept designs (13.7 to 13.9).
Documentation alignment: 2026-11-24 (design revision v0.1.4; `decisions.md`, A40-A54). This
alignment is not a new software release and does not claim an implementation beyond that
baseline. Design revisions v0.1.5 and v0.1.6 apply the reviews of v0.1.4 and of v0.1.5 (A55-A67)
in the executor's plans. In this document they add a note to 13.7 and update the pointer in
section 14; no rule, section number or acceptance row changes. Design revision v0.1.8 records the
owner's adoption of the advisor's recommendations on Q17 to Q29 (A70): here 13.7 says which of
its two designs is adopted, and the pointer in section 14 says that the plans are.

Sections 1-12 describe the existing contracts under `contracts/`, reference client under
`client/`, and tests under `test/`, with explicit pointers to the future production design.
The existing data structures, functions, receipt rules and allocation formulas remain unchanged.
Where the as-built description and the code differ, the code and its tests govern. Section 13
retains future designs, including the adopted work-fact design and proposals still awaiting a
ruling. Sections 14-15 describe production extensions and planned acceptance
work; none of their new fields, payment adapters, verification classes or services is implemented
or validated by R1. Figures marked *illustrative* remain examples (`decisions.md`, last section).

The owner's Q9-Q12 rulings have already been delivered to the executor and are recorded as
A33-A36. This alignment does not reopen them, infer missing deployment parameters, or expand R2
into a production-inference or Tokenomics release. R2 continues under its agreed execution scope.

The three errors the MVP is built to prevent, in the review's words: fake compute earning a
reward, non-real demand drawing the subsidy, over-engineering blocking the MVP. The third one
shaped this revision most: R1 has two profiles, two contracts of substance, no pending state and
nothing to submit at the close.

## 1. Scope

In R1 (implemented): G0 protocol work with one profile, `g0.ref`, verified by recomputation on
chain; G1 tender settlement with one profile, `g1.tender`, through ERC-8414, with the subsidy decided
apart from the settlement; one receipt type; GMU measured and GMU subsidized per receipt; epochs of
a fixed clock with parameters fixed before they begin; an allocation that is a pure function of
the ledger; the reference client with a worker's job and an independent audit.

Deferred, with the designs kept (section 13): `g0.cal` and calibration records, `g0.ver` and its
commit-reveal, challenge windows and overturns, any tier or quality factor, paging, a cap per
operator, the binding of the authority at settlement, a delegation signed by an account, node
attestations, the FOGA adapter. Work facts apart from receipts are adopted as design for the next
ledger version (P60, A70), in place of the earlier receipts-without-the-demander proposal; they
are not implemented in R1 either.

Outside implemented R1 (later milestones, A9): SIG, IPC, production routing, FCT, any balance,
claim or token, autonomous provider payments, stablecoin payment adapters, and production
inference measurement. Sections 14-15 establish their design relationship without implementing
them.

The production objective is a sustainable supply of useful intelligence, beginning with model
token usage that results in qualified delivery and economic value. R1 provides a generic
contribution ledger for that direction. Its G0 audit receipt demonstrates presence and a
conforming submission; it does not demonstrate compute expenditure. Its G1 receipt demonstrates
a settled tender confirmed by its owner; it does not establish independent demand or quantify
model-token production. A successful R2 accounting drill preserves these limits.

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

Additional production-design terms are used only in sections 14-15 and in the alignment notes.
They are not additional fields of `GenesisTypes.sol`.

| Term | Production-design meaning |
| --- | --- |
| Model token | A tokenizer-dependent unit of model input or output. It is distinct from a blockchain asset and has no universal intelligence value by itself |
| Qualified intelligent delivery | A service result that meets the profile's declared specification and acceptance conditions, with the required evidence available |
| Holder funding | Capital or spending authority supplied to a participant by its holder, through a wallet or an authorized provider account. It is funding, not service revenue or generated tokens |
| Payment autonomy | The agent can initiate, reconcile and renew authorized purchases within a spending policy; this does not establish that its revenue covers its costs |
| Operating self-sufficiency | The measured relationship between service income and operating costs over a stated period, with holder funding and subsidies shown separately |
| Supply control | The participant's degree of control over the compute and model service, from an external API to operated GPU/model infrastructure; this is separate from who pays |
| SIG | The planned versioned standard for measuring intelligence-production capability from calibrated, qualified service evidence |
| Production evidence envelope | A proposed versioned record of service, usage, acceptance, funding and settlement evidence, with availability and access rules and a possible on-chain commitment |

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
the epoch has turned reverts and records no receipt or GMU; transaction gas may still be charged.
One attempt per instance: a wrong output for the
epoch named is recorded as rejected and the instance is spent.

What an accepted receipt shows: an address was present in the epoch and submitted the right value
for its own instance. What it does not show: that the audit was carried out (the subject can be
read off the ledger), or any amount of computation. That is why the job carries a small fixed GMU,
and why every worker's G0 contribution in an epoch is the same.

### 5.4 `g1.tender`: real demand through ERC-8414 (`TenderAdapter8414`)

ERC-8414 is used as it is: a tender is minted and funded, a fulfillment submitted, and the tender
settles it - by its judge, by its verifier contract, or by default once the judgment window has
passed in silence. The bounty is handled by the tender's own vault, through payment or a credit
that must subsequently be withdrawn. R1 reads the accepted settlement facts; actual cash receipt
requires the corresponding transfer or withdrawal evidence. Acceptance, rejection and the
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

GMU measured is the record of accepted work under the registered profile; it is kept whether or
not the work is subsidized. GMU subsidized is what the allocation reads. In R1 a fixed `baseGmu`
is assigned to an accepted instance or submission. It does not measure token count, inference
throughput, model quality, energy, cost or independently purchased demand.

Future SIG calibration can use historical records only to the extent that their actual evidence
supports the measurement. Existing fixed-base receipts cannot be retroactively treated as
standardized token production. A future production profile needs richer evidence and a reviewed,
versioned measurement rule (section 14). Historical GMU and allocations remain unchanged; no
automatic GMU-to-SIG exchange, asset conversion or future-token entitlement follows from them.

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
| A G0 submission that lands after its epoch | reverts (`WrongEpoch`); no receipt or GMU is recorded, but transaction gas may be charged | R10 |
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

## 13. Future designs: adopted and awaiting rulings, not implemented

The retained designs in this section are not implemented or tested in R1. Section 13.7 is
adopted through P60 and A70; the other deferred choices retain their stated decision status.
Sections 14-15 add the production direction and its planned acceptance work. Neither a design
adoption nor its planned checks implement functionality or alter the as-built rules above.

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
demander does nothing. The design first kept (P40) gave the adapter a second entry, open to
anyone, that records a settled submission as a receipt which is measured and can never be
subsidized, under an eligibility code of its own; the owner's confirmation stayed the only way to
the subsidy. One contribution still has one receipt: a receipt recorded without the demander is
the receipt of that submission, so that design had to say whether a later confirmation may raise
its eligibility - the one place where a recorded status would change - or whether an unconfirmed
receipt is final as it stands. It is replaced by the design below.

The review of v0.1.4 set a condition on this design (A64): a record that anyone may make first
must not take the one contribution id of a piece of work, or a third party could record a settled
submission before its demander does and leave the demander's confirmation nothing to obtain.
Adopted by the owner on the advisor's recommendation (`decisions.md` P60, Q26, A70), in the form
the review of v0.1.5 asked to have written down before anything is built:

| Record | Who can make it | What it does |
| --- | --- | --- |
| Work fact | anyone, through the adapter, which reads the settlement from the tender and records what it read | a public trace that the work settled. It adds nothing to any total of any epoch and takes nothing that a reward depends on |
| Receipt | the tender's owner or its delegate, by confirming | the contribution: measured, with its eligibility decided, under the profile and the policy of the epoch in which the confirmation is recorded |

1. A work fact has an identity of its own and is recorded once. Its id is derived from the source
   of the work - the chain, the tender contract, the tender and the submission - in a domain of
   its own, so that it is not the contribution id. Recording the same settlement again, by anyone,
   returns the fact that exists and adds nothing.
2. A work fact consumes nothing. It does not take the contribution id. Under a production profile
   it does not take the content key by which a task unit is counted once
   (`production-service.md` 7). It uses up no cap and no counter. Otherwise the taking that A64
   forbids would only have moved.
3. A confirmation is linked to the same work by that source. A fact that exists does not stand in
   the way of a confirmation, and a confirmation needs no fact; either can come first, and a
   repeated call of either returns what exists. A receipt counts in the epoch in which the
   confirmation is recorded. No recorded status changes and no epoch that is frozen is rewritten.

What this gives up is said plainly. When the demander never confirms, the work has a public fact
and no receipt, and it is in no epoch's GMU, measured or subsidized. A work fact is never
reported as a contribution that was counted or as an eligibility that was confirmed. The adoption
rules on what was left open here (A70): such a trace is how the reservation of A33 is met, in the
first of the two ways that A64 allows, and settled work without its demander does not enter the
measured totals. The owner adopted it with that consequence named to him. The choice named above
falls away: an unconfirmed submission has no receipt whose eligibility could be raised.

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

## 14. Production extension design (not implemented)

This section aligns the production direction agreed on 2026-11-24. The maturity descriptions are
the owner's strategic direction, and the choices adopted through Q17-Q29 are design under A70.
Exact interfaces and the details left to implementation remain reviewable design work. No field,
adapter or acceptance case below is an existing function or an additional software release.
Nothing here changes `GenesisTypes.sol`, the R1 GMU formula, the native-asset subsidy rule, the
epoch calculation, or the deployed ERC-8414 contracts.

The executor's plans for carrying this section out are `production-service.md` (14.2 to 14.5) and
`supply-and-payment.md` (14.6 to 14.8). They add concrete choices, each put up for a ruling
(`decisions.md`, P42-P60). The reviews of v0.1.4 and of v0.1.5 corrected the plans (A55-A67); on
the questions the plans raise, the owner adopted the advisor's recommendations on 2026-11-24
(A70), and the choices are approved as design. Where a plan and this section differ, this section
governs.

### 14.1 Three stages, with three parts of Stage 1

This alignment supersedes the economic-stage numbering in `decisions.md` A17. It preserves A17's
source-interoperability principle: holder-funded services, agent-purchased services and operated
GPU/model services can participate together. A17 remains a historical approved decision, not an
illustration. The following five maturity segments are the current development description.

| Stage and segment | Funding and payment operation | Intelligence supply and maturity |
| --- | --- | --- |
| Stage 1, early: Startup | The holder buys model services with fiat and continues to top up or renew them manually | Non-independent startup. External model services supply intelligence; the cell uses the authorized account or quota to deliver work |
| Stage 1, middle: Development | The holder funds the agent's digital-asset wallet or authorizes and funds a fiat-billed API account. The agent purchases, pays and renews within that authority where the provider supports it | Semi-independent operation. External model services remain important; manual and agent-operated purchasing coexist |
| Stage 1, late: Pre-expansion | Development-stage funding and payment remain available | Most operation continues in the middle-stage form, while a small initial group operates its own GPUs and model services. Hardware/supply independence starts to appear; external model services remain the main supply |
| Stage 2: Expansion | Authorized manual and autonomous payment routes both remain usable | Operated GPU/model services supply intelligence at scale and meet the same published service specifications as other eligible sources. Mixed supply is allowed |
| Stage 3: Maturity | Cells increasingly perform authorized procurement, routing, budgeting, renewal and cost reconciliation as part of their own operation | Self-maintenance, self-repair and code-based replication support an autonomous operating economy. Diverse valuable services predominate, while basic model-token production continues to support them |

Stage 1 concentrates on the progression from model-token usage to qualified intelligent delivery
and then to economic value. Buying quota supplies the ability to consume a service; it does not
itself generate tokens, prove useful delivery, or earn a mining reward. More output tokens do not
by themselves demonstrate more useful intelligence.

The labels non-independent and semi-independent describe this development route. Reports retain
three separate dimensions so that a change in one is not mistaken for a change in all three.

| Dimension | What a report records | What it does not establish by itself |
| --- | --- | --- |
| Payment autonomy | Who authorizes, initiates, reconciles and renews purchases, and within what limits | That service revenue pays the bills |
| Operating self-sufficiency | Revenue actually received, costs incurred and paid, liabilities, holder funding and subsidies over a stated period | Control of the underlying GPUs or model service |
| Supply control | Whether service is external, operated on rented infrastructure, or operated on owned infrastructure, with the supporting evidence | Autonomous payment, profitability or independent demand |

No fixed percentage of autonomous payments, self-funded costs or GPU supply is introduced as a
maturity gate. The stages describe development and can overlap. Running a GPU is not an admission
requirement. A standard complete Finchain AI Node combines independent chain-state verification,
FOGA cellular capabilities, a PoUW work interface and the ability to provide measurable, qualified
intelligent deliveries. Production can use an authorized external model service. Chain-only and
work-only participants remain valid. Verification-node participation does not make every worker
a sequencer, change L2 consensus, or create a PoUW reward by itself.

These economic stages are separate from the project's P1-P4 milestones and R1-R4 execution
rounds. A completed R2 ledger test does not, by itself, complete a production maturity stage.

### 14.2 The first production profile

The proposed first production extension is a narrowly specified text-inference service. A working
profile name such as `g1.inference` identifies a future design, not a name registered by R1.
Its purpose is to connect an authorized request, model-service usage, qualified delivery,
acceptance and payment evidence in one reviewable record.

The initial specification should choose a bounded task class whose acceptance can be explained
and repeated, such as structured extraction against a published schema and a declared evaluation
procedure. A syntactically valid answer alone need not be a correct extraction. The specification
must state exactly what the evaluator checks and what remains a trust assumption. A controlled
fixture demonstrates that procedure; it is not evidence of external demand.

The first implementation can use G1 procurement by a customer or a designated test demander.
A later, separately specified G0 production profile can procure useful basic inference with a
finite public budget. That profile must identify the public purpose, the requested output, its
use, acceptance and expenditure limit. Generation without an identified use does not become
public work merely by consuming tokens. The existing `g0.ref` remains the ledger-audit/presence
profile. An independent paying customer is not a gate for every startup-stage work experiment;
controlled procurement validates its stated mechanism, while evidence from independent buyers
is needed for claims about commercial demand.

A production profile needs the following pinned choices before work is accepted under it.

| Specification | Required design decision |
| --- | --- |
| Service | Task class, input and output schemas, permitted modality, output and context limits, and completion conditions |
| Model and tokenizer | Model identifier and revision, tokenizer identifier and revision, relevant serving configuration, and the treatment of provider revisions that cannot be independently inspected |
| Execution | Sampling and decoding settings relevant to evaluation, timeout, retry policy, and whether exact replay or a specified evaluation procedure is expected |
| Quality | Published checks, any held-out evaluation conditions, acceptable partial results, refusal handling, and reasons for rejection |
| Service level | Availability and latency commitments, measurement boundaries, and consequences of incomplete service |
| Measurement | Usage categories, the source of every counter, billing semantics, and the rule for counting accepted service units |
| Verification | The evidence required, the verifier's authority, its independence assumptions, and the dispute/finality procedure |
| Finance | Who funds the model service, who buys the delivery, spending caps, accepted payment route, fees, refunds and settlement evidence |
| Evidence | Content format, hashing and signing rules, retention, retrieval, access control and the policy when required evidence is unavailable |

Hosted and operated-model suppliers may implement the same service profile when they satisfy its
specification. A declaration of equivalent service does not establish equal compute consumption,
equal hardware, or equal model internals. An opaque provider revision must be labelled as such.

Production inference executes off chain. Its verifier need not make the EVM rerun an LLM, and
`IG0Function.evaluate` is not repurposed as a cryptographic proof of inference. The choice of an
attestation, evaluation, proof or dispute mechanism is part of a new reviewed profile and adapter.

### 14.3 A proposed production evidence envelope

The current receipt has hashes but no token counters, model identifiers, provider invoices or
payment states. The following groups are a proposed versioned off-chain evidence envelope,
potentially anchored by a content commitment on chain. They are not a replacement Solidity
struct, a new ABI, or fields that an existing receipt can be assumed to contain.

| Proposed field group | Suggested contents and meaning |
| --- | --- |
| Domain and versions | `schemaVersion`, chain ID, protocol deployment, profile identifier and version, evaluator version, measurement-rule version |
| Work identity | Stable `workId`, request identifier, parent task or delivery identifiers, contribution role, worker, demander and any declared operator relationships |
| Service specification | Specification hash, model and tokenizer revisions, serving configuration, input commitment and requested limits |
| Supply provenance | External API or operated-model source, provider/endpoint identity, deployment evidence where available, and a label distinguishing declared from verified facts |
| Usage | Input, cached-input and output categories with explicit overlap rules; billable categories distinct from delivered-output categories; each counter's origin and observation period |
| Delivery | Output commitment, completion or failure status, start and finish observations, actual service-level measurements and any partial-delivery reference |
| Verification | Evaluator or attestor, checks performed, evidence class, verdict, stated limitations, dispute reference and finality status |
| Funding and procurement | Holder contribution or other source, authorized payer, account or wallet reference, budget and renewal-policy references, provider purchase/invoice identifiers |
| Payment and costs | Asset or currency, raw amount and precision, payer and recipient, fee components, payment state, transaction/provider references, credits, refunds and liabilities |
| Availability and integrity | Canonical encoding and hash algorithm, evidence locations, retention term, permitted auditor access, signatures where available and a missing-evidence status |

Exact field names and interfaces are proposals for the implementation review. Payment credentials,
private keys and provider API secrets never belong in an envelope or public manifest. Sensitive
prompts and outputs may use controlled-access evidence, but the report must disclose that a
public auditor cannot independently check the withheld content. A hash proves a commitment; it
does not guarantee that evidence is available or true.

Any production adapter must define how its envelope commitment, tender and receipt correspond,
including how retries, partial results and parent/child work are linked. This requires a reviewed
new adapter, registry or ledger version as appropriate; a side file alone does not alter R1's
verdict or its fixed-base GMU.

### 14.4 Measurement, qualification and future SIG

Keep four observations distinct: purchased quota, measured service usage, accepted delivery and
economic settlement. A top-up or token allowance is purchased capacity to use a service. It is
not measured output and is not interchangeable with an accepted delivery.

Usage measurement must identify the tokenizer, model/service revision and counter source. Input,
cached input, generated output, delivered output and provider-billed categories need explicit
definitions. Categories that overlap must not be added as if they were disjoint. An incomplete
request may incur a cost even when no delivery qualifies for contribution credit.

The proposed production rule first determines whether the delivery meets the profile, then
records its qualified service units with the corresponding measurement version. It must not
reward extra verbosity, repeated output or repeated requests simply because their raw token
count is larger. A requester-funded service and protocol-funded benchmark work need separate
purpose and eligibility labels.

SIG is the future calibration of intelligence-production capability from comparable evidence.
Model class, quality, throughput, latency and verification assumptions can be reported separately
before a reviewed method permits any normalization. Different models' raw token counts have no
automatic universal exchange rate. A general task can contain several qualified inference
services and additional orchestration or verification work; its whole value need not be reduced
to generated-token count.

GMU continues to identify contribution under a versioned reward rule. A future rule may use
qualified production units and other eligible roles, but it needs its own specification and
implementation. The R1 formula in section 6 remains unchanged. Neither old GMU, future SIG nor a
provider usage counter creates a redeemable balance or a right to a platform token.

### 14.5 Verification classes and their limits

The following proposed classes distinguish the claim supported by evidence. They are not an
automatic ranking or rewards schedule, and none is implemented by R1 for production inference.

| Evidence class | What it can establish under its stated assumptions | What it cannot establish on its own |
| --- | --- | --- |
| Declared usage | What the worker or operator reports | Independent usage, correct inference, owned GPUs or useful demand |
| Provider-attested usage | What an identified provider attests it served or billed, with a signature or authenticated record when supported | A cryptographic proof of model execution, worker-owned hardware, independent demand or qualified output |
| Independently evaluated delivery | Results of the specified checks on available inputs and outputs, performed by the named evaluator | Every internal model operation, every claimed token or universal semantic correctness beyond those checks |
| Execution-evidenced delivery | Execution claims supported by a specific reviewed proof or attestation system and its trust assumptions | Whether the customer needed the result, whether the service was profitable, or facts outside the proved statement |

A production profile names the combination it needs. For example, provider usage can support
cost reconciliation while an independent evaluator supports acceptance. These are separate
claims. A provider's signed usage statement is not presented as cryptographic proof of inference
or evidence that the worker runs a GPU.

Rewarded verification is a later work role with an assigned verification target, distinct work
identity, timing rules and budget. It must not reward a verifier merely for copying a verdict
that was already public. Known operator relationships must be visible; undeclared relationships
and collusion remain explicit limitations. The proposed mechanisms in section 13 require their
own review before they govern valuable rewards.

### 14.6 Procurement, authorization and payment

Both procurement routes are part of the design: digital assets from an authorized agent wallet,
and fiat-billed service through an account authorized by the holder. A fiat route can mean an
agent buying or renewing service within an existing funded or billed provider account; it does
not imply that every provider permits autonomous card entry, account creation or arbitrary
payment automation. Each adapter must declare the operations its provider actually supports.

The purchasing policy records who funds the account, who may spend, permitted providers, account
or wallet boundaries, per-request and period budgets, renewal conditions and escalation rules.
Human payments and agent payments may coexist in the same deployment. Authorization is preserved
through procurement, retries, renewal and recovery.

The proposed payment record distinguishes at least the following meanings; the final state
machine is adapter-specific and is not an existing R1 interface.

| State meaning | Required evidence or action |
| --- | --- |
| Authorized or reserved | An applicable spending authority and available budget; no payment is yet claimed |
| Initiated | A transaction or provider payment request exists; retain its stable identifier |
| Pending or unknown | The payment has not reached the required confirmation, or the response was lost; reconcile before retrying |
| Settled or captured | The required on-chain finality or provider settlement/capture evidence exists under the declared policy |
| Service credit available | The provider has made quota or credit usable; record this separately from money leaving the payer |
| Refunded, credited or disputed | A reversal, refundable amount, internal credit or unresolved liability remains linked to the original payment |

Payment initiation is not settlement. A provider credit becoming available is not inference
delivery. An ERC-8414 `Accepted` submission may leave withdrawable credit; actual customer
revenue is established by the corresponding transfer or withdrawal evidence, not by the
acceptance label alone. These states must remain visible when service, payment and chain
finality happen at different times.

Production evidence and subsidy support for stablecoin or other ERC-20 settlement require future
adaptations. Existing ERC-8414 asset features do not implement those PoUW production adaptations.
Their design identifies the chain,
asset contract, raw integer amount, decimals, permitted token behavior, payer, recipient and
transfer evidence. Issuer-native and bridged representations are distinguished in the manifest;
an asset name alone does not establish provenance, support or equivalence. Any fiat conversion
used in reporting records its source and observation time. The current G1 rule still treats a
non-native bounty as ineligible for subsidy (code 6); these documents do not change it.

Paying for a service with a stablecoin does not change the chain's gas asset. The operating budget
must include transaction gas and any explicit sponsorship arrangement. No production payment
flow is routed through a test-point balance: R1 has no such balance or payment function.

### 14.7 Contribution roles, budgets and economic reports

Production economics retains three separate records: customer service payments, protocol-funded
work or subsidies, and holder-supplied capital. Simulated points remain a fourth, non-monetary
record and are never presented as cash revenue.

| Future work role | Acceptance basis | Who supplies the budget |
| --- | --- | --- |
| Intelligence producer | Qualified service delivered under its profile | Its customer or an explicitly purchasing protocol program |
| Agent or cell fulfiller | An accepted task or agreed orchestration service, with linked underlying work | The task's demander |
| Verifier or dispute participant | The separately specified verification or resolution work and its final result | A reserved task fee or a named protocol budget |
| Public-service provider | An explicitly procured audit, availability, maintenance or other public service | The responsible public-service budget |

The same cell may perform more than one role. Its receipts identify each role, parent/child work,
funding purpose and deduplication key so that a supplier's inference and a fulfiller's completed
task are distinguishable. Multiple real services can be paid, while the same contribution cannot
be repackaged to claim the same subsidy repeatedly. Unused or rejected work retains its cost
record without automatically becoming an eligible contribution.

Self-maintenance, self-repair and replication support cellular completeness. They do not, merely
by occurring, authorize a public reward. If a maintenance or replication service is purchased,
its buyer, budget, accepted outcome and authority must be explicit. A cell's replicas receive
distinct identities, scoped authorization and resource budgets; creating replicas does not
create independent demand or evade operator-level rules.

An operating report covers a stated period and separately reports customer cash received,
receivables, provider charges, unpaid liabilities, refunds, inference costs, verification and
orchestration costs, chain fees, hosting/hardware costs, holder contributions and subsidies.
Where assets or currencies differ, native amounts remain available alongside any justified
conversion. It distinguishes cash flow from costs incurred and identifies omitted costs.

This report evaluates revenue coverage and dependence on external funding. It does not infer
profitability from a token count, a GMU balance, a platform-token price or a successful automatic
renewal. No emission formula, future token price, fixed return, guaranteed margin or automatic
conversion is approved here. Tokenomics must later identify its own budgets, obligations and
asset rules without rewriting historical test allocations.

### 14.8 Failure recovery and evidence availability

The proposed production implementation must recover the work and financial state together.

| Failure | Required design behavior |
| --- | --- |
| Insufficient budget, gas or authorized quota | Decline or pause the purchase according to policy, preserve the request state and report the shortfall; do not infer credit or expand authorization |
| Provider unavailable or a model revision changes | Apply bounded retries or route only to an eligible source whose specification and evidence requirements are satisfied; record the actual source and revision |
| Request times out after the provider accepted it | Reconcile its stable request identifier and billed usage before buying the service again; mark uncertainty explicitly |
| Payment response is lost or transaction remains pending | Reconcile the existing payment, account balance and receipt before any resubmission; preserve nonce/provider-id idempotency as appropriate |
| Work is incomplete, refused or rejected | Preserve partial evidence and incurred cost, apply the agreed acceptance/refund rule, and avoid counting it as a qualified full delivery |
| Payment and delivery complete in different orders | Keep both state machines and their references; do not report both as complete because one succeeded |
| Required evidence cannot be retrieved | Mark the delivery unauditable under that profile and withhold the corresponding verified qualification until its rule is satisfied |
| A cell crashes or repairs itself | Resume from durable work, payment and authorization records; retain prior evidence and prevent duplicate purchase, recording or reward |
| A cell is replicated | Initialize a separate identity and scoped budget through an authorized procedure; retain lineage without copying signing secrets or duplicating earlier contributions |
| Chain history reorganizes | Reconcile chain-derived state with the configured finality policy; preserve records of external purchases that cannot be rolled back with the chain |

No current `pouw` command is claimed to implement these production behaviors. Existing R1
recovery and finality rules remain those of sections 9-12.

## 15. Planned production acceptance and execution sequencing

Every row below is planned and not run as part of R1 or this documentation alignment. Adoption
of the design under A70 is not evidence that a row has run. These rows are not additions to the
69 tests and 16 local-run checks reported for round R1, nor to the tests
and the 37 rehearsal checks added for round R2 in v0.1.3. A later implementation
must report the actual environment, versions, data source, parties, finance mode and evidence
for each completed row.

| Planned check | Expected observation | Status |
| --- | --- | --- |
| Manual startup funding and renewal | A holder's manual fiat purchase/renewal makes service available; later usage and delivery are recorded separately from the top-up | Planned; not run |
| Authorized agent wallet procurement | An agent purchases and reconciles supported digital-asset service within its scope and budget; pending and failed payments remain distinguishable | Planned; not run |
| Authorized fiat-account procurement | An agent purchases or renews through a supported fiat-billed API/account within the holder's authority; unsupported provider actions are reported rather than assumed | Planned; not run |
| Manual and autonomous coexistence | Both routes operate with attribution and reconciliation; a manual top-up is not reclassified as autonomous income | Planned; not run |
| Qualified inference delivery | The chosen service profile records model/tokenizer versions, usage categories, output, evaluator findings and accepted service units | Planned; not run |
| Mixed-source service | External and operated GPU/model suppliers are assessed against the same selected service specification, with source control and evidence classes stated separately | Planned; not run |
| Declared usage limitation | A worker's declaration and provider-attested usage are not misreported as a proof of inference or GPU ownership | Planned; not run |
| Customer cash receipt | Acceptance, credit owed, withdrawal and actual receipt are reconciled; gross service amounts, fees and refunds remain identifiable | Planned; not run |
| Cost and autonomy report | The cell produces a period report that separates payment autonomy, revenue coverage and supply control, including holder funding, liabilities and operating costs | Planned; not run |
| Multiple contribution roles | Producer, fulfiller and verifier contributions link to their funding and work without duplicate subsidy for the same contribution | Planned; not run |
| Unknown payment result and restart | A crash or timeout is reconciled without duplicate purchase or an invented success state | Planned; not run |
| Repair, replication and authorization | Recovery preserves obligations and evidence; a replica has its own identity and budget and does not duplicate past contributions or inherit unrestricted authority | Planned; not run |
| Missing evidence and source change | The report exposes unavailable evidence and changed model/service assumptions; qualification follows the declared profile rule | Planned; not run |
| Related-party demand | Controlled self-tests remain labelled; no collection of addresses, signatures or transfers is presented as proof of all-party independence | Planned; not run |

Payment simulation, sandbox billing, testnet assets and mocked providers may establish specific
technical behaviors. Every such run must say which facts were simulated. They do not establish
real revenue, a live provider payment integration, external demand, economic self-sufficiency or
production-model performance. A real provider charge likewise does not prove independent
customer demand or a profitable service.

The same rows, with identifiers, the items of `decisions.md` A54 they belong to and the production
increment planned to run each, are in `acceptance-matrix.md`, section 11.

R2 continues first as the already-approved Finchain Sepolia ledger and audit round. Its public
evidence is scoped to the functions it actually exercises. The production extension adopted as design is
then specified and implemented as a separately reviewable increment, starting with one bounded
inference profile, a supported procurement route, its evidence envelope and an operating report.
Additional providers, stablecoin settlement, richer verification, SIG calibration and platform
economics expand from that evidence rather than being assumed complete by the generic loop.

The protocol remains in `finchain-pouw`. Finchain supplies the deployment environment and records
verified integration versions. FOGA and other agents participate through their existing approved
capabilities or later optional adapters. This alignment authorizes no FOGA release, ERC change,
mainnet deployment, token issuance, or change to the chain's consensus or sequencing.
