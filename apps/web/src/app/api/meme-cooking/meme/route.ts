import { getMemes, MemeCookingApiError } from "@/lib/meme-cooking";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";

export const revalidate = 60;

export async function GET() {
  try {
    if (isSyncStoreConfigured()) {
      try {
        const stored = await syncStore.listTokens();
        if (stored.length) return Response.json({ data: stored }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
      } catch {
        return Response.json({ error: "Token records are temporarily unavailable." }, { status: 503 });
      }
    }
    const tokens = await getMemes();
    return Response.json({ data: tokens }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message }, { status: apiError.status });
  }
}
