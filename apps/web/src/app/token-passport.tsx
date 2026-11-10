"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "./ui";
import TokenImage from "./token-image";
import PassportMarketOverview from "./passport-market-overview";
import { RegistryIdentityStatus } from "./registry-passports";

type Token = Record<string, unknown>;
const first = (token: Token, ...keys: string[]): unknown => keys.map(key => token[key]).find(value => value !== undefined && value !== null && value !== "");
const display = (value: unknown): string | undefined => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function exactAmount(raw: unknown, decimals: unknown): string | undefined {
  const amount = display(raw);
  if (amount === undefined || amount === "") return;
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 100 || !/^-?\d+$/.test(amount)) return amount;
  const negative = amount.startsWith("-");
  const digits = negative ? amount.slice(1) : amount;
  const padded = digits.padStart(places + 1, "0");
  const whole = places ? padded.slice(0, -places) : padded;
  const fraction = places ? padded.slice(-places).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function SafeLink({ label, raw }: { label: string; raw: unknown }) {
  const href = display(raw)?.trim();
  if (!href) return <span className="passport-link-unavailable">{label} unavailable</span>;
  let safeHref: string | undefined;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(href) ? href : `https://${href}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid URL");
    safeHref = url.href;
  } catch { return <span className="passport-link-unavailable">{label} unavailable</span>; }
  return <a href={safeHref} target="_blank" rel="noopener noreferrer">{label} ↗</a>;
}

type PassportIconName = "passport" | "id" | "status" | "owner" | "copy" | "external";

function PassportIcon({ name }: { name: PassportIconName }) {
  const shapes: Record<PassportIconName, ReactNode> = {
    passport: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5"/><circle cx="15.5" cy="16.5" r="2.5"/></>,
    id: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h2M14 10h3M14 14h3"/></>,
    status: <><circle cx="12" cy="12" r="8.5"/><path d="m8 12 2.5 2.5L16 9"/></>,
    owner: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}

function CopyField({ label, value, className }: { label: string; value?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copyValue = value;
  async function copy() {
    try { await navigator.clipboard.writeText(copyValue); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  }
  return <div className={`passport-copy${className ? ` ${className}` : ""}`}><span><small>{label}</small><code title={value}>{value}</code></span><Button variant="quiet" size="small" onClick={copy}><PassportIcon name="copy"/><span>{copied ? "Copied" : "Copy"}</span></Button></div>;
}

function nearExplorerUrl(account: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(account)) return;
  const host = account.toLowerCase().endsWith(".testnet") ? "https://testnet.nearblocks.io" : "https://nearblocks.io";
  return `${host}/address/${encodeURIComponent(account)}`;
}

function Metric({ label, value, exact, denomination }: { label: string; value?: string; exact?: string; denomination?: string }) {
  return <div className="metric-card passport-metric"><div className="metric-top"><span>{label}</span></div><strong>{value ?? "Unavailable"}</strong>{denomination && <small>{denomination}</small>}{exact && exact !== value && <details><summary>Exact raw value</summary><code>{exact}</code></details>}</div>;
}

export default function TokenPassport({ id }: { id: string }) {
  const [token, setToken] = useState<Token | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/meme-cooking/meme/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async response => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(record(body) && typeof body.error === "string" ? body.error : `Token request failed (${response.status}).`);
      const data = record(body) ? body.data : undefined;
      if (!record(data)) throw new Error("Token service returned an unexpected response.");
      setToken(data); setError(null);
    }).catch(reason => { if (!(reason instanceof Error && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Unable to load token."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, retry]);

  if (loading) return <Card className="passport-state"><span className="eyebrow">MEME.COOKING LAUNCH RECORD</span><h2>Loading token details</h2><p>Fetching the selected token record.</p></Card>;
  if (error || !token) return <Card className="passport-state" role="alert"><span className="eyebrow">TOKEN PASSPORT</span><h2>Token details unavailable</h2><p>{error ?? "No token record was returned."}</p><div className="passport-actions"><Button onClick={() => setRetry(value => value + 1)}>Retry</Button><Link className="button button-quiet" href="/discover">← Back to Discover</Link></div></Card>;

  const name = display(first(token, "name")) ?? "Unnamed token";
  const symbol = display(first(token, "symbol"));
  const owner = display(first(token, "owner", "owner_id", "account_id", "creator"));
  const contract = display(first(token, "token_id", "contract_id"));
  const decimals = first(token, "decimals", "token_decimals");
  const supplyRaw = first(token, "total_supply", "supply", "totalSupply");
  const depositToken = display(first(token, "deposit_token", "deposit_token_id", "payment_token", "currency"));
  const wrappedNear = depositToken?.toLowerCase() === "wrap.near";
  const depositDecimals = wrappedNear ? 24 : first(token, "deposit_token_decimals", "deposit_decimals");
  const linksValue = first(token, "social_links", "socials");
  const social = record(linksValue) ? linksValue : {};
  const links = [
    ["Website", first(token, "website") ?? social.website],
    ["X / Twitter", first(token, "twitter_link") ?? social.twitter_link],
    ["Telegram", first(token, "telegram_link") ?? social.telegram_link],
  ] as const;
  const finalized = first(token, "is_finalized", "finalized");
  const launchState = finalized === true || finalized === "true" ? "Finalized" : finalized === false || finalized === "false" ? "Not finalized" : "Status unavailable";
  const dates: [string, unknown][] = [["Created", first(token, "created_at", "createdAt", "creation_date")], ["Starts", first(token, "start_at", "start_date", "starts_at")], ["Ends", first(token, "end_at", "end_date", "ends_at")], ["Last updated", first(token, "updated_at", "updatedAt")], ["Creation block", first(token, "created_block_height", "creation_block_height", "block_height")]];
  const feeValue = first(token, "total_deposit_fee", "total_deposit_fees");
  const withdrawalFee = first(token, "total_withdrawal_fee", "total_withdrawal_fees");
  const deposit = first(token, "total_deposit", "total_deposits");
  const ownerExplorer = owner ? nearExplorerUrl(owner) : undefined;

  return <div className="token-passport">
    <div className="passport-back"><Link href="/discover" className="button button-quiet">← Back to Discover</Link><span className="eyebrow">MEME.COOKING TOKEN / {display(first(token, "meme_id", "id")) ?? id}</span></div>
    <section className="token-passport-identity" aria-label="Token identity">
      <Card className="token-passport-banner">
        <div className="token-passport-banner-identity">
          <TokenImage className="token-passport-logo" value={token} name={name} width={88} height={88} />
          <div className="token-passport-banner-copy">
            <h1>{name}</h1>
            {symbol && <span className="token-passport-ticker">{symbol.startsWith("$") ? symbol : `$${symbol}`}</span>}
            <span className="token-passport-descriptor">MEME.COOKING TOKEN PASSPORT</span>
          </div>
        </div>
        <div className="token-passport-seal"><PassportIcon name="passport"/><span>MEMEPROOF<br/>TOKEN PASSPORT</span></div>
      </Card>

      <div className="token-passport-detail-grid">
        <Card className="token-passport-meta-card" aria-label="Token launch metadata">
          <div className="token-passport-meta-item">
            <span className="token-passport-meta-icon"><PassportIcon name="id"/></span>
            <span className="token-passport-meta-copy"><small>Meme ID</small><b>{display(first(token, "meme_id", "id")) ?? id}</b></span>
          </div>
          <div className="token-passport-meta-item">
            <span className="token-passport-meta-icon"><PassportIcon name="status"/></span>
            <span className="token-passport-meta-copy"><small>Launch status</small><Badge variant={launchState === "Finalized" ? "success" : "neutral"}>{launchState}</Badge></span>
          </div>
        </Card>

        <Card className="token-passport-owner-card" aria-label="Launch owner">
          <span className="token-passport-owner-avatar"><PassportIcon name="owner"/></span>
          <div className="token-passport-owner-copy"><small>Launch owner</small><b>Meme.Cooking</b>{owner ? <CopyField className="token-passport-owner-account" label="Owner account" value={owner} /> : <span className="token-passport-owner-unavailable">Owner account unavailable</span>}</div>
          {ownerExplorer && <a className="token-passport-external" href={ownerExplorer} target="_blank" rel="noopener noreferrer" aria-label={`Open ${owner} in NEAR Explorer`} title="Open account in NEAR Explorer"><PassportIcon name="external"/></a>}
        </Card>
      </div>

      {contract && <Card className="token-passport-contract-card">
        <span className="token-passport-contract-icon"><PassportIcon name="copy"/></span>
        <CopyField className="token-passport-contract-field" label="Token contract address" value={contract} />
      </Card>}
    </section>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">PROJECT</span><h2>Overview</h2></div></div><Card className="passport-overview">
      <div className="passport-overview-content"><p>{display(first(token, "description")) ?? "No project description is available."}</p><div className="passport-links">{links.filter(([, raw]) => Boolean(raw)).map(([label, raw]) => <SafeLink key={label} label={label} raw={raw} />)}</div></div>
    </Card></section>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF TESTNET REGISTRY</span><h2>Registration status</h2></div></div><RegistryIdentityStatus tokenContractAddress={contract} /></section>

    <PassportMarketOverview memeId={id} />

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEME.COOKING LAUNCH DATA</span><h2>Token economics</h2></div></div><div className="passport-metrics">
      <Metric label="Total supply" value={exactAmount(supplyRaw, decimals)} exact={display(supplyRaw)} denomination={display(decimals) ? `${display(decimals)} token decimals` : undefined} />
      <Metric label="Decimals" value={display(decimals)} />
      <Metric label="Soft cap" value={exactAmount(first(token, "soft_cap"), depositDecimals)} exact={display(first(token, "soft_cap"))} denomination={depositToken ?? "Deposit denomination unavailable"} />
      <Metric label="Hard cap" value={exactAmount(first(token, "hard_cap"), depositDecimals)} exact={display(first(token, "hard_cap"))} denomination={depositToken ?? "Deposit denomination unavailable"} />
      <Metric label="Total deposits" value={exactAmount(deposit, depositDecimals)} exact={display(deposit)} denomination={depositToken ?? "Deposit denomination unavailable"} />
      <Metric label="Deposit fees" value={exactAmount(feeValue, depositDecimals)} exact={display(feeValue)} denomination={depositToken ?? "Deposit denomination unavailable"} />
      <Metric label="Withdrawal fees" value={exactAmount(withdrawalFee, depositDecimals)} exact={display(withdrawalFee)} denomination={depositToken ?? "Deposit denomination unavailable"} />
    </div></section>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEME.COOKING LAUNCH DATA</span><h2>Launch details</h2></div></div><Card className="passport-launch"><div className="passport-launch-status"><span>Launch finalization</span><Badge variant={launchState === "Finalized" ? "success" : "neutral"}>{launchState}</Badge></div><dl>{dates.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}{[["Token contract ID", contract], ["Pool ID", display(first(token, "pool_id"))]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><details className="passport-technical"><summary>Technical details</summary><pre>{JSON.stringify(token, null, 2)}</pre></details></Card></section>

  </div>;
}
