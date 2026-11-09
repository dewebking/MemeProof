"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  getAllCommitments,
  getAllDisputes,
  getAllEvidences,
  getAllHistoryEvents,
  getCommitmentVersionsForCommitment,
  getReviewsForEvidence,
  mapWithConcurrency,
} from "../lib/near/registry-data";
import type {
  CommitmentVersion,
  CommitmentWithCurrentVersion,
  DisputeDisposition,
  DisputeRecord,
  DisputeResponse,
  DisputeResolutionRecord,
  DisputeStatus,
  EvidenceRecord,
  HistoryEvent,
  ReviewOutcome,
  ReviewRecord,
  TokenRecord,
} from "../lib/near/registry";
import { explainTransactionError, getRegistryClient } from "../lib/near/registry";
import { useNearWallet } from "./wallet-context";
import { positiveU32, positiveU64, storageAllowance, validPublicReference, validateSha256 } from "./registry-actions";

type CommitmentChoice = {
  record: CommitmentWithCurrentVersion;
  token: TokenRecord | null;
};
type EvidenceChoice = {
  record: EvidenceRecord;
  commitment: CommitmentWithCurrentVersion | null;
  token: TokenRecord | null;
};
type LoadState<T> = { value: T | null; error: string | null; loading: boolean; retry: () => void };

function useReload() {
  const [revision, setRevision] = useState(0);
  return [revision, () => setRevision((value) => value + 1)] as const;
}

function useCommitmentChoices(): LoadState<CommitmentChoice[]> {
  const [revision, retry] = useReload();
  const [state, setState] = useState<{ revision: number; value?: CommitmentChoice[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const client = getRegistryClient();
    void getAllCommitments(client).then(async (records) => {
      const values = await mapWithConcurrency(records, 6, async (record) => ({
        record,
        token: await client.getToken(record.commitment.token_id),
      }));
      if (active) setState({ revision, value: values });
    }).catch((cause: unknown) => {
      if (active) setState({ revision, error: explainTransactionError(cause) });
    });
    return () => { active = false; };
  }, [revision]);
  const current = state?.revision === revision ? state : null;
  return { value: current?.value ?? null, error: current?.error ?? null, loading: !current, retry };
}

function useCommitmentVersions(commitmentId: string): LoadState<CommitmentVersion[]> {
  const [revision, retry] = useReload();
  const key = `${commitmentId}:${revision}`;
  const [state, setState] = useState<{ key: string; value?: CommitmentVersion[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!commitmentId) return () => { active = false; };
    void getCommitmentVersionsForCommitment(getRegistryClient(), commitmentId)
      .then((value) => { if (active) setState({ key, value }); })
      .catch((cause: unknown) => { if (active) setState({ key, error: explainTransactionError(cause) }); });
    return () => { active = false; };
  }, [commitmentId, key]);
  const current = state?.key === key ? state : null;
  return { value: current?.value ?? null, error: current?.error ?? null, loading: Boolean(commitmentId) && !current, retry };
}

async function loadEvidenceChoices(): Promise<EvidenceChoice[]> {
  const client = getRegistryClient();
  const evidences = await getAllEvidences(client);
  const commitmentIds = [...new Set(evidences.map((item) => String(item.commitment_id)))];
  const commitments = await mapWithConcurrency(commitmentIds, 6, (id) => client.getCommitment(id));
  const commitmentMap = new Map(commitments.filter((item): item is CommitmentWithCurrentVersion => item !== null).map((item) => [String(item.commitment.id), item]));
  const tokenIds = [...new Set([...commitmentMap.values()].map((item) => String(item.commitment.token_id)))];
  const tokens = await mapWithConcurrency(tokenIds, 6, (id) => client.getToken(id));
  const tokenMap = new Map(tokens.filter((item): item is TokenRecord => item !== null).map((item) => [String(item.id), item]));
  return evidences.map((record) => {
      const commitment = commitmentMap.get(String(record.commitment_id)) ?? null;
      return { record, commitment, token: commitment ? tokenMap.get(String(commitment.commitment.token_id)) ?? null : null };
    }).sort((a, b) => {
      const left = BigInt(a.record.id); const right = BigInt(b.record.id);
      return left === right ? 0 : left > right ? -1 : 1;
    });
}

function useEvidenceChoices(): LoadState<EvidenceChoice[]> {
  const [revision, retry] = useReload();
  const [state, setState] = useState<{ revision: number; value?: EvidenceChoice[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void loadEvidenceChoices().then((value) => { if (active) setState({ revision, value }); }).catch((cause: unknown) => {
      if (active) setState({ revision, error: explainTransactionError(cause) });
    });
    return () => { active = false; };
  }, [revision]);
  const current = state?.revision === revision ? state : null;
  return { value: current?.value ?? null, error: current?.error ?? null, loading: !current, retry };
}

function useEvidenceReviews(evidenceId: string, accountId: string | null) {
  const [state, setState] = useState<{ key: string; reviews: ReviewRecord[]; error: string | null; loading: boolean }>({ key: "", reviews: [], error: null, loading: false });
  const key = evidenceId ? `${evidenceId}:${accountId ?? ""}` : "";
  useEffect(() => {
    let active = true;
    if (!evidenceId || !accountId) {
      return () => { active = false; };
    }
    void getReviewsForEvidence(getRegistryClient(), evidenceId).then((reviews) => {
      if (active) setState({ key, reviews, error: null, loading: false });
    }).catch((cause: unknown) => {
      if (active) setState({ key, reviews: [], error: explainTransactionError(cause), loading: false });
    });
    return () => { active = false; };
  }, [evidenceId, accountId, key]);
  return state.key === key ? state : { key, reviews: [], error: null, loading: Boolean(evidenceId && accountId) };
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={error ? "flow-notice flow-error" : "flow-notice"}>{children}</p>;
}

