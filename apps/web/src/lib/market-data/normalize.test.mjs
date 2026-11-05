import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectMemeTokenAddress,
  isValidNearAccountId,
  normalizeDexPairs,
  normalizeGeckoPools,
  selectMarketProvider,
} from "./normalize.ts";

const address = "nene-2250.meme-cooking.near";
const otherAddress = "wrap.near";
const fetchedAt = "2026-11-05T12:00:00.000Z";

function dexPair(overrides = {}) {
  return {
    chainId: "near",
    dexId: "ref-finance",
    url: "https://dexscreener.com/near/example-pair",
    pairAddress: "pool-contract.near:8943",
    baseToken: { address, name: "Nene", symbol: "NENE" },
    quoteToken: {
      address: otherAddress,
      name: "Wrapped NEAR",
      symbol: "wNEAR",
    },
    priceNative: "0.002",
    priceUsd: "0.01",
    liquidity: { usd: 1200 },
    fdv: 100000,
    marketCap: 90000,
    volume: { h24: 500 },
    priceChange: { h24: 4.5 },
    txns: { h24: { buys: 20, sells: 10 } },
    pairCreatedAt: 1762344000000,
    ...overrides,
  };
}

test("accepts NEAR pair with requested token as base", () => {
  const result = normalizeDexPairs([dexPair()], address, fetchedAt);
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.marketData.tokenContractAddress, address);
    assert.equal(result.marketData.priceUsd, 0.01);
    assert.equal(result.marketData.pairAddress, "pool-contract.near:8943");
  }
});

test("accepts token as quote but leaves base-only price fields null", () => {
  const result = normalizeDexPairs(
    [
      dexPair({
        baseToken: { address: otherAddress },
        quoteToken: { address },
      }),
    ],
    address,
    fetchedAt,
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.marketData.priceUsd, null);
    assert.equal(result.marketData.priceNative, null);
    assert.equal(result.marketData.fdv, null);
    assert.equal(result.marketData.buys24h, null);
  }
});

test("rejects wrong chain and wrong token addresses", () => {
  assert.equal(
    normalizeDexPairs([dexPair({ chainId: "aurora" })], address, fetchedAt)
      .status,
    "no_match",
  );
  assert.equal(
    normalizeDexPairs(
      [dexPair({ baseToken: { address: "unrelated.near" } })],
      address,
      fetchedAt,
    ).status,
    "no_match",
  );
});

test("chooses the matching pair with highest available liquidity", () => {
  const result = normalizeDexPairs(
    [
      dexPair({ pairAddress: "low.near", liquidity: { usd: 20 } }),
      dexPair({ pairAddress: "high.near", liquidity: { usd: 250 } }),
    ],
    address,
    fetchedAt,
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched")
    assert.equal(result.marketData.pairAddress, "high.near");
});

test("missing market fields stay null and absent token contract IDs fail validation", () => {
  const result = normalizeDexPairs(
    [
      dexPair({
        priceUsd: null,
        liquidity: null,
        fdv: null,
        marketCap: null,
        volume: {},
        priceChange: null,
        txns: null,
      }),
    ],
    address,
    fetchedAt,
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.marketData.priceUsd, null);
    assert.equal(result.marketData.liquidityUsd, null);
    assert.equal(result.marketData.fdv, null);
    assert.equal(result.marketData.marketCap, null);
    assert.equal(result.marketData.volume24hUsd, null);
    assert.equal(result.marketData.buys24h, null);
  }
  assert.equal(isValidNearAccountId(null), false);
  assert.equal(isValidNearAccountId(""), false);
  assert.equal(isValidNearAccountId(address), true);
  assert.deepEqual(inspectMemeTokenAddress(null), {
    status: "missing",
    address: null,
  });
  assert.deepEqual(inspectMemeTokenAddress(" "), {
    status: "missing",
    address: null,
  });
  assert.deepEqual(inspectMemeTokenAddress("NOT AN ACCOUNT"), {
    status: "invalid",
    address: "NOT AN ACCOUNT",
  });
});

test("returns no match for empty or invalid provider response", () => {
  assert.equal(normalizeDexPairs([], address, fetchedAt).status, "no_match");
  assert.equal(
    normalizeDexPairs({ pairs: [] }, address, fetchedAt).status,
    "unavailable",
  );
});

test("normalizes Gecko pool response and verifies token relation addresses", () => {
  const networkId = "near";
  const pool = {
    id: "near_pool-contract",
    attributes: {
      address: "pool-contract.near",
      reserve_in_usd: "1500.4",
      base_token_price_usd: "0.011",
      quote_token_price_usd: "1",
      volume_usd: { h24: "500" },
      price_change_percentage: { h24: "2.2" },
      transactions: { h24: { buys: 4, sells: 3 } },
    },
    relationships: {
      base_token: { data: { id: `near_${address}` } },
      quote_token: { data: { id: `near_${otherAddress}` } },
    },
  };
  const response = normalizeGeckoPools(
    { data: [pool] },
    address,
    networkId,
    fetchedAt,
  );
  assert.equal(response.status, "matched");
  if (response.status === "matched")
    assert.equal(response.marketData.liquidityUsd, 1500.4);
  assert.equal(
    normalizeGeckoPools(
      {
        data: [
          {
            ...pool,
            relationships: { base_token: { data: { id: "near_wrong.near" } } },
          },
        ],
      },
      address,
      networkId,
      fetchedAt,
    ).status,
    "no_match",
  );
});

test("skips Gecko when native NEAR support is unconfirmed and uses DEX fallback", async () => {
  let geckoCalls = 0;
  let dexCalls = 0;
  const result = await selectMarketProvider({
    geckoSupported: false,
    geckoLookup: async () => {
      geckoCalls += 1;
      return { status: "no_match" };
    },
    dexLookup: async () => {
      dexCalls += 1;
      return normalizeDexPairs([dexPair()], address, fetchedAt);
    },
  });
  assert.equal(geckoCalls, 0);
  assert.equal(dexCalls, 1);
  assert.equal(result.marketData?.provider, "dexscreener");
  assert.equal(result.geckoterminal, "unsupported");
});

test("provider timeout and rate limit errors fall back to DEX Screener", async () => {
  for (const message of ["provider_timeout", "provider_http_429"]) {
    const result = await selectMarketProvider({
      geckoSupported: true,
      geckoLookup: async () => {
        throw new Error(message);
      },
      dexLookup: async () => normalizeDexPairs([dexPair()], address, fetchedAt),
    });
    assert.equal(result.marketData?.provider, "dexscreener");
    assert.equal(result.geckoterminal, "unavailable");
  }
});
