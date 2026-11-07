use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, Promise};

pub const SCHEMA_VERSION: u16 = 4;
pub const MAX_REVIEW_EXPLANATION_BYTES: usize = 4 * 1024;
pub const MAX_TEXT_BYTES: usize = 16 * 1024;
pub const MAX_METADATA_URI_BYTES: usize = 2 * 1024;
pub const MAX_COMMITMENT_TITLE_BYTES: usize = 256;
pub const MAX_COMMITMENT_DESCRIPTION_BYTES: usize = 4 * 1024;
pub const MAX_COMMITMENT_CRITERIA_BYTES: usize = 8 * 1024;
pub const MAX_PAGE_SIZE: u32 = 50;
pub const DEFAULT_PAGE_SIZE: u32 = 20;
pub const DISPUTE_RESPONSE_PERIOD_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
pub const DISPUTE_RESOLVER_PERIOD_NS: u64 = 14 * 24 * 60 * 60 * 1_000_000_000;
pub const DISPUTE_RESOLUTION_PERIOD_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
pub const MAX_DISPUTE_REASON_BYTES: usize = 4 * 1024;
pub const MAX_DISPUTE_RESPONSE_BYTES: usize = 4 * 1024;
pub const MAX_DISPUTE_RATIONALE_BYTES: usize = 4 * 1024;

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum NetworkId {
    Testnet,
}

