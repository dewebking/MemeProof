"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  canonicalTokenIdentity,
  findTokenByIdentity,
  getTokenPassportRecords,
  tokenRegistrationStatus,
  type TokenPassportRecords,
} from "../lib/near/registry-passport";
import type { TokenIdentity, TokenRecord } from "../lib/near/registry";
import { explainTransactionError, getRegistryClient, RegistryTransactionError } from "../lib/near/registry";
import { Badge, Button, Card } from "./ui";

type AsyncResult<T> = { key: string; value?: T; error?: string };

function registryError(cause: unknown): string {
  if (cause instanceof RegistryTransactionError && cause.kind === "configuration") {
    return `Registry configuration unavailable: ${cause.message}`;
  }
  return `NEAR registry RPC error: ${explainTransactionError(cause)}`;
}

function useRetry() {
  const [retry, setRetry] = useState(0);
  return [retry, () => setRetry((value) => value + 1)] as const;
}

function LoadingState({ children = "Loading MemeProof registry records…" }: { children?: ReactNode }) {
  return <div className="registry-state" role="status">{children}</div>;
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="registry-state registry-error" role="alert"><b>Registry records unavailable</b><span>{error}</span><Button variant="secondary" size="small" onClick={onRetry}>Retry registry read</Button></div>;
}

function identityText(identity: TokenIdentity) {
  return `${identity.network_id} · ${identity.token_contract_address}`;
}

function RegistryCopy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return <button className="passport-copy-action" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>;
}

export function RegistryIdentityStatus({ tokenContractAddress }: { tokenContractAddress?: string }) {
  const identity = useMemo(
    () => tokenContractAddress
      ? canonicalTokenIdentity("testnet", tokenContractAddress)
      : null,
    [tokenContractAddress],
  );
  const key = identity ? `${identity.network_id}:${identity.token_contract_address}` : "missing";
  const [retry, retryRead] = useRetry();
  const [result, setResult] = useState<AsyncResult<TokenRecord | null> | null>(null);
  useEffect(() => {
    let active = true;
    if (!identity) return () => { active = false; };
    void Promise.resolve().then(() => findTokenByIdentity(getRegistryClient(), identity))
      .then((value) => { if (active) setResult({ key: `${key}:${retry}`, value }); })
      .catch((cause: unknown) => { if (active) setResult({ key: `${key}:${retry}`, error: registryError(cause) }); });
    return () => { active = false; };
  }, [identity, key, retry]);
  if (!identity || tokenRegistrationStatus(identity, null) === "identity_unavailable") return <Card className="passport-accountability"><Badge variant="neutral">Registry status unavailable</Badge><p>This listing does not provide a valid NEAR testnet token contract address, so MemeProof registration cannot be checked.</p><small>Token tickers and listing IDs are not used as token identity.</small></Card>;
  const resultKey = `${key}:${retry}`;
  const resultValue = result?.key === resultKey ? result.value : undefined;
  const error = result?.key === resultKey ? result.error : undefined;
  if (error) return <Card className="passport-accountability"><ErrorState error={error} onRetry={retryRead} /></Card>;
  if (resultValue === undefined) return <Card className="passport-accountability"><LoadingState>Checking registry identity {identityText(identity)}…</LoadingState></Card>;
  if (resultValue === null || tokenRegistrationStatus(identity, resultValue) === "unregistered") return <Card className="passport-accountability"><Badge variant="warning">Not registered</Badge><p>No MemeProof registration matches <b>{identityText(identity)}</b>.</p><Link className="text-link" href="/register-token">Register this token identity ↗</Link></Card>;
  return <Card className="passport-accountability"><Badge variant="success">Registered on MemeProof</Badge><p>Registered token record #{String(resultValue.id)} for <b>{identityText(identity)}</b>.</p><p>Registrant: {resultValue.registrant} · Registered {formatNsDate(resultValue.created_at_ns)}</p><p className="registry-note">Registration confirms a registry record exists. It is not a verification verdict.</p><Link className="text-link" href={`/passport/registry/${resultValue.id}`}>Open MemeProof accountability record ↗</Link></Card>;
}

function formatNsDate(value: number | string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(Number(BigInt(value) / BigInt(1_000_000))));
  } catch {
    return "Date unavailable";
  }
}

function isPlaceholderToken(token: TokenRecord): boolean {
  return token.identity.token_contract_address === "ddddd";
}

