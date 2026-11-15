import assert from "node:assert/strict";
import test from "node:test";
import { fetchDiscoverListing } from "../lib/discover-client.ts";
import { findDiscoverTokenByContract } from "../lib/near/registry-passport.ts";
import { tokenImageCandidates } from "./token-image-source.ts";

test("passes the discovered Meme.Cooking image URL through to TokenImage", () => {
  const imageUrl = "https://images.example.test/meme-token.png";
  assert.deepEqual(tokenImageCandidates({ meme_id: 2250, image_url: imageUrl }), [imageUrl]);
});

test("discovery normalization and exact contract matching preserve the token image for the passport", async () => {
  const imageUrl = "https://images.example.test/nene-token.png";
  const listing = await fetchDiscoverListing(async () => Response.json({
    data: [{ meme_id: 2250, token_id: "nene-2250.meme-cooking.near", name: "NENE TOKEN", symbol: "NENE", image_url: imageUrl }],
    source: "meme.cooking",
    stale: false,
    retrievedAt: "2026-11-14T12:00:00.000Z",
    upstream: { pagesFetched: 1, recordsReceived: 1, uniqueRecords: 1 },
  }));
  const matched = findDiscoverTokenByContract(listing.data, "nene-2250.meme-cooking.near");
  assert.ok(matched);
  assert.deepEqual(tokenImageCandidates(matched), [imageUrl]);
});

test("recognizes common image aliases and nested listing metadata", () => {
  const imageUrl = "https://images.example.test/token.png";
  for (const listing of [
    { logo_url: imageUrl },
    { icon_url: imageUrl },
    { imageUrl },
    { metadata: { image: imageUrl } },
    { token: { logo: imageUrl } },
  ]) {
    assert.deepEqual(tokenImageCandidates(listing), [imageUrl]);
  }
});

test("keeps IPFS gateway fallback and safely returns no image for missing or invalid values", () => {
  const cid = "Qm123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const gateways = tokenImageCandidates({ image: cid });
  assert.equal(gateways.length, 4);
  assert.ok(gateways.every((url) => url.endsWith(`/ipfs/${cid}`)));
  assert.equal(tokenImageCandidates({ image_uri: `ipfs://${cid}/token.png` }).length, 4);
  assert.deepEqual(tokenImageCandidates(null), []);
  assert.deepEqual(tokenImageCandidates({ image_url: "javascript:alert(1)" }), []);
});
