"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import type { MarketDataResult } from "@/lib/market-data/types";

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumSignificantDigits: 8,
  }).format(value);
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
    value,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="passport-market-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function unavailableText(result: MarketDataResult): string {
  if (result.marketState === "pending")
    return "This token contract is eligible for market lookup. Market data will appear after the next scheduled refresh.";
  if (result.marketState === "contract_unavailable")
    return "A token contract address is not available for this launch record.";
  if (result.marketState === "provider_unavailable")
    return "Market data providers are temporarily unavailable. Any prior successful snapshot is retained.";
  if (result.reason === "missing_token_id")
    return "This launch record does not include a token contract address, so market data cannot be matched safely.";
  if (result.reason === "invalid_token_id")
    return "The launch record's token contract address is invalid, so market data was not queried.";
  if (result.reason === "providers_unavailable")
    return "Market data providers could not be reached. Try again later.";
  return "No market pair matching this token contract was found on NEAR.";
}

export default function PassportMarketOverview({ memeId }: { memeId: string }) {
  const [result, setResult] = useState<MarketDataResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market-data/meme/${encodeURIComponent(memeId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : `Market data request failed (${response.status}).`;
          throw new Error(message);
        }
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("status" in payload)
        ) {
          throw new Error(
            "Market data service returned an unexpected response.",
          );
        }
        setResult(payload as MarketDataResult);
      })
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load market data.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [memeId, retry]);

  const market = result?.marketData;
  const updated = result?.fetchedAt ? new Date(result.fetchedAt) : null;
  const updatedLabel =
    updated && Number.isFinite(updated.getTime())
      ? updated.toLocaleString()
      : null;
  const retryRequest = () => {
    setLoading(true);
    setError(null);
    setRetry((value) => value + 1);
  };

  return (
    <section className="passport-section">
      <div className="passport-section-heading">
        <div>
          <span className="eyebrow">LIVE MARKET DATA</span>
          <h2>Market overview</h2>
        </div>
      </div>
      <Card className="passport-market-card" aria-live="polite">
        {loading ? (
          <p className="passport-market-message">Loading live market data…</p>
        ) : error ? (
          <div className="passport-market-message">
            <p>{error}</p>
            <Button variant="quiet" size="small" onClick={retryRequest}>
              Retry
            </Button>
          </div>
        ) : !result || !market ? (
          <div className="passport-market-message">
            <p>
              {result ? unavailableText(result) : "Market data is unavailable."}
            </p>
            <Button variant="quiet" size="small" onClick={retryRequest}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {result.isStale && (
              <p className="passport-market-message" role="status">
                Stale market data. Last successful refresh: {result.lastSuccessfulRefreshAt && Number.isFinite(Date.parse(result.lastSuccessfulRefreshAt)) ? new Date(result.lastSuccessfulRefreshAt).toLocaleString() : "time unavailable"}.
              </p>
            )}
            <div className="passport-market-grid">
              <Metric label="Price (USD)" value={formatUsd(market.priceUsd)} />
              <Metric
                label="Price (native)"
                value={
                  market.priceNative === null
                    ? "Not available"
                    : `${formatNumber(market.priceNative, 12)} NEAR`
                }
              />
              <Metric
                label="Liquidity"
                value={formatUsd(market.liquidityUsd)}
              />
              <Metric label="Market cap" value={formatUsd(market.marketCap)} />
              <Metric label="FDV" value={formatUsd(market.fdv)} />
              <Metric
                label="24h volume"
                value={formatUsd(market.volume24hUsd)}
              />
              <Metric
                label="24h change"
                value={
                  market.priceChange24h === null
                    ? "Not available"
                    : `${formatNumber(market.priceChange24h, 4)}%`
                }
              />
              <Metric
                label="24h buys / sells"
                value={`${formatNumber(market.buys24h, 0)} / ${formatNumber(market.sells24h, 0)}`}
              />
            </div>
            <div className="passport-market-footer">
              <div>
                <strong>{market.dexName ?? "NEAR DEX"}</strong>
                <span>
                  {market.baseToken.symbol ??
                    market.baseToken.address ??
                    "Token"}{" "}
                  /{" "}
                  {market.quoteToken.symbol ??
                    market.quoteToken.address ??
                    "Quote"}{" "}
                  ·{" "}
                  {market.provider === "geckoterminal"
                    ? "GeckoTerminal"
                    : "DEX Screener"}
                </span>
              </div>
              {market.providerUrl && (
                <a
                  href={market.providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View pair ↗
                </a>
              )}
            </div>
            <small className="passport-market-attribution">
              Source:{" "}
              {market.provider === "geckoterminal"
                ? "GeckoTerminal"
                : "DEX Screener"}
              {updatedLabel ? ` · Fetched ${updatedLabel}` : ""}
              {market.pairCreatedAt
                ? ` · Pair created ${new Date(market.pairCreatedAt).toLocaleDateString()}`
                : ""}
            </small>
          </>
        )}
      </Card>
    </section>
  );
}
