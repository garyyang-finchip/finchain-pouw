# Supply and Payment Interfaces: Plan

Design revision v0.1.7, after the reviews of v0.1.4, v0.1.5 and v0.1.6 (`decisions.md` A55-A69).
This is the executor's plan for the supply and payment interfaces: deliverable C of the alignment of
2026-11-24 (A54), carrying out `genesis-mining-mvp.md` 14.6 to 14.8 and `architecture.md` 5.3. It
covers the source of supply, the execution of payment, the source of funds and the scope of
permission, in one form shared by manual and autonomous operation; and what happens when quota
runs out, a renewal fails, the state of a payment is unclear, a request is duplicated, or a
service has to recover.

Nothing here is built, and nothing here changes round R2. The review of v0.1.4 required
corrections before this plan can serve as an implementation specification (A58, A62): a purchase
is not one state but three records that move independently - the payment, the service credit and
the adjustments (sections 3 and 4); what "settled" means is stated per payment channel (4.1); a
purchase by an agent reserves its budget atomically before anything is sent (4.3); the report
reconciles what was prepaid, what was consumed and what was paid out, and adds none of them twice
(section 8); and the wording on assets and on x402 is made exact (section 9). The review of
v0.1.5 asked for one level more before the second increment is coded: a purchase is an intent,
the payments tried for it are attempts, and each attempt has its own record on its channel; and
after a crash every reservation that is not finished is taken up, whatever status its purchase
shows (sections 3, 4 and 4.3). They are applied here. On the questions this plan raises (Q24,
Q28) the advisor's recommendations are recorded with the questions, and the owner's adoption of
them is pending (`decisions.md` 12, and A66). What this repository adds on its own judgment is
marked as a proposal (P56, P57). Where this plan and `genesis-mining-mvp.md` 14 differ, that
section governs. Where the text says "is", read "is proposed to be".

## 1. Four flows of money, kept apart

| Flow | From, to | What it is | In the first increment |
| --- | --- | --- | --- |
| Holder funding | the Holder, to the worker's account, wallet or provider account | capital, or authority to spend. Not revenue and not generated tokens | a person pays a provider with fiat, by hand |
| Procurement | the worker's side, to the provider of the model service | cost of production | the same purchase, seen from the cost side |
| Customer payment | a customer, to the worker, for an accepted delivery | service revenue | the tender's bounty, in the chain's native asset |
| Protocol funding | a named protocol budget, to a role it procures or subsidizes | subsidy or public procurement | none of value: test points are a simulation and are reported as a count, never as money |

Gas is a cost of its own in every flow that touches the chain. A report that adds two of these
flows together, or shows one as another, is wrong by construction (A49).

## 2. The three operating dimensions, and where each is recorded

| Dimension (A42) | Recorded as | In |
| --- | --- | --- |
| Payment autonomy | who decided, who authorized, who executed and who renewed each purchase, and under which policy | the purchasing policy and the purchase records (sections 3 and 4) |
| Operating self-sufficiency | revenue actually received against costs incurred and paid over a stated period, with Holder funding and subsidy shown apart | the operating report (section 8) |
| Supply control | whether the service is external, operated on rented infrastructure or operated on owned infrastructure, with the evidence there is | the supply source record and the provenance group of each envelope |

The three are reported side by side and never as one figure. An account that renews itself can
still live on fresh Holder funding; an operated GPU can still lose money; a profitable service can
buy all its inference. Each combination is valid and each is recorded as what it is.

## 3. What a worker's side keeps

Proposed (P48, P56, P57). The records are JSON documents the worker's side keeps and reports; none
of them is a contract field. They are the same whether a person or an agent acts, which is what
lets the startup and the development forms share one interface. The first increment keeps four:
supply source, purchasing policy, purchase, funding. The second adds a fifth, the budget book,
which an agent's purchases need (4.3).

**Supply source** - what the worker can deliver from.

| Member | Meaning |
| --- | --- |
| `id` | the worker's name for the source |
| `specification` | the service specification it can serve (`production-service.md` 3) |
| `mode` | `external-service`, `operated-rented`, `operated-owned` |
| `provider` | who is upstream: a name and an endpoint class. Never a credential |
| `quota` | the provider's own unit of account - a balance, an allowance, a rate; what is left of it, if it can be read; as of when; its expiry |
| `authorization` | whether the provider's terms allow the service to be passed on to third parties: `obtained`, `not-obtained`, `not-applicable` |
| `evidence` | what supports the stated mode: an invoice, a deployment record, or `declared` |

