# Supply and Payment Interfaces: Plan

Design revision v0.1.4, documentation alignment of 2026-11-24. This is the executor's plan for
the supply and payment interfaces: deliverable C of the alignment (`decisions.md` A54), carrying
out `genesis-mining-mvp.md` 14.6 to 14.8 and `architecture.md` 5.3. It covers the source of
supply, the execution of payment, the source of funds and the scope of permission, in one form
shared by manual and autonomous operation; and what happens when quota runs out, a renewal fails,
the state of a payment is unclear, a request is duplicated, or a service has to recover.

Nothing here is built, and nothing here changes round R2. Every choice is a proposal put up for a
ruling (`decisions.md` P48, P49, P52); where this plan and `genesis-mining-mvp.md` 14 differ,
that section governs. Where the text says "is", read "is proposed to be".

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

## 3. What a worker's side keeps: four records

Proposed (P48). The records are JSON documents the worker's side keeps and reports; none of them
is a contract field. They are the same whether a person or an agent acts, which is what lets the
startup and the development forms share one interface.

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
| `perRequest`, `perPeriod` | the budgets, per asset or currency |
| `renewal` | the conditions under which a renewal may be made |
| `escalation` | what happens at the limit: `decline`, or `ask-holder` |
| `validUntil`, `grantedBy` | the policy's term, and the Holder that granted it |

**Purchase** - one purchase or renewal, through its states (section 4).

| Member | Meaning |
| --- | --- |
| `purchaseId` | a stable identifier chosen before anything is sent. A retry reuses it |
| `source`, `policy` | the supply source bought for; the policy it was bought under |
| `decidedBy`, `executedBy` | `operator` or `agent`, each |
| `route` | `manual-fiat`, `agent-wallet`, `agent-fiat-account` |
| `asset`, `amount` | a currency, or a chain and an asset contract; the raw amount and its precision |
| `state`, `references` | the state, and for each state reached the reference that supports it |
| `fundingSource` | `holder`, `service-revenue`, `protocol`, or the shares of each where the worker can tell; otherwise `undeclared` |

**Funding** - what the Holder put in: the amount, the asset or currency, the date, the account or
wallet it went to, and its evidence.

An adapter implements a route. It declares which operations its provider really supports - read
the quota, quote, buy, renew, read the state of a payment, confirm that credit arrived - and an
operation it does not support is reported as unsupported, never assumed. A fiat route means buying
or renewing inside an account the Holder has authorized and funded; it does not mean that a
provider lets an agent enter a card or open an account.

| Route | Who acts | Increment |
| --- | --- | --- |
| `manual-fiat` | a person buys and renews; the worker's side records what the person reports | first |
| `agent-wallet` | the agent pays in a digital asset from a wallet its Holder funded | second |
| `agent-fiat-account` | the agent buys or renews through a fiat-billed account its Holder authorized | second |

Both kinds of route can run in one deployment, and one worker may have a source of each. A manual
top-up is never reclassified as an autonomous purchase or as income.

## 4. One state machine for a purchase

The six meanings of `genesis-mining-mvp.md` 14.6, as the states of a purchase record:

| State | Reached when | The reference to keep |
| --- | --- | --- |
| `authorized` | a policy that covers the purchase exists and its budget has room. Nothing is paid | the policy; the budget before and after |
| `initiated` | a transaction was sent or a payment request made | the transaction hash, the nonce of a signed authorization, or the provider's request identifier |
| `pending` or `unknown` | the payment has not reached the required confirmation, or the answer was lost | the same identifier: reconcile on it before anything else |
| `settled` | the required finality on chain, or the provider's own evidence of settlement or capture | the block and the transaction, or the provider's receipt |
| `credit-available` | the provider has made the quota or the credit usable | the quota read back, or the provider's confirmation |
| `refunded`, `credited` or `disputed` | a reversal, a credit or an open liability, linked to the original purchase | the adjusting reference |