impl NetworkId {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Testnet => "testnet",
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct TokenIdentity {
    pub network_id: NetworkId,
    pub token_contract_address: AccountId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenRecord {
    pub id: u64,
    pub identity: TokenIdentity,
    pub registrant: AccountId,
    pub created_at_ns: u64,
    pub metadata_uri: Option<String>,
    pub status: TokenStatus,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenStatus {
    Active,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitmentRecord {
    pub id: u64,
    pub token_id: u64,
    pub creator: AccountId,
    pub current_version: u32,
    pub created_at_ns: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitmentVersion {
    pub version: u32,
    pub title: String,
    pub description: String,
    pub criteria: String,
    pub deadline_at_ns: u64,
    pub created_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitmentWithCurrentVersion {
    pub commitment: CommitmentRecord,
    pub current_version: CommitmentVersion,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitmentVersionPage {
    pub versions: Vec<CommitmentVersion>,
    pub next_cursor: Option<u32>,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DisputeTarget {
    Commitment { commitment_id: u64, version: u32 },
    Evidence { evidence_id: u64 },
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisputeStatus {
    Open,
    UnderReview,
    Resolved,
    Expired,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisputeDisposition {
    Upheld,
    Rejected,
    Inconclusive,
    Dismissed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputeRecord {
    pub id: u64,
    pub target: DisputeTarget,
    pub commitment_id: u64,
    pub version: u32,
    pub evidence_id: Option<u64>,
    pub opener: AccountId,
    pub affected_party: AccountId,
    pub proposed_resolver: AccountId,
    pub proposal_by: AccountId,
    pub other_party_accepted: bool,
    pub resolver_accepted: bool,
    pub counterproposal_used: bool,
    pub reason: String,
    pub created_at_ns: u64,
    pub response_deadline_ns: u64,
    pub resolver_deadline_ns: u64,
    pub resolution_deadline_ns: Option<u64>,
    pub status: DisputeStatus,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputeResponse {
    pub dispute_id: u64,
    pub responder: AccountId,
    pub response: String,
    pub responded_at_ns: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputeResolutionRecord {
    pub dispute_id: u64,
    pub resolver: AccountId,
    pub disposition: DisputeDisposition,
    pub rationale: String,
    pub resolved_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputePage {
    pub records: Vec<DisputeRecord>,
    pub next_cursor: Option<u64>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryEventPage {
    pub records: Vec<HistoryEvent>,
    pub next_cursor: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryEventKind {
    TokenRegistered {
        token_id: u64,
    },
    CommitmentCreated {
        commitment_id: u64,
    },
    CommitmentAmended {
        commitment_id: u64,
        version: u32,
    },
    EvidenceSubmitted {
        commitment_id: u64,
        evidence_id: u64,
    },
    ReviewRecorded {
        commitment_id: u64,
        review_id: u64,
    },
    DisputeRaised {
        dispute_id: u64,
        target: DisputeTarget,
    },
    DisputeResponded {
        dispute_id: u64,
    },
    DisputeResolverProposed {
        dispute_id: u64,
        resolver: AccountId,
        counterproposal: bool,
    },
    // Kept for v4 Borsh compatibility; new writes use the role-specific variants below.
    DisputeResolverAccepted {
        dispute_id: u64,
    },
    DisputeUnderReview {
        dispute_id: u64,
    },
    DisputeResolved {
        dispute_id: u64,
    },
    DisputeExpired {
        dispute_id: u64,
    },
    DisputePartyAcceptedResolver {
        dispute_id: u64,
        resolver: AccountId,
    },
    DisputeNomineeAccepted {
        dispute_id: u64,
        resolver: AccountId,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryEvent {
    pub id: u64,
    pub actor: AccountId,
    pub occurred_at_ns: u64,
    pub kind: HistoryEventKind,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvidenceReference {
    pub id: u64,
    pub commitment_id: u64,
    pub version: u32,
    pub reference: String,
    pub content_hash: String,
    pub submitter: AccountId,
    pub submitted_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvidencePage {
    pub records: Vec<EvidenceReference>,
    pub next_cursor: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewOutcome {
    Supports,
    Challenges,
    Inconclusive,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReviewRecord {
    pub id: u64,
    pub reviewer: AccountId,
    pub commitment_id: u64,
    pub evidence_id: u64,
    pub version: u32,
    pub outcome: ReviewOutcome,
    pub explanation: String,
    pub submitted_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReviewPage {
    pub records: Vec<ReviewRecord>,
    pub next_cursor: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RegistryConfig {
    pub network_id: NetworkId,
    pub schema_version: u16,
    pub max_text_bytes: u32,
    pub max_metadata_uri_bytes: u32,
    pub max_page_size: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenPage {
    pub records: Vec<TokenRecord>,
    pub next_cursor: Option<u64>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
struct Nep297Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<TokenRegisteredEventData>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
struct CommitmentNep297Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<CommitmentCreatedEventData>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
struct CommitmentAmendedNep297Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<CommitmentAmendedEventData>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
struct EvidenceSubmittedNep297Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<EvidenceSubmittedEventData>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
struct TokenRegisteredEventData {
    event_id: u64,
    token_id: u64,
    network_id: NetworkId,
    token_contract_address: AccountId,
    registrant: AccountId,
    metadata_uri: Option<String>,
    registered_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
struct CommitmentCreatedEventData {
    event_id: u64,
    commitment_id: u64,
    token_id: u64,
    creator: AccountId,
    version: u32,
    created_at_ns: u64,
    deadline_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
struct CommitmentAmendedEventData {
    event_id: u64,
    commitment_id: u64,
    version: u32,
    actor: AccountId,
    amended_at_ns: u64,
    deadline_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
struct EvidenceSubmittedEventData {
    event_id: u64,
    evidence_id: u64,
    commitment_id: u64,
    version: u32,
    submitter: AccountId,
    reference: String,
    content_hash: String,
    submitted_at_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
struct ReviewEventData {
    event_id: u64,
    review_id: u64,
    reviewer: AccountId,
    commitment_id: u64,
    evidence_id: u64,
    version: u32,
    outcome: ReviewOutcome,
    submitted_at_ns: u64,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
struct ReviewNep297Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<ReviewEventData>,
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    TokensById,
    TokenIdsByIdentity,
    CommitmentsById,
    CommitmentVersions,
    HistoryEvents,
    EvidenceById,
    ReviewsById,
    ReviewByEvidenceAndReviewer,
    DisputesById,
    ActiveDisputesByTarget,
    DisputeResponses,
    DisputeResolutions,
}

#[near(contract_state)]
pub struct MemeProofRegistry {
    config: RegistryConfig,
    last_token_id: u64,
    last_commitment_id: u64,
    last_history_event_id: u64,
    last_evidence_id: u64,
    last_review_id: u64,
    last_dispute_id: u64,
    tokens_by_id: LookupMap<u64, TokenRecord>,
    token_ids_by_identity: LookupMap<TokenIdentity, u64>,
    commitments_by_id: LookupMap<u64, CommitmentRecord>,
    commitment_versions: LookupMap<(u64, u32), CommitmentVersion>,
    history_events: LookupMap<u64, HistoryEvent>,
    evidence_by_id: LookupMap<u64, EvidenceReference>,
    reviews_by_id: LookupMap<u64, ReviewRecord>,
    review_by_evidence_and_reviewer: LookupMap<(u64, AccountId), u64>,
    disputes_by_id: LookupMap<u64, DisputeRecord>,
    active_disputes_by_target: LookupMap<DisputeTarget, u64>,
    dispute_responses: LookupMap<u64, DisputeResponse>,
    dispute_resolutions: LookupMap<u64, DisputeResolutionRecord>,
}

impl Default for MemeProofRegistry {
    fn default() -> Self {
        Self {
            config: RegistryConfig {
                network_id: parse_network_id("testnet")
                    .expect("the configured network must be supported"),
                schema_version: SCHEMA_VERSION,
                max_text_bytes: MAX_TEXT_BYTES as u32,
                max_metadata_uri_bytes: MAX_METADATA_URI_BYTES as u32,
                max_page_size: MAX_PAGE_SIZE,
            },
            last_token_id: 0,
            last_commitment_id: 0,
            last_history_event_id: 0,
            last_evidence_id: 0,
            last_review_id: 0,
            last_dispute_id: 0,
            tokens_by_id: LookupMap::new(StorageKey::TokensById),
            token_ids_by_identity: LookupMap::new(StorageKey::TokenIdsByIdentity),
            commitments_by_id: LookupMap::new(StorageKey::CommitmentsById),
            commitment_versions: LookupMap::new(StorageKey::CommitmentVersions),
            history_events: LookupMap::new(StorageKey::HistoryEvents),
            evidence_by_id: LookupMap::new(StorageKey::EvidenceById),
            reviews_by_id: LookupMap::new(StorageKey::ReviewsById),
            review_by_evidence_and_reviewer: LookupMap::new(
                StorageKey::ReviewByEvidenceAndReviewer,
            ),
            disputes_by_id: LookupMap::new(StorageKey::DisputesById),
            active_disputes_by_target: LookupMap::new(StorageKey::ActiveDisputesByTarget),
            dispute_responses: LookupMap::new(StorageKey::DisputeResponses),
            dispute_resolutions: LookupMap::new(StorageKey::DisputeResolutions),
        }
    }
}

#[near]
impl MemeProofRegistry {
    #[init]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_config(&self) -> RegistryConfig {
        self.config.clone()
    }

    #[payable]
    pub fn open_dispute(
        &mut self,
        target: DisputeTarget,
        reason: String,
        proposed_resolver: AccountId,
    ) -> DisputeRecord {
        validate_bounded_text(&reason, MAX_DISPUTE_REASON_BYTES)
            .unwrap_or_else(|_| env::panic_str("Dispute reason is invalid."));
        let (commitment_id, version, evidence_id, affected_party) = match &target {
            DisputeTarget::Commitment {
                commitment_id,
                version,
            } => {
                if !self.commitments_by_id.contains_key(commitment_id) {
                    env::panic_str("Commitment does not exist.");
                }
                if !self
                    .commitment_versions
                    .contains_key(&(*commitment_id, *version))
                {
                    env::panic_str("Commitment or version does not exist.");
                }
                let commitment = self.commitments_by_id.get(commitment_id).unwrap();
                (*commitment_id, *version, None, commitment.creator.clone())
            }
            DisputeTarget::Evidence { evidence_id } => {
                let evidence = self
                    .evidence_by_id
                    .get(evidence_id)
                    .unwrap_or_else(|| env::panic_str("Evidence does not exist."));
                if !self.commitments_by_id.contains_key(&evidence.commitment_id)
                    || !self
                        .commitment_versions
                        .contains_key(&(evidence.commitment_id, evidence.version))
                {
                    env::panic_str("Evidence commitment context does not exist.");
                }
                (
                    evidence.commitment_id,
                    evidence.version,
                    Some(*evidence_id),
                    evidence.submitter.clone(),
                )
            }
        };
        if self.active_disputes_by_target.contains_key(&target) {
            env::panic_str("An active dispute already exists for this target.");
        }
        let opener = env::signer_account_id();
        if opener == affected_party {
            env::panic_str("A dispute cannot be opened by its affected party.");
        }
        if proposed_resolver == opener || proposed_resolver == affected_party {
            env::panic_str("The resolver must be a third party.");
        }
        let now = env::block_timestamp();
        let response_deadline_ns = now
            .checked_add(DISPUTE_RESPONSE_PERIOD_NS)
            .unwrap_or_else(|| env::panic_str("Dispute deadline overflowed."));
        let resolver_deadline_ns = now
            .checked_add(DISPUTE_RESOLVER_PERIOD_NS)
            .unwrap_or_else(|| env::panic_str("Dispute deadline overflowed."));
        let id = self
            .last_dispute_id
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("Dispute ID space is exhausted."));
        let previous_history = self.last_history_event_id;
        let raised_event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let proposed_event_id = self.allocate_history_event_id().unwrap_or_else(|_| {
            self.last_history_event_id = previous_history;
            env::panic_str("History event ID space is exhausted.")
        });
        let record = DisputeRecord {
            id,
            target: target.clone(),
            commitment_id,
            version,
            evidence_id,
            opener: opener.clone(),
            affected_party,
            proposed_resolver: proposed_resolver.clone(),
            proposal_by: opener.clone(),
            other_party_accepted: false,
            resolver_accepted: false,
            counterproposal_used: false,
            reason,
            created_at_ns: now,
            response_deadline_ns,
            resolver_deadline_ns,
            resolution_deadline_ns: None,
            status: DisputeStatus::Open,
        };
        let history = HistoryEvent {
            id: raised_event_id,
            actor: opener.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeRaised {
                dispute_id: id,
                target: target.clone(),
            },
        };
        let proposal_history = HistoryEvent {
            id: proposed_event_id,
            actor: opener.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeResolverProposed {
                dispute_id: id,
                resolver: proposed_resolver.clone(),
                counterproposal: false,
            },
        };
        let before = env::storage_usage();
        self.disputes_by_id.insert(id, record.clone());
        self.active_disputes_by_target.insert(target.clone(), id);
        self.history_events.insert(raised_event_id, history);
        self.history_events
            .insert(proposed_event_id, proposal_history);
        self.disputes_by_id.flush();
        self.active_disputes_by_target.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.disputes_by_id.remove(&id);
                self.active_disputes_by_target.remove(&target);
                self.history_events.remove(&raised_event_id);
                self.history_events.remove(&proposed_event_id);
                self.disputes_by_id.flush();
                self.active_disputes_by_target.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Dispute storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.disputes_by_id.remove(&id);
            self.active_disputes_by_target.remove(&target);
            self.history_events.remove(&raised_event_id);
            self.history_events.remove(&proposed_event_id);
            self.disputes_by_id.flush();
            self.active_disputes_by_target.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover dispute storage.");
        }
        self.last_dispute_id = id;
        refund_excess(attached - required);
        emit_dispute_event(
            "dispute_raised",
            near_sdk::serde_json::json!({
                "event_id": raised_event_id, "dispute_id": id, "actor": opener, "target": target,
                "commitment_id": commitment_id, "version": version, "evidence_id": evidence_id,
                "proposed_resolver": proposed_resolver, "created_at_ns": now
            }),
        );
        emit_dispute_event(
            "dispute_resolver_proposed",
            near_sdk::serde_json::json!({
                "event_id": proposed_event_id, "dispute_id": id, "actor": opener,
                "resolver": proposed_resolver, "counterproposal": false, "occurred_at_ns": now
            }),
        );
        record
    }

    #[payable]
    pub fn respond_to_dispute(&mut self, dispute_id: u64, response: String) -> DisputeResponse {
        validate_bounded_text(&response, MAX_DISPUTE_RESPONSE_BYTES)
            .unwrap_or_else(|_| env::panic_str("Dispute response is invalid."));
        let dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let responder = env::signer_account_id();
        let now = env::block_timestamp();
        if !matches!(
            dispute.status,
            DisputeStatus::Open | DisputeStatus::UnderReview
        ) || now >= dispute.response_deadline_ns
        {
            env::panic_str("Dispute response period has ended.");
        }
        if responder != dispute.affected_party {
            env::panic_str("Only the affected party may respond.");
        }
        if self.dispute_responses.contains_key(&dispute_id) {
            env::panic_str("A response has already been recorded.");
        }
        let previous_history = self.last_history_event_id;
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let record = DisputeResponse {
            dispute_id,
            responder: responder.clone(),
            response,
            responded_at_ns: now,
        };
        let history = HistoryEvent {
            id: event_id,
            actor: responder.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeResponded { dispute_id },
        };
        let before = env::storage_usage();
        self.dispute_responses.insert(dispute_id, record.clone());
        self.history_events.insert(event_id, history);
        self.dispute_responses.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.dispute_responses.remove(&dispute_id);
                self.history_events.remove(&event_id);
                self.dispute_responses.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Dispute response storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.dispute_responses.remove(&dispute_id);
            self.history_events.remove(&event_id);
            self.dispute_responses.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover dispute response storage.");
        }
        refund_excess(attached - required);
        emit_dispute_event(
            "dispute_responded",
            near_sdk::serde_json::json!({ "event_id": event_id, "dispute_id": dispute_id, "actor": responder, "responded_at_ns": now }),
        );
        record
    }

    #[payable]
    pub fn counterpropose_dispute_resolver(
        &mut self,
        dispute_id: u64,
        resolver: AccountId,
    ) -> DisputeRecord {
        let mut dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let actor = env::signer_account_id();
        let now = env::block_timestamp();
        if dispute.status != DisputeStatus::Open || now >= dispute.resolver_deadline_ns {
            env::panic_str("Resolver agreement period has ended.");
        }
        if dispute.counterproposal_used {
            env::panic_str("The counterproposal has already been used.");
        }
        let expected = if dispute.proposal_by == dispute.opener {
            &dispute.affected_party
        } else {
            &dispute.opener
        };
        if &actor != expected {
            env::panic_str("Only the other disputing party may counterpropose.");
        }
        if resolver == dispute.opener || resolver == dispute.affected_party {
            env::panic_str("The resolver must be a third party.");
        }
        let old = dispute.clone();
        let previous_history = self.last_history_event_id;
        dispute.proposed_resolver = resolver.clone();
        dispute.proposal_by = actor.clone();
        dispute.other_party_accepted = false;
        dispute.resolver_accepted = false;
        dispute.counterproposal_used = true;
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let history = HistoryEvent {
            id: event_id,
            actor: actor.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeResolverProposed {
                dispute_id,
                resolver: resolver.clone(),
                counterproposal: true,
            },
        };
        let before = env::storage_usage();
        self.disputes_by_id.insert(dispute_id, dispute.clone());
        self.history_events.insert(event_id, history);
        self.disputes_by_id.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.disputes_by_id.insert(dispute_id, old.clone());
                self.history_events.remove(&event_id);
                self.disputes_by_id.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Resolver proposal storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.disputes_by_id.insert(dispute_id, old);
            self.history_events.remove(&event_id);
            self.disputes_by_id.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover resolver proposal storage.");
        }
        refund_excess(attached - required);
        emit_dispute_event(
            "dispute_resolver_proposed",
            near_sdk::serde_json::json!({ "event_id": event_id, "dispute_id": dispute_id, "actor": actor, "resolver": resolver, "counterproposal": true, "occurred_at_ns": now }),
        );
        dispute
    }

    #[payable]
    pub fn accept_dispute_resolver(&mut self, dispute_id: u64) -> DisputeRecord {
        let mut dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let actor = env::signer_account_id();
        let now = env::block_timestamp();
        if dispute.status != DisputeStatus::Open || now >= dispute.resolver_deadline_ns {
            env::panic_str("Resolver agreement period has ended.");
        }
        let expected = if dispute.proposal_by == dispute.opener {
            &dispute.affected_party
        } else {
            &dispute.opener
        };
        if &actor != expected {
            env::panic_str("Only the other disputing party may accept the resolver.");
        }
        if dispute.other_party_accepted {
            env::panic_str("The resolver proposal was already accepted.");
        }
        dispute.other_party_accepted = true;
        self.store_dispute_transition(dispute_id, dispute, actor, now, false)
    }

    #[payable]
    pub fn accept_dispute_appointment(&mut self, dispute_id: u64) -> DisputeRecord {
        let mut dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let actor = env::signer_account_id();
        let now = env::block_timestamp();
        if dispute.status != DisputeStatus::Open || now >= dispute.resolver_deadline_ns {
            env::panic_str("Resolver agreement period has ended.");
        }
        if actor != dispute.proposed_resolver {
            env::panic_str("Only the proposed resolver may accept the appointment.");
        }
        if dispute.resolver_accepted {
            env::panic_str("Resolver appointment was already accepted.");
        }
        dispute.resolver_accepted = true;
        self.store_dispute_transition(dispute_id, dispute, actor, now, true)
    }

    fn store_dispute_transition(
        &mut self,
        dispute_id: u64,
        mut dispute: DisputeRecord,
        actor: AccountId,
        now: u64,
        resolver_acceptance: bool,
    ) -> DisputeRecord {
        let old = self.disputes_by_id.get(&dispute_id).cloned().unwrap();
        let previous_history = self.last_history_event_id;
        let under_review_deadline = if dispute.other_party_accepted && dispute.resolver_accepted {
            Some(
                now.checked_add(DISPUTE_RESOLUTION_PERIOD_NS)
                    .unwrap_or_else(|| env::panic_str("Dispute deadline overflowed.")),
            )
        } else {
            None
        };
        let accepted_event = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let accepted_kind = if resolver_acceptance {
            HistoryEventKind::DisputeNomineeAccepted {
                dispute_id,
                resolver: dispute.proposed_resolver.clone(),
            }
        } else {
            HistoryEventKind::DisputePartyAcceptedResolver {
                dispute_id,
                resolver: dispute.proposed_resolver.clone(),
            }
        };
        let mut events = vec![(
            accepted_event,
            HistoryEvent {
                id: accepted_event,
                actor: actor.clone(),
                occurred_at_ns: now,
                kind: accepted_kind,
            },
        )];
        if let Some(deadline) = under_review_deadline {
            dispute.status = DisputeStatus::UnderReview;
            dispute.resolution_deadline_ns = Some(deadline);
            let id = self.allocate_history_event_id().unwrap_or_else(|_| {
                self.last_history_event_id = previous_history;
                env::panic_str("History event ID space is exhausted.")
            });
            events.push((
                id,
                HistoryEvent {
                    id,
                    actor: actor.clone(),
                    occurred_at_ns: now,
                    kind: HistoryEventKind::DisputeUnderReview { dispute_id },
                },
            ));
        }
        let before = env::storage_usage();
        self.disputes_by_id.insert(dispute_id, dispute.clone());
        for (id, event) in &events {
            self.history_events.insert(*id, event.clone());
        }
        self.disputes_by_id.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.disputes_by_id.insert(dispute_id, old.clone());
                for (id, _) in &events {
                    self.history_events.remove(id);
                }
                self.disputes_by_id.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Resolver acceptance storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.disputes_by_id.insert(dispute_id, old);
            for (id, _) in &events {
                self.history_events.remove(id);
            }
            self.disputes_by_id.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover resolver acceptance storage.");
        }
        refund_excess(attached - required);
        emit_dispute_event(
            if resolver_acceptance {
                "dispute_resolver_accepted"
            } else {
                "dispute_resolver_agreed"
            },
            near_sdk::serde_json::json!({ "event_id": accepted_event, "dispute_id": dispute_id, "actor": actor, "resolver": dispute.proposed_resolver, "occurred_at_ns": now }),
        );
        if dispute.status == DisputeStatus::UnderReview {
            emit_dispute_event(
                "dispute_under_review",
                near_sdk::serde_json::json!({ "event_id": events[1].0, "dispute_id": dispute_id, "actor": actor, "resolution_deadline_ns": dispute.resolution_deadline_ns }),
            );
        }
        dispute
    }

    #[payable]
    pub fn resolve_dispute(
        &mut self,
        dispute_id: u64,
        disposition: DisputeDisposition,
        rationale: String,
    ) -> DisputeResolutionRecord {
        validate_bounded_text(&rationale, MAX_DISPUTE_RATIONALE_BYTES)
            .unwrap_or_else(|_| env::panic_str("Dispute rationale is invalid."));
        let mut dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let resolver = env::signer_account_id();
        let now = env::block_timestamp();
        if dispute.status != DisputeStatus::UnderReview
            || now >= dispute.resolution_deadline_ns.unwrap_or(0)
        {
            env::panic_str("Dispute is not open for resolution.");
        }
        if !self.dispute_responses.contains_key(&dispute_id) && now < dispute.response_deadline_ns {
            env::panic_str("The response period is still open.");
        }
        if resolver != dispute.proposed_resolver
            || !dispute.resolver_accepted
            || !dispute.other_party_accepted
        {
            env::panic_str("Only the accepted resolver may resolve this dispute.");
        }
        let previous_history = self.last_history_event_id;
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let record = DisputeResolutionRecord {
            dispute_id,
            resolver: resolver.clone(),
            disposition,
            rationale,
            resolved_at_ns: now,
        };
        let history = HistoryEvent {
            id: event_id,
            actor: resolver.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeResolved { dispute_id },
        };
        let old = dispute.clone();
        dispute.status = DisputeStatus::Resolved;
        let before = env::storage_usage();
        self.disputes_by_id.insert(dispute_id, dispute.clone());
        self.dispute_resolutions.insert(dispute_id, record.clone());
        self.active_disputes_by_target.remove(&dispute.target);
        self.history_events.insert(event_id, history);
        self.disputes_by_id.flush();
        self.dispute_resolutions.flush();
        self.active_disputes_by_target.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.disputes_by_id.insert(dispute_id, old);
                self.dispute_resolutions.remove(&dispute_id);
                self.active_disputes_by_target
                    .insert(dispute.target.clone(), dispute_id);
                self.history_events.remove(&event_id);
                self.disputes_by_id.flush();
                self.dispute_resolutions.flush();
                self.active_disputes_by_target.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Dispute resolution storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.disputes_by_id.insert(dispute_id, old);
            self.dispute_resolutions.remove(&dispute_id);
            self.active_disputes_by_target
                .insert(dispute.target.clone(), dispute_id);
            self.history_events.remove(&event_id);
            self.disputes_by_id.flush();
            self.dispute_resolutions.flush();
            self.active_disputes_by_target.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover dispute resolution storage.");
        }
        refund_excess(attached - required);
        emit_dispute_event(
            "dispute_resolved",
            near_sdk::serde_json::json!({ "event_id": event_id, "dispute_id": dispute_id, "actor": resolver, "disposition": disposition, "resolved_at_ns": now }),
        );
        record
    }

    #[payable]
    pub fn expire_dispute(&mut self, dispute_id: u64) -> DisputeRecord {
        let mut dispute = self
            .disputes_by_id
            .get(&dispute_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Dispute does not exist."));
        let now = env::block_timestamp();
        let expired = match dispute.status {
            DisputeStatus::Open => now >= dispute.resolver_deadline_ns,
            DisputeStatus::UnderReview => now >= dispute.resolution_deadline_ns.unwrap_or(u64::MAX),
            DisputeStatus::Resolved | DisputeStatus::Expired => false,
        };
        if !expired {
            env::panic_str("Dispute has not reached its expiry deadline.");
        }
        let actor = env::signer_account_id();
        let old = dispute.clone();
        let previous_history = self.last_history_event_id;
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        dispute.status = DisputeStatus::Expired;
        let history = HistoryEvent {
            id: event_id,
            actor: actor.clone(),
            occurred_at_ns: now,
            kind: HistoryEventKind::DisputeExpired { dispute_id },
        };
        let before = env::storage_usage();
        self.disputes_by_id.insert(dispute_id, dispute.clone());
        self.active_disputes_by_target.remove(&dispute.target);
        self.history_events.insert(event_id, history);
        self.disputes_by_id.flush();
        self.active_disputes_by_target.flush();
        self.history_events.flush();
        let required = match storage_cost_for_growth(before, env::storage_usage()) {
            Some(value) => value,
            None => {
                self.disputes_by_id.insert(dispute_id, old);
                self.active_disputes_by_target
                    .insert(dispute.target.clone(), dispute_id);
                self.history_events.remove(&event_id);
                self.disputes_by_id.flush();
                self.active_disputes_by_target.flush();
                self.history_events.flush();
                self.last_history_event_id = previous_history;
                env::panic_str("Dispute expiry storage accounting failed.");
            }
        };
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            self.disputes_by_id.insert(dispute_id, old);
            self.active_disputes_by_target
                .insert(dispute.target.clone(), dispute_id);
            self.history_events.remove(&event_id);
            self.disputes_by_id.flush();
            self.active_disputes_by_target.flush();
            self.history_events.flush();
            self.last_history_event_id = previous_history;
            env::panic_str("Attached deposit does not cover dispute expiry storage.");
        }
        refund_excess(attached - required);
        emit_dispute_event(
            "dispute_expired",
            near_sdk::serde_json::json!({ "event_id": event_id, "dispute_id": dispute_id, "actor": actor, "expired_at_ns": now }),
        );
        dispute
    }

    pub fn get_dispute(&self, dispute_id: u64) -> Option<DisputeRecord> {
        self.disputes_by_id.get(&dispute_id).cloned()
    }
    pub fn get_dispute_response(&self, dispute_id: u64) -> Option<DisputeResponse> {
        self.dispute_responses.get(&dispute_id).cloned()
    }
    pub fn get_dispute_resolution(&self, dispute_id: u64) -> Option<DisputeResolutionRecord> {
        self.dispute_resolutions.get(&dispute_id).cloned()
    }
    pub fn get_disputes(&self, after_id: Option<u64>, limit: Option<u32>) -> DisputePage {
        self.dispute_page(None, None, after_id, limit)
    }
    pub fn get_disputes_by_commitment(
        &self,
        commitment_id: u64,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> DisputePage {
        self.dispute_page(Some(commitment_id), None, after_id, limit)
    }
    pub fn get_disputes_by_evidence(
        &self,
        evidence_id: u64,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> DisputePage {
        self.dispute_page(None, Some(evidence_id), after_id, limit)
    }
    fn dispute_page(
        &self,
        commitment_id: Option<u64>,
        evidence_id: Option<u64>,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> DisputePage {
        let limit = checked_page_limit(limit);
        let Some(mut id) = after_id.unwrap_or(0).checked_add(1) else {
            return DisputePage {
                records: vec![],
                next_cursor: None,
            };
        };
        let mut records = Vec::new();
        let mut scanned = 0;
        let mut last = None;
        while id <= self.last_dispute_id && scanned < limit {
            if let Some(item) = self.disputes_by_id.get(&id) {
                if commitment_id.is_none_or(|v| v == item.commitment_id)
                    && evidence_id.is_none_or(|v| Some(v) == item.evidence_id)
                {
                    records.push(item.clone());
                }
            }
            scanned += 1;
            last = Some(id);
            let Some(next) = id.checked_add(1) else { break };
            id = next;
        }
        DisputePage {
            records,
            next_cursor: (id <= self.last_dispute_id).then_some(last).flatten(),
        }
    }

    pub fn get_history_events(
        &self,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> HistoryEventPage {
        let limit = checked_page_limit(limit);
        let Some(mut id) = after_id.unwrap_or(0).checked_add(1) else {
            return HistoryEventPage {
                records: vec![],
                next_cursor: None,
            };
        };
        let mut records = Vec::new();
        let mut scanned = 0;
        let mut last = None;
        while id <= self.last_history_event_id && scanned < limit {
            if let Some(item) = self.history_events.get(&id) {
                records.push(item.clone());
            }
            scanned += 1;
            last = Some(id);
            let Some(next) = id.checked_add(1) else { break };
            id = next;
        }
        HistoryEventPage {
            records,
            next_cursor: (id <= self.last_history_event_id).then_some(last).flatten(),
        }
    }

    pub fn get_commitment(&self, commitment_id: u64) -> Option<CommitmentWithCurrentVersion> {
        let commitment = self.commitments_by_id.get(&commitment_id)?.clone();
        let current_version = self
            .commitment_versions
            .get(&(commitment_id, commitment.current_version))?
            .clone();
        Some(CommitmentWithCurrentVersion {
            commitment,
            current_version,
        })
    }

    pub fn get_commitment_version(
        &self,
        commitment_id: u64,
        version: u32,
    ) -> Option<CommitmentVersion> {
        self.commitment_versions
            .get(&(commitment_id, version))
            .cloned()
    }

    pub fn get_evidence(&self, evidence_id: u64) -> Option<EvidenceReference> {
        self.evidence_by_id.get(&evidence_id).cloned()
    }

    #[payable]
    pub fn submit_review(
        &mut self,
        evidence_id: u64,
        outcome: ReviewOutcome,
        explanation: String,
    ) -> ReviewRecord {
        let evidence = self
            .evidence_by_id
            .get(&evidence_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Evidence does not exist."));
        validate_bounded_text(&explanation, MAX_REVIEW_EXPLANATION_BYTES)
            .unwrap_or_else(|_| env::panic_str("Review explanation is invalid."));
        let reviewer = env::signer_account_id();
        let duplicate_key = (evidence_id, reviewer.clone());
        if self
            .review_by_evidence_and_reviewer
            .contains_key(&duplicate_key)
        {
            env::panic_str("Reviewer has already reviewed this evidence.");
        }
        let previous_review_id = self.last_review_id;
        let previous_history_id = self.last_history_event_id;
        let review_id = previous_review_id
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("Review ID space is exhausted."));
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let submitted_at_ns = env::block_timestamp();
        let record = ReviewRecord {
            id: review_id,
            reviewer: reviewer.clone(),
            commitment_id: evidence.commitment_id,
            evidence_id,
            version: evidence.version,
            outcome,
            explanation,
            submitted_at_ns,
        };
        let history = HistoryEvent {
            id: event_id,
            actor: reviewer.clone(),
            occurred_at_ns: submitted_at_ns,
            kind: HistoryEventKind::ReviewRecorded {
                commitment_id: evidence.commitment_id,
                review_id,
            },
        };
        let before = env::storage_usage();
        self.reviews_by_id.insert(review_id, record.clone());
        self.review_by_evidence_and_reviewer
            .insert(duplicate_key.clone(), review_id);
        self.history_events.insert(event_id, history);
        self.reviews_by_id.flush();
        self.review_by_evidence_and_reviewer.flush();
        self.history_events.flush();
        let rollback = |this: &mut Self| {
            this.reviews_by_id.remove(&review_id);
            this.review_by_evidence_and_reviewer.remove(&duplicate_key);
            this.history_events.remove(&event_id);
            this.reviews_by_id.flush();
            this.review_by_evidence_and_reviewer.flush();
            this.history_events.flush();
            this.last_review_id = previous_review_id;
            this.last_history_event_id = previous_history_id;
        };
        let increase =
            checked_storage_increase(before, env::storage_usage()).unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Review storage accounting failed.")
            });
        let required = checked_storage_cost(env::storage_byte_cost().as_yoctonear(), increase)
            .unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Review storage cost overflowed.")
            });
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            rollback(self);
            env::panic_str("Attached deposit does not cover review storage.");
        }
        let refund = attached - required;
        refund_excess(refund);
        let event = ReviewNep297Event {
            standard: "memeproof".into(),
            version: "1.0.0".into(),
            event: "review_submitted".into(),
            data: vec![ReviewEventData {
                event_id,
                review_id,
                reviewer,
                commitment_id: evidence.commitment_id,
                evidence_id,
                version: evidence.version,
                outcome,
                submitted_at_ns,
            }],
        };
        let json = near_sdk::serde_json::to_string(&event)
            .unwrap_or_else(|_| env::panic_str("Review event serialization failed."));
        env::log_str(&format!("EVENT_JSON:{json}"));
        self.last_review_id = review_id;
        record
    }

    pub fn get_review(&self, review_id: u64) -> Option<ReviewRecord> {
        self.reviews_by_id.get(&review_id).cloned()
    }

    pub fn get_reviews(&self, after_id: Option<u64>, limit: Option<u32>) -> ReviewPage {
        self.review_page(None, after_id, limit)
    }

    pub fn get_reviews_by_evidence(
        &self,
        evidence_id: u64,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> ReviewPage {
        self.review_page(Some(evidence_id), after_id, limit)
    }

    fn review_page(
        &self,
        evidence_id: Option<u64>,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> ReviewPage {
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
        assert!(
            (1..=MAX_PAGE_SIZE).contains(&limit),
            "Page limit must be between 1 and {MAX_PAGE_SIZE}."
        );
        let Some(mut id) = after_id.unwrap_or(0).checked_add(1) else {
            return ReviewPage {
                records: vec![],
                next_cursor: None,
            };
        };
        let mut records = Vec::new();
        let mut scanned = 0;
        let mut last = None;
        while id <= self.last_review_id && scanned < limit {
            if let Some(review) = self.reviews_by_id.get(&id) {
                if evidence_id.is_none_or(|wanted| wanted == review.evidence_id) {
                    records.push(review.clone());
                }
            }
            scanned += 1;
            last = Some(id);
            let Some(next) = id.checked_add(1) else { break };
            id = next;
        }
        ReviewPage {
            records,
            next_cursor: (id <= self.last_review_id).then_some(last).flatten(),
        }
    }

    pub fn get_evidences(&self, after_id: Option<u64>, limit: Option<u32>) -> EvidencePage {
        self.evidence_page(None, after_id, limit)
    }

    pub fn get_commitment_evidences(
        &self,
        commitment_id: u64,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> EvidencePage {
        self.evidence_page(Some(commitment_id), after_id, limit)
    }

    fn evidence_page(
        &self,
        commitment_id: Option<u64>,
        after_id: Option<u64>,
        limit: Option<u32>,
    ) -> EvidencePage {
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
        assert!(
            (1..=MAX_PAGE_SIZE).contains(&limit),
            "Page limit must be between 1 and {MAX_PAGE_SIZE}."
        );
        let Some(mut id) = after_id.unwrap_or(0).checked_add(1) else {
            return EvidencePage {
                records: vec![],
                next_cursor: None,
            };
        };
        let mut records = Vec::new();
        let mut scanned = 0;
        let mut last_scanned = None;
        while id <= self.last_evidence_id && scanned < limit {
            if let Some(record) = self.evidence_by_id.get(&id) {
                if commitment_id.is_none_or(|wanted| wanted == record.commitment_id) {
                    records.push(record.clone());
                }
            }
            scanned += 1;
            last_scanned = Some(id);
            let Some(next) = id.checked_add(1) else { break };
            id = next;
        }
        EvidencePage {
            records,
            next_cursor: (id <= self.last_evidence_id)
                .then_some(last_scanned)
                .flatten(),
        }
    }

    #[payable]
    pub fn submit_evidence(
        &mut self,
        commitment_id: u64,
        version: u32,
        reference: String,
        content_hash: String,
    ) -> EvidenceReference {
        if !self.commitments_by_id.contains_key(&commitment_id) {
            env::panic_str("Commitment does not exist.");
        }
        if !self
            .commitment_versions
            .contains_key(&(commitment_id, version))
        {
            env::panic_str("Commitment version does not exist.");
        }
        validate_metadata_uri(&reference).unwrap_or_else(|_| {
            env::panic_str("Evidence reference must be a valid public HTTPS or IPFS URI.")
        });
        validate_sha256_hex(&content_hash).unwrap_or_else(|_| {
            env::panic_str("Evidence content hash must be 64 hexadecimal characters.")
        });
        let previous_evidence_id = self.last_evidence_id;
        let previous_history_id = self.last_history_event_id;
        let evidence_id = self
            .last_evidence_id
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("Evidence ID space is exhausted."));
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let submitter = env::signer_account_id();
        let submitted_at_ns = env::block_timestamp();
        let record = EvidenceReference {
            id: evidence_id,
            commitment_id,
            version,
            reference: reference.clone(),
            content_hash: content_hash.clone(),
            submitter: submitter.clone(),
            submitted_at_ns,
        };
        let history = HistoryEvent {
            id: event_id,
            actor: submitter.clone(),
            occurred_at_ns: submitted_at_ns,
            kind: HistoryEventKind::EvidenceSubmitted {
                commitment_id,
                evidence_id,
            },
        };
        let before = env::storage_usage();
        self.evidence_by_id.insert(evidence_id, record.clone());
        self.history_events.insert(event_id, history);
        self.evidence_by_id.flush();
        self.history_events.flush();
        let rollback = |this: &mut Self| {
            this.evidence_by_id.remove(&evidence_id);
            this.history_events.remove(&event_id);
            this.evidence_by_id.flush();
            this.history_events.flush();
            this.last_evidence_id = previous_evidence_id;
            this.last_history_event_id = previous_history_id;
        };
        let increase =
            checked_storage_increase(before, env::storage_usage()).unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Evidence storage accounting failed.")
            });
        let required = checked_storage_cost(env::storage_byte_cost().as_yoctonear(), increase)
            .unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Evidence storage cost overflowed.")
            });
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            rollback(self);
            env::panic_str("Attached deposit does not cover evidence storage.");
        }
        let refund = attached - required;
        refund_excess(refund);
        let event = EvidenceSubmittedNep297Event {
            standard: "memeproof".into(),
            version: "1.0.0".into(),
            event: "evidence_submitted".into(),
            data: vec![EvidenceSubmittedEventData {
                event_id,
                evidence_id,
                commitment_id,
                version,
                submitter,
                reference,
                content_hash,
                submitted_at_ns,
            }],
        };
        let json = near_sdk::serde_json::to_string(&event)
            .unwrap_or_else(|_| env::panic_str("Evidence event serialization failed."));
        env::log_str(&format!("EVENT_JSON:{json}"));
        self.last_evidence_id = evidence_id;
        record
    }

    pub fn get_commitment_versions(
        &self,
        commitment_id: u64,
        after_version: Option<u32>,
        limit: Option<u32>,
    ) -> CommitmentVersionPage {
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
        assert!(
            (1..=MAX_PAGE_SIZE).contains(&limit),
            "Page limit must be between 1 and {MAX_PAGE_SIZE}."
        );
        let Some(commitment) = self.commitments_by_id.get(&commitment_id) else {
            return CommitmentVersionPage {
                versions: Vec::new(),
                next_cursor: None,
            };
        };
        let Some(mut candidate) = after_version.unwrap_or(0).checked_add(1) else {
            return CommitmentVersionPage {
                versions: Vec::new(),
                next_cursor: None,
            };
        };
        let mut versions = Vec::new();
        while candidate <= commitment.current_version && versions.len() < limit as usize {
            if let Some(version) = self.commitment_versions.get(&(commitment_id, candidate)) {
                versions.push(version.clone());
            }
            let Some(next) = candidate.checked_add(1) else {
                break;
            };
            candidate = next;
        }
        let next_cursor = (candidate <= commitment.current_version).then_some(candidate - 1);
        CommitmentVersionPage {
            versions,
            next_cursor,
        }
    }

    #[payable]
    pub fn amend_commitment(
        &mut self,
        commitment_id: u64,
        title: String,
        description: String,
        criteria: String,
        deadline_at_ns: u64,
    ) -> CommitmentWithCurrentVersion {
        let mut commitment = self
            .commitments_by_id
            .get(&commitment_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Commitment does not exist."));
        let signer = env::signer_account_id();
        if signer != commitment.creator {
            env::panic_str("Only the commitment creator may amend it.");
        }
        validate_bounded_text(&title, MAX_COMMITMENT_TITLE_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment title is invalid."));
        validate_bounded_text(&description, MAX_COMMITMENT_DESCRIPTION_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment description is invalid."));
        validate_bounded_text(&criteria, MAX_COMMITMENT_CRITERIA_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment criteria are invalid."));
        if deadline_at_ns <= env::block_timestamp() {
            env::panic_str("Commitment deadline must be in the future.");
        }
        let previous_commitment = commitment.clone();
        let previous_history_id = self.last_history_event_id;
        let version_number = commitment
            .current_version
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("Commitment version space is exhausted."));
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let amended_at_ns = env::block_timestamp();
        let version = CommitmentVersion {
            version: version_number,
            title,
            description,
            criteria,
            deadline_at_ns,
            created_at_ns: amended_at_ns,
        };
        let history = HistoryEvent {
            id: event_id,
            actor: signer.clone(),
            occurred_at_ns: amended_at_ns,
            kind: HistoryEventKind::CommitmentAmended {
                commitment_id,
                version: version_number,
            },
        };
        let storage_before = env::storage_usage();
        self.commitment_versions
            .insert((commitment_id, version_number), version.clone());
        self.history_events.insert(event_id, history);
        commitment.current_version = version_number;
        self.commitments_by_id
            .insert(commitment_id, commitment.clone());
        self.commitment_versions.flush();
        self.history_events.flush();
        self.commitments_by_id.flush();
        let rollback = |this: &mut Self| {
            this.commitment_versions
                .remove(&(commitment_id, version_number));
            this.history_events.remove(&event_id);
            this.commitments_by_id
                .insert(commitment_id, previous_commitment.clone());
            this.commitment_versions.flush();
            this.history_events.flush();
            this.commitments_by_id.flush();
            this.last_history_event_id = previous_history_id;
        };
        let increase = checked_storage_increase(storage_before, env::storage_usage())
            .unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Commitment amendment storage accounting failed.")
            });
        let required = checked_storage_cost(env::storage_byte_cost().as_yoctonear(), increase)
            .unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Commitment amendment storage cost overflowed.")
            });
        let attached = env::attached_deposit().as_yoctonear();
        if attached < required {
            rollback(self);
            env::panic_str("Attached deposit does not cover commitment amendment storage.");
        }
        let refund = attached - required;
        refund_excess(refund);
        let event = CommitmentAmendedNep297Event {
            standard: "memeproof".to_owned(),
            version: "1.0.0".to_owned(),
            event: "commitment_amended".to_owned(),
            data: vec![CommitmentAmendedEventData {
                event_id,
                commitment_id,
                version: version_number,
                actor: signer,
                amended_at_ns,
                deadline_at_ns,
            }],
        };
        let json = near_sdk::serde_json::to_string(&event)
            .unwrap_or_else(|_| env::panic_str("Commitment amendment event serialization failed."));
        env::log_str(&format!("EVENT_JSON:{json}"));
        CommitmentWithCurrentVersion {
            commitment,
            current_version: version,
        }
    }

    #[payable]
    pub fn create_commitment(
        &mut self,
        token_id: u64,
        title: String,
        description: String,
        criteria: String,
        deadline_at_ns: u64,
    ) -> CommitmentWithCurrentVersion {
        if !self.tokens_by_id.contains_key(&token_id) {
            env::panic_str("Token is not registered.");
        }
        validate_bounded_text(&title, MAX_COMMITMENT_TITLE_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment title is invalid."));
        validate_bounded_text(&description, MAX_COMMITMENT_DESCRIPTION_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment description is invalid."));
        validate_bounded_text(&criteria, MAX_COMMITMENT_CRITERIA_BYTES)
            .unwrap_or_else(|_| env::panic_str("Commitment criteria are invalid."));
        if deadline_at_ns <= env::block_timestamp() {
            env::panic_str("Commitment deadline must be in the future.");
        }

        let previous_commitment_id = self.last_commitment_id;
        let previous_history_event_id = self.last_history_event_id;
        let commitment_id = self
            .allocate_commitment_id()
            .unwrap_or_else(|_| env::panic_str("Commitment ID space is exhausted."));
        let event_id = self.allocate_history_event_id().unwrap_or_else(|_| {
            self.last_commitment_id = previous_commitment_id;
            env::panic_str("History event ID space is exhausted.")
        });
        let creator = env::signer_account_id();
        let created_at_ns = env::block_timestamp();
        let commitment = CommitmentRecord {
            id: commitment_id,
            token_id,
            creator: creator.clone(),
            current_version: 1,
            created_at_ns,
        };
        let version = CommitmentVersion {
            version: 1,
            title,
            description,
            criteria,
            deadline_at_ns,
            created_at_ns,
        };
        let history_event = HistoryEvent {
            id: event_id,
            actor: creator.clone(),
            occurred_at_ns: created_at_ns,
            kind: HistoryEventKind::CommitmentCreated { commitment_id },
        };

        let storage_before = env::storage_usage();
        self.commitments_by_id
            .insert(commitment_id, commitment.clone());
        self.commitment_versions
            .insert((commitment_id, 1), version.clone());
        self.history_events.insert(event_id, history_event);
        self.commitments_by_id.flush();
        self.commitment_versions.flush();
        self.history_events.flush();

        let rollback = |this: &mut Self| {
            this.commitments_by_id.remove(&commitment_id);
            this.commitment_versions.remove(&(commitment_id, 1));
            this.history_events.remove(&event_id);
            this.commitments_by_id.flush();
            this.commitment_versions.flush();
            this.history_events.flush();
            this.last_commitment_id = previous_commitment_id;
            this.last_history_event_id = previous_history_event_id;
        };
        let storage_increase = checked_storage_increase(storage_before, env::storage_usage())
            .unwrap_or_else(|| {
                rollback(self);
                env::panic_str("Commitment storage accounting failed.")
            });
        let required_deposit =
            checked_storage_cost(env::storage_byte_cost().as_yoctonear(), storage_increase)
                .unwrap_or_else(|| {
                    rollback(self);
                    env::panic_str("Commitment storage cost overflowed.")
                });
        let attached_deposit = env::attached_deposit().as_yoctonear();
        if attached_deposit < required_deposit {
            rollback(self);
            env::panic_str("Attached deposit does not cover commitment storage.");
        }
        let refund = attached_deposit - required_deposit;
        refund_excess(refund);
        let event = CommitmentNep297Event {
            standard: "memeproof".to_owned(),
            version: "1.0.0".to_owned(),
            event: "commitment_created".to_owned(),
            data: vec![CommitmentCreatedEventData {
                event_id,
                commitment_id,
                token_id,
                creator,
                version: 1,
                created_at_ns,
                deadline_at_ns: version.deadline_at_ns,
            }],
        };
        let event_json = near_sdk::serde_json::to_string(&event)
            .unwrap_or_else(|_| env::panic_str("Commitment event serialization failed."));
        env::log_str(&format!("EVENT_JSON:{event_json}"));
        CommitmentWithCurrentVersion {
            commitment,
            current_version: version,
        }
    }

    #[payable]
    pub fn register_token(
        &mut self,
        token_contract_address: String,
        metadata_uri: Option<String>,
    ) -> TokenRecord {
        let token_contract_address = parse_near_account_id(&token_contract_address)
            .unwrap_or_else(|_| env::panic_str("Invalid NEAR token contract account ID."));
        if let Some(uri) = metadata_uri.as_deref() {
            validate_metadata_uri(uri).unwrap_or_else(|_| {
                env::panic_str("Metadata URI must be a valid public HTTPS or IPFS URI.")
            });
        }

        let identity = TokenIdentity {
            network_id: self.config.network_id,
            token_contract_address,
        };
        if self.token_ids_by_identity.contains_key(&identity) {
            env::panic_str("Token is already registered on this network.");
        }

        let token_id = self
            .allocate_token_id()
            .unwrap_or_else(|_| env::panic_str("Token ID space is exhausted."));
        let event_id = self
            .allocate_history_event_id()
            .unwrap_or_else(|_| env::panic_str("History event ID space is exhausted."));
        let registrant = env::signer_account_id();
        let registered_at_ns = env::block_timestamp();
        let record = TokenRecord {
            id: token_id,
            identity: identity.clone(),
            registrant: registrant.clone(),
            created_at_ns: registered_at_ns,
            metadata_uri: metadata_uri.clone(),
            status: TokenStatus::Active,
        };
        let history_event = HistoryEvent {
            id: event_id,
            actor: registrant.clone(),
            occurred_at_ns: registered_at_ns,
            kind: HistoryEventKind::TokenRegistered { token_id },
        };

        let storage_before = env::storage_usage();
        self.tokens_by_id.insert(token_id, record.clone());
        self.token_ids_by_identity
            .insert(identity.clone(), token_id);
        self.history_events.insert(event_id, history_event);
        self.tokens_by_id.flush();
        self.token_ids_by_identity.flush();
        self.history_events.flush();

        let storage_increase = env::storage_usage()
            .checked_sub(storage_before)
            .unwrap_or_else(|| {
                self.rollback_token_registration(token_id, event_id, &identity);
                env::panic_str("Token registration storage accounting failed.")
            });
        let required_deposit = env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(storage_increase))
            .unwrap_or_else(|| {
                self.rollback_token_registration(token_id, event_id, &identity);
                env::panic_str("Token registration storage cost overflowed.")
            });
        let attached_deposit = env::attached_deposit().as_yoctonear();
        if attached_deposit < required_deposit {
            self.rollback_token_registration(token_id, event_id, &identity);
            env::panic_str("Attached deposit does not cover token registration storage.");
        }

        let refund = attached_deposit - required_deposit;
        refund_excess(refund);

        let event = Nep297Event {
            standard: "memeproof".to_owned(),
            version: "1.0.0".to_owned(),
            event: "token_registered".to_owned(),
            data: vec![TokenRegisteredEventData {
                event_id,
                token_id,
                network_id: identity.network_id,
                token_contract_address: identity.token_contract_address,
                registrant,
                metadata_uri,
                registered_at_ns,
            }],
        };
        let event_json = near_sdk::serde_json::to_string(&event)
            .unwrap_or_else(|_| env::panic_str("Token registration event serialization failed."));
        env::log_str(&format!("EVENT_JSON:{event_json}"));

        record
    }

    pub fn get_token(&self, token_id: u64) -> Option<TokenRecord> {
        self.tokens_by_id.get(&token_id).cloned()
    }

    pub fn get_tokens(&self, after_id: Option<u64>, limit: Option<u32>) -> TokenPage {
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
        assert!(
            (1..=MAX_PAGE_SIZE).contains(&limit),
            "Page limit must be between 1 and {MAX_PAGE_SIZE}."
        );

        let Some(mut candidate_id) = after_id.unwrap_or(0).checked_add(1) else {
            return TokenPage {
                records: Vec::new(),
                next_cursor: None,
            };
        };
        let mut records = Vec::with_capacity(limit as usize);
        let mut scanned = 0;
        let mut last_scanned = None;
        while candidate_id <= self.last_token_id && scanned < limit {
            if let Some(record) = self.tokens_by_id.get(&candidate_id) {
                records.push(record.clone());
            }
            last_scanned = Some(candidate_id);
            scanned += 1;
            let Some(next_id) = candidate_id.checked_add(1) else {
                break;
            };
            candidate_id = next_id;
        }

        TokenPage {
            records,
            next_cursor: (candidate_id <= self.last_token_id
                && last_scanned != Some(self.last_token_id))
            .then_some(last_scanned)
            .flatten(),
        }
    }

    fn allocate_token_id(&mut self) -> Result<u64, IdExhausted> {
        allocate_id(&mut self.last_token_id)
    }

    fn allocate_commitment_id(&mut self) -> Result<u64, IdExhausted> {
        allocate_id(&mut self.last_commitment_id)
    }

    fn allocate_history_event_id(&mut self) -> Result<u64, IdExhausted> {
        allocate_id(&mut self.last_history_event_id)
    }

    fn rollback_token_registration(
        &mut self,
        token_id: u64,
        event_id: u64,
        identity: &TokenIdentity,
    ) {
        self.tokens_by_id.remove(&token_id);
        self.token_ids_by_identity.remove(identity);
        self.history_events.remove(&event_id);
        self.tokens_by_id.flush();
        self.token_ids_by_identity.flush();
        self.history_events.flush();
        self.last_token_id = token_id - 1;
        self.last_history_event_id = event_id - 1;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum IdExhausted {
    Exhausted,
}

fn allocate_id(last_id: &mut u64) -> Result<u64, IdExhausted> {
    let next_id = last_id.checked_add(1).ok_or(IdExhausted::Exhausted)?;
    *last_id = next_id;
    Ok(next_id)
}

fn checked_storage_increase(before: u64, after: u64) -> Option<u64> {
    after.checked_sub(before)
}

fn checked_storage_cost(byte_cost: u128, storage_increase: u64) -> Option<u128> {
    byte_cost.checked_mul(u128::from(storage_increase))
}

fn storage_cost_for_growth(before: u64, after: u64) -> Option<u128> {
    let increase = after.saturating_sub(before);
    checked_storage_cost(env::storage_byte_cost().as_yoctonear(), increase)
}

fn refund_excess(amount: u128) {
    if amount > 0 {
        let _refund_promise =
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(amount));
    }
}

fn checked_page_limit(limit: Option<u32>) -> u32 {
    let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
    assert!(
        (1..=MAX_PAGE_SIZE).contains(&limit),
        "Page limit must be between 1 and {MAX_PAGE_SIZE}."
    );
    limit
}

fn emit_dispute_event(event_name: &str, data: near_sdk::serde_json::Value) {
    let event = near_sdk::serde_json::json!({
        "standard": "memeproof",
        "version": "1.0.0",
        "event": event_name,
        "data": [data]
    });
    let json = near_sdk::serde_json::to_string(&event)
        .unwrap_or_else(|_| env::panic_str("Dispute event serialization failed."));
    env::log_str(&format!("EVENT_JSON:{json}"));
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InputValidationError {
    InvalidAccountId,
    UnsupportedNetwork,
    EmptyText,
    TextTooLong,
    ContainsControlCharacter,
    InvalidMetadataUri,
    InvalidSha256Hash,
}

fn parse_near_account_id(value: &str) -> Result<AccountId, InputValidationError> {
    AccountId::try_from(value.to_owned()).map_err(|_| InputValidationError::InvalidAccountId)
}

fn parse_network_id(value: &str) -> Result<NetworkId, InputValidationError> {
    match value {
        "testnet" => Ok(NetworkId::Testnet),
        _ => Err(InputValidationError::UnsupportedNetwork),
    }
}

fn validate_bounded_text(value: &str, max_bytes: usize) -> Result<(), InputValidationError> {
    if value.trim().is_empty() {
        return Err(InputValidationError::EmptyText);
    }
    if value.len() > max_bytes {
        return Err(InputValidationError::TextTooLong);
    }
    if value.chars().any(char::is_control) {
        return Err(InputValidationError::ContainsControlCharacter);
    }
    Ok(())
}

fn validate_sha256_hex(value: &str) -> Result<(), InputValidationError> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(InputValidationError::InvalidSha256Hash);
    }
    Ok(())
}

fn validate_metadata_uri(value: &str) -> Result<(), InputValidationError> {
    validate_bounded_text(value, MAX_METADATA_URI_BYTES)?;
    if value.chars().any(char::is_whitespace) || value.contains('?') || value.contains('#') {
        return Err(InputValidationError::InvalidMetadataUri);
    }
    let Some((scheme, remainder)) = value.split_once("://") else {
        return Err(InputValidationError::InvalidMetadataUri);
    };
    let (authority, path) = remainder
        .split_once('/')
        .map_or((remainder, ""), |(authority, path)| (authority, path));
    if authority.is_empty()
        || (scheme == "ipfs" && authority.contains(':'))
        || path.chars().any(|ch| matches!(ch, '\\' | '?' | '#'))
    {
        return Err(InputValidationError::InvalidMetadataUri);
    }
    match scheme {
        "https" => {
            if authority.contains('@') || authority.chars().any(|ch| matches!(ch, '\\' | '%')) {
                return Err(InputValidationError::InvalidMetadataUri);
            }
            let (hostname, port) = match authority.rsplit_once(':') {
                Some((host, port)) if !host.contains(':') => (host, Some(port)),
                Some(_) => return Err(InputValidationError::InvalidMetadataUri),
                None => (authority, None),
            };
            if !valid_hostname(hostname)
                || port.is_some_and(|port| {
                    port.is_empty()
                        || !port.bytes().all(|byte| byte.is_ascii_digit())
                        || port.parse::<u16>().map_or(true, |port| port == 0)
                })
            {
                return Err(InputValidationError::InvalidMetadataUri);
            }
        }
        "ipfs" => {
            if !valid_cid_v1_sha256(authority) {
                return Err(InputValidationError::InvalidMetadataUri);
            }
        }
        _ => return Err(InputValidationError::InvalidMetadataUri),
    }
    Ok(())
}

fn valid_hostname(hostname: &str) -> bool {
    !hostname.is_empty()
        && hostname.parse::<std::net::Ipv4Addr>().is_err()
        && hostname.len() <= 253
        && hostname.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.as_bytes()[0].is_ascii_alphanumeric()
                && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

// Support CIDv1 with lowercase base32 multibase and a 32-byte sha2-256 digest.
fn valid_cid_v1_sha256(cid: &str) -> bool {
    if !cid.starts_with('b') || cid.len() < 2 {
        return false;
    }
    let mut bytes = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0;
    for byte in cid[1..].bytes() {
        let Some(value) = (match byte {
            b'a'..=b'z' => Some(byte - b'a'),
            b'2'..=b'7' => Some(byte - b'2' + 26),
            _ => None,
        }) else {
            return false;
        };
        buffer = (buffer << 5) | u32::from(value);
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            bytes.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    if bits >= 5 || buffer != 0 {
        return false;
    }
    let mut cursor = 0;
    let Some(version) = read_varint(&bytes, &mut cursor) else {
        return false;
    };
    let Some(codec) = read_varint(&bytes, &mut cursor) else {
        return false;
    };
    let Some(hash_code) = read_varint(&bytes, &mut cursor) else {
        return false;
    };
    let Some(digest_len) = read_varint(&bytes, &mut cursor) else {
        return false;
    };
    version == 1 && codec > 0 && hash_code == 0x12 && digest_len == 32 && bytes.len() == cursor + 32
}

fn read_varint(bytes: &[u8], cursor: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    let mut shift = 0;
    loop {
        let byte = *bytes.get(*cursor)?;
        *cursor += 1;
        value |= u64::from(byte & 0x7f).checked_shl(shift)?;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
        if shift >= 64 {
            return None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::store::LookupMap;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn default_state_matches_fresh_initialization_defaults() {
        let registry = MemeProofRegistry::default();
        assert_eq!(registry.get_config(), MemeProofRegistry::new().get_config());
        assert_eq!(registry.last_token_id, 0);
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, 0);
        assert!(!registry.tokens_by_id.contains_key(&1));
        assert!(
            !registry.token_ids_by_identity.contains_key(&TokenIdentity {
                network_id: NetworkId::Testnet,
                token_contract_address: "token.example.testnet".parse().unwrap(),
            })
        );
        assert!(!registry.commitments_by_id.contains_key(&1));
        assert!(!registry.commitment_versions.contains_key(&(1, 1)));
        assert!(!registry.history_events.contains_key(&1));
    }

    fn set_context() {
        testing_env!(VMContextBuilder::new().build());
    }

    fn set_registration_context(predecessor: &str, signer: &str, deposit: NearToken, time: u64) {
        let mut context = VMContextBuilder::new();
        let storage_usage = env::storage_usage();
        context
            .current_account_id("registry.testnet".parse::<AccountId>().unwrap())
            .predecessor_account_id(predecessor.parse::<AccountId>().unwrap())
            .signer_account_id(signer.parse::<AccountId>().unwrap())
            .attached_deposit(deposit)
            .storage_usage(storage_usage)
            .block_timestamp(time);
        testing_env!(context.build());
    }

    #[test]
    fn initialization_sets_testnet_config_and_empty_storage() {
        set_context();
        let registry = MemeProofRegistry::new();

        assert_eq!(
            registry.get_config(),
            RegistryConfig {
                network_id: NetworkId::Testnet,
                schema_version: SCHEMA_VERSION,
                max_text_bytes: MAX_TEXT_BYTES as u32,
                max_metadata_uri_bytes: MAX_METADATA_URI_BYTES as u32,
                max_page_size: MAX_PAGE_SIZE,
            }
        );
        assert_eq!(registry.last_token_id, 0);
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, 0);
        let identity = TokenIdentity {
            network_id: NetworkId::Testnet,
            token_contract_address: parse_near_account_id("token.example.testnet").unwrap(),
        };
        assert!(!registry.tokens_by_id.contains_key(&1));
        assert!(!registry.token_ids_by_identity.contains_key(&identity));
        assert!(!registry.commitments_by_id.contains_key(&1));
        assert!(!registry.commitment_versions.contains_key(&(1, 1)));
        assert!(!registry.history_events.contains_key(&1));
    }

    #[test]
    fn lookup_map_records_survive_collection_reconstruction() {
        set_context();
        let identity = TokenIdentity {
            network_id: NetworkId::Testnet,
            token_contract_address: parse_near_account_id("token.example.testnet").unwrap(),
        };
        let record = TokenRecord {
            id: 1,
            identity: identity.clone(),
            registrant: parse_near_account_id("creator.testnet").unwrap(),
            created_at_ns: 42,
            metadata_uri: None,
            status: TokenStatus::Active,
        };

        {
            let mut registry = MemeProofRegistry::new();
            registry.tokens_by_id.insert(record.id, record.clone());
            registry
                .token_ids_by_identity
                .insert(identity.clone(), record.id);
        }

        let tokens: LookupMap<u64, TokenRecord> = LookupMap::new(StorageKey::TokensById);
        let identities: LookupMap<TokenIdentity, u64> =
            LookupMap::new(StorageKey::TokenIdsByIdentity);
        assert_eq!(tokens.get(&1), Some(&record));
        assert_eq!(identities.get(&identity), Some(&1));
    }

    #[test]
    fn id_allocators_are_monotonic_and_do_not_wrap() {
        set_context();
        let mut registry = MemeProofRegistry::new();

        assert_eq!(registry.allocate_token_id(), Ok(1));
        assert_eq!(registry.allocate_token_id(), Ok(2));
        assert_eq!(registry.allocate_commitment_id(), Ok(1));
        assert_eq!(registry.allocate_history_event_id(), Ok(1));

        registry.last_token_id = u64::MAX;
        assert_eq!(registry.allocate_token_id(), Err(IdExhausted::Exhausted));
        assert_eq!(registry.last_token_id, u64::MAX);
    }

    fn register_test_token(registry: &mut MemeProofRegistry) {
        set_registration_context(
            "creator.testnet",
            "creator.testnet",
            NearToken::from_near(10),
            1,
        );
        registry.register_token("token.example.testnet".to_owned(), None);
    }

    #[test]
    fn commitment_creation_stores_version_history_event_and_signer() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        set_registration_context(
            "caller.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            20,
        );
        let created = registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            21,
        );
        assert_eq!(created.commitment.id, 1);
        assert_eq!(
            created.commitment.creator,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(created.commitment.current_version, 1);
        assert_eq!(created.current_version.version, 1);
        assert_eq!(created.current_version.deadline_at_ns, 21);
        assert_eq!(registry.get_commitment(1), Some(created));
        assert_eq!(
            registry.history_events.get(&2).unwrap().kind,
            HistoryEventKind::CommitmentCreated { commitment_id: 1 }
        );
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["event"], "commitment_created");
        assert_eq!(event["data"][0]["creator"], "wallet.testnet");
        assert_eq!(event["data"][0]["event_id"], 2);
    }

    #[test]
    fn evidence_submission_records_signer_history_event_and_retrievable_pages() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "caller.testnet",
            "submitter.testnet",
            NearToken::from_near(10),
            15,
        );
        let evidence = registry.submit_evidence(
            1,
            1,
            "https://example.org/proof.json".into(),
            "ab".repeat(32),
        );
        assert_eq!(evidence.id, 1);
        assert_eq!(
            evidence.submitter,
            "submitter.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(registry.get_evidence(1), Some(evidence.clone()));
        assert_eq!(
            registry.get_commitment_evidences(1, None, Some(1)).records,
            vec![evidence.clone()]
        );
        assert_eq!(
            registry.history_events.get(&3).unwrap().kind,
            HistoryEventKind::EvidenceSubmitted {
                commitment_id: 1,
                evidence_id: 1
            }
        );
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["event"], "evidence_submitted");
        assert_eq!(event["data"][0]["submitter"], "submitter.testnet");
        assert_eq!(event["data"][0]["version"], 1);
    }

    #[test]
    fn review_is_attributed_retrievable_and_duplicate_protected() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "wallet.testnet",
            "submitter.testnet",
            NearToken::from_near(10),
            11,
        );
        registry.submit_evidence(1, 1, "https://example.org/evidence".into(), "ab".repeat(32));
        set_registration_context(
            "caller.testnet",
            "reviewer.testnet",
            NearToken::from_near(10),
            12,
        );
        let review =
            registry.submit_review(1, ReviewOutcome::Supports, "Evidence meets criteria".into());
        assert_eq!(registry.get_review(1), Some(review.clone()));
        assert_eq!(registry.get_reviews(None, Some(2)).records, vec![review]);
        assert_eq!(
            registry.history_events.get(&4).unwrap().actor,
            "reviewer.testnet".parse::<AccountId>().unwrap()
        );
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["event"], "review_submitted");
        assert_eq!(event["data"][0]["outcome"], "supports");
        set_registration_context(
            "reviewer.testnet",
            "reviewer.testnet",
            NearToken::from_near(10),
            13,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
            1,
            ReviewOutcome::Challenges,
            "duplicate".into()
        )))
        .is_err());
    }

    fn registry_with_evidence() -> MemeProofRegistry {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "submitter.testnet",
            "submitter.testnet",
            NearToken::from_near(10),
            11,
        );
        registry.submit_evidence(1, 1, "https://example.org/evidence".into(), "ab".repeat(32));
        registry
    }

    #[test]
    fn reviews_support_all_outcomes_and_multiple_reviewers_with_sequential_ids() {
        let mut registry = registry_with_evidence();
        for (signer, outcome, expected_id) in [
            ("reviewer.testnet", ReviewOutcome::Supports, 1),
            ("second.testnet", ReviewOutcome::Challenges, 2),
            ("third.testnet", ReviewOutcome::Inconclusive, 3),
        ] {
            set_registration_context(signer, signer, NearToken::from_near(10), 20 + expected_id);
            let review = registry.submit_review(1, outcome, "Reasonable explanation".into());
            assert_eq!(review.id, expected_id);
            assert_eq!(review.outcome, outcome);
        }
        assert_eq!(registry.last_review_id, 3);
        assert_eq!(registry.last_history_event_id, 6);
        let page = registry.get_reviews_by_evidence(1, None, Some(2));
        assert_eq!(
            page.records.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(page.next_cursor, Some(2));
        let final_page = registry.get_reviews_by_evidence(1, page.next_cursor, Some(2));
        assert_eq!(
            final_page.records.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![3]
        );
        assert_eq!(final_page.next_cursor, None);
        assert!(registry
            .get_reviews_by_evidence(999, None, Some(2))
            .records
            .is_empty());
        assert!(
            catch_unwind(AssertUnwindSafe(|| registry.get_reviews_by_evidence(
                1,
                None,
                Some(0)
            )))
            .is_err()
        );
        set_registration_context(
            "reviewer.testnet",
            "reviewer.testnet",
            NearToken::from_near(10),
            30,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
            1,
            ReviewOutcome::Supports,
            "duplicate".into()
        )))
        .is_err());
    }

    #[test]
    fn review_references_and_explanation_validation_are_enforced() {
        let mut registry = registry_with_evidence();
        set_registration_context(
            "reviewer.testnet",
            "reviewer.testnet",
            NearToken::from_near(10),
            20,
        );
        for (id, explanation) in [
            (999, "valid".to_owned()),
            (1, String::new()),
            (1, "bad\ntext".to_owned()),
            (1, "x".repeat(MAX_REVIEW_EXPLANATION_BYTES + 1)),
        ] {
            assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
                id,
                ReviewOutcome::Supports,
                explanation
            )))
            .is_err());
        }
        assert_eq!(registry.last_review_id, 0);
        assert_eq!(registry.last_history_event_id, 3);
    }

    #[test]
    fn review_underfunding_and_id_exhaustion_preserve_all_state() {
        let mut registry = registry_with_evidence();
        let history_id = registry.last_history_event_id;
        set_registration_context(
            "reviewer.testnet",
            "reviewer.testnet",
            NearToken::from_yoctonear(1),
            20,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
            1,
            ReviewOutcome::Supports,
            "Reason".into()
        )))
        .is_err());
        assert_eq!(registry.last_review_id, 0);
        assert_eq!(registry.last_history_event_id, history_id);
        assert!(!registry.reviews_by_id.contains_key(&1));
        assert!(!registry
            .review_by_evidence_and_reviewer
            .contains_key(&(1, "reviewer.testnet".parse().unwrap())));
        assert!(!registry.history_events.contains_key(&(history_id + 1)));

        registry.last_review_id = u64::MAX;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
            1,
            ReviewOutcome::Supports,
            "Reason".into()
        )))
        .is_err());
        assert_eq!(registry.last_review_id, u64::MAX);
        registry.last_review_id = 0;
        registry.last_history_event_id = u64::MAX;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_review(
            1,
            ReviewOutcome::Supports,
            "Reason".into()
        )))
        .is_err());
        assert_eq!(registry.last_review_id, 0);
        assert_eq!(registry.last_history_event_id, u64::MAX);
        assert!(!registry.reviews_by_id.contains_key(&1));
        assert!(!registry
            .review_by_evidence_and_reviewer
            .contains_key(&(1, "reviewer.testnet".parse().unwrap())));
    }

    #[test]
    fn review_refund_and_event_history_attribution_are_exact() {
        let mut registry = registry_with_evidence();
        let deposit = NearToken::from_near(10);
        set_registration_context("caller.testnet", "reviewer.testnet", deposit, 42);
        let before = env::storage_usage();
        let review = registry.submit_review(1, ReviewOutcome::Challenges, "Concern".into());
        let required =
            env::storage_byte_cost().as_yoctonear() * u128::from(env::storage_usage() - before);
        let expected_refund = deposit.as_yoctonear() - required;
        let receipt = near_sdk::test_utils::get_created_receipts()
            .last()
            .unwrap()
            .clone();
        assert_eq!(
            receipt.receiver_id,
            "caller.testnet".parse::<AccountId>().unwrap()
        );
        assert!(receipt.actions.iter().any(|action| matches!(action, near_sdk::mock::MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == expected_refund)));
        let history = registry.history_events.get(&4).unwrap();
        assert_eq!(history.actor, review.reviewer);
        assert_eq!(history.occurred_at_ns, 42);
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["data"][0]["reviewer"], "reviewer.testnet");
        assert_eq!(event["data"][0]["evidence_id"], 1);
        assert_eq!(event["data"][0]["commitment_id"], 1);
        assert_eq!(event["data"][0]["version"], 1);
        assert_eq!(event["data"][0]["outcome"], "challenges");
        assert_eq!(event["data"][0]["submitted_at_ns"], 42);
    }

    #[test]
    fn evidence_ids_increment_and_pagination_filters_by_commitment() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        registry.submit_evidence(1, 1, "https://example.org/one".into(), "11".repeat(32));
        registry.submit_evidence(1, 1, "https://example.org/two".into(), "22".repeat(32));
        registry.create_commitment(
            1,
            "Other".into(),
            "Description".into(),
            "Criteria".into(),
            30,
        );
        registry.submit_evidence(2, 1, "https://example.org/three".into(), "33".repeat(32));
        let first = registry.get_evidences(None, Some(2));
        assert_eq!(
            first.records.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(first.next_cursor, Some(2));
        let second = registry.get_evidences(first.next_cursor, Some(2));
        assert_eq!(
            second.records.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![3]
        );
        assert_eq!(second.next_cursor, None);
        let filtered = registry.get_commitment_evidences(1, None, Some(3));
        assert_eq!(
            filtered.records.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(filtered.next_cursor, None);
    }

    #[test]
    fn evidence_id_and_history_id_exhaustion_leave_maps_and_counters_unchanged() {
        let mut registry = registry_with_commitment();
        registry.last_evidence_id = u64::MAX;
        let old_history = registry.last_history_event_id;
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_evidence(
            1,
            1,
            "https://example.org/a".into(),
            "aa".repeat(32)
        )))
        .is_err());
        assert_eq!(registry.last_evidence_id, u64::MAX);
        assert_eq!(registry.last_history_event_id, old_history);
        registry.last_evidence_id = 0;
        registry.last_history_event_id = u64::MAX;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_evidence(
            1,
            1,
            "https://example.org/a".into(),
            "aa".repeat(32)
        )))
        .is_err());
        assert_eq!(registry.last_evidence_id, 0);
        assert_eq!(registry.last_history_event_id, u64::MAX);
        assert!(!registry.evidence_by_id.contains_key(&1));
        assert!(!registry.history_events.contains_key(&u64::MAX));
    }

    #[test]
    fn evidence_submission_rejects_unknown_links_invalid_uri_and_hash() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        for (commitment, version, uri, hash) in [
            (99, 1, "https://example.org/a".to_owned(), "ab".repeat(32)),
            (1, 99, "https://example.org/a".to_owned(), "ab".repeat(32)),
            (1, 1, "http://example.org/a".to_owned(), "ab".repeat(32)),
            (1, 1, "https://example.org/a".to_owned(), "bad".to_owned()),
        ] {
            assert!(catch_unwind(AssertUnwindSafe(
                || registry.submit_evidence(commitment, version, uri, hash)
            ))
            .is_err());
        }
        assert_eq!(registry.last_evidence_id, 0);
        assert!(!registry.evidence_by_id.contains_key(&1));
    }

    #[test]
    fn evidence_insufficient_deposit_rolls_back_and_excess_refunds_predecessor() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_yoctonear(1),
            11,
        );
        let history_before = registry.last_history_event_id;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.submit_evidence(
            1,
            1,
            "https://example.org/p".into(),
            "ab".repeat(32)
        )))
        .is_err());
        assert_eq!(registry.last_evidence_id, 0);
        assert_eq!(registry.last_history_event_id, history_before);
        assert!(!registry.evidence_by_id.contains_key(&1));
        assert!(!registry.history_events.contains_key(&(history_before + 1)));

        let attached = NearToken::from_near(10);
        set_registration_context("caller.testnet", "wallet.testnet", attached, 12);
        let before = env::storage_usage();
        registry.submit_evidence(1, 1, "https://example.org/p".into(), "ab".repeat(32));
        let required =
            env::storage_byte_cost().as_yoctonear() * u128::from(env::storage_usage() - before);
        let expected = attached.as_yoctonear() - required;
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert_eq!(
            receipts.last().unwrap().receiver_id,
            "caller.testnet".parse::<AccountId>().unwrap()
        );
        assert!(receipts.last().unwrap().actions.iter().any(|action| matches!(action, near_sdk::mock::MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == expected)));
    }

    #[test]
    fn amendment_appends_version_history_and_nep297_event() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            10,
        );
        registry.create_commitment(
            1,
            "First".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        );
        set_registration_context(
            "caller.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        let amended = registry.amend_commitment(
            1,
            "Second".into(),
            "Updated".into(),
            "New criteria".into(),
            30,
        );
        assert_eq!(amended.commitment.current_version, 2);
        assert_eq!(
            registry.get_commitment_version(1, 1).unwrap().title,
            "First"
        );
        assert_eq!(
            registry.get_commitment_version(1, 2).unwrap().title,
            "Second"
        );
        let page = registry.get_commitment_versions(1, None, Some(1));
        assert_eq!(page.versions[0].version, 1);
        assert_eq!(page.next_cursor, Some(1));
        assert_eq!(
            registry.history_events.get(&3).unwrap().kind,
            HistoryEventKind::CommitmentAmended {
                commitment_id: 1,
                version: 2
            }
        );
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["event"], "commitment_amended");
        assert_eq!(event["data"][0]["version"], 2);
    }

    #[test]
    fn amendment_rejects_non_creator_and_invalid_terms_without_mutation() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        set_registration_context(
            "creator.testnet",
            "creator.testnet",
            NearToken::from_near(10),
            10,
        );
        registry.create_commitment(
            1,
            "First".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        );
        set_registration_context(
            "attacker.testnet",
            "attacker.testnet",
            NearToken::from_near(10),
            11,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.amend_commitment(
            1,
            "X".into(),
            "D".into(),
            "C".into(),
            30
        )))
        .is_err());
        set_registration_context(
            "creator.testnet",
            "creator.testnet",
            NearToken::from_near(10),
            11,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.amend_commitment(
            1,
            String::new(),
            "D".into(),
            "C".into(),
            30
        )))
        .is_err());
        assert_eq!(
            registry.commitments_by_id.get(&1).unwrap().current_version,
            1
        );
        assert!(registry.get_commitment_version(1, 2).is_none());
    }

    #[test]
    fn amendments_are_sequential_and_keep_every_prior_version() {
        let mut registry = registry_with_commitment();
        for (time, title) in [(11, "Second"), (12, "Third")] {
            set_registration_context(
                "caller.testnet",
                "wallet.testnet",
                NearToken::from_near(10),
                time,
            );
            let result = registry.amend_commitment(
                1,
                title.into(),
                "Description".into(),
                "Criteria".into(),
                time + 10,
            );
            assert_eq!(result.current_version.version, (time - 9) as u32);
        }
        assert_eq!(
            registry.get_commitment_version(1, 1).unwrap().title,
            "First"
        );
        assert_eq!(
            registry.get_commitment_version(1, 2).unwrap().title,
            "Second"
        );
        assert_eq!(
            registry.get_commitment_version(1, 3).unwrap().title,
            "Third"
        );
    }

    #[test]
    fn failed_amendment_rolls_back_version_history_and_current_pointer() {
        let mut registry = registry_with_commitment();
        let old_history = registry.last_history_event_id;
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_yoctonear(1),
            11,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.amend_commitment(
            1,
            "Second".into(),
            "Description".into(),
            "Criteria".into(),
            20
        )))
        .is_err());
        assert_eq!(
            registry.commitments_by_id.get(&1).unwrap().current_version,
            1
        );
        assert!(registry.get_commitment_version(1, 2).is_none());
        assert_eq!(registry.last_history_event_id, old_history);
        assert!(!registry.history_events.contains_key(&(old_history + 1)));
    }

    #[test]
    fn successful_amendment_refunds_exact_excess_to_predecessor_and_attributes_event() {
        let mut registry = registry_with_commitment();
        let attached = NearToken::from_near(10);
        set_registration_context("caller.testnet", "wallet.testnet", attached, 11);
        let before = env::storage_usage();
        registry.amend_commitment(
            1,
            "Second".into(),
            "Description".into(),
            "Criteria".into(),
            21,
        );
        let required =
            env::storage_byte_cost().as_yoctonear() * u128::from(env::storage_usage() - before);
        let expected_refund = attached.as_yoctonear() - required;
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert_eq!(
            receipts[0].receiver_id,
            "caller.testnet".parse::<AccountId>().unwrap()
        );
        assert!(receipts[0].actions.iter().any(|action| matches!(action,
            near_sdk::mock::MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == expected_refund)));
        let history = registry.history_events.get(&3).unwrap();
        assert_eq!(
            history.actor,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(history.occurred_at_ns, 11);
        assert_eq!(
            history.kind,
            HistoryEventKind::CommitmentAmended {
                commitment_id: 1,
                version: 2
            }
        );
        let json = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()
                .last()
                .unwrap()
                .trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(json["data"][0]["commitment_id"], 1);
        assert_eq!(json["data"][0]["actor"], "wallet.testnet");
        assert_eq!(json["data"][0]["version"], 2);
        assert_eq!(json["data"][0]["amended_at_ns"], 11);
    }

    #[test]
    fn version_and_history_id_exhaustion_do_not_write_amendments() {
        let mut registry = registry_with_commitment();
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        registry
            .commitments_by_id
            .get_mut(&1)
            .unwrap()
            .current_version = u32::MAX;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.amend_commitment(
            1,
            "x".into(),
            "d".into(),
            "c".into(),
            20
        )))
        .is_err());
        assert_eq!(registry.last_history_event_id, 2);
        registry
            .commitments_by_id
            .get_mut(&1)
            .unwrap()
            .current_version = 1;
        registry.last_history_event_id = u64::MAX;
        let commitment_before = registry.commitments_by_id.get(&1).unwrap().clone();
        let version_before = registry.get_commitment_version(1, 1).unwrap();
        let history_before = registry.history_events.get(&2).unwrap().clone();
        assert!(catch_unwind(AssertUnwindSafe(|| registry.amend_commitment(
            1,
            "Second".into(),
            "d".into(),
            "c".into(),
            20
        )))
        .is_err());
        assert_eq!(
            registry.commitments_by_id.get(&1).unwrap().current_version,
            1
        );
        assert!(registry.get_commitment_version(1, 2).is_none());
        assert_eq!(registry.commitments_by_id.get(&1), Some(&commitment_before));
        assert_eq!(registry.get_commitment_version(1, 1), Some(version_before));
        assert_eq!(registry.history_events.get(&2), Some(&history_before));
        assert_eq!(registry.last_commitment_id, 1);
        assert_eq!(registry.last_history_event_id, u64::MAX);
        assert!(!registry.history_events.contains_key(&u64::MAX));
    }

    #[test]
    fn version_pagination_handles_cursors_empty_and_invalid_limits() {
        let mut registry = registry_with_commitment();
        for (time, title) in [(11, "Second"), (12, "Third"), (13, "Fourth")] {
            set_registration_context(
                "wallet.testnet",
                "wallet.testnet",
                NearToken::from_near(10),
                time,
            );
            registry.amend_commitment(
                1,
                title.into(),
                "Description".into(),
                "Criteria".into(),
                time + 10,
            );
        }
        let first = registry.get_commitment_versions(1, None, Some(2));
        assert_eq!(
            first.versions.iter().map(|v| v.version).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(first.next_cursor, Some(2));
        let second = registry.get_commitment_versions(1, first.next_cursor, Some(2));
        assert_eq!(
            second
                .versions
                .iter()
                .map(|v| v.version)
                .collect::<Vec<_>>(),
            vec![3, 4]
        );
        assert_eq!(second.next_cursor, None);
        let final_empty = registry.get_commitment_versions(1, Some(4), Some(2));
        assert!(final_empty.versions.is_empty());
        assert_eq!(final_empty.next_cursor, None);
        let empty = registry.get_commitment_versions(1, Some(1), Some(2));
        assert_eq!(
            empty.versions.iter().map(|v| v.version).collect::<Vec<_>>(),
            vec![2, 3]
        );
        assert_eq!(empty.next_cursor, Some(3));
        assert!(registry
            .get_commitment_versions(999, None, Some(2))
            .versions
            .is_empty());
        assert!(registry
            .get_commitment_versions(1, Some(u32::MAX), Some(2))
            .versions
            .is_empty());
        assert!(
            catch_unwind(AssertUnwindSafe(|| registry.get_commitment_versions(
                1,
                None,
                Some(0)
            )))
            .is_err()
        );
    }

    fn registry_with_commitment() -> MemeProofRegistry {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            10,
        );
        registry.create_commitment(
            1,
            "First".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        );
        registry
    }

    #[test]
    fn commitment_creation_rejects_unknown_token_invalid_fields_and_past_deadline() {
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            10,
        );
        let mut registry = MemeProofRegistry::new();
        for (token_id, title, deadline) in [
            (1, "Valid".to_owned(), 20),
            (1, String::new(), 20),
            (1, "x".repeat(MAX_COMMITMENT_TITLE_BYTES + 1), 20),
            (1, "Valid".to_owned(), 10),
        ] {
            assert!(catch_unwind(AssertUnwindSafe(|| registry.create_commitment(
                token_id,
                title,
                "Description".into(),
                "Criteria".into(),
                deadline,
            )))
            .is_err());
        }
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, 0);
        assert!(!registry.commitments_by_id.contains_key(&1));
    }

    #[test]
    fn failed_commitment_creation_does_not_consume_commitment_or_history_ids() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        let prior_history_id = registry.last_history_event_id;
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_yoctonear(1),
            10,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        )))
        .is_err());
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, prior_history_id);
        assert!(!registry.commitments_by_id.contains_key(&1));
        assert!(!registry.commitment_versions.contains_key(&(1, 1)));
        assert!(!registry
            .history_events
            .contains_key(&(prior_history_id + 1)));

        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            11,
        );
        let commitment = registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        );
        assert_eq!(commitment.commitment.id, 1);
        assert_eq!(registry.last_history_event_id, prior_history_id + 1);
    }

    #[test]
    fn history_id_exhaustion_restores_commitment_counter() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        registry.last_history_event_id = u64::MAX;
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            10,
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        )))
        .is_err());
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, u64::MAX);
        assert!(!registry.commitments_by_id.contains_key(&1));
        assert!(!registry.commitment_versions.contains_key(&(1, 1)));
        assert!(registry.get_commitment(1).is_none());
    }

    #[test]
    fn commitment_refund_targets_predecessor_and_matches_excess_deposit() {
        let attached = NearToken::from_near(10);
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        set_registration_context("caller.testnet", "wallet.testnet", attached, 10);
        let storage_before = env::storage_usage();
        registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        );
        let increase = env::storage_usage() - storage_before;
        let required = env::storage_byte_cost().as_yoctonear() * u128::from(increase);
        let expected_refund = attached.as_yoctonear() - required;
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(
            receipts[0].receiver_id,
            "caller.testnet".parse::<AccountId>().unwrap()
        );
        assert!(receipts[0].actions.iter().any(|action| matches!(
            action,
            near_sdk::mock::MockAction::Transfer { deposit, .. }
                if deposit.as_yoctonear() == expected_refund
        )));
    }

    #[test]
    fn commitment_storage_arithmetic_rejects_underflow_and_overflow() {
        assert_eq!(checked_storage_increase(2, 1), None);
        assert_eq!(checked_storage_cost(u128::MAX, 2), None);
    }

    #[test]
    fn get_commitment_returns_none_when_current_version_is_missing() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        registry.commitments_by_id.insert(
            7,
            CommitmentRecord {
                id: 7,
                token_id: 1,
                creator: "wallet.testnet".parse().unwrap(),
                current_version: 1,
                created_at_ns: 10,
            },
        );
        assert_eq!(registry.get_commitment(7), None);
        assert_eq!(registry.get_commitment(8), None);
    }

    #[test]
    fn description_and_criteria_limits_and_control_characters_are_enforced() {
        assert_eq!(
            validate_bounded_text(
                &"d".repeat(MAX_COMMITMENT_DESCRIPTION_BYTES),
                MAX_COMMITMENT_DESCRIPTION_BYTES
            ),
            Ok(())
        );
        assert_eq!(
            validate_bounded_text(
                &"d".repeat(MAX_COMMITMENT_DESCRIPTION_BYTES + 1),
                MAX_COMMITMENT_DESCRIPTION_BYTES
            ),
            Err(InputValidationError::TextTooLong)
        );
        assert_eq!(
            validate_bounded_text("bad\ntext", MAX_COMMITMENT_DESCRIPTION_BYTES),
            Err(InputValidationError::ContainsControlCharacter)
        );
        assert_eq!(
            validate_bounded_text(
                &"c".repeat(MAX_COMMITMENT_CRITERIA_BYTES),
                MAX_COMMITMENT_CRITERIA_BYTES
            ),
            Ok(())
        );
        assert_eq!(
            validate_bounded_text(
                &"c".repeat(MAX_COMMITMENT_CRITERIA_BYTES + 1),
                MAX_COMMITMENT_CRITERIA_BYTES
            ),
            Err(InputValidationError::TextTooLong)
        );
        assert_eq!(
            validate_bounded_text("bad\tcriteria", MAX_COMMITMENT_CRITERIA_BYTES),
            Err(InputValidationError::ContainsControlCharacter)
        );
    }

    #[test]
    fn insufficient_commitment_deposit_rolls_back_records_and_ids() {
        set_context();
        let mut registry = MemeProofRegistry::new();
        register_test_token(&mut registry);
        let history_id = registry.last_history_event_id;
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_yoctonear(1),
            10,
        );
        let before = env::storage_usage();
        assert!(catch_unwind(AssertUnwindSafe(|| registry.create_commitment(
            1,
            "Title".into(),
            "Description".into(),
            "Criteria".into(),
            20,
        )))
        .is_err());
        assert_eq!(registry.last_commitment_id, 0);
        assert_eq!(registry.last_history_event_id, history_id);
        assert!(registry.get_commitment(1).is_none());
        assert!(!registry.commitments_by_id.contains_key(&1));
        assert!(!registry.commitment_versions.contains_key(&(1, 1)));
        assert!(!registry.history_events.contains_key(&(history_id + 1)));
        assert_eq!(env::storage_usage(), before);
        assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    }

    #[test]
    fn account_id_validation_uses_near_account_rules() {
        assert_eq!(
            parse_near_account_id("token.example.testnet").unwrap(),
            "token.example.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            parse_near_account_id("not a valid account"),
            Err(InputValidationError::InvalidAccountId)
        );
    }

    #[test]
    fn text_validation_rejects_empty_oversized_and_control_input() {
        assert_eq!(
            validate_bounded_text("  \n", 10),
            Err(InputValidationError::EmptyText)
        );
        assert_eq!(
            validate_bounded_text("four", 3),
            Err(InputValidationError::TextTooLong)
        );
        assert_eq!(
            validate_bounded_text("line\nbreak", 20),
            Err(InputValidationError::ContainsControlCharacter)
        );
        assert_eq!(validate_bounded_text("measurable outcome", 20), Ok(()));
    }

    #[test]
    fn sha256_hash_validation_accepts_hex_and_rejects_other_shapes() {
        assert_eq!(validate_sha256_hex(&"a5".repeat(32)), Ok(()));
        assert_eq!(
            validate_sha256_hex(&"z5".repeat(32)),
            Err(InputValidationError::InvalidSha256Hash)
        );
        assert_eq!(
            validate_sha256_hex(&"a5".repeat(31)),
            Err(InputValidationError::InvalidSha256Hash)
        );
    }

    #[test]
    fn identity_and_history_models_round_trip_through_borsh_and_json() {
        let identity = TokenIdentity {
            network_id: NetworkId::Testnet,
            token_contract_address: "token.example.testnet".parse::<AccountId>().unwrap(),
        };
        let event = HistoryEvent {
            id: 7,
            actor: "creator.testnet".parse::<AccountId>().unwrap(),
            occurred_at_ns: 123,
            kind: HistoryEventKind::CommitmentAmended {
                commitment_id: 3,
                version: 2,
            },
        };

        let identity_bytes = near_sdk::borsh::to_vec(&identity).unwrap();
        let decoded_identity: TokenIdentity = near_sdk::borsh::from_slice(&identity_bytes).unwrap();
        assert_eq!(decoded_identity, identity);

        let event_bytes = near_sdk::borsh::to_vec(&event).unwrap();
        let decoded_event: HistoryEvent = near_sdk::borsh::from_slice(&event_bytes).unwrap();
        assert_eq!(decoded_event, event);

        let json = near_sdk::serde_json::to_string(&event).unwrap();
        let decoded_json: HistoryEvent = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(decoded_json, event);
        assert!(json.contains("commitment_amended"));
    }

    #[test]
    fn cross_contract_registration_attributes_signer_in_record_history_and_event() {
        set_registration_context(
            "registrant.testnet",
            "different-signer.testnet",
            NearToken::from_near(10),
            987_654,
        );
        let mut registry = MemeProofRegistry::new();

        let record = registry.register_token(
            "token.example.testnet".to_owned(),
            Some("https://example.org/token.json".to_owned()),
        );

        assert_eq!(record.id, 1);
        assert_eq!(record.identity.network_id, NetworkId::Testnet);
        assert_eq!(
            record.identity.token_contract_address,
            "token.example.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            record.registrant,
            "different-signer.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(record.created_at_ns, 987_654);
        assert_eq!(
            record.metadata_uri.as_deref(),
            Some("https://example.org/token.json")
        );
        assert_eq!(record.status, TokenStatus::Active);
        assert_eq!(registry.get_token(1), Some(record.clone()));
        assert_eq!(
            registry.history_events.get(&1),
            Some(&HistoryEvent {
                id: 1,
                actor: "different-signer.testnet".parse::<AccountId>().unwrap(),
                occurred_at_ns: 987_654,
                kind: HistoryEventKind::TokenRegistered { token_id: 1 },
            })
        );

        let event_log = near_sdk::test_utils::get_logs()
            .into_iter()
            .find(|line| line.starts_with("EVENT_JSON:"))
            .expect("registration must emit a NEP-297 event");
        let event: near_sdk::serde_json::Value =
            near_sdk::serde_json::from_str(event_log.trim_start_matches("EVENT_JSON:")).unwrap();
        assert_eq!(event["standard"], "memeproof");
        assert_eq!(event["version"], "1.0.0");
        assert_eq!(event["event"], "token_registered");
        assert_eq!(event["data"][0]["token_id"], 1);
        assert_eq!(event["data"][0]["event_id"], 1);
        assert_eq!(event["data"][0]["registrant"], "different-signer.testnet");
    }

    #[test]
    fn direct_wallet_registration_attributes_signer() {
        set_registration_context(
            "wallet.testnet",
            "wallet.testnet",
            NearToken::from_near(10),
            1,
        );
        let mut registry = MemeProofRegistry::new();
        let record = registry.register_token("token.example.testnet".to_owned(), None);
        assert_eq!(
            record.registrant,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            registry.history_events.get(&1).unwrap().actor,
            record.registrant
        );
        let event = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
            near_sdk::test_utils::get_logs()[0].trim_start_matches("EVENT_JSON:"),
        )
        .unwrap();
        assert_eq!(event["data"][0]["registrant"], "wallet.testnet");
    }

    #[test]
    fn duplicate_registration_is_rejected_without_changing_the_record() {
        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_near(10),
            1,
        );
        let mut registry = MemeProofRegistry::new();
        let original = registry.register_token("token.example.testnet".to_owned(), None);

        let duplicate = catch_unwind(AssertUnwindSafe(|| {
            registry.register_token("token.example.testnet".to_owned(), None)
        }));

        assert!(duplicate.is_err());
        assert_eq!(registry.get_token(1), Some(original));
        assert_eq!(registry.last_token_id, 1);
    }

    #[test]
    fn registration_is_bound_to_testnet_and_rejects_other_network_labels() {
        assert_eq!(parse_network_id("testnet"), Ok(NetworkId::Testnet));
        assert_eq!(
            parse_network_id("mainnet"),
            Err(InputValidationError::UnsupportedNetwork)
        );

        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_near(10),
            2,
        );
        let mut registry = MemeProofRegistry::new();
        let record = registry.register_token("same-address.testnet".to_owned(), None);
        assert_eq!(record.identity.network_id, registry.get_config().network_id);
    }

    #[test]
    fn invalid_account_ids_are_rejected_before_storage_changes() {
        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_near(10),
            3,
        );
        let mut registry = MemeProofRegistry::new();

        let result = catch_unwind(AssertUnwindSafe(|| {
            registry.register_token("not a NEAR account".to_owned(), None)
        }));

        assert!(result.is_err());
        assert_eq!(registry.last_token_id, 0);
        assert!(!registry.tokens_by_id.contains_key(&1));
    }

    #[test]
    fn empty_oversized_and_private_style_metadata_uris_are_rejected() {
        assert_eq!(
            validate_metadata_uri(""),
            Err(InputValidationError::EmptyText)
        );
        assert_eq!(
            validate_metadata_uri(&format!(
                "https://example.org/{}",
                "a".repeat(MAX_METADATA_URI_BYTES)
            )),
            Err(InputValidationError::TextTooLong)
        );
        assert_eq!(
            validate_metadata_uri("https://user:secret@example.org/metadata.json"),
            Err(InputValidationError::InvalidMetadataUri)
        );
        assert_eq!(
            validate_metadata_uri("https://example.org/metadata.json?token=secret"),
            Err(InputValidationError::InvalidMetadataUri)
        );
        assert_eq!(
            validate_metadata_uri("https://example.org/metadata.json"),
            Ok(())
        );
        assert_eq!(validate_metadata_uri(&valid_test_cid()), Ok(()));
        for uri in [
            "https:///metadata.json",
            "https://-bad.example/metadata.json",
            "https://bad..example/metadata.json",
            "https://127.0.0.1/metadata.json",
            "https://example.com:/metadata.json",
            "https://example.com:99999/metadata.json",
            "https://example.com\\@evil.test/a",
            "http://example.com/a",
            "ftp://example.com/a",
            "https://example.com/a b",
            "ipfs://bafybeigdyrzt/metadata.json",
            "ipfs://not-a-cid/metadata.json",
        ] {
            assert_eq!(
                validate_metadata_uri(uri),
                Err(InputValidationError::InvalidMetadataUri),
                "{uri}"
            );
        }
        assert_eq!(
            validate_metadata_uri("https://metadata.example.org:443/token.json"),
            Ok(())
        );

        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_near(10),
            4,
        );
        let mut registry = MemeProofRegistry::new();
        for metadata_uri in [
            Some(String::new()),
            Some(format!(
                "https://example.org/{}",
                "a".repeat(MAX_METADATA_URI_BYTES)
            )),
        ] {
            let result = catch_unwind(AssertUnwindSafe(|| {
                registry.register_token("token.example.testnet".to_owned(), metadata_uri)
            }));
            assert!(result.is_err());
        }
        assert_eq!(registry.last_token_id, 0);
        assert!(!registry.tokens_by_id.contains_key(&1));
    }

    #[test]
    fn insufficient_storage_deposit_rolls_back_and_panics() {
        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_yoctonear(1),
            4,
        );
        let mut registry = MemeProofRegistry::new();
        let storage_before = env::storage_usage();

        let result = catch_unwind(AssertUnwindSafe(|| {
            registry.register_token("token.example.testnet".to_owned(), None)
        }));

        assert!(result.is_err());
        assert_eq!(registry.last_token_id, 0);
        assert_eq!(registry.last_history_event_id, 0);
        assert!(!registry.tokens_by_id.contains_key(&1));
        assert_eq!(env::storage_usage(), storage_before);
        assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    }

    #[test]
    fn excess_storage_deposit_is_refunded_to_the_predecessor() {
        let attached = NearToken::from_near(10);
        set_registration_context("caller.testnet", "wallet.testnet", attached, 5);
        let mut registry = MemeProofRegistry::new();
        let storage_before = env::storage_usage();

        registry.register_token("token.example.testnet".to_owned(), None);

        let storage_increase = env::storage_usage() - storage_before;
        let required = env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(storage_increase))
            .unwrap();
        let expected_refund = attached.as_yoctonear() - required;
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(
            receipts[0].receiver_id,
            "caller.testnet".parse::<AccountId>().unwrap()
        );
        assert!(receipts[0].actions.iter().any(|action| matches!(
            action,
            near_sdk::mock::MockAction::Transfer { deposit, .. }
                if deposit.as_yoctonear() == expected_refund
        )));
    }

    #[test]
    fn token_list_uses_bounded_cursor_pages() {
        set_registration_context(
            "registrant.testnet",
            "registrant.testnet",
            NearToken::from_near(10),
            6,
        );
        let mut registry = MemeProofRegistry::new();
        for name in ["one.testnet", "two.testnet", "three.testnet"] {
            registry.register_token(name.to_owned(), None);
        }

        let first = registry.get_tokens(None, Some(2));
        assert_eq!(
            first
                .records
                .iter()
                .map(|record| record.id)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(first.next_cursor, Some(2));
        let second = registry.get_tokens(first.next_cursor, Some(2));
        assert_eq!(
            second
                .records
                .iter()
                .map(|record| record.id)
                .collect::<Vec<_>>(),
            vec![3]
        );
        assert_eq!(second.next_cursor, None);
        assert!(registry
            .get_tokens(Some(u64::MAX), Some(2))
            .records
            .is_empty());
    }

    fn dispute_call(registry_signer: &str, at: u64, deposit: NearToken) {
        set_registration_context("caller.testnet", registry_signer, deposit, at);
    }

    fn dispute_call_from(predecessor: &str, signer: &str, at: u64, deposit: NearToken) {
        set_registration_context(predecessor, signer, deposit, at);
    }

    fn assert_dispute_excess_refund(predecessor: &str, attached: NearToken, before: u64) {
        let increase = env::storage_usage().saturating_sub(before);
        let required = checked_storage_cost(env::storage_byte_cost().as_yoctonear(), increase)
            .expect("storage cost should fit");
        let expected_refund = attached.as_yoctonear() - required;
        assert!(expected_refund > 0);
        assert!(near_sdk::test_utils::get_created_receipts()
            .iter()
            .any(|receipt| {
                receipt.receiver_id == predecessor.parse::<AccountId>().unwrap()
                    && receipt.actions.iter().any(|action| {
                        matches!(
                            action,
                            near_sdk::mock::MockAction::Transfer { deposit, .. }
                                if deposit.as_yoctonear() == expected_refund
                        )
                    })
            }));
    }

    fn assert_dispute_write_rolls_back<F>(
        registry: &mut MemeProofRegistry,
        target: &DisputeTarget,
        signer: &str,
        at: u64,
        write: F,
    ) where
        F: FnOnce(&mut MemeProofRegistry),
    {
        let before_dispute = registry.get_dispute(1).unwrap();
        let before_history = registry.last_history_event_id;
        let before_storage = env::storage_usage();
        dispute_call_from(
            "short-payer.testnet",
            signer,
            at,
            NearToken::from_yoctonear(1),
        );
        assert!(catch_unwind(AssertUnwindSafe(|| write(registry))).is_err());
        assert_eq!(registry.get_dispute(1), Some(before_dispute));
        assert_eq!(registry.last_history_event_id, before_history);
        assert_eq!(registry.last_dispute_id, 1);
        assert_eq!(env::storage_usage(), before_storage);
        assert_eq!(registry.active_disputes_by_target.get(target), Some(&1));
        assert!(registry
            .history_events
            .get(&before_history.saturating_add(1))
            .is_none());
    }

    fn open_commitment_dispute(registry: &mut MemeProofRegistry, at: u64) -> DisputeRecord {
        dispute_call("challenger.testnet", at, NearToken::from_near(10));
        registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            },
            "The criteria were not met".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        )
    }

    #[test]
    fn dispute_lifecycle_enforces_authority_and_keeps_commitment_unchanged() {
        let mut registry = registry_with_commitment();
        let dispute = open_commitment_dispute(&mut registry, 100);
        assert_eq!(dispute.status, DisputeStatus::Open);
        assert_eq!(
            dispute.affected_party,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );

        dispute_call("wallet.testnet", 200, NearToken::from_near(10));
        let response = registry.respond_to_dispute(1, "I disagree with the challenge".into());
        assert_eq!(
            response.responder,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );
        dispute_call("wallet.testnet", 201, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(
            || registry.respond_to_dispute(1, "Duplicate".into())
        ))
        .is_err());
        dispute_call("challenger.testnet", 202, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(
            || registry.respond_to_dispute(1, "Wrong actor".into())
        ))
        .is_err());

        dispute_call("reviewer.testnet", 300, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.accept_dispute_appointment(1))).is_err());
        dispute_call("resolver.testnet", 301, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        assert_eq!(registry.get_dispute(1).unwrap().status, DisputeStatus::Open);
        dispute_call("wallet.testnet", 302, NearToken::from_near(10));
        let under_review = registry.accept_dispute_resolver(1);
        assert_eq!(under_review.status, DisputeStatus::UnderReview);
        assert_eq!(
            under_review.resolution_deadline_ns,
            Some(302 + DISPUTE_RESOLUTION_PERIOD_NS)
        );

        dispute_call("wallet.testnet", 400, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.resolve_dispute(
            1,
            DisputeDisposition::Rejected,
            "No".into()
        )))
        .is_err());
        dispute_call("resolver.testnet", 401, NearToken::from_near(10));
        let result = registry.resolve_dispute(
            1,
            DisputeDisposition::Inconclusive,
            "Evidence is insufficient".into(),
        );
        assert_eq!(
            result.resolver,
            "resolver.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            registry.get_dispute(1).unwrap().status,
            DisputeStatus::Resolved
        );
        assert_eq!(registry.get_dispute_resolution(1), Some(result));
        let resolution_event = near_sdk::test_utils::get_logs()
            .iter()
            .filter(|line| line.starts_with("EVENT_JSON:"))
            .filter_map(|line| {
                near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
                    line.trim_start_matches("EVENT_JSON:"),
                )
                .ok()
            })
            .find(|event| event["event"] == "dispute_resolved")
            .unwrap();
        assert_eq!(resolution_event["data"][0]["disposition"], "inconclusive");
        assert_eq!(
            registry.get_commitment(1).unwrap().current_version.version,
            1
        );
        assert!(registry
            .active_disputes_by_target
            .get(&DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1
            })
            .is_none());
        assert!(registry
            .get_history_events(None, Some(50))
            .records
            .iter()
            .any(|event| matches!(
                &event.kind,
                HistoryEventKind::DisputeResolved { dispute_id: 1 }
            )));
    }

    #[test]
    fn counterproposal_invalidates_both_acceptances_and_is_limited_to_one() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        dispute_call("resolver.testnet", 101, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        dispute_call("wallet.testnet", 102, NearToken::from_near(10));
        let countered = registry
            .counterpropose_dispute_resolver(1, "resolver2.testnet".parse::<AccountId>().unwrap());
        assert!(!countered.other_party_accepted);
        assert!(!countered.resolver_accepted);
        assert!(countered.counterproposal_used);
        dispute_call("wallet.testnet", 103, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry
            .counterpropose_dispute_resolver(
                1,
                "resolver3.testnet".parse::<AccountId>().unwrap()
            )))
        .is_err());
        dispute_call("resolver2.testnet", 104, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        dispute_call("challenger.testnet", 105, NearToken::from_near(10));
        assert_eq!(
            registry.accept_dispute_resolver(1).status,
            DisputeStatus::UnderReview
        );
        let history = registry.get_history_events(None, Some(50)).records;
        assert!(history.iter().any(|entry| matches!(
            &entry.kind,
            HistoryEventKind::DisputeResolverProposed {
                dispute_id: 1,
                resolver,
                counterproposal: false,
            } if resolver == &"resolver.testnet".parse::<AccountId>().unwrap()
        )));
        assert!(history.iter().any(|entry| matches!(
            &entry.kind,
            HistoryEventKind::DisputeNomineeAccepted { dispute_id: 1, resolver }
                if resolver == &"resolver.testnet".parse::<AccountId>().unwrap()
        )));
        assert!(history.iter().any(|entry| matches!(
            &entry.kind,
            HistoryEventKind::DisputeResolverProposed {
                dispute_id: 1,
                resolver,
                counterproposal: true,
            } if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        )));
        assert!(history.iter().any(|entry| matches!(
            &entry.kind,
            HistoryEventKind::DisputePartyAcceptedResolver { dispute_id: 1, resolver }
                if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        )));
        assert!(history.iter().any(|entry| matches!(
            &entry.kind,
            HistoryEventKind::DisputeNomineeAccepted { dispute_id: 1, resolver }
                if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        )));
    }

    #[test]
    fn evidence_dispute_derives_context_and_active_target_is_unique() {
        let mut registry = registry_with_commitment();
        dispute_call("submitter.testnet", 20, NearToken::from_near(10));
        let evidence = registry.submit_evidence(
            1,
            1,
            "https://example.org/evidence.json".into(),
            "ab".repeat(32),
        );
        dispute_call("challenger.testnet", 30, NearToken::from_near(10));
        let record = registry.open_dispute(
            DisputeTarget::Evidence {
                evidence_id: evidence.id,
            },
            "Evidence is inaccurate".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        );
        assert_eq!(record.commitment_id, evidence.commitment_id);
        assert_eq!(record.version, evidence.version);
        assert_eq!(record.affected_party, evidence.submitter);
        dispute_call("another.testnet", 31, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Evidence {
                evidence_id: evidence.id
            },
            "Duplicate challenge".into(),
            "resolver2.testnet".parse::<AccountId>().unwrap()
        )))
        .is_err());
        assert_eq!(
            registry
                .get_reviews_by_evidence(evidence.id, None, Some(5))
                .records
                .len(),
            0
        );
    }

    #[test]
    fn dispute_open_rejects_missing_targets_self_disputes_and_party_as_resolver() {
        let mut registry = registry_with_commitment();
        dispute_call("challenger.testnet", 100, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 99,
                version: 1,
            },
            "Missing commitment".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        )))
        .is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 99,
            },
            "Missing version".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        )))
        .is_err());
        dispute_call("wallet.testnet", 101, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            },
            "Self challenge".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        )))
        .is_err());
        dispute_call("challenger.testnet", 102, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            },
            "Resolver is the affected party".into(),
            "wallet.testnet".parse::<AccountId>().unwrap(),
        )))
        .is_err());
        assert_eq!(registry.last_dispute_id, 0);
    }

    #[test]
    fn dispute_deadlines_are_enforced_at_exact_boundaries_and_expiry_has_no_disposition() {
        let mut registry = registry_with_commitment();
        let opened = open_commitment_dispute(&mut registry, 100);
        dispute_call(
            "wallet.testnet",
            opened.response_deadline_ns,
            NearToken::from_near(10),
        );
        assert!(catch_unwind(AssertUnwindSafe(
            || registry.respond_to_dispute(1, "Too late".into())
        ))
        .is_err());
        dispute_call(
            "anyone.testnet",
            opened.resolver_deadline_ns - 1,
            NearToken::from_near(10),
        );
        assert!(catch_unwind(AssertUnwindSafe(|| registry.expire_dispute(1))).is_err());
        dispute_call(
            "anyone.testnet",
            opened.resolver_deadline_ns,
            NearToken::from_near(10),
        );
        assert_eq!(registry.expire_dispute(1).status, DisputeStatus::Expired);
        assert!(registry.get_dispute_resolution(1).is_none());
        assert_eq!(
            registry
                .get_commitment(1)
                .unwrap()
                .commitment
                .current_version,
            1
        );
        dispute_call(
            "challenger2.testnet",
            opened.resolver_deadline_ns + 1,
            NearToken::from_near(10),
        );
        assert_eq!(
            registry
                .open_dispute(
                    DisputeTarget::Commitment {
                        commitment_id: 1,
                        version: 1,
                    },
                    "A later challenge".into(),
                    "resolver2.testnet".parse::<AccountId>().unwrap(),
                )
                .id,
            2
        );
    }

    #[test]
    fn under_review_dispute_expires_without_resolver_action() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        dispute_call("wallet.testnet", 101, NearToken::from_near(10));
        registry.accept_dispute_resolver(1);
        dispute_call("resolver.testnet", 102, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        dispute_call("resolver.testnet", 103, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.resolve_dispute(
            1,
            DisputeDisposition::Upheld,
            "Response window is open".into()
        )))
        .is_err());
        let deadline = registry
            .get_dispute(1)
            .unwrap()
            .resolution_deadline_ns
            .unwrap();
        dispute_call("resolver.testnet", deadline, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| registry.resolve_dispute(
            1,
            DisputeDisposition::Upheld,
            "Late".into()
        )))
        .is_err());
        dispute_call("anyone.testnet", deadline, NearToken::from_near(10));
        assert_eq!(registry.expire_dispute(1).status, DisputeStatus::Expired);
        assert!(registry.get_dispute_resolution(1).is_none());
        assert!(registry
            .get_dispute(1)
            .unwrap()
            .resolution_deadline_ns
            .is_some());
    }

    #[test]
    fn affected_party_can_respond_after_early_transition_to_under_review() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        dispute_call("resolver.testnet", 101, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        dispute_call("wallet.testnet", 102, NearToken::from_near(10));
        assert_eq!(
            registry.accept_dispute_resolver(1).status,
            DisputeStatus::UnderReview
        );
        dispute_call("wallet.testnet", 103, NearToken::from_near(10));
        assert_eq!(
            registry
                .respond_to_dispute(1, "Response after appointment".into())
                .responder,
            "wallet.testnet".parse::<AccountId>().unwrap()
        );
    }

    #[test]
    fn dispute_storage_shortfall_rolls_back_and_excess_refunds_predecessor() {
        let mut registry = registry_with_commitment();
        dispute_call("caller.testnet", 100, NearToken::from_yoctonear(1));
        let before_storage = env::storage_usage();
        let before_history = registry.last_history_event_id;
        assert!(catch_unwind(AssertUnwindSafe(|| registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1
            },
            "Reason".into(),
            "resolver.testnet".parse::<AccountId>().unwrap()
        )))
        .is_err());
        assert_eq!(registry.last_dispute_id, 0);
        assert_eq!(registry.last_history_event_id, before_history);
        assert_eq!(env::storage_usage(), before_storage);
        assert!(registry.disputes_by_id.get(&1).is_none());
        let target = DisputeTarget::Commitment {
            commitment_id: 1,
            version: 1,
        };
        assert!(!registry.active_disputes_by_target.contains_key(&target));
        assert!(registry.history_events.get(&(before_history + 1)).is_none());
        assert!(registry.history_events.get(&(before_history + 2)).is_none());

        dispute_call("refund.testnet", 101, NearToken::from_near(10));
        let before = env::storage_usage();
        registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            },
            "Reason".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        );
        let required =
            env::storage_byte_cost().as_yoctonear() * u128::from(env::storage_usage() - before);
        let receipts = near_sdk::test_utils::get_created_receipts();
        assert!(receipts.iter().any(|receipt| receipt.receiver_id == "refund.testnet".parse::<AccountId>().unwrap() && receipt.actions.iter().any(|action| matches!(action, near_sdk::mock::MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == NearToken::from_near(10).as_yoctonear() - required))));
    }

    #[test]
    fn response_storage_shortfall_rolls_back_response_and_history() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        let previous_history = registry.last_history_event_id;
        let before_storage = env::storage_usage();
        dispute_call("wallet.testnet", 101, NearToken::from_yoctonear(1));
        assert!(catch_unwind(AssertUnwindSafe(
            || registry.respond_to_dispute(1, "Response".into())
        ))
        .is_err());
        assert!(registry.get_dispute_response(1).is_none());
        assert_eq!(registry.last_history_event_id, previous_history);
        assert_eq!(env::storage_usage(), before_storage);
        assert!(registry
            .history_events
            .get(&(previous_history + 1))
            .is_none());
    }

    #[test]
    fn multi_event_history_id_exhaustion_restores_staged_counters_and_state() {
        let mut empty = registry_with_commitment();
        empty.last_history_event_id = u64::MAX - 1;
        let before_storage = env::storage_usage();
        dispute_call("challenger.testnet", 100, NearToken::from_near(10));
        assert!(catch_unwind(AssertUnwindSafe(|| empty.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            },
            "Reason".into(),
            "resolver.testnet".parse::<AccountId>().unwrap(),
        )))
        .is_err());
        assert_eq!(empty.last_dispute_id, 0);
        assert_eq!(empty.last_history_event_id, u64::MAX - 1);
        assert_eq!(env::storage_usage(), before_storage);
        assert!(empty.disputes_by_id.get(&1).is_none());
        assert!(empty.history_events.get(&u64::MAX).is_none());

        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        dispute_call("resolver.testnet", 101, NearToken::from_near(10));
        registry.accept_dispute_appointment(1);
        registry.last_history_event_id = u64::MAX - 1;
        let target = DisputeTarget::Commitment {
            commitment_id: 1,
            version: 1,
        };
        assert_dispute_write_rolls_back(&mut registry, &target, "wallet.testnet", 102, |this| {
            this.accept_dispute_resolver(1);
        });
        assert!(registry.history_events.get(&u64::MAX).is_none());
    }

    #[test]
    fn resolver_actions_roll_back_short_deposits_and_refund_each_predecessor() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        let target = DisputeTarget::Commitment {
            commitment_id: 1,
            version: 1,
        };

        assert_dispute_write_rolls_back(&mut registry, &target, "resolver.testnet", 101, |this| {
            this.accept_dispute_appointment(1);
        });
        let deposit = NearToken::from_near(10);
        dispute_call_from("candidate-payer.testnet", "resolver.testnet", 102, deposit);
        let before = env::storage_usage();
        registry.accept_dispute_appointment(1);
        assert_dispute_excess_refund("candidate-payer.testnet", deposit, before);
        assert!(registry.get_dispute(1).unwrap().resolver_accepted);

        assert_dispute_write_rolls_back(&mut registry, &target, "wallet.testnet", 103, |this| {
            this.counterpropose_dispute_resolver(
                1,
                "resolver2.testnet".parse::<AccountId>().unwrap(),
            );
        });
        let deposit = NearToken::from_near(10);
        dispute_call_from("counter-payer.testnet", "wallet.testnet", 104, deposit);
        let before = env::storage_usage();
        let countered = registry
            .counterpropose_dispute_resolver(1, "resolver2.testnet".parse::<AccountId>().unwrap());
        assert_dispute_excess_refund("counter-payer.testnet", deposit, before);
        assert!(!countered.resolver_accepted);
        assert!(!countered.other_party_accepted);
        assert!(countered.counterproposal_used);

        assert_dispute_write_rolls_back(
            &mut registry,
            &target,
            "challenger.testnet",
            105,
            |this| {
                this.accept_dispute_resolver(1);
            },
        );
        let deposit = NearToken::from_near(10);
        dispute_call_from("party-payer.testnet", "challenger.testnet", 106, deposit);
        let before = env::storage_usage();
        registry.accept_dispute_resolver(1);
        assert_dispute_excess_refund("party-payer.testnet", deposit, before);
        assert!(registry.get_dispute(1).unwrap().other_party_accepted);

        assert_dispute_write_rolls_back(&mut registry, &target, "resolver2.testnet", 107, |this| {
            this.accept_dispute_appointment(1);
        });
        let deposit = NearToken::from_near(10);
        dispute_call_from("nominee-payer.testnet", "resolver2.testnet", 108, deposit);
        let before = env::storage_usage();
        assert_eq!(
            registry.accept_dispute_appointment(1).status,
            DisputeStatus::UnderReview
        );
        assert_dispute_excess_refund("nominee-payer.testnet", deposit, before);

        let deposit = NearToken::from_near(10);
        dispute_call_from("response-payer.testnet", "wallet.testnet", 109, deposit);
        let before = env::storage_usage();
        registry.respond_to_dispute(1, "Response before resolution".into());
        assert_dispute_excess_refund("response-payer.testnet", deposit, before);

        assert_dispute_write_rolls_back(&mut registry, &target, "resolver2.testnet", 110, |this| {
            this.resolve_dispute(1, DisputeDisposition::Upheld, "Rationale".into());
        });
        assert!(registry.get_dispute_resolution(1).is_none());
        let deposit = NearToken::from_near(10);
        dispute_call_from(
            "resolution-payer.testnet",
            "resolver2.testnet",
            111,
            deposit,
        );
        let before = env::storage_usage();
        registry.resolve_dispute(1, DisputeDisposition::Upheld, "Rationale".into());
        assert_dispute_excess_refund("resolution-payer.testnet", deposit, before);
        assert_eq!(
            registry.get_dispute(1).unwrap().status,
            DisputeStatus::Resolved
        );
        assert!(registry.active_disputes_by_target.get(&target).is_none());

        let mut expiring = registry_with_commitment();
        let opened = open_commitment_dispute(&mut expiring, 200);
        let expiry_target = opened.target.clone();
        let expiry_at = opened.resolver_deadline_ns + 1;
        assert_dispute_write_rolls_back(
            &mut expiring,
            &expiry_target,
            "anyone.testnet",
            expiry_at,
            |this| {
                this.expire_dispute(1);
            },
        );
        let deposit = NearToken::from_near(10);
        dispute_call_from(
            "expiry-payer.testnet",
            "anyone.testnet",
            expiry_at + 1,
            deposit,
        );
        let before = env::storage_usage();
        assert_eq!(expiring.expire_dispute(1).status, DisputeStatus::Expired);
        assert_dispute_excess_refund("expiry-payer.testnet", deposit, before);
        assert!(expiring
            .active_disputes_by_target
            .get(&expiry_target)
            .is_none());
    }

    #[test]
    fn dispute_pages_history_events_and_serialization_are_bounded_and_append_only() {
        let mut registry = registry_with_commitment();
        open_commitment_dispute(&mut registry, 100);
        // A second exact target is distinct because it names a different version.
        let mut version2 = registry.get_commitment_version(1, 1).unwrap();
        version2.version = 2;
        registry.commitment_versions.insert((1, 2), version2);
        dispute_call("challenger2.testnet", 101, NearToken::from_near(10));
        registry.open_dispute(
            DisputeTarget::Commitment {
                commitment_id: 1,
                version: 2,
            },
            "Second target".into(),
            "resolver2.testnet".parse::<AccountId>().unwrap(),
        );
        let first = registry.get_disputes(None, Some(1));
        assert_eq!(first.records[0].id, 1);
        assert_eq!(first.next_cursor, Some(1));
        let second = registry.get_disputes(first.next_cursor, Some(1));
        assert_eq!(second.records[0].id, 2);
        assert_eq!(second.next_cursor, None);
        assert!(catch_unwind(AssertUnwindSafe(
            || registry.get_disputes(None, Some(MAX_PAGE_SIZE + 1))
        ))
        .is_err());
        let history = registry.get_history_events(None, Some(1));
        assert_eq!(history.records.len(), 1);
        assert_eq!(history.next_cursor, Some(1));
        let json = near_sdk::serde_json::to_string(&registry.get_dispute(1).unwrap()).unwrap();
        let decoded: DisputeRecord = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, registry.get_dispute(1).unwrap());
        let bytes = near_sdk::borsh::to_vec(&decoded).unwrap();
        let from_bytes: DisputeRecord = near_sdk::borsh::from_slice(&bytes).unwrap();
        assert_eq!(from_bytes, decoded);
        let event = near_sdk::test_utils::get_logs()
            .iter()
            .filter(|line| line.starts_with("EVENT_JSON:"))
            .filter_map(|line| {
                near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
                    line.trim_start_matches("EVENT_JSON:"),
                )
                .ok()
            })
            .find(|event| event["event"] == "dispute_raised")
            .unwrap();
        assert_eq!(event["standard"], "memeproof");
        assert_eq!(event["event"], "dispute_raised");
        assert_eq!(event["data"][0]["target"]["commitment"]["version"], 2);
        let proposal_event = near_sdk::test_utils::get_logs()
            .iter()
            .filter(|line| line.starts_with("EVENT_JSON:"))
            .filter_map(|line| {
                near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
                    line.trim_start_matches("EVENT_JSON:"),
                )
                .ok()
            })
            .find(|event| event["event"] == "dispute_resolver_proposed")
            .unwrap();
        assert_eq!(proposal_event["data"][0]["resolver"], "resolver2.testnet");
        assert_eq!(proposal_event["data"][0]["counterproposal"], false);
    }

    #[test]
    fn dispute_records_indexes_responses_resolutions_and_history_survive_reload() {
        let active_target = DisputeTarget::Commitment {
            commitment_id: 1,
            version: 2,
        };
        let mut last_history_event_id = 0;
        {
            let mut registry = registry_with_commitment();
            open_commitment_dispute(&mut registry, 100);

            dispute_call("wallet.testnet", 101, NearToken::from_near(10));
            registry.respond_to_dispute(1, "Persistent response".into());
            dispute_call("resolver.testnet", 102, NearToken::from_near(10));
            registry.accept_dispute_appointment(1);
            dispute_call("wallet.testnet", 103, NearToken::from_near(10));
            registry.counterpropose_dispute_resolver(
                1,
                "resolver2.testnet".parse::<AccountId>().unwrap(),
            );
            dispute_call("resolver2.testnet", 104, NearToken::from_near(10));
            registry.accept_dispute_appointment(1);
            dispute_call("challenger.testnet", 105, NearToken::from_near(10));
            registry.accept_dispute_resolver(1);
            dispute_call("resolver2.testnet", 106, NearToken::from_near(10));
            registry.resolve_dispute(
                1,
                DisputeDisposition::Dismissed,
                "Persistent resolution".into(),
            );

            dispute_call("wallet.testnet", 120, NearToken::from_near(10));
            registry.amend_commitment(
                1,
                "Second version".into(),
                "Description".into(),
                "Criteria".into(),
                200,
            );
            dispute_call("challenger2.testnet", 121, NearToken::from_near(10));
            registry.open_dispute(
                active_target.clone(),
                "Active index survives".into(),
                "resolver3.testnet".parse::<AccountId>().unwrap(),
            );
            last_history_event_id = registry.last_history_event_id;
        }

        let disputes: LookupMap<u64, DisputeRecord> = LookupMap::new(StorageKey::DisputesById);
        let active: LookupMap<DisputeTarget, u64> =
            LookupMap::new(StorageKey::ActiveDisputesByTarget);
        let responses: LookupMap<u64, DisputeResponse> =
            LookupMap::new(StorageKey::DisputeResponses);
        let resolutions: LookupMap<u64, DisputeResolutionRecord> =
            LookupMap::new(StorageKey::DisputeResolutions);
        let history: LookupMap<u64, HistoryEvent> = LookupMap::new(StorageKey::HistoryEvents);

        let resolved = disputes.get(&1).unwrap().clone();
        assert_eq!(resolved.status, DisputeStatus::Resolved);
        assert_eq!(disputes.get(&2).unwrap().status, DisputeStatus::Open);
        assert_eq!(active.get(&active_target), Some(&2));
        assert!(active
            .get(&DisputeTarget::Commitment {
                commitment_id: 1,
                version: 1,
            })
            .is_none());
        let response = responses.get(&1).unwrap().clone();
        let resolution = resolutions.get(&1).unwrap().clone();
        assert_eq!(response.response, "Persistent response");
        assert_eq!(resolution.disposition, DisputeDisposition::Dismissed);

        let history_events = (1..=last_history_event_id)
            .filter_map(|id| history.get(&id).cloned())
            .collect::<Vec<_>>();
        let proposal_events = history_events
            .iter()
            .filter(|event| {
                matches!(
                    &event.kind,
                    HistoryEventKind::DisputeResolverProposed { dispute_id: 1, .. }
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(proposal_events.len(), 2);
        assert!(matches!(
            &proposal_events[0].kind,
            HistoryEventKind::DisputeResolverProposed {
                resolver,
                counterproposal: false,
                ..
            } if resolver == &"resolver.testnet".parse::<AccountId>().unwrap()
        ));
        assert!(matches!(
            &proposal_events[1].kind,
            HistoryEventKind::DisputeResolverProposed {
                resolver,
                counterproposal: true,
                ..
            } if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        ));
        assert!(history_events.iter().any(|event| matches!(
            &event.kind,
            HistoryEventKind::DisputePartyAcceptedResolver { dispute_id: 1, resolver }
                if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        )));
        assert!(history_events.iter().any(|event| matches!(
            &event.kind,
            HistoryEventKind::DisputeNomineeAccepted { dispute_id: 1, resolver }
                if resolver == &"resolver2.testnet".parse::<AccountId>().unwrap()
        )));
        for event in &history_events {
            let bytes = near_sdk::borsh::to_vec(event).unwrap();
            let decoded = near_sdk::borsh::from_slice::<HistoryEvent>(&bytes).unwrap();
            assert_eq!(&decoded, event);
            let json = near_sdk::serde_json::to_string(event).unwrap();
            assert_eq!(
                &near_sdk::serde_json::from_str::<HistoryEvent>(&json).unwrap(),
                event
            );
        }

        let dispute_bytes = near_sdk::borsh::to_vec(&resolved).unwrap();
        assert_eq!(
            near_sdk::borsh::from_slice::<DisputeRecord>(&dispute_bytes).unwrap(),
            resolved
        );
        let response_bytes = near_sdk::borsh::to_vec(&response).unwrap();
        assert_eq!(
            near_sdk::borsh::from_slice::<DisputeResponse>(&response_bytes).unwrap(),
            response
        );
        let resolution_bytes = near_sdk::borsh::to_vec(&resolution).unwrap();
        assert_eq!(
            near_sdk::borsh::from_slice::<DisputeResolutionRecord>(&resolution_bytes).unwrap(),
            resolution
        );
        let raised = history_events
            .iter()
            .find(|event| {
                matches!(
                    &event.kind,
                    HistoryEventKind::DisputeRaised { dispute_id: 1, .. }
                )
            })
            .unwrap();
        let event_bytes = near_sdk::borsh::to_vec(raised).unwrap();
        assert_eq!(
            near_sdk::borsh::from_slice::<HistoryEvent>(&event_bytes).unwrap(),
            (*raised).clone()
        );
        let json = near_sdk::serde_json::to_string(&resolved).unwrap();
        assert_eq!(
            near_sdk::serde_json::from_str::<DisputeRecord>(&json).unwrap(),
            resolved
        );
        let response_json = near_sdk::serde_json::to_string(&response).unwrap();
        assert_eq!(
            near_sdk::serde_json::from_str::<DisputeResponse>(&response_json).unwrap(),
            response
        );
        let resolution_json = near_sdk::serde_json::to_string(&resolution).unwrap();
        assert_eq!(
            near_sdk::serde_json::from_str::<DisputeResolutionRecord>(&resolution_json).unwrap(),
            resolution
        );
        let target_bytes = near_sdk::borsh::to_vec(&active_target).unwrap();
        assert_eq!(
            near_sdk::borsh::from_slice::<DisputeTarget>(&target_bytes).unwrap(),
            active_target
        );
    }

    fn valid_test_cid() -> String {
        let mut bytes = vec![1, 0x55, 0x12, 0x20];
        bytes.extend([0u8; 32]);
        let alphabet = b"abcdefghijklmnopqrstuvwxyz234567";
        let mut encoded = String::from("ipfs://b");
        let (mut buffer, mut bits) = (0u32, 0u32);
        for byte in bytes {
            buffer = (buffer << 8) | u32::from(byte);
            bits += 8;
            while bits >= 5 {
                bits -= 5;
                encoded.push(alphabet[((buffer >> bits) & 31) as usize] as char);
            }
        }
        if bits > 0 {
            encoded.push(alphabet[((buffer << (5 - bits)) & 31) as usize] as char);
        }
        encoded.push_str("/metadata.json");
        encoded
    }
}