**Purchasing policy** - what may be bought without asking.

| Member | Meaning |
| --- | --- |
| `fundedBy` | who funds the account or the wallet |
| `spender` | who may spend: `operator` or `agent` |
| `providers`, `specifications` | what may be bought, and from whom |
| `boundary` | the account or the wallet the policy is limited to |
| `perRequest`, `perPeriod` | the budgets, per asset or currency; the period by its start and its length; and the budget that fees are charged to |
| `renewal` | the conditions under which a renewal may be made |
| `escalation` | what happens at the limit: `decline`, or `ask-holder` |
| `validUntil`, `grantedBy` | the policy's term, and the Holder that granted it |

**Purchase** - one purchase or renewal. Its state is three parts that move independently
(section 4).

| Member | Meaning |
| --- | --- |
| `purchaseId` | the stable identifier of the purchase as an intent - this credit, bought once - chosen before anything is sent. It stays through every attempt |
| `source`, `policy` | the supply source bought for; the policy it was bought under |
| `decidedBy`, `executedBy` | `operator` or `agent`, each |
| `route`, `channel` | `manual-fiat`, `agent-wallet` or `agent-fiat-account`; and the payment channel with its mechanism, as the adapter pins it (4.1) |
| `asset`, `amount` | a currency, or a chain and an asset contract; the raw amount and its precision |
| `attempts` | the payments tried for this purchase, in order and one at a time; each with its `attemptId`, its own status and its record on the channel (section 4) |
| `reservation` | on an agent route, the entry in the budget book (4.3) |
| `payment` | its status, read from the attempts (section 4); for each status reached, the reference that supports it and the time it was observed |
| `credit` | its status; the quantity made available, used and left, in the provider's unit of account; as of when; its expiry |
| `adjustments` | a list: what changed afterwards, each entry with its kind, its amount, its reference and its time |
| `fundingSource` | `holder`, `service-revenue`, `protocol`, or the shares of each where the worker can tell; otherwise `undeclared` |

**Funding** - what the Holder put in: the amount, the asset or currency, the date, the account or
wallet it went to, and its evidence.

**Budget book** - on an agent route: per boundary, asset or currency and budget period, the limit,
what is held and what is consumed, each entry under the `purchaseId` it belongs to (4.3).

An adapter implements a route. What an adapter has to declare is fixed now, before any provider
is chosen, as the review recommends (Q24); the providers are chosen when the second increment is
opened:

| An adapter declares | Content |
| --- | --- |
| Operations | for each of: read the quota, quote, buy, renew, read the state of a payment, confirm that credit arrived, read adjustments - `supported`, or `unsupported` |
| Channel | the payment channel and its mechanism, pinned by version; which of its stages the adapter records as `settled`, and by which evidence (4.1) |
| Idempotency | the identifier the channel accepts for one attempt, or that it accepts none; and whether the same attempt can be sent again without a second charge |
| Release | the rule, if the channel has one, by which an amount that was held is free again |
| Authorization | the scope of the account or the wallet it acts in, and what it can never do there |

An operation an adapter does not support is reported as unsupported, never assumed. No provider is
presumed to support a top-up without a person. A fiat route means buying or renewing inside an
account the Holder has authorized and funded; it does not mean that a provider lets an agent enter
a card or open an account.

| Route | Who acts | Increment |
| --- | --- | --- |
| `manual-fiat` | a person buys and renews; the worker's side records what the person reports | first |
| `agent-wallet` | the agent pays in a digital asset from a wallet its Holder funded | second |
| `agent-fiat-account` | the agent buys or renews through a fiat-billed account its Holder authorized | second |

Both kinds of route can run in one deployment, and one worker may have a source of each. A manual
top-up is never reclassified as an autonomous purchase or as income.

## 4. The state of a purchase: three records

The review's correction (A58): one field cannot hold what is true of a purchase. Money can have
been taken while the credit has not arrived; credit can be half used while part of the money
comes back; a service can stay usable while its payment is disputed. A purchase record therefore
has three parts, and each moves on its own (P56):

