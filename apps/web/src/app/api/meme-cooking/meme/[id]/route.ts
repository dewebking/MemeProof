import { getMeme, MemeCookingApiError } from "@/lib/meme-cooking";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";

export const dynamic = "force-dynamic";
const SYNC_FRESHNESS_WINDOW_MS = 15 * 60 * 1_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 200) return Response.json({ error: "Invalid meme ID." }, { status: 400 });
  let staleSnapshot: { data: unknown; retrievedAt: string | null } | null = null;
  try {
    if (isSyncStoreConfigured()) {
      try {
        const stored = await syncStore.getToken(id);
        const state = await syncStore.getSyncState();
        if (stored) {
          const retrievedAt = state.lastSuccessAt;
          const age = retrievedAt ? Date.now() - Date.parse(retrievedAt) : Number.POSITIVE_INFINITY;
          const stale = state.failureCount > 0 || !Number.isFinite(age) || age > SYNC_FRESHNESS_WINDOW_MS;
          if (!stale) return Response.json({ data: stored, source: "sync_snapshot", stale: false, retrievedAt }, { headers: { "Cache-Control": "no-store" } });
          staleSnapshot = { data: stored, retrievedAt };
        }
      } catch {
        return Response.json({ error: "Token record is temporarily unavailable." }, { status: 503 });
      }
    }
    const token = await getMeme(id);
    return Response.json({ data: token, source: "meme.cooking", stale: false, retrievedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (staleSnapshot) return Response.json({ ...staleSnapshot, source: "sync_snapshot", stale: true }, { headers: { "Cache-Control": "no-store" } });
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message, failureCode: apiError.failureCode }, { status: apiError.status });
  }
}
