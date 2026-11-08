export type DiscoverTokenRecord = Record<string, unknown> & {
  meme_id: string | number;
};

export type DiscoverListing = {
  data: DiscoverTokenRecord[];
  source: string;
  stale: boolean;
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
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Token service returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error("Token service returned an unexpected response.");
  }

  return {
    data: body.data.filter(
      (value): value is DiscoverTokenRecord =>
        typeof value === "object" &&
        value !== null &&
        (typeof value.meme_id === "string" ||
          typeof value.meme_id === "number"),
    ),
    source:
      "source" in body && typeof body.source === "string"
        ? body.source
        : "meme.cooking",
    stale: "stale" in body && body.stale === true,
  };
}