| Part | Values | What it answers |
| --- | --- | --- |
| `payment.status` | `authorized`, `initiated`, `pending`, `unknown`, `settled`, `failed` | where the money is, by the rule of the channel it went through |
| `credit.status` | `not-available`, `available`, `partly-used`, `exhausted`, `lapsed` | whether what was bought can be used, and how much of it is left |
| `adjustments` | entries of kind `partial-refund`, `full-refund`, `credit-reissued`, `dispute` | what changed after the payment or the credit was first recorded, and by how much |

The payment:

| Status | Reached when | The reference to keep |
| --- | --- | --- |
| `authorized` | the policy covers the purchase and, on an agent route, its amount is held in the budget book (4.3). No attempt is open: none has been written yet, or the last one failed definitely and another may follow | the policy; the reservation |
| `initiated` | an attempt was written, with its identifiers on the channel. It may have been sent: from here on the purchase counts as possibly paid | the attempt and its identifiers |
| `pending` | the channel has the open attempt and has not finished with it | the channel's own state as returned; the transaction that was broadcast, where there is one |
| `unknown` | the answer to the open attempt was lost, or the channel cannot say | the attempt's identifiers: reconcile on them before anything else |
| `settled` | one attempt met the channel's rule for settlement (4.1). A purchase has at most one | the evidence that rule names |
| `failed` | the purchase was closed without a payment: its last attempt failed definitely and no other will be made | the evidence of each attempt's failure |

`pending` and `unknown` are different: the first is the channel's answer, the second is the
absence of one. Nothing leaves `settled` or `failed`; what happens to the money afterwards is an
adjustment, linked to the purchase, with its own amount.

A purchase and the tries at paying for it are kept apart, as the review of v0.1.5 asked (Q28).
v0.1.5 gave a purchase one identifier on its channel, made `failed` final and let a retry reuse
the purchase's identifier; real payments cannot satisfy all three. Three levels:

| Level | What it is | Identified by |
| --- | --- | --- |
| Purchase | one intent: this credit, bought once | `purchaseId` |
| Attempt | one try at paying for it | `attemptId`, mapped one to one to what makes the try unique on its channel: an idempotency key, the nonce of a signed authorization, or the sending account with its nonce |
| Channel record | what the channel returned for that attempt | the provider's identifiers and states, as returned; every transaction hash that carries the attempt |

An attempt has a status of its own: written, pending, unknown, settled or failed. A transaction
sent again at the same nonce with a higher fee is the same attempt with one more hash, and at
most one of the hashes can be included. A new nonce, a new signed authorization or a new
idempotency key is a new attempt. An attempt that failed is final as an attempt; the purchase
goes on only by a new one, under the rules of 4.3, and neither is a second purchase.

The six meanings of `genesis-mining-mvp.md` 14.6 (A50) all stay apart, now across the three parts:

| Meaning | Recorded as |
| --- | --- |
| Authorized or reserved | `payment.status` `authorized`, with the reservation |
| Initiated | `payment.status` `initiated` |
| Pending or unknown | `payment.status` `pending`, or `unknown` |
| Settled or captured | `payment.status` `settled`, the channel's own state saying which of the two it was |
| Service credit available | `credit.status` `available` |
| Refunded, credited or disputed | an entry in `adjustments` |

States that hold together, and are recorded together:

| What happened | `payment.status` | `credit.status` | `adjustments` |
| --- | --- | --- | --- |
| The money was taken and the credit has not arrived | `settled` | `not-available` | none |
| Half the credit was used and part of the money came back | `settled` | `partly-used` | a `partial-refund`, with its amount |
| The service is in use and its payment is disputed | `settled` | `available` or `partly-used` | a `dispute`, open, with the amount in dispute |
| The answer to a payment was lost and the quota reads higher | `unknown` | `available` | none. The open attempt is reconciled on its identifiers; the credit that appeared is evidence to weigh and does not settle it |

Initiation is not settlement, settlement is not credit, and none of them is a delivery. On the
manual route the same records are entered from what the person reports, the provider's receipt
and the quota read back, and the report labels them so.

### 4.1 What "settled" means, by channel

A payment channel has up to four stages, and channels differ in which of them exist and in when
money has moved for good. The adapter of a route pins its channel and declares which stage it
records as `settled`, and by which evidence. Beside the status, the record keeps the channel's
own state as the channel returned it.

