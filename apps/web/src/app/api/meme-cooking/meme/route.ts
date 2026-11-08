import { getMemes, MemeCookingApiError } from "@/lib/meme-cooking";
import { resolveDiscoverTokens } from "@/lib/discover-data";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";

export const revalidate = 60;

export async function GET() {
  try {
    const result = await resolveDiscoverTokens({
      readSnapshot: () => isSyncStoreConfigured() ? syncStore.listTokens() : Promise.resolve([]),
      readLive: getMemes,
    });
    return Response.json(result, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message, provider: "Meme.Cooking", upstreamStatus: apiError.upstreamStatus }, { status: apiError.status });
  }
}
