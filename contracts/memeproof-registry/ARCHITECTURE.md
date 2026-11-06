# MemeProof registry contract foundation

## Scope and authority

The registry is the authoritative source for MemeProof token identities,
commitments, amendments, evidence references, review records, disputes, and
history. Supabase may later index these records for search and feeds, but must
be rebuildable from NEAR and must not decide canonical state. The first
implementation stage exposes token registration, token reads, and commitment
creation and creator-authorized amendments. Evidence, review, and dispute
methods remain future stages.

The contract is configured for NEAR testnet. `NetworkId` currently has only the
`Testnet` variant, and the initializer records that configuration. NEAR
contracts cannot reliably infer which network they were deployed to from
contract code alone; the deployment process must verify a testnet account and
RPC before any deployment.

## Data model

- `TokenIdentity` is `(network_id, token_contract_address)`. Tickers and names
  are display metadata and are not identity keys.
- `TokenRecord` stores registrant, creation timestamp, optional public metadata
  URI, and active status. Any signer account may register an identity; for a
  cross-contract call the signer is the original wallet and the predecessor is
  the immediate calling contract. Registration does not assert official
  ownership or affiliation.
- `CommitmentRecord` points to a registered token and creator. Immutable terms
  live in numbered `CommitmentVersion` records. Creation writes version 1 and
  each creator-authorized amendment appends the next version and history event.

- `EvidenceReference` stores only an opaque reference, a content hash, submitter,
  and timestamp. File contents and secrets stay off-chain.
- `HistoryEvent` is designed as an append-only, globally sequenced event record
  for significant actions. Token registration now writes its corresponding
  history event; event writers for other action types remain unimplemented.
- Reviews must preserve attribution and distinguish automated observations,
  AI assistance, and human/community decisions. AI cannot be a final authority.
- A deadline does not itself cause a failed status. Status transitions require
  a separately specified evidence/review rule.

## Storage and identifiers

The contract uses `near_sdk::store::LookupMap`, which stores entries in the
NEAR trie and does not support whole-map iteration. Stable `StorageKey` variants
separate token records, token-identity lookup, commitments, commitment
versions, and history events. IDs are monotonic `u64` counters starting at 1;
checked addition rejects exhaustion rather than wrapping or reusing an ID.
Records are not physically deleted. Future list views must use cursor-based,
bounded pages (maximum 50 records per page) over monotonic IDs, never an
unbounded collection scan. The current token list reads at most the requested
number of consecutive IDs per call.

`register_token` measures trie storage growth after flushing the token record,
identity index, and append-only registration history event. It requires an
attached deposit of at least `storage byte increase * env::storage_byte_cost()`.
If the deposit is short, the method removes its staged entries and panics (the
NEAR runtime also rolls back a failed call). If it is larger, the excess is
returned to the predecessor (the account that attached the deposit) using a
native-token transfer promise; storage cost is retained as the contract's
storage collateral. Gas is charged by NEAR separately. Refund transfer
execution is asynchronous. No metadata, identity, or ticker-based fee is
charged.

## Validation and serialization

NEAR `AccountId` parsing validates contract and account identifiers. Shared
text validation rejects empty, oversized, or control-character input without
silently normalizing published text. SHA-256 hash validation accepts exactly
64 hexadecimal characters. Registration accepts optional metadata URIs up to
2 KiB. HTTPS requires a valid DNS hostname and optional port from 1 through
65535; IP literal hosts are not supported. IPFS accepts CIDv1 in lowercase
base32 multibase with a nonzero codec and a SHA-256 multihash containing 32
digest bytes. Both forms reject whitespace, credentials, query strings,
fragments, backslashes, and unsupported schemes. No URL parser dependency is
used because this narrow grammar is validated directly. Public structures
support JSON; persisted structures and map keys also support Borsh. Schema
version 2 describes the current layout; it does not migrate persisted state.

## Token registration interface

- `register_token(token_contract_address, metadata_uri)` is payable, derives
  `registrant` from `env::signer_account_id()`, binds identity to the
  configured network, rejects duplicates, stores an active record and
  `TokenRegistered` history entry, and emits `EVENT_JSON:` with NEP-297
  `standard: "memeproof"`, `version: "1.0.0"`, and `event: "token_registered"`.
