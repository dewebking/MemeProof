import "server-only";
import { randomUUID } from "node:crypto";
import { getMemeFeed } from "@/lib/meme-cooking";
import { getMarketDataForToken } from "@/lib/market-data/service";
import { runRefreshJob, type MarketAttempt } from "./core";
import { syncStore } from "./supabase-store";

function minutes(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export async function refreshMemeProof(trigger: "scheduled" | "manual") {
  const owner = randomUUID();
  return runRefreshJob({
    ...syncStore,
    fetchSourceTokens: getMemeFeed,
    refreshMarket: async (token): Promise<MarketAttempt> => {
      const result = await getMarketDataForToken(String(token.meme_id), token.source_record);
      return {
        marketData: result.marketData as unknown as Record<string, unknown> | null,
        providers: result.providers,
        state: result.status === "available" ? "available" : result.reason === "missing_token_id" || result.reason === "invalid_token_id" ? "contract_unavailable" : result.reason === "providers_unavailable" ? "provider_unavailable" : "no_matching_pair",
        fetchedAt: result.fetchedAt,
      };
    },
    now: () => new Date(),
  }, {
    trigger,
    owner,
    syncIntervalMinutes: minutes("MEME_SYNC_INTERVAL_MINUTES", 15, 1, 1440),
    marketRefreshIntervalMinutes: minutes("MARKET_REFRESH_INTERVAL_MINUTES", 60, 5, 10080),
    marketBatchSize: minutes("MARKET_REFRESH_BATCH_SIZE", 5, 1, 25),
    leaseSeconds: 1200,
  });
}
