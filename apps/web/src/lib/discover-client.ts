export type DiscoverTokenRecord = Record<string, unknown> & {
  meme_id: string | number;
};

export type DiscoverSource = "meme.cooking" | "sync_snapshot" | "stale_cache";

export type DiscoverListing = {
  data: DiscoverTokenRecord[];
  source: DiscoverSource;
  stale: boolean;
  retrievedAt: string | null;
  upstream?: {
    pagesFetched: number;
    recordsReceived: number;
    uniqueRecords: number;
  };
};

export async function fetchDiscoverListing(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DiscoverListing> {
  const response = await fetcher("/api/meme-cooking/meme", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Token service returned HTTP ${response.status} without a readable error response.`);
    }
    throw new Error("Token service returned invalid JSON.");
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Token service returned HTTP ${response.status}.`;
    const failureCode = typeof body === "object" && body !== null && "failureCode" in body && typeof body.failureCode === "string" && /^[A-Z0-9_]+$/.test(body.failureCode)
      ? body.failureCode
      : null;
    throw new Error(failureCode ? `${message} (${failureCode})` : message);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error("Token service returned an unexpected response.");
  }

  const validSources: DiscoverSource[] = ["meme.cooking", "sync_snapshot", "stale_cache"];
  if (!("source" in body) || typeof body.source !== "string" || !validSources.includes(body.source as DiscoverSource)) {
    throw new Error("Token service did not identify the origin of its listings.");
  }
  if (!("stale" in body) || typeof body.stale !== "boolean") {
    throw new Error("Token service did not identify whether its listings are stale.");
  }
  const retrievedAt = "retrievedAt" in body && typeof body.retrievedAt === "string" && Number.isFinite(Date.parse(body.retrievedAt))
    ? body.retrievedAt
    : null;
  const upstream = "upstream" in body && typeof body.upstream === "object" && body.upstream !== null
    ? body.upstream as Record<string, unknown>
    : null;
  if (upstream && [upstream.pagesFetched, upstream.recordsReceived, upstream.uniqueRecords].some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
    throw new Error("Token service returned invalid upstream pagination metadata.");
  }
  if (body.source === "meme.cooking" && body.stale === false && (!retrievedAt || !upstream)) {
    throw new Error("Token service omitted live retrieval or pagination metadata.");
  }
  if (upstream && upstream.uniqueRecords !== body.data.length) {
    throw new Error("Token service record count does not match its upstream metadata.");
  }

  return {
    data: body.data.flatMap((value): DiscoverTokenRecord[] => {
      if (typeof value !== "object" || value === null) return [];
      const token = value as Record<string, unknown>;
      const memeId = token.meme_id ?? token.id;
      if (typeof memeId !== "string" && typeof memeId !== "number") return [];
      return [{ ...token, meme_id: memeId }];
    }),
    source: body.source as DiscoverSource,
    stale: body.stale,
    retrievedAt,
    upstream: upstream ? {
      pagesFetched: upstream.pagesFetched as number,
      recordsReceived: upstream.recordsReceived as number,
      uniqueRecords: upstream.uniqueRecords as number,
    } : undefined,
  };
}