- `get_token(token_id)` is a point read.
- `get_tokens(after_id, limit)` returns a cursor page. It inspects no more than
  `limit` consecutive IDs, where the default is 20 and the maximum is 50. IDs
  are gapless because failed transactions roll back allocation and records
  cannot currently be deleted. If future deletion or migration introduces
  gaps, pagination must preserve the cursor over scanned IDs.
- `network_id` is not caller input. This version accepts only `testnet`; a
  `mainnet` label is rejected by the network validation helper. A different
  network requires an explicit supported `NetworkId` and deployment policy.
  The same address registered here is therefore always its testnet identity.
- Active means "registered in MemeProof," not issuer ownership, endorsement,
  market availability, or verification.

## Unresolved product/protocol decisions

1. Which commitment fields and criteria formats are canonical, including
   per-field size limits and deadline precision.
2. Whether and how a token registration can be superseded or revoked. Duplicate
   registration currently rejects and leaves the existing record unchanged.
3. Whether only the original creator can amend a commitment and which changes
   require a new version.
4. Evidence URI scheme, visibility, retention/takedown behavior, and the exact
   content-hash encoding and verification process.
5. Supported verification adapters and how evidence is judged; review
   eligibility, duration, quorum, thresholds, dispute authority, and final
   state transitions. Deadline expiry alone is never a failure verdict.
6. Whether registrations should later support more networks than testnet.
7. Contract upgrade authority and migration procedure for persisted schema.

## Initialization and compatibility

The checked-in deployment documentation states that testnet deployment and
wallet flow are not configured, and this repository contains no registry
account ID, deployment record, or initialized-state snapshot. On that available
evidence, no previous initialized registry instance is identified. This code
requires fresh initialization with `new`. `SCHEMA_VERSION` only reports the
current schema; it does not convert old state. The `#[init]` initializer must
not be used to replace an existing initialized account. There is no migration
method because no prior initialized state or historical storage layout has
been identified. If an existing deployment is discovered, do not upgrade or
reinitialize it with this version; first obtain and inspect its exact state
layout, then design and test a state-preserving migration for that version.

## Implemented in this foundation

- Explicit `new` initializer and read-only `get_config`, `get_token`, and
  bounded cursor-based `get_tokens` views.
- Payable token registration with signer attribution, duplicate
  protection, metadata checks, exact storage-cost deposit, and excess refund.
- Payable `create_commitment` accepts any signer for an existing token ID,
  records the signer as creator, and stores initial terms as version 1. Title,
  description, and criteria are nonempty control-free UTF-8 text limited to
  256 bytes, 4 KiB, and 8 KiB respectively. The deadline must be strictly
  later than the current block timestamp. Creation writes append-only history
  and a NEP-297 event, charges exact storage cost, rolls back staged state on
  failure, and refunds excess deposit to the predecessor.
- `get_commitment` returns the commitment and current terms. Deadline expiry
  alone does not mark it failed, and no AI verdict is made by the contract.
- `amend_commitment` requires the original creator's signer account, validates
  the replacement terms and future deadline, and appends a sequential version.
  It records signer and block time, writes `CommitmentAmended` history and a
  NEP-297 `commitment_amended` event, and applies exact storage deposit,
  rollback, and predecessor refund handling.
- `get_commitment_version` retrieves one immutable version;
  `get_commitment_versions` returns bounded cursor pages up to 50 versions.
  Deadline passage never automatically marks a commitment failed.
- An append-only registration history record and NEP-297-compatible event.
- Testnet-only network type and versioned configuration.
- Typed future record/event structures and persistent map layout.
- Checked internal token, commitment, and event ID allocation.
- Account ID, bounded text, and SHA-256 shape validation helpers.
- Unit tests for initialization, trie-backed map persistence, IDs, validation,
  and Borsh/JSON serialization.

Evidence submission, verification, reviews, disputes, and their history events
remain unimplemented.