export function RegistryPassportDirectory() {
  const [retry, retryRead] = useRetry();
  const [result, setResult] = useState<AsyncResult<TokenRecord[]> | null>(null);
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
      return records;
    }).then((value) => { if (active) setResult({ key: String(retry), value }); })
      .catch((cause: unknown) => { if (active) setResult({ key: String(retry), error: registryError(cause) }); });
    return () => { active = false; };
  }, [retry]);
  const current = result?.key === String(retry) ? result : null;
  if (current?.error) return <section className="panel passport-directory-panel"><ErrorState error={current.error} onRetry={retryRead} /></section>;
  if (!current?.value) return <section className="panel passport-directory-panel"><LoadingState /></section>;
  if (current.value.length === 0) return <section className="panel passport-directory-panel passport-directory-empty"><div className="registry-state"><span className="eyebrow">THE REGISTRY IS OPEN</span><b>No token identities are registered yet.</b><span>Registration is checked using the NEAR testnet network and full contract address. A Meme.Cooking listing alone does not create a MemeProof record.</span><Link className="button button-primary button-small" href="/register-token">Register a token</Link></div></section>;
  return <section className="panel registry-directory passport-directory-panel"><div className="panel-heading"><div><span className="eyebrow">ON-CHAIN REGISTRY RECORDS</span><h2>Registered identities</h2><p>Each passport belongs to one network and one full token contract address.</p></div><span className="passport-directory-count"><b>{current.value.length.toLocaleString()}</b> records</span></div>{current.value.map((token) => <article className={`registry-directory-row ${isPlaceholderToken(token) ? "is-test-record" : ""}`} key={String(token.id)}><div className="passport-directory-identity"><span className="eyebrow">MEMEPROOF RECORD #{String(token.id)}{isPlaceholderToken(token) ? " · PLACEHOLDER TEST DATA" : ""}</span><b>{token.identity.token_contract_address}</b><div className="passport-directory-meta"><span>Network <strong>{token.identity.network_id}</strong></span><span>Registrant <strong>{token.registrant}</strong></span><span>Added <strong>{formatNsDate(token.created_at_ns)}</strong></span></div></div><div className="passport-directory-row-action"><Badge variant={isPlaceholderToken(token) ? "warning" : "success"}>{isPlaceholderToken(token) ? "Test record" : "Registered"}</Badge><Link className="text-link" href={`/passport/registry/${token.id}`}>View passport <span aria-hidden="true">↗</span></Link></div></article>)}</section>;
}

export function RegistryPassportDetail({ tokenRecordId }: { tokenRecordId: string }) {
  const [retry, retryRead] = useRetry();
  const key = `${tokenRecordId}:${retry}`;
  const [result, setResult] = useState<AsyncResult<{ token: TokenRecord | null; records?: TokenPassportRecords }> | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!/^\d+$/.test(tokenRecordId)) return { token: null };
      const client = getRegistryClient();
      const token = await client.getToken(tokenRecordId);
      if (!token) return { token: null };
      const records = await getTokenPassportRecords(client, token.id);
      return { token, records };
    }).then((value) => { if (active) setResult({ key, value }); })
      .catch((cause: unknown) => { if (active) setResult({ key, error: registryError(cause) }); });
    return () => { active = false; };
  }, [key, tokenRecordId]);
  const current = result?.key === key ? result : null;
  if (current?.error) return <section className="page-content passport-detail-state"><ErrorState error={current.error} onRetry={retryRead} /></section>;
  if (!current?.value) return <section className="page-content passport-detail-state"><LoadingState /></section>;
  if (!current.value.token) return <section className="page-content passport-detail-state"><Card className="passport-state"><Badge variant="warning">Registration not found</Badge><h1>No token record #{tokenRecordId}</h1><p>This token ID is not registered in the configured MemeProof testnet registry.</p><Link className="button button-secondary" href="/passport">Browse registered tokens</Link></Card></section>;
  const placeholder = isPlaceholderToken(current.value.token);
  return <div className="token-passport registry-passport"><div className="passport-back"><Link href="/passport" className="button button-quiet">← All token passports</Link><span className="eyebrow">MEMEPROOF PUBLIC RECORD / NEAR TESTNET</span></div><Card className={`passport-hero registry-passport-hero ${placeholder ? "is-test-record" : ""}`}><div className="passport-identity"><span className="eyebrow">TOKEN IDENTITY <i /> RECORD #{String(current.value.token.id)}</span><h1>{current.value.token.identity.token_contract_address}</h1>{placeholder && <p className="registry-test-record-note">Placeholder test data · this registry record does not identify a real token contract.</p>}<div className="passport-identity-network"><span>Network</span><b>{current.value.token.identity.network_id}</b></div></div><div className="passport-registry-status"><Badge variant={placeholder ? "warning" : "success"}>{placeholder ? "Placeholder test record" : "Registered on MemeProof"}</Badge><p>A registry entry exists for this identity. Registration is not an official verification or verdict.</p></div><div className="passport-identifiers registry-passport-identifiers"><div className="passport-copy"><span><small>Token contract address</small><code title={current.value.token.identity.token_contract_address}>{current.value.token.identity.token_contract_address}</code></span><RegistryCopy value={current.value.token.identity.token_contract_address} /></div><div className="passport-copy"><span><small>Registrant</small><code title={current.value.token.registrant}>{current.value.token.registrant}</code></span></div><div className="passport-copy"><span><small>Registered</small><code>{formatNsDate(current.value.token.created_at_ns)}</code></span></div></div></Card><TokenAccountability records={current.value.records!} /></div>;
}

