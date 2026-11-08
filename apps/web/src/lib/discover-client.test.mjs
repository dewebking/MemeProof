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
    return Response.json({ data: tokens, source: "meme.cooking", stale: false });
  });

  assert.equal(request.input, "/api/meme-cooking/meme");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.headers["Cache-Control"], "no-cache");
  assert.deepEqual(listing.data, tokens);
  assert.equal(listing.source, "meme.cooking");
  assert.equal(listing.stale, false);
});

test("a subsequent refresh consumes and returns the newer response", async () => {
  const responses = [
    Response.json({ data: [{ meme_id: 10, name: "Older" }], source: "meme.cooking", stale: false }),
    Response.json({ data: [{ meme_id: 11, name: "Newer" }], source: "meme.cooking", stale: false }),
  ];
  const fetcher = async () => responses.shift();

  await fetchDiscoverListing(fetcher);
  const refreshed = await fetchDiscoverListing(fetcher);
  assert.deepEqual(refreshed.data.map((token) => token.name), ["Newer"]);
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
});
