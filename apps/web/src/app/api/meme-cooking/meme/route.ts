import { getMemes, MemeCookingApiError } from "@/lib/meme-cooking";

export const revalidate = 60;

export async function GET() {
  try {
    const tokens = await getMemes();
    return Response.json({ data: tokens }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    const apiError = error instanceof MemeCookingApiError ? error : new MemeCookingApiError("Unexpected upstream error.", 502);
    return Response.json({ error: apiError.message }, { status: apiError.status });
  }
}