export function TokenAccountability({ records }: { records: TokenPassportRecords }) {
  return <>
    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF COMMITMENTS</span><h2>Recorded commitments</h2></div></div>{records.commitments.length ? records.commitments.map(({ record, versions, evidence }) => <Card className="registry-passport-card" id={`commitment-${record.commitment.id}`} key={String(record.commitment.id)}><div className="registry-record-heading"><div><span className="eyebrow">COMMITMENT #{String(record.commitment.id)} · VERSION {record.current_version.version}</span><h3>{record.current_version.title}</h3></div><Badge variant="neutral">Record only</Badge></div><p className="registry-commitment-description">{record.current_version.description}</p><div className="registry-criteria"><b>Success criteria recorded</b><p>{record.current_version.criteria}</p></div><div className="registry-record-meta"><span>Creator: {record.commitment.creator}</span><span>Created: {formatNsDate(record.commitment.created_at_ns)}</span><span>Current deadline: {formatNsDate(record.current_version.deadline_at_ns)}</span><span>Current version recorded: {formatNsDate(record.current_version.created_at_ns)}</span></div>{versions.length > 1 && <details className="registry-version-history"><summary>Version timeline · {versions.length} recorded versions</summary><div className="registry-version-timeline">{[...versions].sort((a, b) => a.version - b.version).map((version) => <article className={version.version === record.current_version.version ? "is-current" : ""} key={version.version}><i aria-hidden="true"/><div><div className="registry-version-title"><b>Version {version.version} · {version.title}</b>{version.version === record.current_version.version && <span>Current</span>}</div><small>Recorded {formatNsDate(version.created_at_ns)} · Deadline {formatNsDate(version.deadline_at_ns)}</small><p>{version.description}</p><small>Criteria: {version.criteria}</small></div></article>)}</div></details>}<p className="registry-note">A deadline passing does not set a final outcome. Community reviews are opinions, and disputes are tracked separately.</p>{evidence.length > 0 && <div className="registry-nested-records"><h4>Evidence records</h4>{evidence.map(({ record: item, reviews }) => <div className="registry-evidence" id={`evidence-${item.id}`} key={String(item.id)}><div className="registry-record-heading"><b>Evidence #{String(item.id)} · version {item.version}</b><small>{formatNsDate(item.submitted_at_ns)}</small></div><p>Submitted by {item.submitter}</p><p>Reference: <code>{item.reference}</code></p><p>Content hash: <code>{item.content_hash}</code></p><div className="registry-review-list"><b>Community reviews ({reviews.length})</b>{reviews.length ? reviews.map((review) => <article id={`review-${review.id}`} key={String(review.id)}><span>Review #{String(review.id)} · {review.outcome}</span><small>By {review.reviewer} · {formatNsDate(review.submitted_at_ns)}</small><p>{review.explanation}</p></article>) : <p className="registry-note">No community reviews recorded for this evidence.</p>}<small className="registry-note">Community reviews are attributed opinions; they do not determine a final verdict.</small></div></div>)}</div>}{records.disputes.some(({ record: dispute }) => String(dispute.commitment_id) === String(record.commitment.id)) && <div className="registry-related-links">{records.disputes.filter(({ record: dispute }) => String(dispute.commitment_id) === String(record.commitment.id)).map(({ record: dispute }) => <a key={`dispute-${dispute.id}`} href={`#dispute-${dispute.id}`}>Open dispute #{String(dispute.id)} ↓</a>)}</div>}</Card>) : <Card className="registry-passport-card"><div className="registry-state">This token is registered, but no commitments have been recorded for it.</div></Card>}</section>
    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF DISPUTES</span><h2>Dispute history</h2></div></div>{records.disputes.length ? <div className="registry-dispute-list">{records.disputes.map(({ record, resolution }) => <Card className="registry-passport-card" id={`dispute-${record.id}`} key={String(record.id)}><div className="registry-record-heading"><div><span className="eyebrow">DISPUTE #{String(record.id)}</span><h3>Commitment #{String(record.commitment_id)}{record.evidence_id !== null ? ` · Evidence #${String(record.evidence_id)}` : ""}</h3></div><Badge variant={record.status === "resolved" ? "info" : record.status === "expired" ? "warning" : "neutral"}>{disputeStatus(record.status)}</Badge></div><p>{record.reason}</p><div className="registry-record-meta"><span>Opened by: {record.opener}</span><span>Created: {formatNsDate(record.created_at_ns)}</span></div>{resolution ? <div className="registry-criteria"><b>Resolution: {resolution.disposition}</b><p>{resolution.rationale}</p><small>Resolved by {resolution.resolver} · {formatNsDate(resolution.resolved_at_ns)}</small></div> : record.status === "resolved" ? <p className="registry-note">The dispute record is resolved, but no resolution detail was returned.</p> : <p className="registry-note">Current contract status: {disputeStatus(record.status)}. No resolution is recorded.</p>}</Card>)}</div> : <Card className="registry-passport-card"><div className="registry-state">No disputes are recorded for this token’s commitments or evidence.</div></Card>}</section>
  </>;
}

function disputeStatus(status: string): string {
  if (status === "under_review") return "Under review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
