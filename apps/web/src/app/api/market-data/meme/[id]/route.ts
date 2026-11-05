import { MemeCookingApiError } from "@/lib/meme-cooking";
import { getMemeMarketData } from "@/lib/market-data/service";
import { isSyncStoreConfigured, syncStore } from "@/lib/sync/supabase-store";
import { isMarketSnapshotStale } from "@/lib/sync/core";
import { getMeme } from "@/lib/meme-cooking";
import { inspectMemeTokenAddress } from "@/lib/market-data/normalize";

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
    if (isSyncStoreConfigured()) {
      const [token, snapshot] = await Promise.all([syncStore.getToken(id), syncStore.getMarketSnapshot(id)]);
      if (token) {
        const identity = inspectMemeTokenAddress(token.token_id);
        const address = identity.status === "valid" ? identity.address : null;
        const snapshotMatchesContract = address !== null && snapshot?.token_contract_address === address;
        const fetchedAt = snapshotMatchesContract && typeof snapshot?.fetched_at === "string" ? snapshot.fetched_at : new Date().toISOString();
        const lastSuccess = snapshotMatchesContract && typeof snapshot?.last_successful_refresh_at === "string" ? snapshot.last_successful_refresh_at : null;
        const status = snapshotMatchesContract ? snapshot?.last_attempt_status : null;
        const marketData = snapshotMatchesContract && snapshot?.market_data && typeof snapshot.market_data === "object" ? snapshot.market_data : null;
        const reason = identity.status === "missing" ? "missing_token_id" : identity.status === "invalid" ? "invalid_token_id" : status === "provider_unavailable" ? "providers_unavailable" : "no_matching_pool";
        return Response.json({
          status: marketData ? "available" : "market_data_unavailable",
          reason: marketData ? null : reason,
          memeId: id,
          networkId: "near",
          tokenContractAddress: address,
          marketData,
          providers: snapshotMatchesContract ? snapshot?.providers ?? { geckoterminal: "skipped", dexscreener: "skipped" } : { geckoterminal: "skipped", dexscreener: "skipped" },
          fetchedAt,
          marketState: marketData ? "available" : identity.status !== "valid" ? "contract_unavailable" : status === "provider_unavailable" ? "provider_unavailable" : status === "no_matching_pair" ? "no_matching_pair" : "pending",
          isStale: marketData ? isMarketSnapshotStale(lastSuccess, status === "available" ? "matched" : typeof status === "string" ? status : null, new Date(), Number(process.env.MARKET_REFRESH_INTERVAL_MINUTES) || 60) : false,
          lastSuccessfulRefreshAt: lastSuccess,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      const liveToken = await getMeme(id);
      const identity = inspectMemeTokenAddress(liveToken.token_id);
      return Response.json({
        status: "market_data_unavailable",
        reason: identity.status === "missing" ? "missing_token_id" : identity.status === "invalid" ? "invalid_token_id" : "no_matching_pool",
        memeId: id,
        networkId: "near",
        tokenContractAddress: identity.status === "valid" || identity.status === "invalid" ? identity.address : null,
        marketData: null,
        providers: { geckoterminal: "skipped", dexscreener: "skipped" },
        fetchedAt: new Date().toISOString(),
        marketState: identity.status === "valid" ? "pending" : "contract_unavailable",
        isStale: false,
        lastSuccessfulRefreshAt: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }
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