| Stage | A transfer the payer sends on chain | A signed authorization that another party settles on chain | A card or a billed account at a provider |
| --- | --- | --- | --- |
| Authorization | none of the channel's: the payer sends the transfer itself, under its policy | the payer signs. Nothing has moved, and the amount can be taken until the authorization is used or lapses | the provider or the network holds an amount. Nothing has moved for good |
| Capture | the transaction is in a block | the settling transaction is in a block | the provider captures the amount |
| Settlement | that block has the finality the policy names | the same, for the settling transaction | the provider's or the network's own settlement, as its statement or invoice shows |
| Later adjustment | a separate transfer back; the first is not undone | a separate transfer back | a refund, a reversal or a dispute, which can come long after |
| State to keep as returned | the transaction, its block, the finality that was read | the identifier and the validity of the signed payload; every answer of the settling party; the transaction | the provider's identifiers and status values; the invoice or the statement |

A stage that a channel does not have is recorded as absent, not as passed. A capture that has not
met the declared rule is `pending`. On the manual route a person's report and the provider's
receipt stand where the adapter's reading would, and are labelled so.

### 4.2 The service credit

Credit is counted in the provider's own unit of account - a balance, an allowance, a number of
requests - and is not converted here. It is `not-available` until the provider makes it usable;
`available`; `partly-used` and `exhausted` as it is drawn, from the worker's own usage records and
from the quota read back, each labelled with its origin; `lapsed` when it expired or the provider
withdrew it. A quantity that could not be read is recorded as not observed and never as zero. A
`credit-reissued` adjustment makes credit available again without a new payment. Credit becoming
available is not a delivery, and a top-up is never production (A40).

### 4.3 The budget book: a reservation before a purchase

For the agent routes, in the second increment. To check that a budget has room and then to buy is
not enough: two requests can read the same room at the same moment and both spend it (A58).
Proposed (P57):

1. One book per boundary of a policy, asset or currency, and budget period. It holds the limit,
   what is held and what is consumed, each entry under its `purchaseId`.
2. A reservation is atomic: testing the room and holding the amount are one operation on the
   book. Where the worker's side is more than one process, the book is the one durable place they
   all pass through; two copies of a book are not a book. The per-request budget is tested in the
   same operation.
3. The order is: the reservation; then, before each sending, the attempt, written durably with
   its identifiers on the channel; and only then the sending. After a crash the record of a
   possible payment therefore exists before the payment could have, whatever status the purchase
   still shows.
4. The reservation is held for the purchase through all its attempts. A payment that is `pending`
   or `unknown` keeps it: it counts as possibly made.
5. An attempt whose result is unknown is reconciled on its identifiers, or sent again as the same
   attempt where the channel makes that harmless. No second attempt that could also succeed is
   opened beside it.
6. A new attempt is opened only when the one before it has failed definitely: the channel's own
   evidence that nothing was taken and that nothing can still be taken under its identifiers -
   a signed authorization whose validity ended unused or that was cancelled, a nonce used up by
   another transaction, a provider's definite refusal. The budget is tested again when the new
   attempt is opened. A timeout is not such evidence.
7. A purchase has at most one payment that settles. What a failed attempt cost - the fee of a
   transaction that reverted, a charge the provider kept - is recorded as a cost of the purchase.
   It is not a second purchase.
8. The reservation is released when the purchase is closed without a payment, or by the release
   rule the adapter declares for its channel, such as a hold the provider has released. When the
   payment settles, the amount settled becomes consumption of the period, and what was held
   beyond it is released. A reservation belongs to the period it was made in and stays there,
   whenever the payment settles.
9. A refund is an adjustment. It returns nothing to a budget unless the policy says that its
   budgets are net of refunds.
10. At every start, before any new purchase, every reservation that is not finished is taken up,
    whatever status its purchase shows - `authorized` included, because the process can have
    stopped between a sending and the note of it. Its attempts are read; an attempt that was
    written counts as possibly sent and is reconciled on its identifiers. What is held plus what
    is consumed is at most the limit, and the report states the same figures.
11. Where a channel accepts no identifier for an attempt, the adapter says so. A purchase on that
    channel has one attempt, and a lost answer is resolved by reading the account and never by
    sending again.
12. Principal and fees each have a stated budget: the policy says which budget a fee is charged
    to. A fee that was incurred and cannot be recovered is consumption of that budget. Before a
    new attempt is opened, and before a transaction is sent again at a higher fee, the
    reservation for fees is raised to cover what the fee can now reach.

