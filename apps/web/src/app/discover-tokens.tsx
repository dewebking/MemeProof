"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TokenImage from "./token-image";
import { filterDiscoverTokens, type LaunchStatusFilter } from "@/lib/discover-filter";
import { fetchDiscoverListing, type DiscoverTokenRecord } from "@/lib/discover-client";
import { canonicalTokenIdentity } from "@/lib/near/registry-passport";
import { getRegistryClient, type TokenRecord } from "@/lib/near/registry";

type Token = DiscoverTokenRecord;

function DiscoverSkeletons() {
  return <div className="discover-token-grid discover-skeleton-grid" aria-label="Loading token listings" role="status">
    {[0, 1, 2, 3].map((item) => <article className="discover-token-card discover-token-skeleton" key={item} aria-hidden="true">
      <div className="skeleton-token-identity"><i /><span><b /><small /></span><em /></div>
      <div className="skeleton-token-description"><i /><i /></div>
      <div className="skeleton-token-meta"><i /><i /></div>
      <div className="skeleton-token-footer"><i /><i /></div>
    </article>)}
    <span className="visually-hidden">Loading current token listings from Meme.Cooking.</span>
  </div>;
}

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
  const [lastResponseAt, setLastResponseAt] = useState<string | null>(null);
  const [upstreamMeta, setUpstreamMeta] = useState<{ pagesFetched: number; recordsReceived: number; uniqueRecords: number } | null>(null);
  const [registryContracts, setRegistryContracts] = useState<Set<string> | null>(null);
  const [registryError, setRegistryError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const loadTokens = useCallback(async (controller: AbortController) => {
    try {
      const listing = await fetchDiscoverListing(fetch, controller.signal);
      if (controller.signal.aborted) return;
      setTokens(listing.data);
      setSource(listing.source);
      setStale(listing.stale);
      setLastResponseAt(listing.retrievedAt);
      setUpstreamMeta(listing.upstream ?? null);
      setError(null);
    } catch (reason) {
      if (controller.signal.aborted || (reason instanceof Error && reason.name === "AbortError")) return;
      setError(reason instanceof Error ? reason.message : "Unable to load token data.");
      setStale(true);
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
    queueMicrotask(() => { void loadTokens(controller); });
    return () => {
      controller.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, [loadTokens]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const client = getRegistryClient();
      const records: TokenRecord[] = [];
      let cursor: string | number | null = null;
      do {
        const page = await client.getTokens(cursor, 50);
        records.push(...page.records);
        cursor = page.next_cursor;
      } while (cursor !== null);
      return new Set(records.map((record) => `${record.identity.network_id}:${record.identity.token_contract_address.toLowerCase()}`));
    }).then((contracts) => { if (active) setRegistryContracts(contracts); })
      .catch(() => { if (active) setRegistryError(true); });
    return () => { active = false; };
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

  return <section className="discover-directory" aria-label="Token listings">
    <div className="discover-toolbar">
      <div className="discover-toolbar-heading"><span className="eyebrow">THE DIRECTORY</span><h2>Explore token launches</h2><p>Search the external feed, then open a passport for its MemeProof registry status.</p></div>
      <div className="discover-controls">
        <label className="search-field"><span aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8"/><path d="m13.2 13.2 4 4"/></svg></span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, symbol, or contract address" aria-label="Search by token name, symbol, or contract address" /></label>
        <label className="discover-filter"><span className="sr-only">Launch status</span><select value={status} onChange={event => setStatus(event.target.value as LaunchStatusFilter)} aria-label="Filter launch status">
          <option value="all">All launch statuses</option><option value="finalized">Finalized</option><option value="not_finalized">Not finalized</option><option value="unknown">Unavailable</option>
        </select></label>
        <button type="button" className="button button-secondary button-small" onClick={refresh} disabled={loading} aria-label={loading ? "Refreshing token list" : "Refresh token list"}>{loading ? "Refreshing…" : <><span aria-hidden="true">↻</span><span>Refresh</span></>}</button>
      </div>
    </div>
    <div className="discover-feedline">
      <b aria-live="polite">{filtered.length} shown · {source === "meme.cooking" ? stale ? `${tokens.length} records in stale upstream result` : `${upstreamMeta?.uniqueRecords ?? tokens.length} unique records received` : source === "sync_snapshot" ? `${tokens.length} records in ${stale ? "stale" : "synced"} snapshot` : source === "stale_cache" ? `${tokens.length} records in stale memory fallback` : "0 records received"}</b>
      <span>{source ? (source === "meme.cooking" ? (stale ? "Stale Meme.Cooking result" : "Live upstream") : source === "sync_snapshot" ? (stale ? "Stale sync snapshot" : "Synced snapshot") : "Stale in-memory fallback") + (lastResponseAt ? " · retrieved " + new Date(lastResponseAt).toLocaleString() : " · retrieval time unavailable") + (source === "meme.cooking" && !stale && upstreamMeta ? ` · ${upstreamMeta.pagesFetched} pages, ${upstreamMeta.recordsReceived} rows` : "") : loading ? "Fetching listings…" : "No successful retrieval recorded"}</span>
    </div>
    {loading && tokens.length === 0 ? <DiscoverSkeletons /> : error && tokens.length === 0 ? <div className="discover-empty" role="alert"><h3>The token feed is unavailable</h3><p>{error}</p><button className="button button-primary button-small" onClick={refresh}>Try again</button></div> : <>
      {error && <div className="discover-error-notice" role="alert"><span>Refresh failed: {error}</span><span>Previously received data remains visible and may be outdated.</span></div>}
      {filtered.length === 0 ? <div className="discover-empty"><span className="discover-empty-mark" aria-hidden="true">⌕</span><h3>{query ? "No token found for “" + query + "”" : "No listings to show"}</h3><p>{query ? "Try a different name, symbol or contract address." : "Meme.Cooking returned no listing records. This does not indicate whether MemeProof has registered any tokens."}</p></div> : <div className="discover-token-grid">
      {filtered.map((token) => {
        const name = text(token, "name") ?? "Unnamed token";
        const symbol = text(token, "symbol");
        const owner = text(token, "owner", "account_id", "creator");
        const contract = text(token, "token_id");
        const identity = contract ? canonicalTokenIdentity("testnet", contract) : null;
        const membership = !identity
          ? "Registry status unavailable · contract address invalid or missing"
          : registryError
            ? "Registry status unavailable"
            : !registryContracts
              ? "Checking MemeProof registry…"
              : registryContracts.has(`${identity.network_id}:${identity.token_contract_address}`)
                ? "Registered with MemeProof"
                : "Not registered with MemeProof";
        const description = text(token, "description");
        const launched = text(token, "created_at", "launched_at", "launch_time", "timestamp");
        const poolId = text(token, "pool_id");
        const launchStatus = token.is_finalized === true ? "Finalized" : token.is_finalized === false ? "Not finalized" : "Status unavailable";
        const socials = ["website", "twitter", "telegram", "discord"].flatMap(key => {
          const value = text(token, key);
          if (!value) return [];
          try { const url = new URL(value.startsWith("http") ? value : `https://${value}`); return [<a key={key} href={url.href} target="_blank" rel="noreferrer">{key}</a>]; } catch { return []; }
        });
        const registered = membership === "Registered with MemeProof";
        const unavailable = membership.startsWith("Registry status unavailable");
        return <article className="discover-token-card" key={String(token.meme_id)}>
  <header className="discover-token-card-top">
    <TokenImage className="discover-token-image" value={token} name={name} width={48} height={48} />
    <div className="discover-token-heading">
      <span className="discover-listing-source">MEME.COOKING · LISTING #{String(token.meme_id)}</span>
      <h3>{name}{symbol && <span className="discover-token-symbol">${symbol}</span>}</h3>
      <small className="discover-token-contract" title={contract ?? "Contract address unavailable"}>{contract ? "NEAR testnet · " + contract : "Contract address unavailable"}</small>
    </div>
    <span className={"discover-launch-pill " + (token.is_finalized === true ? "is-finalized" : token.is_finalized === false ? "is-pending" : "is-unavailable")}><i />{launchStatus}</span>
  </header>
  {description && <p className="discover-token-description">{description}</p>}
  <dl className="discover-token-details">
    {owner && owner !== "Owner unavailable" && <div><dt>CREATOR</dt><dd title={owner}>{owner}</dd></div>}
    {launched && <div><dt>CREATED</dt><dd>{launched}</dd></div>}
    {poolId && <div><dt>POOL</dt><dd title={poolId}>{poolId}</dd></div>}
  </dl>
  {socials.length > 0 && <div className="discover-socials" aria-label={name + " external links"}>{socials}</div>}
  <footer className="discover-card-footer">
    <span className={"discover-membership " + (registered ? "is-registered" : "") + (membership.startsWith("Not registered") ? " is-unregistered" : "") + (unavailable ? " discover-registry-unavailable" : "")}><i aria-hidden="true" /><span><small>MEMEPROOF REGISTRY</small>{membership}</span></span>
    <Link className="discover-token-open" href={"/passport/" + encodeURIComponent(String(token.meme_id))}>View token details <span aria-hidden="true">↗</span></Link>
  </footer>
</article>;
      })}
    </div>}
    </>}
    <div className="discover-source-note" id="registry-note"><span>ABOUT THESE LISTINGS</span><p>Meme.Cooking provides the launch data shown here. A listing is not a MemeProof registration; passport pages check the full NEAR testnet contract identity against the registry.</p><Link href="/passport">See registered MemeProof tokens <span aria-hidden="true">↗</span></Link></div>
  </section>;
}
