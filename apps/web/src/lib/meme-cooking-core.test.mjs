import assert from "node:assert/strict";
import test from "node:test";
import { getMemeFeed, MemeCookingApiError } from "./meme-cooking-core.ts";

test("fetches every next-link page, normalizes both provider IDs, and reports page counts", async () => {
  const requests = [];
  const feed = await getMemeFeed(async (input, init) => {
    requests.push({ url: String(input), init });
    if (requests.length === 1) {
      return Response.json({
        data: [{ id: 1, name: "First" }, { meme_id: 2, name: "Second" }],
        pagination: { next: "/meme?page=2" },
      });
    }
    return Response.json({ data: [{ meme_id: 1, name: "First, updated" }, { id: 3, name: "Third" }], pagination: { next: null } });
  });

  assert.deepEqual(requests.map(({ url }) => url), [
    "https://api.meme.cooking/meme",
    "https://api.meme.cooking/meme?page=2",
  ]);
  assert.ok(requests.every(({ init }) => init.cache === "no-store" && init.headers.accept === "application/json"));
  assert.deepEqual(feed, {
    records: [
      { meme_id: 1, name: "First, updated" },
      { meme_id: 2, name: "Second" },
      { id: 3, meme_id: 3, name: "Third" },
    ],
    pagesFetched: 2,
    recordsReceived: 4,
    uniqueRecords: 3,
  });
});

test("rejects a pagination link outside the provider's listing endpoint", async () => {
  await assert.rejects(
    getMemeFeed(async () => Response.json({ data: [{ id: 1 }], next: "https://example.com/meme?page=2" })),
    (error) => error instanceof MemeCookingApiError && error.failureCode === "UNSAFE_PAGINATION_URL",
  );
});

test("follows the standard HTTP Link rel=next header when a page has no JSON next field", async () => {
  const urls = [];
  const feed = await getMemeFeed(async (input) => {
    urls.push(String(input));
    return urls.length === 1
      ? new Response(JSON.stringify([{ id: 1 }]), { headers: { "content-type": "application/json", link: '<https://api.meme.cooking/meme?page=2>; rel="next"' } })
      : Response.json([{ meme_id: 2 }]);
  });
  assert.equal(feed.pagesFetched, 2);
  assert.equal(feed.uniqueRecords, 2);
  assert.deepEqual(urls, ["https://api.meme.cooking/meme", "https://api.meme.cooking/meme?page=2"]);
});

test("classifies a connection denial and keeps the public error free of raw transport details", async () => {
  const denied = Object.assign(new Error("socket denied"), { code: "EACCES" });
  await assert.rejects(
    getMemeFeed(async () => { throw new TypeError("fetch failed", { cause: denied }); }),
    (error) => error instanceof MemeCookingApiError && error.status === 502 && error.failureCode === "EACCES" && error.message === "Meme.Cooking could not be reached.",
  );
});

test("rejects malformed page responses instead of treating them as an empty feed", async () => {
  await assert.rejects(
    getMemeFeed(async () => Response.json({ data: [{ name: "Missing provider ID" }] })),
    (error) => error instanceof MemeCookingApiError && error.failureCode === "INVALID_RESPONSE",
  );
});

test("returns an honest upstream HTTP status rather than relabeling it as a network failure", async () => {
  await assert.rejects(
    getMemeFeed(async () => new Response("unavailable", { status: 404 })),
    (error) => error instanceof MemeCookingApiError && error.status === 404 && error.upstreamStatus === 404 && error.failureCode === "HTTP_404",
  );
});
