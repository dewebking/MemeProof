import test from "node:test";
import assert from "node:assert/strict";
import { describeLockRpcResult, describeTransportError, isNextDynamicUsageError, lockWasAcquired, safeRpcErrorMessage } from "./lock-rpc.ts";

test("only a literal true from the lock RPC means acquisition succeeded", () => {
  assert.equal(lockWasAcquired(true), true);
  assert.equal(lockWasAcquired(false), false);
  assert.equal(lockWasAcquired(null), false);
  assert.equal(lockWasAcquired({ acquire_memeproof_refresh_lock: true }), false);
});

test("lock RPC diagnostics distinguish false, null, and unexpected response shapes", () => {
  assert.deepEqual(describeLockRpcResult(false), { resultType: "boolean", returnedValue: false });
  assert.deepEqual(describeLockRpcResult(null), { resultType: "null", returnedValue: null });
  assert.deepEqual(describeLockRpcResult({ owner: "private-value" }), {
    resultType: "object",
    returnedValue: "{object with 1 keys; values omitted}",
  });
});

test("database error messages are bounded and redact URLs, tokens, and UUIDs", () => {
  const message = safeRpcErrorMessage("Failed https://project.supabase.co with Bearer abc123 and 01234567-89ab-cdef-0123-456789abcdef");
  assert.equal(message.includes("project.supabase.co"), false);
  assert.equal(message.includes("abc123"), false);
  assert.equal(message.includes("01234567-89ab-cdef-0123-456789abcdef"), false);
});

test("transport diagnostics preserve the native cause while redacting secret-like values", () => {
  const error = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("getaddrinfo ENOTFOUND db.example.supabase.co token_1234567890123456789012345678901234567890"), { code: "ENOTFOUND" }),
  });
  const diagnostic = describeTransportError(error);
  assert.equal(diagnostic.errorName, "TypeError");
  assert.equal(diagnostic.errorCode, "ENOTFOUND");
  assert.match(diagnostic.errorMessage, /ENOTFOUND/);
  assert.doesNotMatch(diagnostic.errorMessage, /token_1234567890123456789012345678901234567890/);
});

test("transport diagnostics identify malformed Supabase URLs", () => {
  const diagnostic = describeTransportError(new TypeError("Failed to parse URL from invalid input"));
  assert.equal(diagnostic.errorCode, "ERR_INVALID_URL");
});

test("transport error sanitization redacts named environment values even when they are short", () => {
  const diagnostic = describeTransportError(new TypeError("Invalid URL: CRON_SECRET=short SUPABASE_SERVICE_ROLE_KEY=also-short"));
  assert.doesNotMatch(diagnostic.errorMessage, /short|also-short/);
});

test("Next static-generation dynamic-usage signals are not reported as Supabase transport failures", () => {
  assert.equal(isNextDynamicUsageError(new Error("Dynamic server usage: Route /api/example used fetch")), true);
  assert.equal(isNextDynamicUsageError(new Error("fetch failed")), false);
});
