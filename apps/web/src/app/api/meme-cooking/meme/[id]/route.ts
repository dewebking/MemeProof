import { getMeme, MemeCookingApiError } from "@/lib/meme-cooking";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 200) return Response.json({ error: "Invalid meme ID." }, { status: 400 });
  try {
    const token = await getMeme(id);
    return Response.json({ data: token }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message }, { status: apiError.status });
  }
}
