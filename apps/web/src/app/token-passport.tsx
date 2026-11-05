"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "./ui";
import TokenImage from "./token-image";

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

function CopyField({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copyValue = value;
  async function copy() {
    try { await navigator.clipboard.writeText(copyValue); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  }
  return <div className="passport-copy"><span><small>{label}</small><code title={value}>{value}</code></span><Button variant="quiet" size="small" onClick={copy}>{copied ? "Copied" : "Copy"}</Button></div>;
}

function Metric({ label, value, exact, denomination }: { label: string; value?: string; exact?: string; denomination?: string }) {
  return <div className="metric-card passport-metric"><div className="metric-top"><span>{label}</span></div><strong>{value ?? "Unavailable"}</strong>{denomination && <small>{denomination}</small>}{exact && exact !== value && <details><summary>Exact raw value</summary><code>{exact}</code></details>}</div>;
}

export default function TokenPassport({ id }: { id: string }) {
  const [token, setToken] = useState<Token | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  return <div className="token-passport">
    <div className="passport-back"><Link href="/discover" className="button button-quiet">← Back to Discover</Link><span className="eyebrow">MEME.COOKING TOKEN / {display(first(token, "meme_id", "id")) ?? id}</span></div>
    <Card className="passport-hero">
      <TokenImage className="passport-avatar" value={token} name={name} width={96} height={96} />
      <div className="passport-identity"><span className="eyebrow">LAUNCH OWNER: MEME.COOKING</span><h1>{name}{symbol && <span>{symbol.startsWith("$") ? symbol : `$${symbol}`}</span>}</h1><p>Meme ID {display(first(token, "meme_id", "id")) ?? id}</p><Badge variant={launchState === "Finalized" ? "success" : "neutral"}>Launch: {launchState}</Badge></div>
      <div className="passport-identifiers"><CopyField label="Launch owner" value={owner} /><CopyField label="Token contract" value={contract} /></div>
    </Card>

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">PROJECT</span><h2>Overview</h2></div></div><Card className="passport-overview">
      <div className="passport-overview-content"><p>{display(first(token, "description")) ?? "No project description is available."}</p><div className="passport-links">{links.filter(([, raw]) => Boolean(raw)).map(([label, raw]) => <SafeLink key={label} label={label} raw={raw} />)}</div></div>
    </Card></section>

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

    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF REGISTRY</span><h2>Accountability record</h2></div></div><Card className="passport-accountability"><Badge variant="warning">Not registered</Badge><p>This token has not yet been registered in the MemeProof registry. Commitments, evidence submissions, disputes, and verification history become available after registration.</p><small>Meme.Cooking launch finalization is separate from MemeProof verification.</small></Card></section>
  </div>;
}
