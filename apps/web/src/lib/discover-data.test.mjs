import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscoverTokens } from "./discover-data.ts";

const fixedNow = () => "2026-11-09T12:00:00.000Z";

test("falls through to Meme.Cooking when the configured snapshot store fails", async () => {
  let liveCalls = 0;
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => { throw new Error("snapshot unavailable"); },
    readLive: async () => { liveCalls += 1; return [{ meme_id: "meme-1" }]; },
    now: fixedNow,
  });
  assert.equal(liveCalls, 1);
  assert.deepEqual(result, {
    data: [{ meme_id: "meme-1" }],
    source: "meme.cooking",
    stale: false,
    retrievedAt: fixedNow(),
  });
});

test("serves the last real listing snapshot when both upstream sources fail", async () => {
  const fresh = [{ meme_id: "meme-2", token_id: "contract.near" }];
  await resolveDiscoverTokens({
    readSnapshot: async () => fresh,
    readSnapshotMetadata: async () => ({ retrievedAt: fixedNow(), stale: false }),
    readLive: async () => [],
    now: fixedNow,
  });
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => { throw new Error("snapshot unavailable"); },
    readLive: async () => { throw new Error("Meme.Cooking unavailable"); },
    now: fixedNow,
  });
  assert.deepEqual(result, { data: fresh, source: "stale_cache", stale: true, retrievedAt: fixedNow() });
});

test("uses the configured snapshot without making a live request", async () => {
  const snapshot = [{ meme_id: "meme-3" }];
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => snapshot,
    readLive: async () => { throw new Error("should not be called"); },
    readSnapshotMetadata: async () => ({ retrievedAt: fixedNow(), stale: false }),
    now: fixedNow,
  });
  assert.deepEqual(result, { data: snapshot, source: "sync_snapshot", stale: false, retrievedAt: fixedNow() });
});

test("an un-timestamped snapshot is stale and never receives a fabricated retrieval time", async () => {
  const snapshot = [{ meme_id: "old-snapshot" }];
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => snapshot,
    readLive: async () => { throw new Error("provider unavailable"); },
    now: fixedNow,
  });
  assert.deepEqual(result, { data: snapshot, source: "sync_snapshot", stale: true, retrievedAt: null });
});

test("refreshes a stale sync snapshot from Meme.Cooking before serving it", async () => {
  let liveCalls = 0;
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => [{ meme_id: "old-launch" }],
    readSnapshotMetadata: async () => ({ retrievedAt: "2026-11-08T19:30:00.000Z", stale: true }),
    readLive: async () => { liveCalls += 1; return [{ meme_id: "new-launch" }]; },
    now: fixedNow,
  });

  assert.equal(liveCalls, 1);
  assert.deepEqual(result, {
    data: [{ meme_id: "new-launch" }],
    source: "meme.cooking",
    stale: false,
    retrievedAt: fixedNow(),
  });
});

test("keeps a stale sync snapshot visible when refreshing it fails", async () => {
  const snapshot = [{ meme_id: "cached-launch" }];
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => snapshot,
    readSnapshotMetadata: async () => ({ retrievedAt: "2026-11-08T19:30:00.000Z", stale: true }),
    readLive: async () => { throw new Error("Meme.Cooking unavailable"); },
    now: fixedNow,
  });

  assert.deepEqual(result, {
    data: snapshot,
    source: "sync_snapshot",
    stale: true,
    retrievedAt: "2026-11-08T19:30:00.000Z",
  });
});

test("does not replace the last useful listing snapshot with an empty provider response", async () => {
  const useful = [{ meme_id: "meme-4", token_id: "useful.near" }];
  await resolveDiscoverTokens({
    readSnapshot: async () => useful,
    readSnapshotMetadata: async () => ({ retrievedAt: fixedNow(), stale: false }),
    readLive: async () => [],
    now: fixedNow,
  });
  const empty = await resolveDiscoverTokens({ readSnapshot: async () => [], readLive: async () => [], now: fixedNow });
  assert.deepEqual(empty, { data: [], source: "meme.cooking", stale: false, retrievedAt: fixedNow() });

  const unavailable = await resolveDiscoverTokens({
    readSnapshot: async () => { throw new Error("snapshot unavailable"); },
    readLive: async () => { throw new Error("provider unavailable"); },
    now: fixedNow,
  });
  assert.deepEqual(unavailable, { data: useful, source: "stale_cache", stale: true, retrievedAt: fixedNow() });
});

test("uses the sync store's last successful refresh time for cached listings", async () => {
  const snapshotAt = "2026-11-08T19:30:00.000Z";
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => [{ meme_id: "meme-5" }],
    readSnapshotMetadata: async () => ({ retrievedAt: snapshotAt, stale: true }),
    readLive: async () => { throw new Error("should not be called"); },
    now: fixedNow,
  });

  assert.equal(result.retrievedAt, snapshotAt);
  assert.equal(result.stale, true);
});

test("marks a snapshot stale instead of assigning it a misleading current timestamp", async () => {
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => [{ meme_id: "meme-6" }],
    readSnapshotMetadata: async () => { throw new Error("sync state unavailable"); },
    readLive: async () => { throw new Error("should not be called"); },
    now: fixedNow,
  });

  assert.equal(result.stale, true);
  assert.equal(result.retrievedAt, null);
});
