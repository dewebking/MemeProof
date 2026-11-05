import type {
  MarketData,
  MarketToken,
  ProviderLookup,
  ProviderState,
} from "./types";

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function token(address: unknown, name: unknown, symbol: unknown): MarketToken {
  return {
    address: stringValue(address),
    name: stringValue(name),
    symbol: stringValue(symbol),
  };
}

function liquidityRank(item: MarketData): number {
  return item.liquidityUsd ?? Number.NEGATIVE_INFINITY;
}

function bestPair(items: MarketData[]): MarketData | null {
  return items.reduce<MarketData | null>(
    (best, current) =>
      best === null || liquidityRank(current) > liquidityRank(best)
        ? current
        : best,
    null,
  );
}

function dexPairUrl(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      (url.hostname === "dexscreener.com" ||
        url.hostname.endsWith(".dexscreener.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Validates the NEAR account ID syntax before it is used as a provider identifier. */
export function isValidNearAccountId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/.test(
      value,
    )
  );
}

export function inspectMemeTokenAddress(
  value: unknown,
):
  | { status: "valid"; address: string }
  | { status: "missing"; address: null }
  | { status: "invalid"; address: string } {
  if (typeof value !== "string" || !value.trim())
    return { status: "missing", address: null };
  const address = value.trim();
  return isValidNearAccountId(address)
    ? { status: "valid", address }
    : { status: "invalid", address };
}

export function normalizeDexPairs(
  payload: unknown,
  address: string,
  fetchedAt: string,
): ProviderLookup {
  if (!Array.isArray(payload)) return { status: "unavailable" };
  const matching: MarketData[] = [];

  for (const value of payload) {
    if (!isRecord(value) || value.chainId !== "near") continue;
    const base = isRecord(value.baseToken) ? value.baseToken : {};
    const quote = isRecord(value.quoteToken) ? value.quoteToken : {};
    const baseAddress = stringValue(base.address);
    const quoteAddress = stringValue(quote.address);
    const isBase = baseAddress === address;
    const isQuote = quoteAddress === address;
    const pairAddress = stringValue(value.pairAddress);
    if ((!isBase && !isQuote) || !pairAddress) continue;

    const txns = nested(value, "txns", "h24");
    const created = finiteNumber(value.pairCreatedAt);
    const marketData: MarketData = {
      provider: "dexscreener",
      networkId: "near",
      tokenContractAddress: address,
      pairAddress,
      dexName: stringValue(value.dexId),
      baseToken: token(base.address, base.name, base.symbol),
      quoteToken: token(quote.address, quote.name, quote.symbol),
      priceUsd: isBase ? finiteNumber(value.priceUsd) : null,
      priceNative: isBase ? finiteNumber(value.priceNative) : null,
      liquidityUsd: finiteNumber(nested(value, "liquidity", "usd")),
      fdv: isBase ? finiteNumber(value.fdv) : null,
      marketCap: isBase ? finiteNumber(value.marketCap) : null,
      volume24hUsd: finiteNumber(nested(value, "volume", "h24")),
      priceChange24h: isBase
        ? finiteNumber(nested(value, "priceChange", "h24"))
        : null,
      buys24h: isBase ? finiteNumber(nested(txns, "buys")) : null,
      sells24h: isBase ? finiteNumber(nested(txns, "sells")) : null,
      pairCreatedAt:
        created === null || !Number.isFinite(new Date(created).getTime())
          ? null
          : new Date(created).toISOString(),
      providerUrl: dexPairUrl(value.url),
      fetchedAt,
    };
    // Pair-level figures are valid for either side. DEX Screener's price and token-level values
    // describe its base token, so those stay null when the requested token is the quote.
    matching.push(marketData);
  }

  const selected = bestPair(matching);
  return selected
    ? { status: "matched", marketData: selected }
    : { status: "no_match" };
}

function relationshipId(pool: JsonRecord, key: string): string | null {
  return stringValue(nested(pool, "relationships", key, "data", "id"));
}

function tokenFromRelationship(
  pool: JsonRecord,
  key: string,
  includedById: Map<string, JsonRecord>,
  networkId: string,
): MarketToken {
  const id = relationshipId(pool, key);
  const included = id ? includedById.get(id) : undefined;
  const attributes =
    included && isRecord(included.attributes) ? included.attributes : {};
  const idAddress = id?.startsWith(`${networkId}_`)
    ? id.slice(networkId.length + 1)
    : null;
  return token(
    attributes.address ?? idAddress,
    attributes.name,
    attributes.symbol,
  );
}

export function normalizeGeckoPools(
  payload: unknown,
  address: string,
  networkId: string,
  fetchedAt: string,
): ProviderLookup {
  if (!isRecord(payload) || !Array.isArray(payload.data))
    return { status: "unavailable" };
  const includedById = new Map<string, JsonRecord>();
  if (Array.isArray(payload.included)) {
    for (const item of payload.included) {
      if (isRecord(item) && typeof item.id === "string")
        includedById.set(item.id, item);
    }
  }

  const matching: MarketData[] = [];
  for (const item of payload.data) {
    if (!isRecord(item) || !isRecord(item.attributes)) continue;
    const attributes = item.attributes;
    const base = tokenFromRelationship(
      item,
      "base_token",
      includedById,
      networkId,
    );
    const quote = tokenFromRelationship(
      item,
      "quote_token",
      includedById,
      networkId,
    );
    const isBase = base.address === address;
    const isQuote = quote.address === address;
    const pairAddress = stringValue(attributes.address);
    if ((!isBase && !isQuote) || !pairAddress) continue;

    const createdAt = stringValue(attributes.pool_created_at);
    const dexId = relationshipId(item, "dex");
    const dexRecord = dexId ? includedById.get(dexId) : undefined;
    const dexAttrs =
      dexRecord && isRecord(dexRecord.attributes) ? dexRecord.attributes : {};
    matching.push({
      provider: "geckoterminal",
      networkId,
      tokenContractAddress: address,
      pairAddress,
      dexName: stringValue(dexAttrs.name) ?? dexId,
      baseToken: base,
      quoteToken: quote,
      priceUsd: finiteNumber(
        attributes[isBase ? "base_token_price_usd" : "quote_token_price_usd"],
      ),
      priceNative: finiteNumber(
        attributes[
          isBase
            ? "base_token_price_native_currency"
            : "quote_token_price_native_currency"
        ],
      ),
      liquidityUsd: finiteNumber(attributes.reserve_in_usd),
      fdv: isBase ? finiteNumber(attributes.fdv_usd) : null,
      marketCap: isBase ? finiteNumber(attributes.market_cap_usd) : null,
      volume24hUsd: finiteNumber(nested(attributes, "volume_usd", "h24")),
      priceChange24h: finiteNumber(
        nested(attributes, "price_change_percentage", "h24"),
      ),
      buys24h: finiteNumber(nested(attributes, "transactions", "h24", "buys")),
      sells24h: finiteNumber(
        nested(attributes, "transactions", "h24", "sells"),
      ),
      pairCreatedAt:
        createdAt && Number.isFinite(Date.parse(createdAt))
          ? new Date(createdAt).toISOString()
          : null,
      providerUrl: `https://www.geckoterminal.com/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(pairAddress)}`,
      fetchedAt,
    });
  }

  const selected = bestPair(matching);
  return selected
    ? { status: "matched", marketData: selected }
    : { status: "no_match" };
}

export type ProviderLookupFn = () => Promise<ProviderLookup>;

export async function selectMarketProvider(options: {
  geckoSupported: boolean;
  geckoLookup: ProviderLookupFn;
  dexLookup: ProviderLookupFn;
}): Promise<{
  marketData: MarketData | null;
  geckoterminal: ProviderState;
  dexscreener: ProviderState;
}> {
  let geckoStatus: ProviderState = options.geckoSupported
    ? "unavailable"
    : "unsupported";
  let dexStatus: ProviderState = "skipped";

  if (options.geckoSupported) {
    try {
      const gecko = await options.geckoLookup();
      geckoStatus = gecko.status;
      if (gecko.status === "matched")
        return {
          marketData: gecko.marketData,
          geckoterminal: geckoStatus,
          dexscreener: dexStatus,
        };
    } catch {
      geckoStatus = "unavailable";
    }
  }

  try {
    const dex = await options.dexLookup();
    dexStatus = dex.status;
    return {
      marketData: dex.status === "matched" ? dex.marketData : null,
      geckoterminal: geckoStatus,
      dexscreener: dexStatus,
    };
  } catch {
    return {
      marketData: null,
      geckoterminal: geckoStatus,
      dexscreener: "unavailable",
    };
  }
}
