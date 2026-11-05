import "server-only";
import { isRecord, normalizeGeckoPools } from "../normalize";
import type { ProviderLookup } from "../types";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const NETWORK_CACHE_SECONDS = 21_600;
const DATA_CACHE_SECONDS = 120;
const TIMEOUT_MS = 8_000;
const MAX_NETWORK_PAGES = 10;

type NetworkSupport =
  | { status: "supported"; networkId: string }
  | { status: "unsupported" | "unavailable"; networkId: null };

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

function safeNextUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, BASE_URL);
    return url.origin === BASE_URL && url.pathname === "/api/v2/networks"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function discoverGeckoNearNetwork(): Promise<NetworkSupport> {
  let nextUrl: string | null = `${BASE_URL}/networks?page=1`;
  let confirmedNetworkId: string | null = null;
  const visited = new Set<string>();

  try {
    for (let page = 0; nextUrl && page < MAX_NETWORK_PAGES; page += 1) {
      if (visited.has(nextUrl))
        return { status: "unavailable", networkId: null };
      visited.add(nextUrl);
      const payload: unknown = await getJson(nextUrl, NETWORK_CACHE_SECONDS);
      if (!isRecord(payload) || !Array.isArray(payload.data))
        return { status: "unavailable", networkId: null };

      for (const item of payload.data) {
        if (
          !isRecord(item) ||
          typeof item.id !== "string" ||
          !isRecord(item.attributes)
        )
          continue;
        const name = item.attributes.name;
        if (
          typeof name === "string" &&
          name.trim().toLowerCase() === "near" &&
          item.id.toLowerCase() !== "aurora"
        ) {
          confirmedNetworkId = item.id;
        }
      }

      const next = safeNextUrl(
        isRecord(payload.links) ? payload.links.next : null,
      );
      if (
        isRecord(payload.links) &&
        typeof payload.links.next === "string" &&
        !next
      ) {
        return { status: "unavailable", networkId: null };
      }
      nextUrl = next;
    }
  } catch {
    return confirmedNetworkId
      ? { status: "supported", networkId: confirmedNetworkId }
      : { status: "unavailable", networkId: null };
  }

  if (nextUrl)
    return confirmedNetworkId
      ? { status: "supported", networkId: confirmedNetworkId }
      : { status: "unavailable", networkId: null };
  return confirmedNetworkId
    ? { status: "supported", networkId: confirmedNetworkId }
    : { status: "unsupported", networkId: null };
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