function WalletLine() {
  const { accountId, state } = useNearWallet();
  return accountId
    ? <p className="flow-wallet">Signing as <b>{accountId}</b> on NEAR testnet.</p>
    : <Notice>{state === "restoring" ? "Restoring your wallet sessionâ€¦" : "Connect a NEAR testnet wallet to submit a registry transaction."}</Notice>;
}

function TransactionState({ pending, error, result }: { pending: boolean; error: string | null; result: { title: string; id: string; hash: string | null } | null }) {
  return <>
    {pending && <div className="transaction-state" role="status"><span className="transaction-pulse"/><div><b>Wallet approval pending</b><p>Approve the request in your wallet. MemeProof will then wait for the NEAR testnet transaction result.</p></div></div>}
    {error && <Notice error>{error}</Notice>}
    {result && <section className="transaction-confirmed" aria-live="polite"><span className="flow-eyebrow">CONFIRMED ON NEAR TESTNET</span><h3>{result.title}</h3><p>Registry record <b>#{result.id}</b></p>{result.hash ? <p className="flow-hash"><span>Transaction</span><code>{result.hash}</code><a href={`https://explorer.testnet.near.org/transactions/${encodeURIComponent(result.hash)}`} target="_blank" rel="noreferrer">Open in NEAR explorer â†—</a></p> : <small>The wallet confirmed the transaction but did not return a transaction hash.</small>}</section>}
  </>;
}

function RecordLoading({ state, label, empty }: { state: LoadState<unknown>; label: string; empty: string }) {
  if (state.loading) return <Notice>Loading {label} from the NEAR testnet registryâ€¦</Notice>;
  if (state.error) return <Notice error>{state.error} <button type="button" className="flow-inline-button" onClick={state.retry}>Try again</button></Notice>;
  if (!state.value || (Array.isArray(state.value) && state.value.length === 0)) return <Notice>{empty}</Notice>;
  return null;
}

function commitmentLabel(choice: CommitmentChoice): string {
  const token = choice.token?.identity.token_contract_address ?? `Token record #${choice.record.commitment.token_id}`;
  return `${choice.record.current_version.title} Â· ${token} Â· v${choice.record.commitment.current_version}`;
}

function identityOf(token: TokenRecord | null, tokenId?: string | number): string {
  return token ? `${token.identity.network_id} Â· ${token.identity.token_contract_address}` : `Token contract identity unavailable${tokenId === undefined ? "" : ` Â· record #${tokenId}`}`;
}

function CopyHashCommand() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText('Get-FileHash -Algorithm SHA256 .\\path\\to\\your-file');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return <div className="hash-command"><div><small>Windows PowerShell example</small><code>Get-FileHash -Algorithm SHA256 .\path\to\your-file</code></div><button type="button" className="button button-secondary button-small" onClick={() => void copy()}>{copied ? "Copied" : "Copy command"}</button></div>;
}

