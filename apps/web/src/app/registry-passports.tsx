"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fetchDiscoverListing, type DiscoverTokenRecord } from "../lib/discover-client";
import {
  canonicalTokenIdentity,
  findDiscoverTokenByContract,
  findTokenByIdentity,
  getTokenPassportRecords,
  tokenRegistrationStatus,
  type TokenPassportRecords,
} from "../lib/near/registry-passport";
import type { TokenIdentity, TokenRecord } from "../lib/near/registry";
import { explainTransactionError, getRegistryClient, RegistryTransactionError } from "../lib/near/registry";
import { Badge, Button, Card } from "./ui";
import TokenImage from "./token-image";

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
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(Number(BigInt(value) / BigInt(1_000_000))));
  } catch {
    return "Date unavailable";
  }
}

function isPlaceholderToken(token: TokenRecord): boolean {
  return token.identity.token_contract_address === "ddddd";
}

function listingText(listing: DiscoverTokenRecord | null | undefined, field: "name" | "symbol"): string | null {
  const value = listing?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  const [listingResult, setListingResult] = useState<{
    tokenId: string;
    record: DiscoverTokenRecord | null;
    source: string;
    stale: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!/^\d+$/.test(tokenRecordId)) return { token: null };
      const client = getRegistryClient();
      const token = await client.getToken(tokenRecordId);
      if (!token) return { token: null };
      const records = await getTokenPassportRecords(client, token.id);
      return { token, records };
    }).then((value) => {
      if (active) setResult({ key, value });
    }).catch((cause: unknown) => {
      if (active) setResult({ key, error: registryError(cause) });
    });
    return () => { active = false; };
  }, [key, tokenRecordId]);

  const current = result?.key === key ? result : null;
  const currentToken = current?.value?.token ?? null;

  useEffect(() => {
    if (!currentToken) return;
    let active = true;
    const controller = new AbortController();
    void fetchDiscoverListing(globalThis.fetch, controller.signal)
      .then((listing) => {
        if (active) {
          setListingResult({
            tokenId: String(currentToken.id),
            record: findDiscoverTokenByContract(listing.data, currentToken.identity.token_contract_address),
            source: listing.source,
            stale: listing.stale,
          });
        }
      })
      .catch(() => {
        if (active) setListingResult({
          tokenId: String(currentToken.id),
          record: null,
          source: "unavailable",
          stale: true,
        });
      });
    return () => { active = false; controller.abort(); };
  }, [currentToken]);

  if (current?.error) {
    return (
      <section className="registry-dossier-state">
        <ErrorState error={current.error} onRetry={retryRead} />
      </section>
    );
  }
  if (!current?.value) {
    return <section className="registry-dossier-state"><LoadingState>Reading the public registry record…</LoadingState></section>;
  }
  if (!current.value.token) {
    return (
      <section className="registry-dossier-state">
        <div className="dossier-empty">
          <span className="dossier-empty-mark" aria-hidden="true">—</span>
          <h1>Registry record not found</h1>
          <p>There is no token with registry ID <code>{tokenRecordId}</code> in the configured NEAR testnet registry.</p>
          <Link className="dossier-link" href="/passport">Return to all passports</Link>
        </div>
      </section>
    );
  }

  const token = current.value.token;
  const records = current.value.records!;
  const associatedListing = listingResult?.tokenId === String(token.id) ? listingResult.record : null;

  return (
    <RegistryPassportPresentation
      token={token}
      records={records}
      listing={associatedListing}
      listingSource={listingResult?.source}
      listingStale={listingResult?.stale ?? false}
    />
  );
}

