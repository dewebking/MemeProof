# MemeProof registry contract architecture

## Scope and authority

The registry is authoritative for MemeProof token identities, commitments,
commitment versions, evidence references, community reviews, disputes, and
history. Supabase may index these records, but must be rebuildable from NEAR
and must not decide canonical state. The contract targets NEAR testnet only.

The current layout reports schema version 4. Changing `SCHEMA_VERSION` only
labels a layout; it does not migrate persisted state. Version 4 adds dispute
counters and persistent maps and is not Borsh-compatible with initialized
version 3 state. Existing state must not be overwritten. An initialized v3
registry needs a separately designed and tested state-preserving migration
before upgrade. The repository does not identify an existing initialized
registry deployment.

## Existing data and rules

- Token identity is `(network_id, token_contract_address)`; ticker and name are
  display metadata only. This version supports `testnet` only.
- Commitments point to registered tokens. Their terms are immutable numbered
  versions. The creator may append amendments; prior terms remain retrievable.
- Evidence records link to one existing commitment version and retain a public
  URI, SHA-256 hash, submitter, and timestamp. Evidence contents remain
  off-chain.
- A signer may submit one advisory review per evidence item. Review opinions
  never determine a commitment result.
- Deadline expiry alone never changes a commitment outcome. No contract method
  sets an automatic PASS or FAIL result.

## Dispute model and lifecycle

A `DisputeTarget` is either `Commitment { commitment_id, version }` or
`Evidence { evidence_id }`. Commitment targets validate that exact version.
Evidence targets validate the evidence record and derive its commitment and
version context from that record. One active dispute is allowed per exact
target. Expired or resolved disputes remain in storage and history; a new
dispute may later be opened for that target.

Disputes have exactly four statuses: `Open`, `UnderReview`, `Resolved`, and
`Expired`.

- Opening records the signer as opener, derives the affected party (commitment
  creator or evidence submitter), stores the reason and timestamps, and names a
  proposed resolver. The opener and affected party cannot be the resolver or
  each other.
- The affected party may submit one response within seven days. A missing
  response neither blocks review nor favors either party. The response window
  remains open if the dispute enters review early; the resolver cannot resolve
  before a response is recorded or that seven-day window has elapsed.
- The opener proposes the initial resolver. The other disputing party may
  counterpropose once; that replaces the nominee and clears both earlier
  acceptance flags. The party who did not make the current proposal must accept
  it, and the nominee must separately accept. Both must happen within fourteen
  days of opening. No owner or reviewer has automatic authority.
- Once both disputing parties agree to the current nominee and that third party
  accepts, status becomes `UnderReview`. The resolver then has thirty days to
  record a disposition and bounded rationale. Dispositions are `upheld`,
  `rejected`, `inconclusive`, or `dismissed` and apply only to that dispute.
- Anyone may call `expire_dispute` at or after the fourteen-day resolver
  agreement deadline while `Open`, or at or after the thirty-day resolution
  deadline while `UnderReview`. Expiry records `Expired`, with no disposition
  and no winner. A new dispute can be opened after expiry.
- Existing evidence reviews may be retrieved as advisory context for an
  evidence dispute. The contract does not create a separate dispute review or
  voting system; reviews do not confer resolver authority and do not decide a
  dispute.

All changes append a globally sequenced history event and emit a NEP-297 event.
Opening a dispute writes both the raised event and the initial resolver
proposal. Counterproposals record the selected resolver, and separate history
variants record disputing-party agreement and nominee acceptance against that
resolver. These records preserve the complete appointment sequence after the
mutable current-dispute fields change. New history variants are appended to
the v4 enum; the legacy generic resolver-acceptance variant is retained for
Borsh compatibility.
Responses and terminal resolution records are stored separately and are never
rewritten. Status and resolver-acceptance fields on the current dispute record
are updated only as the lifecycle advances. No dispute operation changes
commitment terms or assigns a commitment PASS/FAIL status.

## Storage, IDs, and pagination

Persistent maps use `near_sdk::store::LookupMap`; maps are not iterated. Stable
`StorageKey` variants identify each map. IDs are monotonic and checked against
overflow. List views use cursors over monotonically increasing IDs and scan no
more than the requested limit; the maximum page size is 50. Filtered dispute
pages also advance over scanned IDs, not only returned matches. Public history
retrieval is cursor-based and bounded to 50 events per call.

Payable writes measure trie storage growth after flushing the affected maps.
They require at least `storage byte increase * env::storage_byte_cost()` in
attached deposit. Insufficient deposits remove staged writes and restore
counters before panicking. Excess deposit is returned to the predecessor
account, which can differ from the signer. Refund transfer execution is
asynchronous; NEAR charges gas separately. Dispute expiry is permissionless,
but its caller pays its storage deposit.

## Validation and serialization

NEAR `AccountId` validates account inputs. User-facing reason, response, and
rationale text is nonempty, bounded UTF-8 with control characters rejected.
Commitment/evidence references are checked at trusted contract boundaries.
Public types support JSON; persisted values and map keys support Borsh.

## Contract interface additions

- `open_dispute(target, reason, proposed_resolver)` validates target and
  affected-party context and rejects an already active exact target.
- `respond_to_dispute` records one affected-party response before the
  seven-day deadline.
- `counterpropose_dispute_resolver` allows one counterproposal from the party
  that did not make the current proposal. It invalidates prior acceptances.
- `accept_dispute_resolver` records the non-proposing party's agreement;
  `accept_dispute_appointment` records the nominee's separate acceptance.
  The second acceptance transitions the dispute to `UnderReview`.
- `resolve_dispute` is restricted to the accepted nominee and the active
  resolution period. `expire_dispute` is permissionless only at the relevant
  deadline.
- `get_dispute`, response and resolution point reads, bounded dispute list and
  target-filtered pages, and `get_history_events` expose records.
- Dispute methods use exact storage-cost accounting, rollback on failure,
  predecessor refunds, append-only history, and NEP-297 events.

## Deployment compatibility

`SCHEMA_VERSION = 4` is descriptive only. It does not convert v3 state into the
new layout. Do not reinitialize or upgrade any existing registry using this
layout without first inspecting its exact state and implementing and testing a
migration. Deployment remains testnet-only and must verify the account and RPC
before any deployment.
