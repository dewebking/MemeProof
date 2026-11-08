"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCommitmentsForCreator,
  getRegistrySummary,
  historyKind,
  type RegistrySummary,
} from "../lib/near/registry-data";
import type { CommitmentWithCurrentVersion, HistoryEvent } from "../lib/near/registry";
import { explainTransactionError, getRegistryClient } from "../lib/near/registry";
import { useNearWallet } from "./wallet-context";

function useReload() {
  const [reload, setReload] = useState(0);
  return [reload, () => setReload((value) => value + 1)] as const;
}

function LoadMessage({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error) return <div className="registry-state registry-error" role="alert"><b>Registry data could not be loaded.</b><span>{error}</span><button className="button button-secondary button-small" onClick={onRetry}>Try again</button></div>;
  return <div className="registry-state" role="status">Loading records from the NEAR testnet registry…</div>;
}

function eventPayload(event: HistoryEvent): Record<string, unknown> {
  const value = event.kind[historyKind(event)];
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function eventTitle(event: HistoryEvent): string {
  const kind = historyKind(event);
  const titles: Record<string, string> = {
    token_registered: "Token registered",
    commitment_created: "Commitment created",
    commitment_amended: "Commitment amended",
    evidence_submitted: "Evidence submitted",
    review_recorded: "Community review recorded",
    dispute_raised: "Dispute raised",
    dispute_responded: "Dispute response submitted",
    dispute_resolver_proposed: "Dispute resolver proposed",
    dispute_resolver_accepted: "Dispute resolver accepted",
    dispute_party_accepted_resolver: "Dispute resolver accepted by party",
    dispute_nominee_accepted: "Dispute nominee accepted",
    dispute_under_review: "Dispute entered review",
    dispute_resolved: "Dispute resolved",
    dispute_expired: "Dispute expired",
  };
  return titles[kind] ?? "Registry event";
}

function eventCategory(event: HistoryEvent): "commitment" | "evidence" | "review" | "dispute" | "token" {
  const kind = historyKind(event);
  if (kind.startsWith("dispute_")) return "dispute";
  if (kind === "evidence_submitted") return "evidence";
  if (kind === "review_recorded") return "review";
  if (kind.startsWith("commitment_")) return "commitment";
  return "token";
}

function formatDate(value: number | string): string {
  try {
    const ms = Number(BigInt(value) / BigInt(1_000_000));
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return "Date unavailable";
  }
}

function EventItem({ event }: { event: HistoryEvent }) {
  const payload = eventPayload(event);
  const related = payload.commitment_id ?? payload.evidence_id ?? payload.review_id ?? payload.dispute_id ?? payload.token_id;
  const kind = eventCategory(event);
  return <article className="registry-event"><span className="registry-event-mark">{kind.slice(0, 1).toUpperCase()}</span><div className="registry-event-copy"><b>{eventTitle(event)}</b><small>{event.actor} · {formatDate(event.occurred_at_ns)}</small>{related !== undefined && <small>{kind === "token" ? "Token" : kind.charAt(0).toUpperCase() + kind.slice(1)} #{String(related)}</small>}</div><span className="registry-event-id">Event #{String(event.id)}</span></article>;
}

function CommitmentItem({ record }: { record: CommitmentWithCurrentVersion }) {
  return <article className="registry-commitment"><div><span className="eyebrow">COMMITMENT #{String(record.commitment.id)} · TOKEN #{String(record.commitment.token_id)}</span><h3>{record.current_version.title}</h3><p>{record.current_version.description}</p><small>Created {formatDate(record.commitment.created_at_ns)} · Version {record.commitment.current_version} · Deadline {formatDate(record.current_version.deadline_at_ns)}</small></div><Link className="text-link" href={`/passport/${record.commitment.token_id}`}>View passport ↗</Link></article>;
}

export function OverviewRegistryView() {
  const [reload, retry] = useReload();
  const [result, setResult] = useState<{ key: number; summary?: RegistrySummary; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void getRegistrySummary(getRegistryClient()).then((summary) => { if (active) setResult({ key: reload, summary }); }).catch((cause: unknown) => { if (active) setResult({ key: reload, error: explainTransactionError(cause) }); });
    return () => { active = false; };
  }, [reload]);
  const summary = result?.key === reload ? result.summary ?? null : null;
  const error = result?.key === reload ? result.error ?? null : null;
  if (!summary) return <LoadMessage error={error} onRetry={retry} />;
  const metrics = [
    ["Registered tokens", summary.tokenCount, "On-chain token records", "◎"],
    ["Commitments", summary.commitmentCount, "Created commitment records", "◷"],
    ["Evidence", summary.evidenceCount, "Evidence submissions", "↗"],
    ["Reviews / disputes", summary.reviewCount + summary.disputeCount, `${summary.reviewCount} reviews · ${summary.disputeCount} disputes`, "!"],
  ] as const;
  return <>
    <div className="stat-ribbon" aria-label="Registry summary"><div className="stat-ribbon-label"><span className="eyebrow">REGISTRY SNAPSHOT</span><small>Counts from testnet records and history</small></div>{metrics.map(([label, value, note, mark]) => <article className="metric-card" key={label}><div className="metric-top"><span>{label}</span><i>{mark}</i></div><strong>{value.toLocaleString()}</strong><small>{note}</small></article>)}</div>
    <div className="overview-grid dashboard-lower"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">LATEST RECORDS</span><h2>Recent activity</h2><p>Recent events read from the registry history.</p></div><Link href="/activity">Activity log ↗</Link></div>{summary.events.length ? <div className="registry-event-list">{summary.events.slice(0, 5).map((event) => <EventItem key={String(event.id)} event={event} />)}</div> : <div className="registry-state">No registry events have been recorded yet.</div>}</section><MyCommitmentsPreview /></div>
  </>;
}

function MyCommitmentsPreview() {
  const { accountId, state } = useNearWallet();
  const key = `${accountId ?? ""}:${state}`;
  const [result, setResult] = useState<{ key: string; records?: CommitmentWithCurrentVersion[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!accountId || state !== "connected") return () => { active = false; };
    void getCommitmentsForCreator(getRegistryClient(), accountId).then((records) => { if (active) setResult({ key, records }); }).catch((cause: unknown) => { if (active) setResult({ key, error: explainTransactionError(cause) }); });
    return () => { active = false; };
  }, [accountId, state, key]);
  const records = result?.key === key ? result.records ?? null : null;
  const error = result?.key === key ? result.error : null;
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CREATOR VIEW</span><h2>My commitments</h2><p>Your commitments published from this account.</p></div><Link href="/my-commitments">Open ↗</Link></div>{state === "restoring" || state === "connecting" ? <div className="registry-state">Restoring wallet connection…</div> : !accountId ? <div className="registry-state">Connect a NEAR testnet wallet to view its commitments.</div> : error ? <div className="registry-state registry-error" role="alert">{error}</div> : records === null ? <div className="registry-state" role="status">Loading your registry commitments…</div> : records.length ? <div className="registry-commitment-list">{records.slice(0, 3).map((record) => <CommitmentItem key={String(record.commitment.id)} record={record} />)}</div> : <div className="registry-state">No commitments are associated with {accountId} yet.<p><Link href="/create-commitment">Create a commitment ↗</Link></p></div>}</section>;
}