export function RegistryPassportPresentation({
  token,
  records,
  listing,
  listingSource,
  listingStale = false,
}: {
  token: TokenRecord;
  records: TokenPassportRecords;
  listing: DiscoverTokenRecord | null;
  listingSource?: string;
  listingStale?: boolean;
}) {
  const placeholder = isPlaceholderToken(token);
  const tokenName = listingText(listing, "name");
  const tokenSymbol = listingText(listing, "symbol");
  const ticker = tokenSymbol
    ? tokenSymbol.startsWith("$") ? tokenSymbol : "$" + tokenSymbol
    : null;

  return (
    <main className="registry-dossier">
      <nav className="dossier-breadcrumb" aria-label="Breadcrumb">
        <Link href="/passport">All passports</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Token passport</span>
        <Link className="dossier-return-link" href="/passport">Return to registry index</Link>
      </nav>

      <header className="dossier-identity">
        <div className="dossier-identity-overline">
          <span>Public registry record</span>
          <div className="dossier-identity-status">
            <span className={"dossier-network-tag " + (placeholder ? "is-placeholder" : "")}>
              {token.identity.network_id}
            </span>
            <Badge variant={placeholder ? "warning" : "success"}>
              {placeholder ? "Placeholder record" : "Registered"}
            </Badge>
          </div>
        </div>

        <div className="dossier-identity-main">
          <TokenImage
            className="dossier-token-logo"
            value={listing}
            name={tokenName ?? "Token"}
            width={80}
            height={80}
          />
          <div className="dossier-identity-copy">
            <h1>{tokenName ?? "Token identity"}</h1>
            <div className="dossier-identity-tags">
              {ticker && <span className="dossier-token-ticker">{ticker}</span>}
              <span className="dossier-registry-id">Registry ID <code>#{String(token.id)}</code></span>
            </div>
            {listing && (
              <p className="dossier-metadata-source">
                Meme.Cooking listing metadata
                <span>{listingSource === "meme.cooking" ? "Live feed" : listingSource === "sync_snapshot" ? "Sync snapshot" : listingSource === "fixture" ? "Fixture data" : "Cached listing"}{listingStale ? " · may be outdated" : ""}</span>
              </p>
            )}
          </div>
        </div>

        {placeholder && (
          <p className="dossier-placeholder-note">
            Placeholder test record. This entry does not identify a real token contract.
          </p>
        )}
      </header>

      <section className="dossier-registration" aria-labelledby="registration-heading">
        <div className="dossier-section-heading">
          <div>
            <span className="dossier-section-index">01</span>
            <h2 id="registration-heading">Registration record</h2>
          </div>
          <span className="dossier-section-note">Identity confirmed on NEAR testnet</span>
        </div>

        <dl className="dossier-registration-grid">
          <div className="dossier-registration-address">
            <dt>Token contract address</dt>
            <dd>
              <code title={token.identity.token_contract_address}>{token.identity.token_contract_address}</code>
              <RegistryCopy value={token.identity.token_contract_address} />
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd><span className="dossier-network-value">{token.identity.network_id}</span></dd>
          </div>
          <div>
            <dt>Registrant</dt>
            <dd><code>{token.registrant}</code></dd>
          </div>
          <div>
            <dt>Registered</dt>
            <dd>{formatNsDate(token.created_at_ns)}</dd>
          </div>
          <div>
            <dt>Registry ID</dt>
            <dd><code>#{String(token.id)}</code></dd>
          </div>
        </dl>

        <p className="dossier-disclaimer">
          Registration records a token identity and its registrant. It is not an official endorsement,
          verification, or verdict about the token.
        </p>
      </section>

      <TokenAccountability records={records} />
    </main>
  );
}

