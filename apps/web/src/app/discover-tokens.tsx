"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TokenImage from "./token-image";
import { filterDiscoverTokens, type LaunchStatusFilter } from "@/lib/discover-filter";
import { fetchDiscoverListing, type DiscoverTokenRecord } from "@/lib/discover-client";

type Token = DiscoverTokenRecord;

function text(record: Token, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export default function DiscoverTokens({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LaunchStatusFilter>("all");
  const [source, setSource] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const loadTokens = useCallback(async (controller: AbortController) => {
    try {
      const listing = await fetchDiscoverListing(fetch, controller.signal);
      if (controller.signal.aborted) return;
      setTokens(listing.data);
      setSource(listing.source);
      setStale(listing.stale);
      setLastSuccessfulRefresh(new Date().toISOString());
      setError(null);
    } catch (reason) {
      if (controller.signal.aborted || (reason instanceof Error && reason.name === "AbortError")) return;
      setError(reason instanceof Error ? reason.message : "Unable to load token data.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    fetchDiscoverListing(fetch, controller.signal)
      .then((listing) => {
        if (controller.signal.aborted) return;
        setTokens(listing.data);
        setSource(listing.source);
        setStale(listing.stale);
        setLastSuccessfulRefresh(new Date().toISOString());
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof Error && reason.name === "AbortError")) return;
        setError(reason instanceof Error ? reason.message : "Unable to load token data.");
      })
      .finally(() => {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, []);

  const refresh = () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setError(null);
    setLoading(true);
    void loadTokens(controller);
  };

  const filtered = useMemo(() => filterDiscoverTokens(tokens, query, status), [query, status, tokens]);

  return <section className="panel discover-panel">
    <div className="discover-controls">
      <label className="search-field"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, symbol, owner or contract" aria-label="Search tokens" /></label>
      <span className="discover-result-count">{loading ? "Loading…" : `${filtered.length.toLocaleString()} tokens`}</span>
      <select value={status} onChange={event => setStatus(event.target.value as LaunchStatusFilter)} aria-label="Filter launch status">
        <option value="all">All launch statuses</option>
        <option value="finalized">Finalized</option>
        <option value="not_finalized">Not Finalized</option>
        <option value="unknown">Status unavailable</option>
      </select>
      <button type="button" className="button button-primary button-small" onClick={refresh} disabled={loading} aria-label={loading ? "Refreshing token list" : "Refresh token list"}>{loading ? "Refreshing..." : "Refresh"}</button>
    </div>
    {source && <p className="discover-data-source" role="status">{stale ? "Showing stale cached data" : source === "meme.cooking" ? "Live data from Meme.Cooking" : "MemeProof cached Meme.Cooking snapshot"}{lastSuccessfulRefresh && <> · Last successful refresh: {new Date(lastSuccessfulRefresh).toLocaleString()}</>}</p>}
    {loading ? <div className="empty-state" role="status"><h3>Loading tokens</h3><p>Fetching current token records.</p></div> : error ? <div className="empty-state" role="alert"><h3>Could not load tokens</h3><p>{error}</p><button className="button button-primary button-small" onClick={refresh}>Try again</button></div> : filtered.length === 0 ? <div className="empty-state"><h3>{query ? `No results for “${query}”` : "No tokens available"}</h3><p>{query ? "Try a different name, symbol, owner or contract." : "The live token service returned no records."}</p></div> : <div className="discover-token-list">
      {filtered.map((token, index) => {
        const name = text(token, "name") ?? "Unnamed token";
        const symbol = text(token, "symbol");
        const owner = text(token, "owner", "account_id", "creator") ?? "Owner unavailable";
        const contract = text(token, "token_id");
        const description = text(token, "description");
        const launched = text(token, "created_at", "launched_at", "launch_time", "timestamp");
        const poolId = text(token, "pool_id");
        const launchStatus = token.is_finalized === true ? "Finalized" : token.is_finalized === false ? "Not Finalized" : "Status unavailable";
        const socials = ["website", "twitter", "telegram", "discord"].flatMap(key => {
          const value = text(token, key);
          if (!value) return [];
          try { const url = new URL(value.startsWith("http") ? value : `https://${value}`); return [<a key={key} href={url.href} target="_blank" rel="noreferrer">{key}</a>]; } catch { return []; }
        });
        return <Link className="discover-token-row" href={`/passport/${encodeURIComponent(String(token.meme_id))}`} key={`${token.meme_id}-${index}`} aria-label={`View ${name} passport`}>
          <TokenImage className="discover-token-image" value={token} name={name} width={42} height={42} />
          <div className="discover-token-main"><strong>{name}{symbol && <span className="discover-token-symbol">${symbol}</span>}</strong><small>{contract ?? `Meme ID ${token.meme_id}`}</small>{description && <p>{description}</p>}</div>
          <div className="discover-token-meta"><span>LAUNCH OWNER</span><b title={owner}>{owner}</b><small className="discover-launch-status">Launch: {launchStatus}</small>{launched && <small>Launch: {launched}</small>}{poolId && <small>Pool: {poolId}</small>}{socials.length > 0 && <div className="discover-socials">{socials}</div>}</div>
        </Link>;
      })}
    </div>}
  </section>;
}