The manual route has no book: a person decides each purchase, and what is recorded is who
decided. The protocol's records state the policy, the reservations and the purchases; enforcing
them is the agent's own software (section 10).

## 5. The state of a supply source, and when new work is taken

A source is `serving`, `low` (a renewal is due), `exhausted`, `paused` or replaced by another
source of the same specification. Before the worker commits to a request it checks that the
source can serve it. Where serving it needs a purchase by the agent, the room in the budget is a
reservation (4.3), not a reading. If either fails, the worker declines: no commitment is made
first and funded later.

## 6. Failure and recovery

The rows of `genesis-mining-mvp.md` 14.8, with the handling proposed. Work and money recover
together, each from its own durable record.

| Failure | What the worker's side does | What must not happen |
| --- | --- | --- |
| Quota exhausted | takes no new request; ends requests in flight as what they are - completed, or failed with their cost recorded; switches only to a source that meets the same specification and its evidence requirements; resumes when credit is available | a delivery claimed for output that never reached the customer; a silent change of model |
| Budget, gas or authorized quota insufficient | declines or pauses as the policy says, keeps the state of the request, reports the shortfall | credit inferred; authority widened |
| Two requests need the same room in a budget at once | the reservation admits one; the other is declined or waits, as the policy says | two purchases made on one reading of the same room |
| A renewal fails | retries a bounded number of times inside the policy: each retry is a new attempt of the same purchase, opened only after the attempt before it failed definitely; then stops and escalates | spending outside the policy; a retry opened while the attempt before it could still succeed; a retry that is a second purchase |
| The state of a payment is unclear | reconciles the open attempt on its identifiers - and on the account balance and the provider's receipt - or sends the same attempt again where the channel makes that harmless; until then the payment counts as possibly made and keeps its reservation | a second payment for one purchase; an invented success; room in a budget freed by a timeout |
| Paid, and the credit does not arrive | the payment stays `settled` and the credit `not-available`; stops buying from that source and takes it up with the provider; the amount stays in the report as paid | booking it as service received, or writing it off in silence |
| Money comes back in part, or a payment is disputed while the credit is in use | an adjustment linked to the purchase, with its amount; the payment and the credit keep their own status | one of the three overwritten by another |
| A request times out after the provider accepted it | reconciles the request's identifier and the usage billed before buying the service again | paying twice without saying so. If the provider did bill twice, that is two costs and one delivery |
| The same request reaches the worker twice: sent again, or issued again as another tender | recognized by its request id (`production-service.md` 4.1): the first result answers it, and the model service is not bought again. A second order on chain is a second work id of the same request: its payment is a fact and is recorded, and it adds no contribution (`production-service.md` 7) | two contributions; a second cost passed on in silence |
| Work incomplete, refused or rejected | keeps the partial evidence and the cost; applies the agreed rule of acceptance and refund | counting it as a qualified delivery |
| Payment and delivery complete in different orders | keeps both records and their references | reporting both as complete because one is |
| Required evidence cannot be retrieved | marks the delivery unauditable under its profile | a verified qualification for it |
| The worker crashes, or a cell repairs itself | resumes from the durable records of work, payment, reservation and authority; takes up every reservation that is not finished, whatever status its purchase shows; prior evidence is kept | a second purchase, a second recording or a second reward; a payment that was sent and forgotten |
| A cell is replicated | the replica gets its own identity and its own scoped budget by an authorized procedure, and keeps a record of its lineage | signing secrets copied; a budget book shared; earlier contributions claimed again |
| The chain reorganizes | reconciles what was read from the chain under the configured finality; purchases made outside the chain cannot be rolled back with it and stay recorded | - |

Every purchase and every request has an identifier that is fixed before the first attempt.
Recovery reads the identifier, never the intention.

## 7. The customer's payment in the first increment

The delivery is procured through an ERC-8414 tender (`production-service.md` 3), and the payment
is the tender's own:

| State | In the tender | Evidence |
| --- | --- | --- |
| Reserved | the bounty is held in the tender's vault | the funding transaction |
| Owed | the submission is accepted; a credit is due to the fulfiller | the settlement |
| Received | the credit was paid out or withdrawn | the transfer or the withdrawal transaction |
| Returned | what the vault gives back to the demander under its own rules | the transaction |