Initiation is not settlement. Settlement is money leaving the payer; credit becoming available is
a separate fact; and neither is a delivery. On the manual route the same states are entered from
what the person reports and what the quota reads back, and the report labels them so.

## 5. The state of a supply source, and when new work is taken

A source is `serving`, `low` (a renewal is due), `exhausted`, `paused` or replaced by another
source of the same specification. Before the worker commits to a request it checks that the
source can serve it and that the policy has room. If not, it declines: no commitment is made
first and funded later.

## 6. Failure and recovery

The rows of `genesis-mining-mvp.md` 14.8, with the handling proposed. Work and money recover
together, each from its own durable record.

| Failure | What the worker's side does | What must not happen |
| --- | --- | --- |
| Quota exhausted | takes no new request; ends requests in flight as what they are - completed, or failed with their cost recorded; switches only to a source that meets the same specification and its evidence requirements; resumes when credit is available | a delivery claimed for output that never reached the customer; a silent change of model |
| Budget, gas or authorized quota insufficient | declines or pauses as the policy says, keeps the state of the request, reports the shortfall | credit inferred; authority widened |
| A renewal fails | retries a bounded number of times inside the policy; then stops and escalates | spending outside the policy |
| The state of a payment is unclear | reconciles on the purchase's identifier - and on the account balance and the provider's receipt - before any resubmission; until then the payment counts as possibly made | a second payment for one purchase; an invented success |
| Paid, and the credit does not arrive | records it, stops buying from that source, takes it up with the provider; the amount stays in the report as paid | booking it as service received, or writing it off in silence |
| A request times out after the provider accepted it | reconciles the request's identifier and the usage billed before buying the service again | paying twice without saying so. If the provider did bill twice, that is two costs and one delivery |
| A customer sends the same request twice | one work id, one delivery, one receipt; the second submission is answered with the first result | two contributions |
| Work incomplete, refused or rejected | keeps the partial evidence and the cost; applies the agreed rule of acceptance and refund | counting it as a qualified delivery |
| Payment and delivery complete in different orders | keeps both state machines and their references | reporting both as complete because one is |
| Required evidence cannot be retrieved | marks the delivery unauditable under its profile | a verified qualification for it |
| The worker crashes, or a cell repairs itself | resumes from the durable records of work, payment and authority; prior evidence is kept | a second purchase, a second recording or a second reward |
| A cell is replicated | the replica gets its own identity and its own scoped budget by an authorized procedure, and keeps a record of its lineage | signing secrets copied; earlier contributions claimed again |
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
| `work` | the work id |
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
| Provider charges paid; charges incurred and unpaid | on chain when paid from a wallet; otherwise the provider's receipt by reference, or self-reported |
| Inference cost of the deliveries; cost of requests that failed or were rejected | the envelopes; the provider's bill |
| Verification and orchestration costs | as incurred |
| Chain fees | on chain: can be recomputed from the worker's transactions |
| Hosting and hardware | self-reported |
| Holder contributions | on chain for a wallet transfer; otherwise self-reported |
| Protocol subsidy | none of value; test points as a count |
| Costs the report leaves out | named, not silent |

Rules of the report (`genesis-mining-mvp.md` 14.7):

- every line carries its evidence: `on-chain`, `receipt` (a document, by reference) or
  `self-reported`. What could not be observed is listed as missing and is never written as zero;
- cash that moved and costs that were incurred are told apart;
- amounts in different assets or currencies are never added. A conversion, where one is given,
  names its source and the time it was observed, and the native amounts stay beside it;
- revenue coverage is stated per period as what it is. Nothing is inferred from a token count, a
  GMU figure, a token price or a renewal that happened by itself.

The shape proposed for it is the observation record of the owner's ERC-8454 (AIFi Unit
Framework), which already requires these things of a record: stocks and flows per asset, flows
by port, a reconciliation that must hold exactly, missing values listed and never zeroed, and no
sum across assets. The ports of a worker are its customers, its Holder, its providers, the
protocol and the chain's fees.

