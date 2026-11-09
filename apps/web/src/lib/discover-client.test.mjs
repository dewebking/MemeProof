import assert from "node:assert/strict";
import test from "node:test";
import { fetchDiscoverListing } from "./discover-client.ts";

test("requests fresh browser data and preserves the API's token order", async () => {
  const tokens = [
    { meme_id: 2318, name: "MASH" },
    { meme_id: 2317, name: "AJE" },
    { meme_id: 2316, name: "MARKPVID" },
  ];
  let request;
  const listing = await fetchDiscoverListing(async (input, init) => {
    request = { input, init };
    return Response.json({ data: tokens, source: "meme.cooking", stale: false, retrievedAt: "2026-11-09T12:00:00.000Z", upstream: { pagesFetched: 1, recordsReceived: 3, uniqueRecords: 3 } });
  });

  assert.equal(request.input, "/api/meme-cooking/meme");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.headers["Cache-Control"], "no-cache");
  assert.deepEqual(listing.data, tokens);
  assert.equal(listing.source, "meme.cooking");
  assert.equal(listing.stale, false);
  assert.equal(listing.retrievedAt, "2026-11-09T12:00:00.000Z");
  assert.deepEqual(listing.upstream, { pagesFetched: 1, recordsReceived: 3, uniqueRecords: 3 });
});

test("a subsequent refresh consumes and returns the newer response", async () => {
  const responses = [
    Response.json({ data: [{ meme_id: 10, name: "Older" }], source: "meme.cooking", stale: false, retrievedAt: "2026-11-09T12:00:00.000Z", upstream: { pagesFetched: 1, recordsReceived: 1, uniqueRecords: 1 } }),
    Response.json({ data: [{ meme_id: 11, name: "Newer" }], source: "meme.cooking", stale: false, retrievedAt: "2026-11-09T12:01:00.000Z", upstream: { pagesFetched: 1, recordsReceived: 1, uniqueRecords: 1 } }),
  ];
  const fetcher = async () => responses.shift();

  await fetchDiscoverListing(fetcher);
  const refreshed = await fetchDiscoverListing(fetcher);
  assert.deepEqual(refreshed.data.map((token) => token.name), ["Newer"]);
});

test("normalizes provider records that use id instead of meme_id", async () => {
  const listing = await fetchDiscoverListing(async () =>
    Response.json({ data: [{ id: "meme-12", name: "Sample listing" }], source: "meme.cooking", stale: false, retrievedAt: "2026-11-09T12:00:00.000Z", upstream: { pagesFetched: 1, recordsReceived: 1, uniqueRecords: 1 } }),
  );

  assert.deepEqual(listing.data, [{ id: "meme-12", name: "Sample listing", meme_id: "meme-12" }]);
});

test("does not label a listing live when the API omits its source", async () => {
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({ data: [{ id: 12 }], stale: false })),
    /did not identify the origin/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({ data: [{ id: 12 }], source: "meme.cooking" })),
    /did not identify whether its listings are stale/,
  );
});

test("parses checked upstream pagination metadata and rejects malformed counters", async () => {
  const listing = await fetchDiscoverListing(async () => Response.json({
    data: [{ id: 12 }], source: "meme.cooking", stale: false, retrievedAt: "2026-11-09T12:00:00.000Z",
    upstream: { pagesFetched: 2, recordsReceived: 51, uniqueRecords: 1 },
  }));
  assert.deepEqual(listing.upstream, { pagesFetched: 2, recordsReceived: 51, uniqueRecords: 1 });
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({
      data: [], source: "meme.cooking", stale: false,
      retrievedAt: "2026-11-09T12:00:00.000Z",
      upstream: { pagesFetched: -1, recordsReceived: 0, uniqueRecords: 0 },
    })),
    /invalid upstream pagination metadata/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({
      data: [{ meme_id: 1 }], source: "meme.cooking", stale: false,
      retrievedAt: "2026-11-09T12:00:00.000Z", upstream: { pagesFetched: 1, recordsReceived: 1, uniqueRecords: 0 },
    })),
    /record count does not match/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({ data: [{ meme_id: 1 }], source: "meme.cooking", stale: false })),
    /omitted live retrieval or pagination metadata/,
  );
});

test("reports API errors and rejects malformed listing responses", async () => {
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({ error: "Provider unavailable" }, { status: 503 })),
    /Provider unavailable/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => Response.json({ tokens: [] })),
    /unexpected response/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => new Response("upstream gateway error", { status: 503 })),
    /HTTP 503 without a readable error response/,
  );
  await assert.rejects(
    fetchDiscoverListing(async () => new Response("not json", { status: 200 })),
    /invalid JSON/,
  );
});
