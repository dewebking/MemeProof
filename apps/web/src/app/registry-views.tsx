"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getAllHistoryEvents,
  getRegistrySummary,
  historyKind,
  mapWithConcurrency,
  type RegistrySummary,
} from "../lib/near/registry-data";
import type { CommitmentWithCurrentVersion, HistoryEvent, TokenRecord } from "../lib/near/registry";
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

function eventRecord(payload: Record<string, unknown>, category: ReturnType<typeof eventCategory>) {
  const fields = { token: ["token_id", "Token"], commitment: ["commitment_id", "Commitment"], evidence: ["evidence_id", "Evidence"], review: ["review_id", "Review"], dispute: ["dispute_id", "Dispute"] } as const;
  const [field, label] = fields[category];
  const value = payload[field];
  return value === undefined ? null : { label, id: String(value) };
}

function EventSymbol({ kind }: { kind: ReturnType<typeof eventCategory> }) {
  const shapes = {
    token: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></>,
    commitment: <><path d="M7 4h10l3 3v13H7z"/><path d="M17 4v4h4M10 12h7M10 16h5M4 8v13h12"/></>,
    evidence: <><path d="M8 3h8l5 5v13H8z"/><path d="M16 3v6h5M11 14h7M11 18h5M4 11l-2 3 2 3"/></>,
    review: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/><path d="m16 5 1.5 1.5L20 4"/></>,
    dispute: <><path d="M12 3 21 19H3L12 3Z"/><path d="M12 9v4M12 16h.01"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{shapes[kind]}</svg>;
}

function formatDate(value: number | string): string {
  try {
    const ms = Number(BigInt(value) / BigInt(1_000_000));
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return "Date unavailable";
  }
}

function deadlineState(value: number | string): { label: string; passed: boolean } {
  try {
    const deadlineMs = Number(BigInt(value) / BigInt(1_000_000));
    const passed = deadlineMs < Date.now();
    return { label: passed ? "Deadline passed · outcome unresolved" : "Deadline ahead", passed };
  } catch {
    return { label: "Deadline unavailable", passed: false };
  }
}

function EventItem({ event }: { event: HistoryEvent }) {
  const kind = eventCategory(event);
  const record = eventRecord(eventPayload(event), kind);
  const href = kind === "token" && record ? `/passport/registry/${record.id}` : `/activity#event-${String(event.id)}`;
  const date = new Date(Number(BigInt(event.occurred_at_ns) / BigInt(1_000_000)));
  return <article className={`registry-event registry-event-${kind}`} id={`event-${String(event.id)}`}><span className="registry-event-mark"><EventSymbol kind={kind} /></span><div className="registry-event-copy"><b>{eventTitle(event)}</b><small><span>By</span> {event.actor} <i aria-hidden="true">·</i> <time dateTime={date.toISOString()}>{formatDate(event.occurred_at_ns)}</time></small>{record && <small className="registry-event-record">{record.label} <b>#{record.id}</b></small>}</div><Link className="registry-event-link" href={href}>{kind === "token" ? "Open passport" : `Open event #${String(event.id)}`} <span aria-hidden="true">↗</span></Link></article>;
}

type CreatorCommitment = { record: CommitmentWithCurrentVersion; token: TokenRecord | null; activity: HistoryEvent[] };
type CreatorCommitmentPage = { records: CreatorCommitment[]; total: number; evidenceCount: number; reviewCount: number };

async function loadCreatorCommitmentPage(accountId: string, offset: number, limit: number, suppliedEvents?: HistoryEvent[]): Promise<CreatorCommitmentPage> {
  const client = getRegistryClient();
  const events = suppliedEvents ?? await getAllHistoryEvents(client);
  const created = new Map<string, HistoryEvent>();
  for (const event of events) {
    if (event.actor !== accountId || historyKind(event) !== "commitment_created") continue;
    const id = eventPayload(event).commitment_id;
    if (id !== undefined) created.set(String(id), event);
  }
  const ids = [...created.entries()].sort((a, b) => {
    const left = BigInt(a[1].occurred_at_ns);
    const right = BigInt(b[1].occurred_at_ns);
    return left === right ? 0 : left > right ? -1 : 1;
  });
  const creatorIds = new Set(ids.map(([id]) => id));
  const activityByCommitment = new Map<string, HistoryEvent[]>();
  let evidenceCount = 0;
  let reviewCount = 0;
  for (const event of events) {
    const payload = eventPayload(event);
    const id = payload.commitment_id;
    if (id === undefined || !creatorIds.has(String(id))) continue;
    const activity = activityByCommitment.get(String(id)) ?? [];
    activity.push(event);
    activityByCommitment.set(String(id), activity);
    if (historyKind(event) === "evidence_submitted") evidenceCount += 1;
    if (historyKind(event) === "review_recorded") reviewCount += 1;
  }
  const pageIds = ids.slice(offset, offset + limit);
  const commitments = await mapWithConcurrency(pageIds, 4, ([id]) => client.getCommitment(id));
  const records = await mapWithConcurrency(commitments.filter((record): record is CommitmentWithCurrentVersion => record !== null), 4, async (record) => ({
    record,
    token: await client.getToken(record.commitment.token_id),
    activity: activityByCommitment.get(String(record.commitment.id)) ?? [],
  }));
  return { records, total: ids.length, evidenceCount, reviewCount };
}

function CommitmentItem({ item, variant = "history" }: { item: CreatorCommitment; variant?: "overview" | "history" | "profile" }) {
  const { record, token } = item;
  const timing = deadlineState(record.current_version.deadline_at_ns);
  return (
    <article className={`registry-commitment registry-commitment-${variant}`}>
      <div className="registry-commitment-copy">
        <div className="registry-commitment-topline"><span className="eyebrow">COMMITMENT #{String(record.commitment.id)}</span><span className={`registry-commitment-status ${timing.passed ? "is-past" : ""}`}><i aria-hidden="true" />{timing.label}</span></div>
        <h3>{record.current_version.title}</h3>
        <p>{record.current_version.description}</p>
        <div className="registry-commitment-identity">
          <small>Token identity</small>
          {token ? <>
            <span>NEAR {token.identity.network_id} · Registry token #{String(token.id)}{token.identity.token_contract_address === "ddddd" ? " · TEST RECORD" : ""}</span>
            <code title={token.identity.token_contract_address}>{token.identity.token_contract_address}{token.identity.token_contract_address === "ddddd" ? " — placeholder test data" : ""}</code>
          </> : <b>Identity unavailable · Registry token #{String(record.commitment.token_id)}</b>}
        </div>
        <div className="registry-commitment-meta">
          <span>Current version <b>{record.commitment.current_version}</b></span>
          <span>Deadline <b>{formatDate(record.current_version.deadline_at_ns)}</b></span>
          <span>Created <b>{formatDate(record.commitment.created_at_ns)}</b></span>
        </div>
        <div className="registry-commitment-activity" aria-label="Related registry activity">
          <span>{item.activity.filter((event) => historyKind(event) === "evidence_submitted").length} evidence</span>
          <span>{item.activity.filter((event) => historyKind(event) === "review_recorded").length} community reviews</span>
        </div>
        <small className="registry-record-only">On-chain record · A deadline alone does not determine the outcome.</small>
      </div>
      <Link className="registry-open-record" href={`/passport/registry/${record.commitment.token_id}#commitment-${record.commitment.id}`}>
        View commitment <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
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
    ["Registered tokens", summary.tokenCount, "Testnet token records", "token"],
    ["Commitments", summary.commitmentCount, "Promises entered in the registry", "commitment"],
    ["Evidence submissions", summary.evidenceCount, "Supporting records attached", "evidence"],
    ["Community reviews", summary.reviewCount, "Independent assessments recorded", "review"],
    ["Disputes", summary.disputeCount, "Disputes raised in the registry", "dispute"],
  ] as const;
  return <>
    <section className="overview-stat-section" aria-labelledby="registry-stat-title"><div className="overview-section-heading"><div><span className="eyebrow">THE REGISTRY, AT A GLANCE</span><h2 id="registry-stat-title">An open record of follow-through.</h2></div><span>Counts from NEAR testnet records</span></div><div className="overview-stat-grid" aria-label="Registry summary">{metrics.map(([label, value, note, mark]) => <article className={`overview-stat-card overview-stat-${mark}`} key={label}><div className="overview-stat-top"><span>{label}</span><i aria-hidden="true"><EventSymbol kind={mark} /></i></div><strong>{value.toLocaleString()}</strong><small>{note}</small><span className="overview-stat-rule" aria-hidden="true" /></article>)}</div></section>
    <div className="overview-grid dashboard-lower"><section className="panel overview-activity"><div className="panel-heading"><div><span className="eyebrow">APPEND-ONLY PUBLIC RECORD</span><h2>Latest activity</h2><p>Each event is attributed and timestamped on the testnet registry.</p></div><Link href="/activity">All activity <span aria-hidden="true">↗</span></Link></div>{summary.events.length ? <div className="registry-event-list">{summary.events.slice(0, 5).map((event) => <EventItem key={String(event.id)} event={event} />)}</div> : <div className="registry-state">No registry events have been recorded yet.</div>}</section><MyCommitmentsPreview events={summary.events} /></div>
  </>;
}

function MyCommitmentsPreview({ events }: { events: HistoryEvent[] }) {
  const { accountId, state } = useNearWallet();
  const key = `${accountId ?? ""}:${state}`;
  const [result, setResult] = useState<{ key: string; page?: CreatorCommitmentPage; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!accountId || state !== "connected") return () => { active = false; };
    void loadCreatorCommitmentPage(accountId, 0, 3).then((page) => { if (active) setResult({ key, page }); }).catch((cause: unknown) => {
      if (active) setResult({ key, error: explainTransactionError(cause) });
    });
    return () => { active = false; };
  }, [accountId, state, key, events]);
  const current = result?.key === key ? result : null;
  const ownEvents = accountId ? events.filter((event) => event.actor === accountId).slice(0, 3) : [];
  return <section className="panel creator-workspace">
    <div className="creator-workspace-heading">
      <div><span className="eyebrow">YOUR CREATOR WORKSPACE</span><h2>Your commitments</h2><p>Promises recorded by this NEAR account, with their evidence and review trail.</p></div>
      <Link href="/my-commitments">Commitment history <span aria-hidden="true">↗</span></Link>
    </div>
    {state === "restoring" || state === "connecting" ? <div className="creator-workspace-state" role="status">Restoring wallet connection…</div>
      : !accountId ? <div className="creator-workspace-state">Connect a NEAR testnet wallet to see its creator records.</div>
      : current?.error ? <div className="creator-workspace-state is-error" role="alert"><span>{current.error}</span><Link href="/my-commitments">Open commitment history</Link></div>
      : !current?.page ? <div className="creator-workspace-state" role="status">Loading your commitment records…</div>
      : <>
        <div className="creator-workspace-summary"><span><b>{current.page.total.toLocaleString()}</b> {current.page.total === 1 ? "commitment" : "commitments"}</span><span><b>{current.page.evidenceCount.toLocaleString()}</b> evidence submissions</span><span><b>{current.page.reviewCount.toLocaleString()}</b> community reviews</span></div>
        {current.page.records.length > 0 ? <div className="registry-commitment-list">{current.page.records.map((item) => <CommitmentItem key={String(item.record.commitment.id)} item={item} variant="overview" />)}</div>
          : <div className="creator-workspace-state creator-workspace-empty">No commitments are associated with this account yet.<Link href="/create-commitment">Create a commitment <span aria-hidden="true">↗</span></Link></div>}
        {current.page.total > 3 && <Link className="creator-workspace-more" href="/my-commitments">View all {current.page.total.toLocaleString()} commitments <span aria-hidden="true">↗</span></Link>}
        {ownEvents.length > 0 && <div className="creator-workspace-recent"><div><b>Latest account activity</b><Link href="/activity">Full activity log <span aria-hidden="true">↗</span></Link></div><div className="creator-workspace-events">{ownEvents.map((event) => <EventItem key={String(event.id)} event={event} />)}</div></div>}
      </>}
  </section>;
}

const COMMITMENT_PAGE_SIZE = 10;

export function MyCommitmentsView({ variant = "history" }: { variant?: "history" | "profile" }) {
  const { accountId, state } = useNearWallet();
  const [reload, retry] = useReload();
  const key = `${accountId ?? ""}:${state}:${reload}:${variant}`;
  const firstPageSize = variant === "profile" ? 3 : COMMITMENT_PAGE_SIZE;
  const [result, setResult] = useState<{ key: string; page?: CreatorCommitmentPage; loadingMore?: boolean; error?: string; moreError?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!accountId || state !== "connected") return () => { active = false; };
    void loadCreatorCommitmentPage(accountId, 0, firstPageSize).then((page) => { if (active) setResult({ key, page }); }).catch((cause: unknown) => {
      if (active) setResult({ key, error: explainTransactionError(cause) });
    });
    return () => { active = false; };
  }, [accountId, state, key, firstPageSize]);
  const current = result?.key === key ? result : null;

  async function loadOlder() {
    if (!accountId || !current?.page || current.loadingMore) return;
    setResult({ ...current, loadingMore: true, moreError: undefined });
    try {
      const next = await loadCreatorCommitmentPage(accountId, current.page.records.length, COMMITMENT_PAGE_SIZE);
      setResult((latest) => latest?.key === key && latest.page
        ? { key, page: { ...latest.page, records: [...latest.page.records, ...next.records] }, loadingMore: false }
        : latest);
    } catch (cause) {
      setResult((latest) => latest?.key === key ? { ...latest, loadingMore: false, moreError: explainTransactionError(cause) } : latest);
    }
  }

  if (state === "restoring" || state === "connecting") return <div className={`creator-record-state ${variant}`} role="status">Restoring wallet connection…</div>;
  if (!accountId) return <div className={`creator-record-state ${variant}`}>Connect a NEAR testnet wallet to see commitments created by that account.</div>;
  if (current?.error) return <div className={`creator-record-state ${variant} is-error`} role="alert"><b>Registry history could not be loaded.</b><span>{current.error}</span><button type="button" className="button button-secondary button-small" onClick={retry}>Try again</button></div>;
  if (!current?.page) return <div className={`creator-record-state ${variant}`} role="status">Loading creator records from NEAR testnet…</div>;

  if (variant === "profile") return <section className="profile-commitment-activity">
    <div className="profile-commitment-heading"><div><span className="eyebrow">CREATOR RECORD</span><h2>Commitment activity</h2></div><Link href="/my-commitments">Full history <span aria-hidden="true">↗</span></Link></div>
    <div className="profile-commitment-stats"><span><b>{current.page.total.toLocaleString()}</b> commitments</span><span><b>{current.page.evidenceCount.toLocaleString()}</b> evidence</span><span><b>{current.page.reviewCount.toLocaleString()}</b> community reviews</span></div>
    {current.page.records.length ? <div className="profile-commitment-list">{current.page.records.map((item) => <CommitmentItem key={String(item.record.commitment.id)} item={item} variant="profile" />)}</div>
      : <div className="profile-commitment-empty">No commitments have been recorded by this account yet.<Link href="/create-commitment">Make a commitment <span aria-hidden="true">↗</span></Link></div>}
  </section>;

  return <section className="commitment-history">
    <header className="commitment-history-heading"><div><span className="eyebrow">ON-CHAIN CREATOR RECORD</span><h2>Commitment history</h2><p>Created by <b>{accountId}</b>. Review the current terms and the record trail for each promise.</p></div><button type="button" className="button button-secondary button-small" onClick={retry}>Refresh records</button></header>
    <div className="commitment-history-count"><span>Showing <b>{current.page.records.length.toLocaleString()}</b> of <b>{current.page.total.toLocaleString()}</b> commitments</span><span>Newest first · NEAR testnet</span></div>
    {current.page.records.length ? <div className="registry-commitment-list">{current.page.records.map((item) => <CommitmentItem key={String(item.record.commitment.id)} item={item} variant="history" />)}</div>
      : <div className="commitment-history-empty"><span>NO CREATOR RECORDS YET</span><b>Your promises appear here after they are recorded on NEAR.</b><Link className="button button-primary button-small" href="/create-commitment">Create a commitment</Link></div>}
    {current.moreError && <p className="commitment-history-error" role="alert">Could not load older records: {current.moreError}</p>}
    {current.page.records.length < current.page.total && <button type="button" className="commitment-history-more" disabled={current.loadingMore} onClick={() => void loadOlder()}>{current.loadingMore ? "Loading older records…" : "Load older commitments"}</button>}
  </section>;
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
  return <section className="panel activity-ledger"><div className="panel-heading"><div><span className="eyebrow">APPEND-ONLY PUBLIC RECORD</span><h2>All recorded events</h2><p>Chronological events from the NEAR registry, attributed to each actor.</p></div><div className="registry-toolbar"><label><span className="visually-hidden">Filter activity</span><select aria-label="Filter activity" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All activity</option><option value="commitment">Commitments</option><option value="evidence">Evidence</option><option value="review">Reviews</option><option value="dispute">Disputes</option><option value="token">Tokens</option></select></label><button className="button button-secondary button-small" onClick={retry}>Refresh</button></div></div>{!summary ? <LoadMessage error={error} onRetry={retry} /> : events.length ? <div className="registry-event-list">{events.map((event) => <EventItem key={String(event.id)} event={event} />)}</div> : <div className="registry-state">{filter === "all" ? "No registry events have been recorded yet." : `No ${filter} events have been recorded yet.`}</div>}</section>;
}
