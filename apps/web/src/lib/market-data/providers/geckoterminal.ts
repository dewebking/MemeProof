import "server-only";
import { normalizeGeckoPools } from "../normalize";
import type { ProviderLookup } from "../types";
import { discoverNearNetwork } from "./geckoterminal-networks";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const NETWORK_CACHE_SECONDS = 21_600;
const DATA_CACHE_SECONDS = 120;
const TIMEOUT_MS = 8_000;
const MAX_NETWORK_PAGES = 10;

async function getJson(url: string, revalidate: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json;version=20230203" },
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "provider_timeout"
        : "provider_network_error",
    );
  }
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("provider_invalid_json");
  }
}

export async function discoverGeckoNearNetwork() {
  return discoverNearNetwork(
    (url) => getJson(url, NETWORK_CACHE_SECONDS),
    BASE_URL,
    MAX_NETWORK_PAGES,
  );
}

export async function getGeckoMarketData(
  address: string,
  networkId: string,
  fetchedAt: string,
): Promise<ProviderLookup> {
  const url = `${BASE_URL}/networks/${encodeURIComponent(networkId)}/tokens/${encodeURIComponent(address)}/pools?include=base_token%2Cquote_token%2Cdex`;
  const payload = await getJson(url, DATA_CACHE_SECONDS);
  return normalizeGeckoPools(payload, address, networkId, fetchedAt);
}
