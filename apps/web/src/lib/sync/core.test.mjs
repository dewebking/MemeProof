import test from "node:test";
import assert from "node:assert/strict";
import { calculateRetryAt, isMarketSnapshotStale, prepareSyncChanges, runRefreshJob } from "./core.ts";

const valid = (meme_id, fields = {}) => ({ meme_id, name: `Token ${meme_id}`, ...fields });
const token = (id, tokenId = "token.near", extra = {}) => ({ meme_id: id, token_id: tokenId, pool_id: null, is_finalized: null, source_created_at: null, source_updated_at: null, market_eligible: tokenId?.endsWith(".near") ?? false, source_record: valid(id, { token_id: tokenId }), ...extra });

function deps(overrides = {}) {
  const calls = { upserts: [], attempts: [], failures: [], syncFailed: [], syncSucceeded: [], refreshed: 0, lockReleased: 0, finished: [] };
  const state = { lastSuccessAt: null, nextRetryAt: null, failureCount: 0 };
  return {
    calls, state,
    acquireLock: async () => true, releaseLock: async () => { calls.lockReleased++; },
    startRun: async () => "run-1", finishRun: async (...args) => calls.finished.push(args), getSyncState: async () => state,
    getExistingTokens: async () => [], fetchSourceTokens: async () => [valid(1)],
    upsertTokens: async (rows) => calls.upserts.push(...rows),
    markSyncSuccessful: async (at) => calls.syncSucceeded.push(at),
    markSyncFailed: async (...args) => calls.syncFailed.push(args),
    countTokens: async () => calls.upserts.length,
    getDueMarketTokens: async () => [], refreshMarket: async () => { calls.refreshed++; return { marketData: null, providers: { geckoterminal: "no_match", dexscreener: "no_match" }, state: "no_matching_pair", fetchedAt: "2026-01-01T00:00:00.000Z" }; },
    recordMarketAttempt: async (...args) => calls.attempts.push(args),
    recordMarketFailure: async (...args) => calls.failures.push(args),
    countUnavailableMarketRecords: async () => 0,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const options = { trigger: "manual", owner: "test", syncIntervalMinutes: 15, marketRefreshIntervalMinutes: 60, marketBatchSize: 5 };

test("discovers new tokens, updates changed source records, and deduplicates by meme_id", () => {
  const result = prepareSyncChanges([valid(1, { name: "old" }), valid(1, { name: "new" }), valid(2)], [token(1, "token.near", { source_record: valid(1, { name: "old" }) })]);
  assert.equal(result.newTokens, 1);
  assert.equal(result.updatedTokens, 1);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.rows.find((row) => row.meme_id === 1).source_record.name, "new");
});

test("source API outage preserves existing rows and schedules exponential retry", async () => {
  const store = deps({ fetchSourceTokens: async () => { throw new Error("upstream down"); }, countTokens: async () => 9 });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.sourceSync, "failed");
  assert.equal(summary.totalTokensDiscovered, 9);
  assert.equal(store.calls.upserts.length, 0);
  assert.equal(store.calls.syncFailed[0][1], 1);
  assert.equal(store.calls.lockReleased, 1);
});

test("missing token contracts are not looked up; available contracts can match market data", async () => {
  const store = deps({
    getDueMarketTokens: async () => [token(1, null, { market_eligible: false }), token(2)],
    refreshMarket: async () => ({ marketData: { provider: "dexscreener", pairAddress: "pair" }, providers: { geckoterminal: "unsupported", dexscreener: "matched" }, state: "available", fetchedAt: "2026-01-01T00:00:00.000Z" }),
  });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.marketLookupsAttempted, 1);
  assert.equal(summary.successfulMarketMatches, 1);
  assert.equal(store.calls.attempts.length, 1);
});

test("a valid contract with no matching pair is counted unavailable without inventing data", async () => {
  const store = deps({
    getDueMarketTokens: async () => [token(2)],
    refreshMarket: async () => ({ marketData: null, providers: { geckoterminal: "no_match", dexscreener: "no_match" }, state: "no_matching_pair", fetchedAt: "2026-01-01T00:00:00.000Z" }),
    countUnavailableMarketRecords: async () => 1,
  });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.marketLookupsAttempted, 1);
  assert.equal(summary.successfulMarketMatches, 0);
  assert.equal(summary.unavailableMarketRecords, 1);
  assert.equal(store.calls.attempts[0][1].marketData, null);
});

test("temporary provider failure records retry while preserving cached-success contract for store", async () => {
  const store = deps({
    getDueMarketTokens: async () => [token(2)],
    refreshMarket: async () => { throw new Error("429"); },
    recordMarketFailure: async (_token, at, nextAttemptAt, failureCount) => {
      store.calls.failures.push([_token, at, nextAttemptAt, failureCount]);
      // The storage adapter updates attempt metadata and retains these successful fields.
    },
  });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.failedProviderRequests, 1);
  assert.equal(store.calls.failures.length, 1);
  assert.equal(Date.parse(store.calls.failures[0][2]) - Date.parse("2026-01-01T00:00:00.000Z"), 5 * 60_000);
  assert.equal(calculateRetryAt(new Date("2026-01-01T00:00:00.000Z"), 3), "2026-01-01T00:20:00.000Z");
});

test("cached data is stale after interval or unsuccessful attempt", () => {
  const success = "2026-01-01T00:00:00.000Z";
  assert.equal(isMarketSnapshotStale(success, "matched", new Date("2026-01-01T00:30:00.000Z"), 60), false);
  assert.equal(isMarketSnapshotStale(success, "provider_unavailable", new Date("2026-01-01T00:30:00.000Z"), 60), true);
  assert.equal(isMarketSnapshotStale(success, "matched", new Date("2026-01-01T01:00:00.000Z"), 60), true);
});

test("a concurrent refresh does not run work", async () => {
  const store = deps({ acquireLock: async () => false });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.lockAcquired, false);
  assert.equal(store.calls.upserts.length, 0);
  assert.equal(store.calls.lockReleased, 0);
  assert.equal(store.calls.finished.length, 1);
});

test("a lock storage RPC error is reported as a failed refresh, not successful contention", async () => {
  const store = deps({ acquireLock: async () => { throw new Error("storage_http_403"); } });
  await assert.rejects(runRefreshJob(store, options), /Refresh lock storage is unavailable/);
  assert.equal(store.calls.upserts.length, 0);
  assert.equal(store.calls.finished[0][2], "refresh_lock_failed");
});

test("a successful lock acquisition releases the lock after completing work", async () => {
  const store = deps();
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.lockAcquired, true);
  assert.equal(store.calls.lockReleased, 1);
});

test("refresh summary captures attempted, matched, and unavailable counts", async () => {
  const store = deps({ getDueMarketTokens: async () => [token(2)], countUnavailableMarketRecords: async () => 4 });
  const summary = await runRefreshJob(store, options);
  assert.equal(summary.lockAcquired, true);
  assert.equal(summary.totalTokensDiscovered, 1);
  assert.equal(summary.newTokensFound, 1);
  assert.equal(summary.marketLookupsAttempted, 1);
  assert.equal(summary.unavailableMarketRecords, 4);
});
