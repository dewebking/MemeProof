use near_sdk::near;

/// Phase 1 scaffold only. No registration or commitment behavior is implemented yet.
#[near(contract_state)]
#[derive(Default)]
pub struct MemeProofRegistry {}

#[near]
impl MemeProofRegistry {
    pub fn get_network(&self) -> String {
        "testnet".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_testnet_as_development_network() {
        let contract = MemeProofRegistry::default();
        assert_eq!(contract.get_network(), "testnet");
    }
}