export function MyCommitmentsView() {
  const { accountId, state } = useNearWallet();
  const [reload, retry] = useReload();
  const key = `${accountId ?? ""}:${state}:${reload}`;
  const [result, setResult] = useState<{ key: string; records?: CommitmentWithCurrentVersion[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!accountId || state !== "connected") return () => { active = false; };
    void getCommitmentsForCreator(getRegistryClient(), accountId).then((records) => { if (active) setResult({ key, records }); }).catch((cause: unknown) => { if (active) setResult({ key, error: explainTransactionError(cause) }); });
    return () => { active = false; };
  }, [accountId, state, key]);
  const records = result?.key === key ? result.records ?? null : null;
  const error = result?.key === key ? result.error ?? null : null;
  if (state === "restoring" || state === "connecting") return <div className="panel"><div className="registry-state" role="status">Restoring wallet connection…</div></div>;
  if (!accountId) return <div className="panel"><div className="registry-state">Connect a NEAR testnet wallet to see commitments created by that account.</div></div>;
  if (!records) return <div className="panel"><LoadMessage error={error} onRetry={retry} /></div>;
  return <section className="panel"><div className="panel-heading"><div><h2>Commitment history</h2><p>Created by {accountId}. Original commitment records and current versions come from the registry.</p></div><button className="button button-secondary button-small" onClick={retry}>Refresh</button></div>{records.length ? <div className="registry-commitment-list">{records.map((record) => <CommitmentItem key={String(record.commitment.id)} record={record} />)}</div> : <div className="registry-state">No commitments are associated with {accountId} yet.<p><Link href="/create-commitment">Create a commitment ↗</Link></p></div>}</section>;
}

export function ActivityRegistryView() {
  const [reload, retry] = useReload();
  const [result, setResult] = useState<{ key: number; summary?: RegistrySummary; error?: string } | null>(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    let active = true;
    void getRegistrySummary(getRegistryClient()).then((summary) => { if (active) setResult({ key: reload, summary }); }).catch((cause: unknown) => { if (active) setResult({ key: reload, error: explainTransactionError(cause) }); });
    return () => { active = false; };
  }, [reload]);
  const summary = result?.key === reload ? result.summary ?? null : null;
  const error = result?.key === reload ? result.error ?? null : null;
  const events = summary?.events.filter((event) => filter === "all" || eventCategory(event) === filter) ?? [];
  return <section className="panel"><div className="panel-heading"><div><h2>All recorded events</h2><p>Append-only history from the NEAR registry, attributed to each actor.</p></div><div className="registry-toolbar"><select aria-label="Filter activity" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All activity</option><option value="commitment">Commitments</option><option value="evidence">Evidence</option><option value="review">Reviews</option><option value="dispute">Disputes</option><option value="token">Tokens</option></select><button className="button button-secondary button-small" onClick={retry}>Refresh</button></div></div>{!summary ? <LoadMessage error={error} onRetry={retry} /> : events.length ? <div className="registry-event-list">{events.map((event) => <EventItem key={String(event.id)} event={event} />)}</div> : <div className="registry-state">{filter === "all" ? "No registry events have been recorded yet." : `No ${filter} events have been recorded yet.`}</div>}</section>;
}
