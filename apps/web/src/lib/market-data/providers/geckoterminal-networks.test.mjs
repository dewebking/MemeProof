import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverNearNetwork,
  safeGeckoNetworksNextUrl,
} from "./geckoterminal-networks.ts";

const baseUrl = "https://api.geckoterminal.com/api/v2";
const pageOneUrl = `${baseUrl}/networks?page=1`;
const pageTwoUrl = `${baseUrl}/networks?page=2`;

test("accepts a valid paginated GeckoTerminal networks response URL", () => {
  assert.equal(
    safeGeckoNetworksNextUrl(pageTwoUrl, baseUrl),
    pageTwoUrl,
  );
});

test("discovers the NEAR network ID on a later page", async () => {
  const responses = new Map([
    [pageOneUrl, {
      data: [{ id: "aurora", attributes: { name: "Aurora" } }],
      links: { next: pageTwoUrl },
    }],
    [pageTwoUrl, {
      data: [{ id: "near", attributes: { name: "NEAR" } }],
      links: { next: null },
    }],
  ]);
  const requestedUrls = [];

  const result = await discoverNearNetwork(async (url) => {
    requestedUrls.push(url);
    return responses.get(url);
  }, baseUrl, 10);

  assert.deepEqual(requestedUrls, [pageOneUrl, pageTwoUrl]);
  assert.deepEqual(result, { status: "supported", networkId: "near" });
});

test("rejects a GeckoTerminal pagination URL with an external hostname", () => {
  assert.equal(
    safeGeckoNetworksNextUrl("https://attacker.example/api/v2/networks?page=2", baseUrl),
    null,
  );
});

test("rejects an unexpected API path on the GeckoTerminal hostname", () => {
  assert.equal(
    safeGeckoNetworksNextUrl("https://api.geckoterminal.com/api/v2/tokens?page=2", baseUrl),
    null,
  );
});