export function TokenAccountability({ records }: { records: TokenPassportRecords }) {
  return (
    <div className="dossier-history">
      <section className="dossier-section" aria-labelledby="commitments-heading">
        <div className="dossier-section-heading">
          <div>
            <span className="dossier-section-index">02</span>
            <h2 id="commitments-heading">Commitment history</h2>
          </div>
          <span className="dossier-section-note">
            {records.commitments.length} {records.commitments.length === 1 ? "public record" : "public records"}
          </span>
        </div>

        {records.commitments.length ? (
          <div className="dossier-commitment-list">
            {records.commitments.map(({ record, versions, evidence }) => (
              <article className="dossier-commitment" id={"commitment-" + record.commitment.id} key={String(record.commitment.id)}>
                <div className="dossier-record-overline">
                  <span className="dossier-record-id">Commitment <code>#{String(record.commitment.id)}</code></span>
                  <span className="dossier-record-version">Current version <b>{record.current_version.version}</b></span>
                  <Badge variant="neutral">Record only</Badge>
                </div>

                <h3>{record.current_version.title}</h3>
                <p className="dossier-description">{record.current_version.description}</p>

                <section className="dossier-criteria" aria-label="Success criteria">
                  <h4>Success criteria</h4>
                  <p>{record.current_version.criteria}</p>
                </section>

                <dl className="dossier-commitment-facts">
                  <div><dt>Creator</dt><dd><code>{record.commitment.creator}</code></dd></div>
                  <div><dt>Created</dt><dd>{formatNsDate(record.commitment.created_at_ns)}</dd></div>
                  <div><dt>Deadline</dt><dd>{formatNsDate(record.current_version.deadline_at_ns)}</dd></div>
                  <div><dt>Version recorded</dt><dd>{formatNsDate(record.current_version.created_at_ns)}</dd></div>
                </dl>

                {versions.length > 1 && (
                  <details className="dossier-version-history">
                    <summary>
                      <span>Version history</span>
                      <span>{versions.length} versions</span>
                    </summary>
                    <ol className="dossier-version-list">
                      {[...versions].sort((a, b) => a.version - b.version).map((version) => (
                        <li className={version.version === record.current_version.version ? "is-current" : ""} key={version.version}>
                          <div className="dossier-version-number">V{version.version}</div>
                          <div className="dossier-version-copy">
                            <div className="dossier-version-title">
                              <b>{version.title}</b>
                              {version.version === record.current_version.version && <span>Current</span>}
                            </div>
                            <small>Recorded {formatNsDate(version.created_at_ns)} · Deadline {formatNsDate(version.deadline_at_ns)}</small>
                            <p>{version.description}</p>
                            <div className="dossier-version-criteria"><b>Criteria</b><span>{version.criteria}</span></div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                <section className="dossier-evidence-section" aria-label="Evidence and community reviews">
                  <div className="dossier-related-heading">
                    <h4>Evidence and community reviews</h4>
                    <span>{evidence.length} {evidence.length === 1 ? "record" : "records"}</span>
                  </div>
                  {evidence.length ? (
                    <div className="dossier-evidence-list">
                      {evidence.map(({ record: item, reviews }) => (
                        <article className="dossier-evidence" id={"evidence-" + item.id} key={String(item.id)}>
                          <div className="dossier-evidence-heading">
                            <div>
                              <span>Evidence <code>#{String(item.id)}</code> · Version {item.version}</span>
                              <small>Submitted {formatNsDate(item.submitted_at_ns)}</small>
                            </div>
                            <Badge variant="info">{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</Badge>
                          </div>
                          <dl className="dossier-evidence-facts">
                            <div><dt>Submitter</dt><dd><code>{item.submitter}</code></dd></div>
                            <div><dt>Reference</dt><dd><code>{item.reference}</code></dd></div>
                            <div className="dossier-hash"><dt>Content hash</dt><dd><code>{item.content_hash}</code></dd></div>
                          </dl>
                          {reviews.length ? (
                            <div className="dossier-review-list">
                              {reviews.map((review) => (
                                <article className="dossier-review" id={"review-" + review.id} key={String(review.id)}>
                                  <div className="dossier-review-heading">
                                    <div>
                                      <Badge variant={review.outcome === "supports" ? "success" : review.outcome === "challenges" ? "warning" : "neutral"}>
                                        {review.outcome}
                                      </Badge>
                                      <span>Review <code>#{String(review.id)}</code></span>
                                    </div>
                                    <small>By <code>{review.reviewer}</code> · {formatNsDate(review.submitted_at_ns)}</small>
                                  </div>
                                  <p>{review.explanation}</p>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="dossier-nested-empty">No community reviews have been recorded for this evidence.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="dossier-nested-empty">No evidence has been attached to this commitment.</p>
                  )}
                </section>

                <p className="dossier-integrity-note">
                  A deadline passing does not set a final outcome. Community reviews are attributed opinions; disputes are tracked separately.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <DossierEmpty
            label="Commitment register"
            title="No commitment has been recorded yet"
            description="No commitment creation event for this token is recorded in the NEAR testnet registry."
          />
        )}
      </section>

      <section className="dossier-section dossier-disputes" aria-labelledby="disputes-heading">
        <div className="dossier-section-heading">
          <div>
            <span className="dossier-section-index">03</span>
            <h2 id="disputes-heading">Dispute history</h2>
          </div>
          <span className="dossier-section-note">
            {records.disputes.length} {records.disputes.length === 1 ? "public record" : "public records"}
          </span>
        </div>

        {records.disputes.length ? (
          <div className="dossier-dispute-list">
            {records.disputes.map(({ record, resolution }) => (
              <article className="dossier-dispute" id={"dispute-" + record.id} key={String(record.id)}>
                <div className="dossier-record-overline">
                  <span className="dossier-record-id">Dispute <code>#{String(record.id)}</code></span>
                  <Badge variant={record.status === "resolved" ? "success" : record.status === "expired" ? "warning" : "neutral"}>
                    {disputeStatus(record.status)}
                  </Badge>
                </div>
                <h3>
                  Commitment <code>#{String(record.commitment_id)}</code>
                  {record.evidence_id !== null && <> · Evidence <code>#{String(record.evidence_id)}</code></>}
                </h3>
                <section className="dossier-criteria" aria-label="Dispute reason">
                  <h4>Reason</h4>
                  <p>{record.reason}</p>
                </section>
                <dl className="dossier-dispute-facts">
                  <div><dt>Opened by</dt><dd><code>{record.opener}</code></dd></div>
                  <div><dt>Created</dt><dd>{formatNsDate(record.created_at_ns)}</dd></div>
                </dl>
                {resolution ? (
                  <section className="dossier-resolution">
                    <div><span>Resolution</span><b>{resolution.disposition}</b></div>
                    <p>{resolution.rationale}</p>
                    <small>Resolved by <code>{resolution.resolver}</code> · {formatNsDate(resolution.resolved_at_ns)}</small>
                  </section>
                ) : (
                  <p className="dossier-integrity-note">No resolution has been recorded.</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <DossierEmpty
            label="Dispute register"
            title="No disputes recorded"
            description="If a dispute is opened for one of this token’s commitments or its evidence, the record and any resolution will appear here."
          />
        )}
      </section>
    </div>
  );
}

function DossierEmpty({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="dossier-empty">
      <span className="dossier-empty-mark" aria-hidden="true">—</span>
      <span className="dossier-empty-label">{label}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function disputeStatus(status: string): string {
  if (status === "under_review") return "Under review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
