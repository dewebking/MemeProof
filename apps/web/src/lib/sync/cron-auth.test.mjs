import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedCronRequest } from "./cron-auth.ts";
import { handleCronPost } from "./cron-handler.ts";

const secret = "test-secret-with-at-least-thirty-two-characters";
const req = (authorization) => new Request("https://memeproof.test/api/cron/sync", { headers: authorization ? { authorization } : {} });

test("cron rejects missing, malformed, or wrong secrets and accepts a matching bearer secret", () => {
  assert.equal(isAuthorizedCronRequest(req(null), secret), false);
  assert.equal(isAuthorizedCronRequest(req("Basic abc"), secret), false);
  assert.equal(isAuthorizedCronRequest(req("Bearer wrong"), secret), false);
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${secret}`), secret), true);
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${secret}`), "short"), false);
});

test("unauthorized cron requests never start a refresh", async () => {
  let called = false;
  const response = await handleCronPost(req(null), { authorized: false, configured: true, refresh: async () => { called = true; throw new Error("should not run"); } });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("authorized scheduled requests run and return the refresh summary", async () => {
  const summary = { trigger: "scheduled", lockAcquired: true, sourceSync: "success", totalTokensDiscovered: 4, newTokensFound: 1, tokensUpdated: 2, marketLookupsAttempted: 1, successfulMarketMatches: 1, unavailableMarketRecords: 3, failedProviderRequests: 0, startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:02.000Z" };
  let trigger;
  const request = new Request("https://memeproof.test/api/cron/sync", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ trigger: "scheduled" }) });
  const response = await handleCronPost(request, { authorized: isAuthorizedCronRequest(request, secret), configured: true, refresh: async (value) => { trigger = value; return summary; } });
  assert.equal(response.status, 200);
  assert.equal(trigger, "scheduled");
  assert.deepEqual(await response.json(), summary);
});
