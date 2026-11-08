import test from "node:test";
import assert from "node:assert/strict";
import { validateSupabaseServerKey } from "./supabase-key.ts";

const projectRef = "projectref123456789012";
function legacyKey(role, ref = projectRef) {
  return `header.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.signature`;
}

test("service-key validation rejects the control character seen in the effective local env value", () => {
  const result = validateSupabaseServerKey(String.fromCharCode(22), projectRef);
  assert.equal(result.valid, false);
  assert.equal(result.issue, "control_character");
});

test("service-key validation rejects whitespace and quoted values", () => {
  assert.equal(validateSupabaseServerKey(" secret ", projectRef).issue, "whitespace");
  assert.equal(validateSupabaseServerKey('"sb_secret_example"', projectRef).issue, "quoted");
});

test("service-key validation rejects public keys and keys for a different project", () => {
  assert.equal(validateSupabaseServerKey(legacyKey("anon"), projectRef).issue, "public_key");
  assert.equal(validateSupabaseServerKey("sb_publishable_example", projectRef).issue, "public_key");
  const mismatch = validateSupabaseServerKey(legacyKey("service_role", "anotherprojectref123"), projectRef);
  assert.equal(mismatch.issue, "wrong_project");
  assert.equal(mismatch.matchesProject, false);
});

test("service-key validation accepts supported server key formats for this project", () => {
  assert.deepEqual(validateSupabaseServerKey(legacyKey("service_role"), projectRef), {
    valid: true,
    format: "legacy_jwt",
    role: "service_role",
    matchesProject: true,
    issue: "none",
  });
  assert.equal(validateSupabaseServerKey("sb_secret_example", projectRef).valid, true);
});