export function EvidenceSubmissionExperience() {
  const { accountId, state, submitRegistryFunction, transactionPending } = useNearWallet();
  const choices = useCommitmentChoices();
  const [commitmentId, setCommitmentId] = useState("");
  const [version, setVersion] = useState("");
  const [reference, setReference] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [hashNote, setHashNote] = useState("");
  const [deposit, setDeposit] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ title: string; id: string; hash: string | null } | null>(null);
  const selected = choices.value?.find((item) => String(item.record.commitment.id) === commitmentId) ?? null;
  const versions = useCommitmentVersions(commitmentId);
  const selectedVersion = versions.value?.find((item) => String(item.version) === version) ?? null;

  function chooseCommitment(value: string) {
    setCommitmentId(value);
    const choice = choices.value?.find((item) => String(item.record.commitment.id) === value);
    setVersion(choice ? String(choice.record.commitment.current_version) : "");
  }

  async function hashLocalFile(file: File | undefined) {
    setHashNote("");
    if (!file) return;
    if (!globalThis.crypto?.subtle) {
      setHashNote("This browser cannot calculate a local hash. Use the PowerShell command below.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setHashNote("This file is larger than 100 MB. Use the local PowerShell command below to avoid loading it all into browser memory.");
      return;
    }
    setHashing(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      setContentHash([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
      setHashNote(`Fingerprint calculated locally for ${file.name}. The file was not uploaded.`);
    } catch {
      setHashNote("The browser could not read this file. Use the local PowerShell command below.");
    } finally {
      setHashing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setConfirmed(null);
    try {
      if (!selected) throw new Error("Choose a commitment from the registry.");
      if (!selectedVersion) throw new Error("Choose a version recorded for this commitment.");
      if (!validPublicReference(reference.trim())) throw new Error("Use a public HTTPS or IPFS link without spaces, fragments, or query parameters.");
      if (!validateSha256(contentHash.trim())) throw new Error("Enter the SHA-256 fingerprint as 64 hexadecimal characters.");
      const result = await submitRegistryFunction<EvidenceRecord>("submit_evidence", {
        commitment_id: String(selected.record.commitment.id),
        version: positiveU32(version, "commitment version"),
        reference: reference.trim(),
        content_hash: contentHash.trim().toLowerCase(),
      }, storageAllowance(deposit));
      setConfirmed({ title: "Evidence submission confirmed.", id: String(result.value.id), hash: result.transactionHash });
    } catch (cause) { setError(explainTransactionError(cause)); }
  }

  return <div className="guided-flow evidence-flow">
    <section className="flow-intro"><span className="flow-eyebrow">EVIDENCE / PUBLIC REFERENCE</span><h2>Evidence makes a promise verifiable.</h2><p>Evidence is the material that helps others verify whether a project&apos;s promise has been fulfilled.</p><div className="flow-callout"><b>Before you begin</b><span>Upload your file to a publicly accessible hosting service. MemeProof records its public link and SHA-256 fingerprint; it does not upload file contents or store them on-chain.</span></div></section>
    <section className="panel flow-panel"><form onSubmit={submit}>
      <div className="flow-step-heading"><span>01</span><div><h3>Choose the promise</h3><p>Select the commitment and version this material relates to.</p></div></div>
      <WalletLine />
      {choices.loading || choices.error || !choices.value?.length ? <RecordLoading state={choices} label="commitments" empty="No commitments are available in the registry yet, so evidence cannot be attached."/> : <>
        <label className="field-label">Commitment<select required value={commitmentId} onChange={(event) => chooseCommitment(event.target.value)}><option value="">Choose a commitment</option>{choices.value.map((item) => <option key={String(item.record.commitment.id)} value={String(item.record.commitment.id)}>{commitmentLabel(item)}</option>)}</select></label>
        {selected && <div className="selected-record"><span>Selected commitment</span><b>{selected.record.current_version.title}</b><small>{identityOf(selected.token, String(selected.record.commitment.token_id))}</small></div>}
        {selected && (versions.loading || versions.error || !versions.value?.length) && <RecordLoading state={versions} label="recorded versions" empty="No version history is available for this commitment."/>}
        {selected && versions.value && <label className="field-label">Commitment version<select required value={version} onChange={(event) => setVersion(event.target.value)}><option value="">Choose a recorded version</option>{versions.value.map((item) => <option key={item.version} value={String(item.version)}>Version {item.version} Â· {item.title}</option>)}</select></label>}
        {selectedVersion && <p className="field-caption">Version {selectedVersion.version}: {selectedVersion.description}</p>}
      </>}

      <div className="flow-step-heading flow-step-spaced"><span>02</span><div><h3>Point to the public evidence</h3><p>Paste the public link to your screenshot, document, video, or other proof.</p></div></div>
      <label className="field-label">Evidence link<input required type="url" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="https://â€¦ or ipfs://â€¦" autoComplete="url"/><small className="field-caption">The link must be publicly accessible. MemeProof records the reference and does not host the file.</small></label>

      <div className="flow-step-heading flow-step-spaced"><span>03</span><div><h3>Add the content fingerprint</h3><p>SHA-256 is a unique digital fingerprint used to detect changes to a file.</p></div></div>
      <label className="field-label">Content fingerprint (SHA-256)<input required minLength={64} maxLength={64} inputMode="text" autoCapitalize="off" spellCheck={false} value={contentHash} onChange={(event) => setContentHash(event.target.value)} placeholder="64 hexadecimal characters"/><small className="field-caption">Choose a file to calculate its hash in this browser. The file stays on your device and is not uploaded.</small></label>
      <label className="file-hash-picker">{hashing ? "Calculating fingerprintâ€¦" : "Choose a local file to calculate its fingerprint"}<input type="file" onChange={(event) => void hashLocalFile(event.target.files?.[0])}/></label>
      {hashNote && <p className="field-caption" role="status">{hashNote}</p>}
      <p className="hash-example">Example: run the command below for your actual file, then paste the returned 64-character hash.</p><CopyHashCommand />

      <details className="flow-advanced"><summary>Storage allowance</summary><label className="field-label">NEAR storage allowance<input type="number" min="0.000000000000000000000001" step="any" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label><small>The contract charges measured storage and refunds any excess.</small></details>
      <button className="button button-primary flow-submit" disabled={!accountId || state !== "connected" || transactionPending || !selected || !selectedVersion}>{transactionPending ? "Waiting for wallet confirmationâ€¦" : "Submit evidence"}</button>
      <TransactionState pending={transactionPending} error={error} result={confirmed}/>
    </form></section>
  </div>;
}

const REVIEW_CHOICES: { value: ReviewOutcome; title: string; explanation: string }[] = [
  { value: "supports", title: "Supports", explanation: "The evidence appears to support the original promise." },
  { value: "challenges", title: "Challenges", explanation: "The evidence appears to contradict or weaken the original promise." },
  { value: "inconclusive", title: "Inconclusive", explanation: "There is not enough information to make a reasonable assessment." },
];

export function CommunityReviewExperience() {
  const { accountId, state, submitRegistryFunction, transactionPending } = useNearWallet();
  const data = useEvidenceChoices();
  const [evidenceId, setEvidenceId] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome>("supports");
  const [explanation, setExplanation] = useState("");
  const [deposit, setDeposit] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ title: string; id: string; hash: string | null } | null>(null);
  const selected = data.value?.find((item) => String(item.record.id) === evidenceId) ?? null;
  const evidenceReviews = useEvidenceReviews(evidenceId, accountId);
  const alreadyReviewed = Boolean(accountId && evidenceReviews.reviews.some((review) => review.reviewer === accountId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setConfirmed(null);
    try {
      if (!selected) throw new Error("Choose submitted evidence to review.");
      if (alreadyReviewed) throw new Error("This account has already reviewed this evidence. The contract allows one review per account for each evidence record.");
      if (!explanation.trim()) throw new Error("Explain what you observed in the evidence.");
      const result = await submitRegistryFunction<ReviewRecord>("submit_review", {
        evidence_id: String(selected.record.id), outcome, explanation: explanation.trim(),
      }, storageAllowance(deposit));
      setConfirmed({ title: "Community review confirmed.", id: String(result.value.id), hash: result.transactionHash });
    } catch (cause) { setError(explainTransactionError(cause)); }
  }

  return <div className="guided-flow review-flow">
    <section className="flow-intro"><span className="flow-eyebrow">COMMUNITY REVIEW / INDEPENDENT ASSESSMENT</span><h2>Read the evidence. Record what you see.</h2><p>A community review records an independent assessment of submitted evidence. It does not automatically decide whether a commitment has passed or failed.</p><div className="review-policy"><span aria-hidden="true">01</span><p><b>One review per account, per evidence record.</b> The registry enforces this rule on-chain. Reviews remain attributable opinions; they do not produce a final verdict.</p></div></section>
    <section className="panel flow-panel"><form onSubmit={submit}>
      <div className="flow-step-heading"><span>01</span><div><h3>Select evidence to assess</h3><p>Choose a real evidence record from the testnet registry.</p></div></div><WalletLine />
      {data.loading || data.error || !data.value?.length ? <RecordLoading state={data} label="submitted evidence" empty="No evidence records are available to review yet."/> : <>
        <label className="field-label">Evidence record<select required value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Choose evidence</option>{data.value.map((item) => <option key={String(item.record.id)} value={String(item.record.id)}>Evidence #{item.record.id} Â· {item.commitment?.current_version.title ?? `Commitment #${item.record.commitment_id}`} Â· version {item.record.version}</option>)}</select></label>
        {selected && <div className="selected-record"><span>Evidence #{String(selected.record.id)} Â· Commitment version {selected.record.version}</span><b>{selected.commitment?.current_version.title ?? `Commitment #${selected.record.commitment_id}`}</b><small>{identityOf(selected.token, selected.commitment ? String(selected.commitment.commitment.token_id) : undefined)}</small><a href={selected.record.reference} target="_blank" rel="noreferrer">Open public evidence â†—</a><small>Submitted by {selected.record.submitter} Â· {formatDateNs(selected.record.submitted_at_ns)}</small></div>}
        {evidenceReviews.loading && <Notice>Checking reviews for this evidence…</Notice>}{evidenceReviews.error && <Notice error>{evidenceReviews.error}</Notice>}{alreadyReviewed && <Notice error>This account has already reviewed this evidence. Choose another record; duplicate reviews are rejected by the contract.</Notice>}
      </>}
      <div className="flow-step-heading flow-step-spaced"><span>02</span><div><h3>Choose your assessment</h3><p>Describe how this material relates to the original promise.</p></div></div>
      <fieldset className="review-choice-list"><legend className="flow-legend">Assessment</legend>{REVIEW_CHOICES.map((choice) => <label key={choice.value} className={`review-choice ${outcome === choice.value ? "review-choice-selected" : ""}`}><input type="radio" name="review-outcome" value={choice.value} checked={outcome === choice.value} onChange={() => setOutcome(choice.value)}/><span><b>{choice.title}</b><small>{choice.explanation}</small></span></label>)}</fieldset>
      <label className="field-label">What did you observe, and why does it support, challenge, or leave the evidence inconclusive?<textarea required rows={5} maxLength={4096} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Describe details visible in the linked material and how they relate to the recorded commitment."/><small className="field-caption">Example wording (replace it with what you actually observed): â€œThe linked report shows the promised monthly figures for June.â€</small></label>
      <details className="flow-advanced"><summary>Storage allowance</summary><label className="field-label">NEAR storage allowance<input type="number" min="0.000000000000000000000001" step="any" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label><small>The contract charges measured storage and refunds any excess.</small></details>
      <button className="button button-primary flow-submit" disabled={!accountId || state !== "connected" || transactionPending || !selected || evidenceReviews.loading || Boolean(evidenceReviews.error) || alreadyReviewed}>{transactionPending ? "Waiting for wallet confirmationâ€¦" : "Record community review"}</button>
      <TransactionState pending={transactionPending} error={error} result={confirmed}/>
    </form></section>
  </div>;
}

function formatDateNs(value: number | string | null): string {
  if (value === null) return "Not set yet";
  try {
    const ms = Number(BigInt(value) / BigInt(1_000_000));
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch { return "Date unavailable"; }
}

function eventPayload(event: HistoryEvent): Record<string, unknown> {
  const kind = Object.keys(event.kind)[0];
  const payload = kind ? event.kind[kind] : null;
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

const DISPUTE_EVENT_LABELS: Record<string, string> = {
  dispute_raised: "Dispute opened",
  dispute_responded: "Affected party responded",
  dispute_resolver_proposed: "Resolver nominated",
  dispute_resolver_accepted: "Resolver proposal accepted",
  dispute_party_accepted_resolver: "Other party accepted resolver",
  dispute_nominee_accepted: "Resolver accepted appointment",
  dispute_under_review: "Dispute entered review",
  dispute_resolved: "Dispute resolved",
  dispute_expired: "Dispute expired",
};

function statusLabel(status: DisputeStatus): string {
  return status === "under_review" ? "Under Review" : status.charAt(0).toUpperCase() + status.slice(1);
}

function targetOf(dispute: DisputeRecord): string {
  return dispute.evidence_id === null
    ? `Commitment #${String(dispute.commitment_id)} Â· version ${dispute.version}`
    : `Evidence #${String(dispute.evidence_id)} Â· commitment #${String(dispute.commitment_id)}`;
}

export function DisputeManagementExperience() {
  const { accountId, state, submitRegistryFunction, transactionPending } = useNearWallet();
  const commitments = useCommitmentChoices();
  const evidence = useEvidenceChoices();
  const [revision, retry] = useReload();
  const [registry, setRegistry] = useState<{ revision: number; disputes?: DisputeRecord[]; events?: HistoryEvent[]; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const client = getRegistryClient();
    void Promise.all([getAllDisputes(client), getAllHistoryEvents(client)]).then(([disputes, events]) => {
      if (active) setRegistry({ revision, disputes, events });
    }).catch((cause: unknown) => {
      if (active) setRegistry({ revision, error: explainTransactionError(cause) });
    });
    return () => { active = false; };
  }, [revision]);
  const disputes = registry?.revision === revision ? registry.disputes ?? null : null;
  const registryError = registry?.revision === revision ? registry.error ?? null : null;
  const events = useMemo(() => registry?.revision === revision ? registry.events ?? [] : [], [registry, revision]);
  const [selectedDisputeId, setSelectedDisputeId] = useState("");
  const [targetKind, setTargetKind] = useState<"commitment" | "evidence">("commitment");
  const [targetId, setTargetId] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const [reason, setReason] = useState("");
  const [resolver, setResolver] = useState("");
  const [response, setResponse] = useState("");
  const [disposition, setDisposition] = useState<DisputeDisposition>("inconclusive");
  const [rationale, setRationale] = useState("");
  const [deposit, setDeposit] = useState("10");
  const [responseRecord, setResponseRecord] = useState<DisputeResponse | null>(null);
  const [resolutionRecord, setResolutionRecord] = useState<DisputeResolutionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ title: string; id: string; hash: string | null } | null>(null);
  const [nowNs, setNowNs] = useState(BigInt(Date.now()) * BigInt(1_000_000));
  useEffect(() => {
    const timer = window.setInterval(() => setNowNs(BigInt(Date.now()) * BigInt(1_000_000)), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const selected = disputes?.find((item) => String(item.id) === selectedDisputeId) ?? null;
  const selectedCommitment = commitments.value?.find((item) => String(item.record.commitment.id) === targetId) ?? null;
  const selectedEvidence = evidence.value?.find((item) => String(item.record.id) === targetId) ?? null;
  const affectedParty = targetKind === "commitment" ? selectedCommitment?.record.commitment.creator : selectedEvidence?.record.submitter;
  const activeDuplicate = Boolean(disputes?.some((item) => item.status === "open" || item.status === "under_review" ? targetKind === "commitment"
    ? item.evidence_id === null && String(item.commitment_id) === targetId && String(item.version) === targetVersion
    : item.evidence_id !== null && String(item.evidence_id) === targetId : false));
  const activeTarget = selected ? selected.status === "open" || selected.status === "under_review" : false;
  const deadlineOpen = (value: number | string | null) => value !== null && nowNs < BigInt(value);
  const resolverDeadlineOpen = Boolean(selected && selected.status === "open" && deadlineOpen(selected.resolver_deadline_ns));
  const responseDeadlineOpen = Boolean(selected && deadlineOpen(selected.response_deadline_ns));
  const otherParty = selected ? selected.proposal_by === selected.opener ? selected.affected_party : selected.opener : null;
  const detailsReady = !detailLoading && !detailError;
  const canRespond = Boolean(selected && detailsReady && accountId === selected.affected_party && responseDeadlineOpen && !responseRecord && (selected.status === "open" || selected.status === "under_review"));
  const canCounterpropose = Boolean(selected && accountId === otherParty && resolverDeadlineOpen && !selected.counterproposal_used);
  const canAcceptProposal = Boolean(selected && accountId === otherParty && resolverDeadlineOpen && !selected.other_party_accepted);
  const canAcceptAppointment = Boolean(selected && accountId === selected.proposed_resolver && resolverDeadlineOpen && !selected.resolver_accepted);
  const canResolve = Boolean(selected && detailsReady && accountId === selected.proposed_resolver && selected.status === "under_review" && selected.other_party_accepted && selected.resolver_accepted && deadlineOpen(selected.resolution_deadline_ns) && (responseRecord || !responseDeadlineOpen));
  const canExpire = Boolean(selected && (selected.status === "open" && !deadlineOpen(selected.resolver_deadline_ns) || selected.status === "under_review" && !deadlineOpen(selected.resolution_deadline_ns)));
  const timeline = useMemo(() => events.filter((event) => String(eventPayload(event).dispute_id ?? "") === selectedDisputeId).sort((a, b) => {
    const left = BigInt(a.id); const right = BigInt(b.id); return left === right ? 0 : left < right ? -1 : 1;
  }), [events, selectedDisputeId]);

  useEffect(() => {
    let active = true;
    setResponseRecord(null); setResolutionRecord(null);
    setDetailError(null);
    if (!selected) { setDetailLoading(false); return () => { active = false; }; }
    setDetailLoading(true);
    const client = getRegistryClient();
    void Promise.all([client.getDisputeResponse(selected.id), client.getDisputeResolution(selected.id)]).then(([responseValue, resolutionValue]) => {
      if (active) { setResponseRecord(responseValue); setResolutionRecord(resolutionValue); setDetailLoading(false); }
    }).catch((cause: unknown) => { if (active) { const message = explainTransactionError(cause); setDetailError(message); setError(message); setDetailLoading(false); } });
    return () => { active = false; };
  }, [selectedDisputeId, selected]);

  function resetFeedback() { setError(null); setConfirmed(null); }
  async function run(method: string, args: Record<string, unknown>, title: string) {
    resetFeedback();
    try {
      const result = await submitRegistryFunction<Record<string, unknown>>(method, args, storageAllowance(deposit));
      const id = String(result.value.id ?? result.value.dispute_id ?? selectedDisputeId);
      setConfirmed({ title, id, hash: result.transactionHash });
      retry();
    } catch (cause) { setError(explainTransactionError(cause)); }
  }

  async function openDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback();
    try {
      if (!affectedParty) throw new Error("Choose an existing commitment or evidence record from the registry.");
      if (accountId === affectedParty) throw new Error("The affected party cannot open this dispute.");
      if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(resolver.trim()) || resolver.trim().length < 2 || resolver.trim().length > 64) throw new Error("Enter a valid NEAR testnet account for the proposed resolver.");
      if (resolver.trim() === accountId || resolver.trim() === affectedParty) throw new Error("The resolver must be a third party, separate from the opener and affected party.");
      if (new TextEncoder().encode(reason.trim()).length === 0 || new TextEncoder().encode(reason.trim()).length > 4096) throw new Error("Enter a dispute reason of 1â€“4,096 UTF-8 bytes.");
      if (activeDuplicate) throw new Error("An active dispute already exists for this exact target and version.");
      const target = targetKind === "commitment"
        ? { commitment: { commitment_id: positiveU64(targetId, "commitment ID"), version: positiveU32(targetVersion, "commitment version") } }
        : { evidence: { evidence_id: positiveU64(targetId, "evidence ID") } };
      const result = await submitRegistryFunction<DisputeRecord>("open_dispute", { target, reason: reason.trim(), proposed_resolver: resolver.trim() }, storageAllowance(deposit));
      setSelectedDisputeId(String(result.value.id));
      setConfirmed({ title: "Dispute opened.", id: String(result.value.id), hash: result.transactionHash });
      retry();
    } catch (cause) { setError(explainTransactionError(cause)); }
  }

  function button(title: string, allowed: boolean, action: () => void, hint: string) {
    return <div className="dispute-action"><button type="button" className="button button-secondary" disabled={!allowed || transactionPending} onClick={action}>{title}</button>{!allowed && <small>{hint}</small>}</div>;
  }

  const loading = commitments.loading || evidence.loading || disputes === null;
  const loadError = commitments.error ?? evidence.error ?? registryError;
  const selectedVersions = useCommitmentVersions(targetKind === "commitment" ? targetId : "");
  const versions = selectedVersions.value ?? [];

  return <div className="guided-flow dispute-flow">
    <section className="flow-intro"><span className="flow-eyebrow">DISPUTE RESOLUTION / CONTRACT WORKFLOW</span><h2>A clear path when a record is contested.</h2><p>A dispute records a challenge to a commitment or its evidence. A third-party resolver is proposed, accepted by the other party and by the resolver, then reviews the record.</p><div className="dispute-status-flow" aria-label="Dispute lifecycle: Open, Under Review, then Resolved or Expired"><span>Open</span><i>â†’</i><span>Under Review</span><i>â†’</i><span>Resolved or Expired</span></div><p className="dispute-expiry-note">Expiry only closes the dispute workflow. It does not decide who was right, and it does not determine the commitment&apos;s outcome.</p></section>
    <section className="dispute-how panel"><div><b>1. Open</b><p>Anyone except the affected party may open a dispute and nominate a third-party resolver.</p></div><div><b>2. Respond and agree</b><p>The affected party may respond before the recorded response deadline. The other party can accept or counterpropose the resolver once.</p></div><div><b>3. Under Review</b><p>Review begins after both the other party and the nominated resolver accept the appointment.</p></div><div><b>4. Resolve or expire</b><p>The accepted resolver may record an outcome before the actual resolution deadline. A missed contract deadline may be recorded as expired.</p></div></section>

    {loading ? <Notice>Loading commitments, evidence, and disputes from the NEAR testnet registryâ€¦</Notice> : loadError ? <Notice error>{loadError}</Notice> : null}
    <section className="panel flow-panel dispute-open-panel"><form onSubmit={openDispute}><div className="flow-step-heading"><span>01</span><div><h3>Open a dispute</h3><p>Choose the exact record under dispute and nominate an eligible third party.</p></div></div><WalletLine/>
      <label className="field-label">Dispute target<select value={targetKind} onChange={(event) => { setTargetKind(event.target.value as "commitment" | "evidence"); setTargetId(""); setTargetVersion(""); }}><option value="commitment">Commitment version</option><option value="evidence">Submitted evidence</option></select></label>
      {targetKind === "commitment" && selectedCommitment && (selectedVersions.loading || selectedVersions.error) && <RecordLoading state={selectedVersions} label="commitment versions" empty="No version history is available for this commitment."/>}
      {targetKind === "commitment" ? commitments.value?.length ? <><label className="field-label">Commitment<select required value={targetId} onChange={(event) => { setTargetId(event.target.value); const choice = commitments.value?.find((item) => String(item.record.commitment.id) === event.target.value); setTargetVersion(choice ? String(choice.record.commitment.current_version) : ""); }}><option value="">Choose a commitment</option>{commitments.value.map((item) => <option key={String(item.record.commitment.id)} value={String(item.record.commitment.id)}>{commitmentLabel(item)}</option>)}</select></label>{selectedCommitment && <label className="field-label">Version<select required value={targetVersion} onChange={(event) => setTargetVersion(event.target.value)}>{versions.map((item) => <option key={item.version} value={String(item.version)}>Version {item.version} Â· {item.title}</option>)}</select></label>}</> : <Notice>No commitment records are available.</Notice>
        : evidence.value?.length ? <label className="field-label">Evidence<select required value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose evidence</option>{evidence.value.map((item) => <option key={String(item.record.id)} value={String(item.record.id)}>Evidence #{item.record.id} Â· {item.commitment?.current_version.title ?? `Commitment #${item.record.commitment_id}`} Â· version {item.record.version}</option>)}</select></label> : <Notice>No submitted evidence records are available.</Notice>}
      {affectedParty && <div className="selected-record"><span>The contract identifies the affected party as</span><b>{affectedParty}</b><small>{activeDuplicate ? "An active dispute already exists for this target." : "The affected party cannot be the opener or proposed resolver."}</small></div>}
      <label className="field-label">Why is this record being disputed?<textarea required rows={4} maxLength={4096} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the specific issue with this commitment version or evidence record."/><small className="field-caption">Maximum 4 KB, enforced by the contract.</small></label>
      <label className="field-label">Proposed resolver&apos;s NEAR testnet account<input required maxLength={64} autoComplete="off" value={resolver} onChange={(event) => setResolver(event.target.value)} placeholder="resolver.testnet"/></label>
      <details className="flow-advanced"><summary>Storage allowance</summary><label className="field-label">NEAR storage allowance<input type="number" min="0.000000000000000000000001" step="any" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label><small>The contract charges measured storage and refunds any excess.</small></details>
      <button className="button button-primary flow-submit" disabled={!accountId || state !== "connected" || transactionPending || loading || !affectedParty || activeDuplicate || !resolver.trim() || resolver.trim() === accountId || resolver.trim() === affectedParty}>{transactionPending ? "Waiting for wallet confirmationâ€¦" : "Open dispute"}</button>
    </form></section>

    <section className="panel flow-panel dispute-record-panel"><div className="flow-step-heading"><span>02</span><div><h3>Follow a dispute</h3><p>Select a registry record to inspect its lifecycle and available actions.</p></div></div>
      {disputes?.length ? <label className="field-label">Dispute record<select value={selectedDisputeId} onChange={(event) => { setSelectedDisputeId(event.target.value); resetFeedback(); }}><option value="">Choose a dispute</option>{[...disputes].sort((a,b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).map((item) => <option key={String(item.id)} value={String(item.id)}>Dispute #{item.id} Â· {statusLabel(item.status)} Â· {targetOf(item)}</option>)}</select></label> : <Notice>{disputes === null ? "Dispute records are unavailable." : "No disputes have been recorded in the registry yet."}</Notice>}
      {selected && <><div className="dispute-record-heading"><div><span className="flow-eyebrow">DISPUTE #{String(selected.id)}</span><h4>{targetOf(selected)}</h4></div><span className={`dispute-status dispute-status-${selected.status.replaceAll("_", "-")}`}>{statusLabel(selected.status)}</span></div>
        <p className="dispute-reason">{selected.reason}</p>
        <dl className="dispute-parties"><div><dt>Opened by</dt><dd>{selected.opener}</dd></div><div><dt>Affected party</dt><dd>{selected.affected_party}</dd></div><div><dt>Resolver proposed by</dt><dd>{selected.proposal_by}</dd></div><div><dt>Proposed resolver</dt><dd>{selected.proposed_resolver}</dd></div></dl>
        <div className="dispute-deadlines"><div><small>Response deadline</small><b>{formatDateNs(selected.response_deadline_ns)}</b><span>{responseDeadlineOpen ? "Response window open" : "Response window closed"}</span></div><div><small>Resolver agreement deadline</small><b>{formatDateNs(selected.resolver_deadline_ns)}</b><span>{resolverDeadlineOpen ? "Appointment window open" : "Appointment window closed"}</span></div><div><small>Resolution deadline</small><b>{formatDateNs(selected.resolution_deadline_ns)}</b><span>{selected.resolution_deadline_ns === null ? "Set when both parties and resolver accept" : deadlineOpen(selected.resolution_deadline_ns) ? "Resolution window open" : "Resolution window closed"}</span></div></div>
        <div className="dispute-timeline"><h4>Dispute timeline</h4>{timeline.length ? timeline.map((event) => { const kind = Object.keys(event.kind)[0] ?? "unknown"; return <article className="dispute-timeline-item" key={String(event.id)}><i/><div><b>{DISPUTE_EVENT_LABELS[kind] ?? "Dispute update"}</b><small>{event.actor} Â· {formatDateNs(event.occurred_at_ns)}</small></div></article>; }) : <p>Timeline events are not available for this dispute.</p>}{responseRecord && <article className="dispute-timeline-item"><i/><div><b>Affected party response</b><small>{responseRecord.responder} Â· {formatDateNs(responseRecord.responded_at_ns)}</small><p>{responseRecord.response}</p></div></article>}{resolutionRecord && <article className="dispute-timeline-item"><i/><div><b>Resolution: {resolutionRecord.disposition}</b><small>{resolutionRecord.resolver} Â· {formatDateNs(resolutionRecord.resolved_at_ns)}</small><p>{resolutionRecord.rationale}</p></div></article>}</div>
        {resolutionRecord && <div className="dispute-outcome"><b>{resolutionRecord.disposition.charAt(0).toUpperCase() + resolutionRecord.disposition.slice(1)}</b><p>This is the dispute outcome only. It is not a pass/fail verdict for the commitment.</p></div>}
        {selected.status === "expired" && <div className="dispute-outcome"><b>Expired</b><p>The contract closed this dispute after its deadline. Expiry does not mean either party was right or wrong.</p></div>}

        {activeTarget && <div className="dispute-actions-panel"><h4>Available actions</h4>
          {canRespond && <div className="dispute-action-form"><label className="field-label">Your response<textarea rows={3} maxLength={4096} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Respond to the dispute reason."/></label><button type="button" className="button button-primary" disabled={transactionPending || !response.trim()} onClick={() => void run("respond_to_dispute", { dispute_id: String(selected.id), response: response.trim() }, "Dispute response recorded.")}>Submit response</button></div>}
          {canCounterpropose && <div className="dispute-action-form"><label className="field-label">Counterpropose a resolver<input maxLength={64} value={resolver} onChange={(event) => setResolver(event.target.value)} placeholder="resolver.testnet"/></label><button type="button" className="button button-secondary" disabled={transactionPending || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(resolver.trim()) || resolver.trim() === selected.opener || resolver.trim() === selected.affected_party} onClick={() => void run("counterpropose_dispute_resolver", { dispute_id: String(selected.id), resolver: resolver.trim() }, "Resolver counterproposal recorded.")}>Counterpropose resolver</button><small>The other party may counterpropose once before the resolver deadline.</small></div>}
          {button("Accept proposed resolver", canAcceptProposal, () => void run("accept_dispute_resolver", { dispute_id: String(selected.id) }, "Resolver proposal accepted by the other party."), "Only the other disputing party can accept before the resolver deadline.")}
          {button("Accept resolver appointment", canAcceptAppointment, () => void run("accept_dispute_appointment", { dispute_id: String(selected.id) }, "Resolver appointment accepted."), "Only the nominated resolver can accept before the resolver deadline.")}
          {canResolve && <div className="dispute-action-form"><label className="field-label">Dispute outcome<select value={disposition} onChange={(event) => setDisposition(event.target.value as DisputeDisposition)}><option value="upheld">Upheld</option><option value="rejected">Rejected</option><option value="inconclusive">Inconclusive</option><option value="dismissed">Dismissed</option></select></label><label className="field-label">Reason for this outcome<textarea rows={4} maxLength={4096} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain how the record supports this dispute outcome."/></label><button type="button" className="button button-primary" disabled={transactionPending || !rationale.trim()} onClick={() => void run("resolve_dispute", { dispute_id: String(selected.id), disposition, rationale: rationale.trim() }, "Dispute resolution confirmed.")}>Resolve dispute</button><small>Upheld, rejected, inconclusive, or dismissed describes only this dispute; it does not determine overall commitment status.</small></div>}
          {button("Record dispute expiry", canExpire, () => void run("expire_dispute", { dispute_id: String(selected.id) }, "Dispute expiry recorded."), "Expiry can be recorded after the active resolver or resolution deadline. Anyone may call it.")}
          {!canRespond && !canCounterpropose && !canAcceptProposal && !canAcceptAppointment && !canResolve && !canExpire && <Notice>{detailLoading ? "Checking dispute response and resolution records…" : "No action is available to this account at the current status and deadlines."}</Notice>}
        </div>}
      </>}
      <details className="flow-advanced"><summary>Storage allowance for dispute actions</summary><label className="field-label">NEAR storage allowance<input type="number" min="0.000000000000000000000001" step="any" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label><small>The contract charges measured storage and refunds any excess.</small></details>
      <TransactionState pending={transactionPending} error={error} result={confirmed}/>
    </section>
    <p className="dispute-dispositions"><b>Resolver outcomes</b> Â· Upheld Â· Rejected Â· Inconclusive Â· Dismissed. These describe the dispute only, never a final commitment verdict.</p>
  </div>;
}