An example with *illustrative* figures, for a worker of the startup form over one period:

| Line | Amount | Evidence |
| --- | --- | --- |
| Qualified deliveries | 12; 21,700 qualified service units | on-chain; envelopes |
| Customer cash received | 0.006 of the native asset | on-chain |
| Receivables | 0 | on-chain |
| Provider charges paid | 5.00 of a fiat currency, bought by the Holder | receipt |
| Inference cost of the 12 deliveries | 0.41 of that currency | envelopes; the provider's bill |
| Cost of 2 rejected requests | 0.07 of that currency | envelopes |
| Chain fees | 0.0000031 of the native asset | on-chain |
| Holder contributions | 5.00 of that currency | self-reported |
| Hosting | missing | - |
| Dimensions | payment: manual; supply: external; coverage of the period's cost by revenue: not stated - cost and revenue are in different assets and no conversion is given | - |

## 9. Later adaptations: designs kept, not part of the first increment

Each needs its own review, policy and implementation (P52). None of them is in round R2 or in the
first increment.

**Assets other than the native one** (A51). The kernel's rule stays until a new policy replaces
it. The design kept: a parameter version lists the assets it accepts, each identified by chain
and contract with its decimals, each with its own thresholds in raw amounts; there is no live
exchange rate and amounts in two assets are never compared; the manifest says for each asset
whether it is issued on the chain by its issuer or is a bridged representation, and through which
bridge; a test network uses an asset that is labelled a test asset; the real contracts of a main
network are a separate acceptance. Listing an asset implies nothing about its issuer having
deployed or endorsed it.

**The agent-wallet route.** One target is payment over HTTP by a signed stablecoin transfer, as
x402 does it. In version 2 of its specification a server answers with its payment requirements,
the client sends a signed authorization that carries a nonce and a validity window, a facilitator
verifies it and settles it on chain, and the answer names the transaction; a settlement that is
still pending is reported as pending, with the transaction that was broadcast. Those are the
identifiers and the states of section 4. Such payments are usually made on another chain than the
one the work is recorded on, which is why a purchase record names its chain.

**Supply that is metered and prepaid.** Where inference is sold as supply rather than as an
accepted task - a cell buying its fuel from a supplier on the network - the carrier proposed is
the entitlement ledger of ERC-8506: a supplier issues units under a specification; a holder
authorizes a consumer up to a ceiling, which is a Holder's delegated budget in the standard's own
terms; a request reserves an upper bound and is settled at what was accepted; a stream of calls
settles as one request. A FOGA Cell Account, as built today, can hold such units and authorize
their consumption with its owner's signature and without a transaction of its node: revision 3 of
the account receives ERC-1155 units and validates its owner's signature (checked against the
source of FOGA 1.0.9; to be shown on chain before it is relied on).

**Gas.** Paying for a service in a stablecoin does not change the asset gas is paid in. Sponsoring
gas is a separate arrangement with a budget and an abuse model of its own.

## 10. Who enforces a budget

For purchases outside the chain, the agent's own software enforces the policy: a FOGA cell has
budget books of its own, and another agent has its own controls. The protocol's records state the
policy and the purchases; they neither enforce it nor go around it (A37). Chain administration,
worker operation, procurement permissions and delegated smart-account permissions stay distinct,
and no L1 administration or sequencer key ever becomes a payment key or a worker key (A43).

## 11. What each increment builds

| Increment | Routes | Builds |
| --- | --- | --- |
| First | `manual-fiat` | the four records; the state machine as entered from a person's report and the quota read back; the failure rules that need no payment adapter; the operating report |
| Second | `agent-wallet`, `agent-fiat-account` | one adapter of each kind, each with the operations its provider supports; reconciliation of unknown payments; the policy enforced by the agent |
| Third | any | an operated model as a supply source of the same specification; the evidence that exists for its mode |
