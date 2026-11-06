import { isRecord } from "../normalize.ts";

export type NetworkSupport =
  | { status: "supported"; networkId: string }
  | { status: "unsupported" | "unavailable"; networkId: null };

export function safeGeckoNetworksNextUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const base = new URL(baseUrl);
    const expectedPath = new URL(`${baseUrl}/networks`).pathname;
    const url = new URL(value, base);
    return url.origin === base.origin && url.pathname === expectedPath
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function discoverNearNetwork(
  getJson: (url: string) => Promise<unknown>,
  baseUrl: string,
  maxPages: number,
): Promise<NetworkSupport> {
  let nextUrl: string | null = `${baseUrl}/networks?page=1`;
  let confirmedNetworkId: string | null = null;
  const visited = new Set<string>();

  try {
    for (let page = 0; nextUrl && page < maxPages; page += 1) {
      if (visited.has(nextUrl))
        return { status: "unavailable", networkId: null };
      visited.add(nextUrl);
      const payload: unknown = await getJson(nextUrl);
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

      const next = safeGeckoNetworksNextUrl(
        isRecord(payload.links) ? payload.links.next : null,
        baseUrl,
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