An accepted submission is not money received. Revenue is established by the transfer or the
withdrawal, and the record keeps the gross amount, the fees and any refund identifiable
(`genesis-mining-mvp.md` 14.6).

The payment record of a delivery, proposed (`architecture.md` 5.3):

| Member | Content |
| --- | --- |
| `request`, `work` | the request id and the work id (`production-service.md` 4.1). Payments are reconciled per request; one request can have several work ids |
| `payer`, `payee` | accounts, each with its chain |
| `asset` | the chain and the asset contract, or the native asset; the decimals. A symbol is not an identity |
| `amount` | the raw integer amount |
| `state` | as above, with the transaction of each state reached |
| `adjustments` | fees, refunds, credits |

In the first increment the asset is the chain's native one and the kernel's rule for it is
unchanged: a bounty in any other asset is recorded, measured and not subsidized (code 6). Gas is
paid in the native asset by whoever sends a transaction, and nothing in the increment pays gas
for another party.

## 8. The operating report

Proposed (P49). A worker reports per stated period, and per asset or currency, in native amounts:

| Line | Evidence |
| --- | --- |
| Qualified deliveries and their qualified service units, per specification | on chain and in the envelopes: can be recomputed |
| Customer cash received; receivables (accepted and not yet withdrawn); refunds | on chain: can be recomputed |
| Cash paid to providers; charges incurred and unpaid | on chain when paid from a wallet; otherwise the provider's receipt by reference, or self-reported |
| Prepaid service credit, per provider: opening, bought, consumed, adjusted, closing | the purchase records; the provider's balance read back |
| Inference cost of the deliveries; cost of requests that failed or were rejected | the envelopes; the provider's bill |
| Verification and orchestration costs | as incurred |
| Chain fees | on chain: can be recomputed from the worker's transactions |
| Hosting and hardware | self-reported |
| Holder contributions | on chain for a wallet transfer; otherwise self-reported |
| Budgets, on an agent route: limit, held, consumed | the budget book |
| Protocol subsidy | none of value; test points as a count |
| Costs the report leaves out | named, not silent |

Rules of the report (`genesis-mining-mvp.md` 14.7):

- every line carries its evidence: `on-chain`, `receipt` (a document, by reference) or
  `self-reported`. What could not be observed is listed as missing and is never written as zero;
- cash that moved and costs that were incurred are told apart. What was paid for credit is cash
  out in the period it was paid; what was drawn from the credit is the cost of the period. They
  are two views of the same money and are never added to each other;
- prepaid credit reconciles exactly, per provider and in the provider's unit of account: opening
  plus bought, less consumed, plus or less adjustments, is the closing figure; where the
  provider's balance can be read back, it is shown beside the computed one and a difference is a
  line of its own;
- one movement of money is one movement. A payment the Holder made to a provider appears as the
  source of the funds and as their use, which are its two ends; the two are never summed into a
  total of spending;
- amounts in different assets or currencies are never added. A conversion, where one is given,
  names its source and the time it was observed, and the native amounts stay beside it;
- revenue coverage is stated per period as what it is. Nothing is inferred from a token count, a
  GMU figure, a token price or a renewal that happened by itself.

The shape proposed for it is the observation record of the owner's ERC-8454 (AIFi Unit
Framework), which already requires these things of a record: stocks and flows per asset, flows
by port, a reconciliation that must hold exactly, missing values listed and never zeroed, and no
sum across assets. The ports of a worker are its customers, its Holder, its providers, the
protocol and the chain's fees; prepaid credit is one of its stocks.

An example with *illustrative* figures, for a worker of the startup form over one period. The
Holder paid a provider 5.00 by hand, once; the period drew 0.48 of it:

| Line | Amount | Evidence |
| --- | --- | --- |
| Qualified deliveries | 12; 21,700 qualified service units | on-chain; envelopes |
| Customer cash received | 0.006 of the native asset | on-chain |
| Receivables | 0 | on-chain |
| Holder contributions | 5.00 of a fiat currency, paid by the Holder to the provider | receipt; self-reported |
| Cash paid to the provider | 5.00 of that currency: the same payment, at its other end | receipt |
| Prepaid credit, opening | 0 | - |
| Prepaid credit bought | 5.00 | receipt |
| Consumed: inference cost of the 12 deliveries | 0.41 | envelopes; the provider's bill |
| Consumed: cost of 2 rejected requests | 0.07 | envelopes |
| Prepaid credit, closing | 4.52 = 0 + 5.00 - 0.41 - 0.07; the provider's balance read back: 4.52 | computed; the balance read back |
| Cost of the period | 0.48 of that currency. Cash out of the period: 5.00. The difference, 4.52, is the credit that is left | computed from the lines above |
| Chain fees | 0.0000031 of the native asset | on-chain |
| Hosting | missing | - |
| Dimensions | payment: manual; supply: external; coverage of the period's cost by revenue: not stated - cost and revenue are in different assets and no conversion is given | - |

