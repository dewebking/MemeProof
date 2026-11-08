import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./registry-passport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { canonicalTokenIdentity, findTokenByIdentity, sameTokenIdentity, tokenRegistrationStatus } = await import(
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
