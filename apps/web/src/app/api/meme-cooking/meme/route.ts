import { getMemeFeed, MemeCookingApiError } from "@/lib/meme-cooking";
import { resolveDiscoverTokens } from "@/lib/discover-data";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";

export const dynamic = "force-dynamic";
const SYNC_FRESHNESS_WINDOW_MS = 15 * 60 * 1_000;

export async function GET() {
  let upstream: { pagesFetched: number; recordsReceived: number; uniqueRecords: number } | undefined;
  try {
    const result = await resolveDiscoverTokens({
      readSnapshot: () => isSyncStoreConfigured() ? syncStore.listTokens() : Promise.resolve([]),
      readSnapshotMetadata: async () => {
        if (!isSyncStoreConfigured()) return { retrievedAt: null, stale: true };
        const state = await syncStore.getSyncState();
        const retrievedAt = state.lastSuccessAt;
        const age = retrievedAt ? Date.now() - Date.parse(retrievedAt) : Number.POSITIVE_INFINITY;
        return {
          retrievedAt,
          stale: state.failureCount > 0 || !Number.isFinite(age) || age > SYNC_FRESHNESS_WINDOW_MS,
        };
      },
      readLive: async () => {
        const feed = await getMemeFeed();
        upstream = {
          pagesFetched: feed.pagesFetched,
          recordsReceived: feed.recordsReceived,
          uniqueRecords: feed.uniqueRecords,
        };
        return feed.records;
      },
    });
    return Response.json({
      ...result,
      ...(result.source === "meme.cooking" && upstream ? { upstream } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message, provider: "Meme.Cooking", upstreamStatus: apiError.upstreamStatus, failureCode: apiError.failureCode }, { status: apiError.status });
  }
}
