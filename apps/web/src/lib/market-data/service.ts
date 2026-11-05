import "server-only";
import { getMeme } from "@/lib/meme-cooking";
import {
  getMemeTokenContractAddress,
  inspectMemeTokenAddress,
  selectMarketProvider,
} from "./normalize";
import {
  discoverGeckoNearNetwork,
  getGeckoMarketData,
} from "./providers/geckoterminal";
import { getDexScreenerMarketData } from "./providers/dex-screener";
import type { MarketDataResult } from "./types";

function unavailable(
  memeId: string,
  address: string | null,
  reason: MarketDataResult["reason"],
  fetchedAt: string,
  providers: MarketDataResult["providers"] = {
    geckoterminal: "skipped",
    dexscreener: "skipped",
  },
): MarketDataResult {
  return {
    status: "market_data_unavailable",
    reason,
    memeId,
    networkId: "near",
    tokenContractAddress: address,
    marketData: null,
    providers,
    fetchedAt,
  };
}

export async function getMemeMarketData(
  memeId: string,
): Promise<MarketDataResult> {
  const token = await getMeme(memeId);
  return getMarketDataForToken(memeId, token);
}

export async function getMarketDataForToken(
  memeId: string,
  token: Record<string, unknown>,
): Promise<MarketDataResult> {
  const fetchedAt = new Date().toISOString();
  const rawAddress = getMemeTokenContractAddress(token);

  if (typeof rawAddress !== "string" || !rawAddress.trim()) {
    return unavailable(memeId, null, "missing_token_id", fetchedAt);
  }
  const identity = inspectMemeTokenAddress(rawAddress);
  if (identity.status !== "valid")
    return unavailable(
      memeId,
      identity.address,
      identity.status === "missing" ? "missing_token_id" : "invalid_token_id",
      fetchedAt,
    );
  const address = identity.address;

  const network = await discoverGeckoNearNetwork();
  const selected = await selectMarketProvider({
    geckoSupported: network.status === "supported",
    geckoLookup: () =>
      getGeckoMarketData(address, network.networkId!, fetchedAt),
    dexLookup: () => getDexScreenerMarketData(address, fetchedAt),
  });
  const providers: MarketDataResult["providers"] = {
    geckoterminal:
      network.status === "unavailable" &&
      selected.geckoterminal === "unsupported"
        ? "unavailable"
        : selected.geckoterminal,
    dexscreener: selected.dexscreener,
  };
  const completedAt = new Date().toISOString();

  if (selected.marketData) {
    return {
      status: "available",
      reason: null,
      memeId,
      networkId: "near",
      tokenContractAddress: address,
      marketData: { ...selected.marketData, fetchedAt: completedAt },
      providers,
      fetchedAt: completedAt,
      marketState: "available",
      isStale: false,
      lastSuccessfulRefreshAt: completedAt,
    };
  }
  const hadProviderError =
    providers.geckoterminal === "unavailable" ||
    providers.dexscreener === "unavailable";
  return unavailable(
    memeId,
    address,
    hadProviderError ? "providers_unavailable" : "no_matching_pool",
    completedAt,
    providers,
  );
}
