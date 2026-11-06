use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, Promise};

pub const SCHEMA_VERSION: u16 = 2;
pub const MAX_TEXT_BYTES: usize = 16 * 1024;
pub const MAX_METADATA_URI_BYTES: usize = 2 * 1024;
pub const MAX_PAGE_SIZE: u32 = 50;
pub const DEFAULT_PAGE_SIZE: u32 = 20;

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
        commitment_id: u64,
        dispute_id: u64,
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
    pub reference: String,
    pub content_hash: String,
    pub submitter: AccountId,
    pub submitted_at_ns: u64,
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

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    TokensById,
    TokenIdsByIdentity,
    CommitmentsById,
    CommitmentVersions,
    HistoryEvents,
}

#[near(contract_state)]
pub struct MemeProofRegistry {
    config: RegistryConfig,
    last_token_id: u64,
    last_commitment_id: u64,
    last_history_event_id: u64,
    tokens_by_id: LookupMap<u64, TokenRecord>,
    token_ids_by_identity: LookupMap<TokenIdentity, u64>,
    commitments_by_id: LookupMap<u64, CommitmentRecord>,
    commitment_versions: LookupMap<(u64, u32), CommitmentVersion>,
    history_events: LookupMap<u64, HistoryEvent>,
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
            tokens_by_id: LookupMap::new(StorageKey::TokensById),
            token_ids_by_identity: LookupMap::new(StorageKey::TokenIdsByIdentity),
            commitments_by_id: LookupMap::new(StorageKey::CommitmentsById),
            commitment_versions: LookupMap::new(StorageKey::CommitmentVersions),
            history_events: LookupMap::new(StorageKey::HistoryEvents),
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
        if refund > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(refund));
        }

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
        context
            .current_account_id("registry.testnet".parse::<AccountId>().unwrap())
            .predecessor_account_id(predecessor.parse::<AccountId>().unwrap())
            .signer_account_id(signer.parse::<AccountId>().unwrap())
            .attached_deposit(deposit)
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

        let mut tokens: LookupMap<u64, TokenRecord> = LookupMap::new(StorageKey::TokensById);
        let mut identities: LookupMap<TokenIdentity, u64> =
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
