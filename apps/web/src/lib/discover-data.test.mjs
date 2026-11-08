import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscoverTokens } from "./discover-data.ts";

test("falls through to Meme.Cooking when the configured snapshot store fails", async () => {
  let liveCalls = 0;
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => { throw new Error("snapshot unavailable"); },
    readLive: async () => { liveCalls += 1; return [{ meme_id: "meme-1" }]; },
  });
  assert.equal(liveCalls, 1);
  assert.deepEqual(result, {
    data: [{ meme_id: "meme-1" }],
    source: "meme.cooking",
    stale: false,
  });
});

test("serves the last real listing snapshot when both upstream sources fail", async () => {
  const fresh = [{ meme_id: "meme-2", token_id: "contract.near" }];
  await resolveDiscoverTokens({ readSnapshot: async () => fresh, readLive: async () => [] });
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => { throw new Error("snapshot unavailable"); },
    readLive: async () => { throw new Error("Meme.Cooking unavailable"); },
  });
  assert.deepEqual(result, { data: fresh, source: "stale_cache", stale: true });
});

test("uses the configured snapshot without making a live request", async () => {
  const snapshot = [{ meme_id: "meme-3" }];
  const result = await resolveDiscoverTokens({
    readSnapshot: async () => snapshot,
    readLive: async () => { throw new Error("should not be called"); },
  });
  assert.deepEqual(result, { data: snapshot, source: "sync_snapshot", stale: false });
});
