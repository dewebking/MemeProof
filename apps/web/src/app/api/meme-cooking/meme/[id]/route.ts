import { getMeme, MemeCookingApiError } from "@/lib/meme-cooking";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 200) return Response.json({ error: "Invalid meme ID." }, { status: 400 });
  try {
    if (isSyncStoreConfigured()) {
      try {
        const stored = await syncStore.getToken(id);
        if (stored) return Response.json({ data: stored }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
      } catch {
        return Response.json({ error: "Token record is temporarily unavailable." }, { status: 503 });
      }
    }
    const token = await getMeme(id);
    return Response.json({ data: token }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message }, { status: apiError.status });
  }
}
