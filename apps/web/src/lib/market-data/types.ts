export type MarketProvider = "geckoterminal" | "dexscreener";

export type ProviderState =
  "matched" | "no_match" | "unsupported" | "unavailable" | "skipped";

export type MarketToken = {
  address: string | null;
  name: string | null;
  symbol: string | null;
};

export type MarketData = {
  provider: MarketProvider;
  networkId: string;
  tokenContractAddress: string;
  pairAddress: string;
  dexName: string | null;
  baseToken: MarketToken;
  quoteToken: MarketToken;
  priceUsd: number | null;
  priceNative: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairCreatedAt: string | null;
  providerUrl: string | null;
  fetchedAt: string;
};

export type MarketDataResult = {
  status: "available" | "market_data_unavailable";
  reason:
    | "missing_token_id"
    | "invalid_token_id"
    | "no_matching_pool"
    | "providers_unavailable"
    | null;
  memeId: string;
  networkId: "near";
  tokenContractAddress: string | null;
  marketData: MarketData | null;
  providers: {
    geckoterminal: ProviderState;
    dexscreener: ProviderState;
  };
  fetchedAt: string;
  marketState?: "contract_unavailable" | "no_matching_pair" | "provider_unavailable" | "available" | "pending";
  isStale?: boolean;
  lastSuccessfulRefreshAt?: string | null;
};

export type ProviderLookup =
  | { status: "matched"; marketData: MarketData }
  | { status: "no_match" | "unsupported" | "unavailable" };
