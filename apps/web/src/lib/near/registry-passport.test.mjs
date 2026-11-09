import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./registry-passport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { canonicalTokenIdentity, findTokenByIdentity, getTokenPassportRecords, sameTokenIdentity, tokenRegistrationStatus } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const identity = { network_id: "testnet", token_contract_address: "meme-token.testnet" };
const token = { id: 12, identity, registrant: "alice.testnet", created_at_ns: "1", metadata_uri: null, status: "active" };

test("token identity matching uses network and contract address, never ticker", async () => {
  assert.deepEqual(canonicalTokenIdentity("testnet", " MEME-TOKEN.testnet "), identity);
  assert.equal(canonicalTokenIdentity("mainnet", "meme-token.testnet"), null);
  assert.equal(canonicalTokenIdentity("testnet", "not a contract"), null);
  assert.equal(sameTokenIdentity(identity, { ...identity, network_id: "mainnet" }), false);
  const found = await findTokenByIdentity({
    getTokens: async (cursor) => cursor === null
      ? { records: [{ ...token, identity: { ...identity, token_contract_address: "other.testnet" } }], next_cursor: 1 }
      : { records: [token], next_cursor: null },
  }, identity);
  assert.equal(found.id, 12);
});

test("registry status distinguishes absent identity, confirmed absence, and an exact match", () => {
  assert.equal(tokenRegistrationStatus(null, null), "identity_unavailable");
  assert.equal(tokenRegistrationStatus(identity, null), "unregistered");
  assert.equal(tokenRegistrationStatus(identity, token), "registered");
  assert.equal(tokenRegistrationStatus(identity, { ...token, identity: { ...identity, token_contract_address: "different.testnet" } }), "unregistered");
});

test("token passport hydrates only commitments named for the selected token and loads related records", async () => {
  const hydrated = [];
  const record = (id, tokenId) => ({
    commitment: { id, token_id: tokenId, creator: "alice.testnet", current_version: 2, created_at_ns: "10" },
    current_version: { version: 2, title: `Promise ${id}`, description: "Description", criteria: "Criteria", deadline_at_ns: "20", created_at_ns: "15" },
  });
  const result = await getTokenPassportRecords({
    getHistoryEvents: async () => ({ records: [
      { id: 1, actor: "alice.testnet", occurred_at_ns: 10, kind: { commitment_created: { commitment_id: 7, token_id: 12 } } },
      { id: 2, actor: "alice.testnet", occurred_at_ns: 11, kind: { commitment_created: { commitment_id: 8, token_id: 99 } } },
    ], next_cursor: null }),
    getCommitment: async (id) => { hydrated.push(String(id)); return record(id, 12); },
    getCommitmentVersions: async () => ({ versions: [
      { version: 1, title: "Earlier", description: "Old", criteria: "Old criteria", deadline_at_ns: "18", created_at_ns: "12" },
      { version: 2, title: "Promise 7", description: "Description", criteria: "Criteria", deadline_at_ns: "20", created_at_ns: "15" },
    ], next_cursor: null }),
    getCommitmentEvidences: async () => ({ records: [{ id: 20, commitment_id: 7, version: 2, reference: "https://example.test/evidence", content_hash: "sha256:abc", submitter: "bob.testnet", submitted_at_ns: "21" }], next_cursor: null }),
    getReviewsByEvidence: async () => ({ records: [{ id: 30, evidence_id: 20, commitment_id: 7, reviewer: "carol.testnet", version: 2, outcome: "supports", explanation: "Observed", submitted_at_ns: "22" }], next_cursor: null }),
    getDisputesByCommitment: async () => ({ records: [{ id: 40, commitment_id: 7, evidence_id: null, status: "resolved" }], next_cursor: null }),
    getDisputesByEvidence: async () => ({ records: [{ id: 40, commitment_id: 7, evidence_id: 20, status: "resolved" }], next_cursor: null }),
    getDisputeResolution: async () => ({ dispute_id: 40, resolver: "dave.testnet", disposition: "inconclusive", rationale: "Insufficient record", resolved_at_ns: "23" }),
  }, 12);

  assert.deepEqual(hydrated, ["7"]);
  assert.equal(result.commitments.length, 1);
  assert.equal(result.commitments[0].versions.length, 2);
  assert.equal(result.commitments[0].evidence[0].reviews[0].id, 30);
  assert.equal(result.disputes.length, 1);
  assert.equal(result.disputes[0].resolution.disposition, "inconclusive");
});
