import "server-only";
import { normalizeDexPairs } from "../normalize";
import type { ProviderLookup } from "../types";

const BASE_URL = "https://api.dexscreener.com";
const CACHE_SECONDS = 120;
const TIMEOUT_MS = 8_000;

class NotFoundError extends Error {}

async function getJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "provider_timeout"
        : "provider_network_error",
    );
  }
  if (response.status === 404) throw new NotFoundError("provider_not_found");
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("provider_invalid_json");
  }
}

export async function getDexScreenerMarketData(
  address: string,
  fetchedAt: string,
): Promise<ProviderLookup> {
  let tokenPairs: unknown;
  try {
    tokenPairs = await getJson(
      `${BASE_URL}/token-pairs/v1/near/${encodeURIComponent(address)}`,
    );
  } catch (error) {
    if (error instanceof NotFoundError) return { status: "no_match" };
    throw error;
  }
  const selected = normalizeDexPairs(tokenPairs, address, fetchedAt);
  if (selected.status !== "matched") return selected;

  // The provider issued this pair address after the token-address lookup. Re-read that exact
  // pair for current detail and accept it only if the response still identifies the same pair.
  try {
    const detail = await getJson(
      `${BASE_URL}/latest/dex/pairs/near/${encodeURIComponent(selected.marketData.pairAddress)}`,
    );
    if (
      typeof detail !== "object" ||
      detail === null ||
      !("pairs" in detail) ||
      !Array.isArray(detail.pairs)
    )
      return selected;
    const confirmed = normalizeDexPairs(detail.pairs, address, fetchedAt);
    if (
      confirmed.status !== "matched" ||
      confirmed.marketData.pairAddress !== selected.marketData.pairAddress
    )
      return selected;
    const primary = selected.marketData;
    const current = confirmed.marketData;
    return {
      status: "matched",
      marketData: {
        ...primary,
        ...current,
        baseToken: { ...primary.baseToken, ...current.baseToken },
        quoteToken: { ...primary.quoteToken, ...current.quoteToken },
        priceUsd: current.priceUsd ?? primary.priceUsd,
        priceNative: current.priceNative ?? primary.priceNative,
        liquidityUsd: current.liquidityUsd ?? primary.liquidityUsd,
        fdv: current.fdv ?? primary.fdv,
        marketCap: current.marketCap ?? primary.marketCap,
        volume24hUsd: current.volume24hUsd ?? primary.volume24hUsd,
        priceChange24h: current.priceChange24h ?? primary.priceChange24h,
        buys24h: current.buys24h ?? primary.buys24h,
        sells24h: current.sells24h ?? primary.sells24h,
        pairCreatedAt: current.pairCreatedAt ?? primary.pairCreatedAt,
        providerUrl: current.providerUrl ?? primary.providerUrl,
      },
    };
  } catch {
    // The address lookup already returned a verified pair. Preserve that real response if its
    // optional detail refresh is throttled or temporarily unavailable.
    return selected;
  }
}