## 9. Later adaptations: designs kept, not part of the first increment

Each needs its own review, policy and implementation (P52). None of them is in round R2 or in the
first increment.

**Assets other than the native one** (A51, A62). The order is: a reviewed policy; a new version
of the contracts that implements it; and only then parameters that configure it. The present
contracts apply the native-only rule in code (code 6), so entering an asset in a parameter cannot
lift it. The design kept for that policy: a parameter version lists the assets it accepts, each
identified by chain and contract with its decimals, each with its own thresholds in raw amounts;
there is no live exchange rate and amounts in two assets are never compared; the manifest says
for each asset whether it is issued on the chain by its issuer or is a bridged representation,
and through which bridge; a test network uses an asset that is labelled a test asset; the real
contracts of a main network are a separate acceptance. Listing an asset implies nothing about its
issuer having deployed or endorsed it.

**The agent-wallet route.** One target is payment over HTTP as x402 does it. Version 2 of that
specification carries several payment mechanisms and networks, and an adapter pins the one it
implements: the version of the specification, the scheme, the network, the asset, and the party
it relies on to verify and settle. One such mechanism, as an example: the `exact` scheme on an
EVM network, in which the client signs a transfer authorization that carries a nonce and a
validity window, a facilitator verifies it and settles it on chain, and the answer names the
transaction; a settlement that is still pending is reported as pending, with the transaction that
was broadcast. The nonce and the window belong to that mechanism and not to the protocol as a
whole; another mechanism has other identifiers and other stages, and its adapter maps them to the
records of section 4. The payment can be made on the chain the work is recorded on or on another
chain the mechanism supports, which is why a purchase record names its chain.

**Supply that is metered and prepaid.** Where inference is sold as supply rather than as an
accepted task - a cell buying its fuel from a supplier on the network - the carrier proposed is
the entitlement ledger of ERC-8506, at a pinned revision (`production-service.md` 4.2): a
supplier issues units under a specification; a holder authorizes a consumer up to a ceiling,
which is a Holder's delegated budget in the standard's own terms; a request reserves an upper
bound and is settled at what was accepted; a stream of calls settles as one request. A conformant
Source record and a conformant Receipt record come with that ledger, not before it. A FOGA Cell
Account, as built today, can hold such units and authorize their consumption with its owner's
signature and without a transaction of its node: revision 3 of the account receives ERC-1155
units and validates its owner's signature (checked against the source of FOGA 1.0.9; to be shown
on chain before it is relied on).

**Gas.** Paying for a service in a stablecoin does not change the asset gas is paid in. Sponsoring
gas is a separate arrangement with a budget and an abuse model of its own.

## 10. Who enforces a budget

For purchases outside the chain, the agent's own software enforces the policy and keeps the
budget book: a FOGA cell has budget books of its own, and another agent has its own controls. The
protocol's records state the policy, the reservations and the purchases; they neither enforce
them nor go around them (A37). Chain administration, worker operation, procurement permissions
and delegated smart-account permissions stay distinct, and no L1 administration or sequencer key
ever becomes a payment key or a worker key (A43).

## 11. What each increment builds

| Increment | Routes | Builds |
| --- | --- | --- |
| First | `manual-fiat` | the four records; the three parts of a purchase as entered from a person's report, the provider's receipt and the quota read back; the failure rules that need no payment adapter; the operating report with its prepaid-credit lines |
| Second | `agent-wallet`, `agent-fiat-account` | the budget book with its atomic reservation; attempts under a purchase, each written before it is sent; one adapter of each kind, each with its declaration - operations, channel, idempotency, release, authorization; reconciliation of unknown payments and the recovery of a crash; the policy enforced by the agent |
| Third | any | an operated model as a supply source of the same specification; the evidence that exists for its mode |
