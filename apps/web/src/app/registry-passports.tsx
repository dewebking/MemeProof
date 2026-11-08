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
  if (current?.error) return <section className="panel"><ErrorState error={current.error} onRetry={retryRead} /></section>;
  if (!current?.value) return <section className="panel"><LoadingState /></section>;
  if (current.value.length === 0) return <section className="panel"><div className="registry-state"><b>No tokens are registered in MemeProof yet.</b><span>Registration is matched by the testnet network and full token contract address, never by ticker.</span><Link className="button button-primary button-small" href="/register-token">Register a token</Link></div></section>;
  return <section className="panel registry-directory"><div className="panel-heading"><div><h2>Registered token identities</h2><p>On-chain MemeProof registry records · NEAR testnet</p></div><span>{current.value.length.toLocaleString()} tokens</span></div>{current.value.map((token) => <article className="registry-directory-row" key={String(token.id)}><div><span className="eyebrow">TOKEN RECORD #{String(token.id)}</span><b>{identityText(token.identity)}</b><small>Registrant {token.registrant} · {formatNsDate(token.created_at_ns)}</small></div><Link className="text-link" href={`/passport/registry/${token.id}`}>Open passport ↗</Link></article>)}</section>;
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
  if (current?.error) return <section className="page-content"><ErrorState error={current.error} onRetry={retryRead} /></section>;
  if (!current?.value) return <section className="page-content"><LoadingState /></section>;
  if (!current.value.token) return <section className="page-content"><Card className="passport-state"><Badge variant="warning">Registration not found</Badge><h1>No token record #{tokenRecordId}</h1><p>This token ID is not registered in the configured MemeProof testnet registry.</p><Link className="button button-secondary" href="/passport">Browse registered tokens</Link></Card></section>;
  return <div className="token-passport"><div className="passport-back"><Link href="/passport" className="button button-quiet">← Registry directory</Link><span className="eyebrow">MEMEPROOF TESTNET REGISTRY</span></div><Card className="passport-hero"><div className="passport-identity"><span className="eyebrow">REGISTERED TOKEN · RECORD #{String(current.value.token.id)}</span><h1>{current.value.token.identity.token_contract_address}</h1><p>Canonical identity: {identityText(current.value.token.identity)}</p><Badge variant="success">Registered · {current.value.token.status}</Badge></div><div className="passport-identifiers"><div className="passport-copy"><span><small>Registrant</small><code>{current.value.token.registrant}</code></span></div><div className="passport-copy"><span><small>Registered</small><code>{formatNsDate(current.value.token.created_at_ns)}</code></span></div></div></Card><TokenAccountability records={current.value.records!} /></div>;
}

export function TokenAccountability({ records }: { records: TokenPassportRecords }) {
  return <>
    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF COMMITMENTS</span><h2>Recorded commitments</h2></div></div>{records.commitments.length ? records.commitments.map(({ record, versions, evidence }) => <Card className="registry-passport-card" id={`commitment-${record.commitment.id}`} key={String(record.commitment.id)}><div className="registry-record-heading"><div><span className="eyebrow">COMMITMENT #{String(record.commitment.id)} · VERSION {record.current_version.version}</span><h3>{record.current_version.title}</h3></div><Badge variant="neutral">Record only</Badge></div><p>{record.current_version.description}</p><div className="registry-criteria"><b>Success criteria recorded</b><p>{record.current_version.criteria}</p></div><div className="registry-record-meta"><span>Creator: {record.commitment.creator}</span><span>Created: {formatNsDate(record.commitment.created_at_ns)}</span><span>Deadline: {formatNsDate(record.current_version.deadline_at_ns)}</span></div>{versions.length > 1 && <details className="registry-version-history"><summary>Earlier commitment versions ({versions.length - 1})</summary>{versions.filter((version) => version.version !== record.current_version.version).map((version) => <article key={version.version}><b>Version {version.version} · {version.title}</b><p>{version.description}</p><small>Criteria: {version.criteria} · Deadline: {formatNsDate(version.deadline_at_ns)}</small></article>)}</details>}<p className="registry-note">No PASS or FAIL is inferred from the deadline, evidence, or community reviews.</p><div className="registry-related-links">{evidence.flatMap(({ record: item, reviews }) => [<a key={`evidence-${item.id}`} href={`#evidence-${item.id}`}>Evidence #{String(item.id)} ↓</a>, ...reviews.map((review) => <a key={`review-${review.id}`} href={`#review-${review.id}`}>Review #{String(review.id)} ↓</a>), ...records.disputes.filter(({ record: dispute }) => String(dispute.evidence_id) === String(item.id)).map(({ record: dispute }) => <a key={`dispute-${dispute.id}`} href={`#dispute-${dispute.id}`}>Dispute #{String(dispute.id)} ↓</a>)] )}{records.disputes.filter(({ record: dispute }) => String(dispute.commitment_id) === String(record.commitment.id)).map(({ record: dispute }) => <a key={`dispute-${dispute.id}`} href={`#dispute-${dispute.id}`}>Dispute #{String(dispute.id)} ↓</a>)}</div>{evidence.length > 0 && <div className="registry-nested-records"><h4>Evidence & community reviews</h4>{evidence.map(({ record: item, reviews }) => <div className="registry-evidence" id={`evidence-${item.id}`} key={String(item.id)}><div className="registry-record-heading"><b>Evidence #{String(item.id)} · version {item.version}</b><small>{formatNsDate(item.submitted_at_ns)}</small></div><p>Submitted by {item.submitter}</p><p>Reference: <code>{item.reference}</code></p><p>Content hash: <code>{item.content_hash}</code></p>{reviews.length ? <div className="registry-review-list"><b>Community reviews ({reviews.length})</b>{reviews.map((review) => <article id={`review-${review.id}`} key={String(review.id)}><span>Review #{String(review.id)} · {review.outcome}</span><small>By {review.reviewer} · {formatNsDate(review.submitted_at_ns)}</small><p>{review.explanation}</p></article>)}<small className="registry-note">Community reviews are attributed opinions; they do not determine a final verdict.</small></div> : <p className="registry-note">No community reviews recorded for this evidence.</p>}</div>)}</div>}</Card>) : <Card className="registry-passport-card"><div className="registry-state">This token is registered, but no commitments have been recorded for it.</div></Card>}</section>
    <section className="passport-section"><div className="passport-section-heading"><div><span className="eyebrow">MEMEPROOF DISPUTES</span><h2>Dispute history</h2></div></div>{records.disputes.length ? <div className="registry-dispute-list">{records.disputes.map(({ record, resolution }) => <Card className="registry-passport-card" id={`dispute-${record.id}`} key={String(record.id)}><div className="registry-record-heading"><div><span className="eyebrow">DISPUTE #{String(record.id)}</span><h3>Commitment #{String(record.commitment_id)}{record.evidence_id !== null ? ` · Evidence #${String(record.evidence_id)}` : ""}</h3></div><Badge variant={record.status === "resolved" ? "info" : record.status === "expired" ? "warning" : "neutral"}>{disputeStatus(record.status)}</Badge></div><p>{record.reason}</p><div className="registry-record-meta"><span>Opened by: {record.opener}</span><span>Created: {formatNsDate(record.created_at_ns)}</span></div>{resolution ? <div className="registry-criteria"><b>Resolution: {resolution.disposition}</b><p>{resolution.rationale}</p><small>Resolved by {resolution.resolver} · {formatNsDate(resolution.resolved_at_ns)}</small></div> : record.status === "resolved" ? <p className="registry-note">The dispute record is resolved, but no resolution detail was returned.</p> : <p className="registry-note">Current contract status: {disputeStatus(record.status)}. No resolution is recorded.</p>}</Card>)}</div> : <Card className="registry-passport-card"><div className="registry-state">No disputes are recorded for this token’s commitments or evidence.</div></Card>}</section>
  </>;
}

function disputeStatus(status: string): string {
  if (status === "under_review") return "Under review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
