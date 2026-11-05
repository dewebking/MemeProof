import { MemeCookingApiError } from "@/lib/meme-cooking";
import { getMemeMarketData } from "@/lib/market-data/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id) || Number(id) > 4_294_967_295) {
    return Response.json(
      { error: "Invalid Meme.Cooking meme ID." },
      { status: 400 },
    );
  }

  try {
    const result = await getMemeMarketData(id);
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof MemeCookingApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Market data is temporarily unavailable." },
      { status: 502 },
    );
  }
}
