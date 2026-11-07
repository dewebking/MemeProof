"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  explainTransactionError,
  getRegistryClient,
  nearToYocto,
  type CommitmentWithCurrentVersion,
  type DisputeRecord,
  type DisputeResponse,
  type DisputeResolutionRecord,
  type EvidenceRecord,
  type ReviewRecord,
  type ReviewOutcome,
  type DisputeDisposition,
  type TokenRecord,
} from "../lib/near/registry";
import { useNearWallet } from "./wallet-context";

const DEFAULT_STORAGE_DEPOSIT = "1";
const U64_MAX = BigInt(2) ** BigInt(64) - BigInt(1);
const DEFAULT_RECORD_STORAGE_DEPOSIT = "10";

function inputBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isValidAccountId(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= 64 &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)
  );
}

function validateStorageDeposit(value: string): bigint {
  const deposit = nearToYocto(value);
  if (deposit <= BigInt(0))
    throw new Error("Storage deposit must be greater than zero.");
  return deposit;
}

function tokenIdFromInput(value: string): bigint {
  if (!/^\d+$/.test(value.trim()))
    throw new Error("Enter a registered token ID.");
  const tokenId = BigInt(value.trim());
  if (tokenId < BigInt(1) || tokenId > U64_MAX) {
    throw new Error("Token ID must be a positive u64 value.");
  }
  return tokenId;
}

function positiveU64(value: string, label: string): string {
  if (!/^\d+$/.test(value.trim())) throw new Error(`Enter a ${label}.`);
  const parsed = BigInt(value.trim());
  if (parsed < BigInt(1) || parsed > U64_MAX)
    throw new Error(`${label} must be a positive u64 value.`);
  return parsed.toString();
}

function positiveU32(value: string, label: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error(`Enter a ${label}.`);
  const parsed = BigInt(value.trim());
  if (parsed < BigInt(1) || parsed > BigInt(2) ** BigInt(32) - BigInt(1)) {
    throw new Error(`${label} must be a positive u32 value.`);
  }
  return Number(parsed);
}

function storageAllowance(value: string): bigint {
  const deposit = nearToYocto(value);
  if (deposit <= BigInt(0))
    throw new Error("Storage allowance must be greater than zero.");
  return deposit;
}

function validPublicReference(value: string): boolean {
  if (
    inputBytes(value) === 0 ||
    inputBytes(value) > 2048 ||
    /[\u0000-\u001f\u007f-\u009f\s?#]/u.test(value)
  )
    return false;
  const separator = value.indexOf("://");
  if (separator < 0 || value.indexOf("://", separator + 3) >= 0) return false;
  const scheme = value.slice(0, separator);
  const remainder = value.slice(separator + 3);
  const slash = remainder.indexOf("/");
  const authority = slash < 0 ? remainder : remainder.slice(0, slash);
  const path = slash < 0 ? "" : remainder.slice(slash + 1);
  if (!authority || /[\\?#]/u.test(path)) return false;
  if (scheme === "ipfs")
    return !authority.includes(":") && validCidV1Sha256(authority);
  if (scheme !== "https" || authority.includes("@") || /[%\\]/u.test(authority))
    return false;

  const colon = authority.lastIndexOf(":");
  const hostname = colon < 0 ? authority : authority.slice(0, colon);
  const port = colon < 0 ? undefined : authority.slice(colon + 1);
  if (
    port !== undefined &&
    (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  )
    return false;
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const isIpv4 = Boolean(
    ipv4 && ipv4.slice(1).every((octet) => Number(octet) <= 255),
  );
  if (!hostname || hostname.length > 253 || isIpv4) return false;
  return hostname
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
    );
}

function validCidV1Sha256(cid: string): boolean {
  if (!cid.startsWith("b") || cid.length < 2) return false;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of cid.slice(1)) {
    const code = char.charCodeAt(0);
    const value =
      code >= 97 && code <= 122
        ? code - 97
        : code >= 50 && code <= 55
          ? code - 24
          : -1;
    if (value < 0) return false;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits >= 5 || buffer !== 0) return false;
  let cursor = 0;
  const readVarint = (): bigint | null => {
    let value = BigInt(0);
    let shift = BigInt(0);
    while (cursor < bytes.length && shift < BigInt(64)) {
      const byte = bytes[cursor++];
      value |= BigInt(byte & 127) << shift;
      if ((byte & 128) === 0) return value;
      shift += BigInt(7);
    }
    return null;
  };
  const version = readVarint();
  const codec = readVarint();
  const hashCode = readVarint();
  const digestLength = readVarint();
  return (
    version === BigInt(1) &&
    codec !== null &&
    codec > BigInt(0) &&
    hashCode === BigInt(0x12) &&
    digestLength === BigInt(32) &&
    bytes.length === cursor + 32
  );
}

function validateSha256(value: string): boolean {
  return /^[\da-fA-F]{64}$/.test(value);
}

function dateTimeToNanoseconds(value: string): bigint {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    throw new Error("Choose a valid deadline.");
  const timestampNs = BigInt(date.getTime()) * BigInt(1_000_000);
  if (timestampNs <= BigInt(Date.now()) * BigInt(1_000_000)) {
    throw new Error("Deadline must be in the future.");
  }
  if (timestampNs > U64_MAX) {
    throw new Error("Deadline exceeds the registry's u64 timestamp range.");
  }
  return timestampNs;
}

function localDateTimeMinimum(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function FormNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={error ? "form-error" : "form-success"}
    >
      {children}
    </p>
  );
}

function WalletRequirement() {
  const { accountId, state } = useNearWallet();
  if (accountId) {
    return <p className="field-caption">Transaction signer: {accountId}</p>;
  }
  return (
    <FormNotice error>
      {state === "restoring"
        ? "Restoring the NEAR wallet session. Wait for it to finish before continuing."
        : "Connect a NEAR testnet wallet from the page header before submitting."}
    </FormNotice>
  );
}

function TransactionProgress() {
  return (
    <FormNotice>
      Approve the transaction in your wallet. Waiting for the NEAR testnet
      result…
    </FormNotice>
  );
}

function TransactionSuccess({
  title,
  recordId,
  transactionHash,
  nextHref,
}: {
  title: string;
  recordId: number | string;
  transactionHash: string | null;
  nextHref?: string;
}) {
  return (
    <section className="panel mt-5" aria-live="polite">
      <span className="eyebrow">CONFIRMED ON NEAR TESTNET</span>
      <h2>{title}</h2>
      <p>
        Registry record ID: <strong>{recordId}</strong>
      </p>
      {transactionHash && (
        <p className="field-caption break-all">
          Transaction: {transactionHash}
        </p>
      )}
      {nextHref && (
        <Link
          className="button button-primary button-small mt-4"
          href={nextHref}
        >
          Create a commitment →
        </Link>
      )}
    </section>
  );
}

export function RegisterTokenForm() {
  const { accountId, state, submitRegistryFunction, transactionPending } =
    useNearWallet();
  const [tokenAddress, setTokenAddress] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [storageDeposit, setStorageDeposit] = useState(DEFAULT_STORAGE_DEPOSIT);
  const [error, setError] = useState<string | null>(null);
  const [registeredToken, setRegisteredToken] = useState<{
    record: TokenRecord;
    transactionHash: string | null;
  } | null>(null);
  const canSubmit =
    Boolean(accountId) && !transactionPending && state === "connected";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRegisteredToken(null);
    try {
      const address = tokenAddress.trim();
      if (!isValidAccountId(address)) {
        throw new Error(
          "Enter a valid NEAR testnet token contract account ID.",
        );
      }
      const metadata = metadataUri.trim() || null;
      if (metadata) {
        let parsed: URL;
        try {
          parsed = new URL(metadata);
        } catch {
          throw new Error("Metadata URI must be a valid HTTPS or IPFS URI.");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "ipfs:") {
          throw new Error("Metadata URI must use HTTPS or IPFS.");
        }
        if (inputBytes(metadata) > 2048)
          throw new Error("Metadata URI exceeds 2 KB.");
      }
      const deposit = validateStorageDeposit(storageDeposit);
      const result = await submitRegistryFunction<TokenRecord>(
        "register_token",
        { token_contract_address: address, metadata_uri: metadata },
        deposit,
      );
      setRegisteredToken({
        record: result.value,
        transactionHash: result.transactionHash,
      });
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  return (
    <>
      <div className="form-layout">
        <section className="panel form-main">
          <form onSubmit={submit}>
            <h2>Register a NEAR token</h2>
            <p className="form-hint">
              Token identity is the NEAR testnet network and its contract
              account. Registration is permanent and must be confirmed by your
              wallet.
            </p>
            <WalletRequirement />
            <label className="field-label">
              Token contract account ID
              <input
                required
                autoComplete="off"
                maxLength={64}
                placeholder="token.example.testnet"
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
              />
            </label>
            <label className="field-label">
              Public metadata URI <span className="optional">Optional</span>
              <input
                type="url"
                maxLength={2048}
                placeholder="https://… or ipfs://…"
                value={metadataUri}
                onChange={(event) => setMetadataUri(event.target.value)}
              />
            </label>
            <label className="field-label">
              Storage allowance (NEAR)
              <input
                required
                type="number"
                min="0.000000000000000000000001"
                step="any"
                value={storageDeposit}
                onChange={(event) => setStorageDeposit(event.target.value)}
              />
            </label>
            <p className="field-caption">
              The contract charges for storage and asynchronously refunds excess
              deposit to the transaction sender. Increase the allowance if the
              contract reports a storage shortfall.
            </p>
            <button
              className="button button-primary"
              type="submit"
              disabled={!canSubmit}
            >
              {transactionPending
                ? "Waiting for wallet…"
                : "Register token on NEAR"}
            </button>
            {transactionPending && <TransactionProgress />}
            {error && <FormNotice error>{error}</FormNotice>}
          </form>
        </section>
        <aside className="side-note panel">
          <div className="note-icon">Ⓝ</div>
          <h3>Registry source of truth</h3>
          <p>
            The token appears here only after the contract transaction succeeds.
            A rejected wallet request or failed transaction does not create a
            local record.
          </p>
        </aside>
      </div>
      {registeredToken && (
        <TransactionSuccess
          title="Token registration confirmed"
          recordId={registeredToken.record.id}
          transactionHash={registeredToken.transactionHash}
          nextHref="/create-commitment"
        />
      )}
    </>
  );
}

export function CreateCommitmentForm() {
  const { accountId, state, submitRegistryFunction, transactionPending } =
    useNearWallet();
  const [step, setStep] = useState(1);
  const [tokenId, setTokenId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [deadline, setDeadline] = useState("");
  const [storageDeposit, setStorageDeposit] = useState(DEFAULT_STORAGE_DEPOSIT);
  const [error, setError] = useState<string | null>(null);
  const [createdCommitment, setCreatedCommitment] = useState<{
    record: CommitmentWithCurrentVersion;
    transactionHash: string | null;
  } | null>(null);
  const canSubmit =
    Boolean(accountId) && !transactionPending && state === "connected";
  const minimumDeadline = localDateTimeMinimum();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }
    setError(null);
    setCreatedCommitment(null);
    try {
      const parsedTokenId = tokenIdFromInput(tokenId);
      if (inputBytes(title.trim()) > 256)
        throw new Error("Title exceeds 256 bytes.");
      if (inputBytes(description.trim()) > 4096)
        throw new Error("Description exceeds 4 KB.");
      if (inputBytes(criteria.trim()) > 8192)
        throw new Error("Criteria exceed 8 KB.");
      if (!title.trim() || !description.trim() || !criteria.trim()) {
        throw new Error("Complete all commitment fields before submitting.");
      }
      const deadlineAtNs = dateTimeToNanoseconds(deadline);
      const deposit = validateStorageDeposit(storageDeposit);
      const result = await submitRegistryFunction<CommitmentWithCurrentVersion>(
        "create_commitment_decimal",
        {
          token_id: parsedTokenId.toString(),
          title: title.trim(),
          description: description.trim(),
          criteria: criteria.trim(),
          deadline_at_ns: deadlineAtNs.toString(),
        },
        deposit,
      );
      setCreatedCommitment({
        record: result.value,
        transactionHash: result.transactionHash,
      });
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  return (
    <>
      <div className="form-layout">
        <section className="form-main panel">
          <div className="stepper">
            {[1, 2, 3].map((number) => (
              <div
                key={number}
                className={`stepper-item ${step >= number ? "stepper-current" : ""}`}
              >
                <span>{step > number ? "✓" : `0${number}`}</span>
                <b>
                  {["Commitment", "Criteria & deadline", "Review"][number - 1]}
                </b>
              </div>
            ))}
          </div>
          <form onSubmit={submit}>
            {step === 1 && (
              <>
                <h2>What are you committing to?</h2>
                <p className="form-hint">
                  Create an immutable commitment for a token already registered
                  in the MemeProof testnet registry.
                </p>
                <WalletRequirement />
                <label className="field-label">
                  Registered token ID
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]+"
                    placeholder="Token ID returned after registration"
                    value={tokenId}
                    onChange={(event) => setTokenId(event.target.value)}
                  />
                </label>
                <p className="field-caption">
                  <Link href="/register-token" className="text-link">
                    Register a token first ↗
                  </Link>
                </p>
                <label className="field-label">
                  Commitment title
                  <input
                    required
                    minLength={1}
                    maxLength={256}
                    placeholder="e.g. Publish a monthly treasury report"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Commitment description
                  <textarea
                    required
                    rows={4}
                    maxLength={4096}
                    placeholder="Describe what will be delivered and who it benefits."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <h2>Define success clearly</h2>
                <p className="form-hint">
                  Criteria and verification guidance are stored together in the
                  contract&apos;s immutable criteria field.
                </p>
                <label className="field-label">
                  Success criteria and verification method
                  <textarea
                    required
                    rows={6}
                    maxLength={8192}
                    placeholder="What observable conditions must be met, and what evidence can show the result?"
                    value={criteria}
                    onChange={(event) => setCriteria(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Deadline
                  <input
                    required
                    type="datetime-local"
                    min={minimumDeadline}
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Storage allowance (NEAR)
                  <input
                    required
                    type="number"
                    min="0.000000000000000000000001"
                    step="any"
                    value={storageDeposit}
                    onChange={(event) => setStorageDeposit(event.target.value)}
                  />
                </label>
                <p className="field-caption">
                  The contract charges for storage and refunds excess deposit to
                  the transaction sender. You can increase the allowance if a
                  storage shortfall is reported.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <h2>Review your commitment</h2>
                <p className="form-hint">
                  Submitting asks your connected wallet to sign a NEAR testnet
                  transaction.
                </p>
                <dl className="commitment-review">
                  <div>
                    <dt>Token ID</dt>
                    <dd>{tokenId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Title</dt>
                    <dd>{title || "—"}</dd>
                  </div>
                  <div>
                    <dt>Description</dt>
                    <dd>{description || "—"}</dd>
                  </div>
                  <div>
                    <dt>Criteria</dt>
                    <dd>{criteria || "—"}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>
                      {deadline ? new Date(deadline).toLocaleString() : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Transaction signer</dt>
                    <dd>{accountId ?? "Connect a wallet"}</dd>
                  </div>
                </dl>
              </>
            )}
            {error && <FormNotice error>{error}</FormNotice>}
            {transactionPending && <TransactionProgress />}
            <div className="form-actions">
              {step > 1 && (
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={transactionPending}
                  onClick={() => setStep((current) => current - 1)}
                >
                  ← Back
                </button>
              )}
              <button
                className="button button-primary"
                type="submit"
                disabled={(step === 3 && !canSubmit) || transactionPending}
              >
                {step < 3
                  ? "Continue →"
                  : transactionPending
                    ? "Waiting for wallet…"
                    : "Create commitment on NEAR"}
              </button>
            </div>
          </form>
        </section>
        <aside className="side-note panel">
          <div className="note-icon">✳</div>
          <h3>Stored on the registry</h3>
          <p>
            The contract validates the token ID, immutable criteria, deadline,
            and attached storage deposit. Failed or rejected transactions do not
            create local commitments.
          </p>
        </aside>
      </div>
      {createdCommitment && (
        <TransactionSuccess
          title="Commitment confirmed"
          recordId={createdCommitment.record.commitment.id}
          transactionHash={createdCommitment.transactionHash}
        />
      )}
    </>
  );
}

type ConfirmedAction = { id: string; hash: string | null; label: string };

function ActionFeedback({
  pending,
  error,
  confirmed,
}: {
  pending: boolean;
  error: string | null;
  confirmed: ConfirmedAction | null;
}) {
  return (
    <>
      {pending && <TransactionProgress />}
      {error && <FormNotice error>{error}</FormNotice>}
      {confirmed && (
        <section className="panel mt-4" aria-live="polite">
          <span className="eyebrow">CONFIRMED ON NEAR TESTNET</span>
          <p>{confirmed.label}</p>
          <p>
            Returned record ID: <strong>{confirmed.id}</strong>
          </p>
          {confirmed.hash && (
            <p className="field-caption break-all">
              Transaction: {confirmed.hash}
            </p>
          )}
        </section>
      )}
    </>
  );
}

export function EvidenceSubmissionForm() {
  const { accountId, state, submitRegistryFunction, transactionPending } =
    useNearWallet();
  const [commitmentId, setCommitmentId] = useState("");
  const [version, setVersion] = useState("1");
  const [reference, setReference] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [deposit, setDeposit] = useState(DEFAULT_RECORD_STORAGE_DEPOSIT);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedAction | null>(null);
  const canSubmit =
    Boolean(accountId) && state === "connected" && !transactionPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmed(null);
    try {
      if (!validPublicReference(reference.trim()))
        throw new Error(
          "Evidence reference must be a public HTTPS or IPFS URI.",
        );
      if (!validateSha256(contentHash.trim()))
        throw new Error(
          "Enter the SHA-256 content hash as 64 hexadecimal characters.",
        );
      const result = await submitRegistryFunction<EvidenceRecord>(
        "submit_evidence",
        {
          commitment_id: positiveU64(commitmentId, "commitment ID"),
          version: positiveU32(version, "commitment version"),
          reference: reference.trim(),
          content_hash: contentHash.trim().toLowerCase(),
        },
        storageAllowance(deposit),
      );
      setConfirmed({
        id: String(result.value.id),
        hash: result.transactionHash,
        label: "Evidence submission confirmed.",
      });
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  return (
    <section className="panel form-main">
      <form onSubmit={submit}>
        <h2>Submit evidence</h2>
        <p className="form-hint">
          The registry stores a public reference and SHA-256 hash. Upload files
          to your evidence host first; file contents are not sent on-chain.
        </p>
        <WalletRequirement />
        <label className="field-label">
          Commitment ID
          <input
            required
            inputMode="numeric"
            value={commitmentId}
            onChange={(e) => setCommitmentId(e.target.value)}
            placeholder="1"
          />
        </label>
        <label className="field-label">
          Commitment version
          <input
            required
            type="number"
            min="1"
            step="1"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <label className="field-label">
          Public evidence reference
          <input
            required
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="https://… or ipfs://…"
          />
        </label>
        <label className="field-label">
          SHA-256 content hash
          <input
            required
            minLength={64}
            maxLength={64}
            value={contentHash}
            onChange={(e) => setContentHash(e.target.value)}
            placeholder="64 hexadecimal characters"
          />
        </label>
        <label className="field-label">
          Storage allowance (NEAR)
          <input
            required
            type="number"
            min="0.000000000000000000000001"
            step="any"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </label>
        <p className="field-caption">
          The contract checks the commitment, version, URI and hash. It charges
          measured storage and refunds excess allowance.
        </p>
        <button className="button button-primary" disabled={!canSubmit}>
          {transactionPending
            ? "Waiting for wallet…"
            : "Submit evidence on NEAR"}
        </button>
        <ActionFeedback
          pending={transactionPending}
          error={error}
          confirmed={confirmed}
        />
      </form>
    </section>
  );
}

export function CommunityReviewForm() {
  const { accountId, state, submitRegistryFunction, transactionPending } =
    useNearWallet();
  const [evidenceId, setEvidenceId] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome>("supports");
  const [explanation, setExplanation] = useState("");
  const [deposit, setDeposit] = useState(DEFAULT_RECORD_STORAGE_DEPOSIT);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedAction | null>(null);
  const canSubmit =
    Boolean(accountId) && state === "connected" && !transactionPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmed(null);
    try {
      const result = await submitRegistryFunction<ReviewRecord>(
        "submit_review",
        {
          evidence_id: positiveU64(evidenceId, "evidence ID"),
          outcome,
          explanation: explanation.trim(),
        },
        storageAllowance(deposit),
      );
      setConfirmed({
        id: String(result.value.id),
        hash: result.transactionHash,
        label: "Community review confirmed.",
      });
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  return (
    <section className="panel form-main">
      <form onSubmit={submit}>
        <h2>Record a community review</h2>
        <p className="form-hint">
          Each connected account may review a given evidence record once. Review
          outcomes do not independently set a final commitment verdict.
        </p>
        <WalletRequirement />
        <label className="field-label">
          Evidence ID
          <input
            required
            inputMode="numeric"
            value={evidenceId}
            onChange={(e) => setEvidenceId(e.target.value)}
            placeholder="1"
          />
        </label>
        <label className="field-label">
          Assessment
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
          >
            <option value="supports">Supports</option>
            <option value="challenges">Challenges</option>
            <option value="inconclusive">Inconclusive</option>
          </select>
        </label>
        <label className="field-label">
          Explanation
          <textarea
            required
            rows={4}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </label>
        <label className="field-label">
          Storage allowance (NEAR)
          <input
            required
            type="number"
            min="0.000000000000000000000001"
            step="any"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </label>
        <p className="field-caption">
          The contract enforces explanation limits, duplicate-review prevention
          and measured storage charges.
        </p>
        <button className="button button-primary" disabled={!canSubmit}>
          {transactionPending ? "Waiting for wallet…" : "Submit review on NEAR"}
        </button>
        <ActionFeedback
          pending={transactionPending}
          error={error}
          confirmed={confirmed}
        />
      </form>
    </section>
  );
}

export function DisputeActions() {
  const { accountId, state, submitRegistryFunction, transactionPending } =
    useNearWallet();
  const [disputeId, setDisputeId] = useState("");
  const [targetKind, setTargetKind] = useState<"commitment" | "evidence">(
    "commitment",
  );
  const [targetId, setTargetId] = useState("");
  const [version, setVersion] = useState("1");
  const [reason, setReason] = useState("");
  const [resolver, setResolver] = useState("");
  const [response, setResponse] = useState("");
  const [disposition, setDisposition] =
    useState<DisputeDisposition>("inconclusive");
  const [rationale, setRationale] = useState("");
  const [deposit, setDeposit] = useState(DEFAULT_RECORD_STORAGE_DEPOSIT);
  const [record, setRecord] = useState<DisputeRecord | null>(null);
  const [responseRecord, setResponseRecord] = useState<DisputeResponse | null>(
    null,
  );
  const [resolutionRecord, setResolutionRecord] =
    useState<DisputeResolutionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedAction | null>(null);
  const [nowNs, setNowNs] = useState(BigInt(0));
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowNs(BigInt(Date.now()) * BigInt(1_000_000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const canSubmit =
    Boolean(accountId) && state === "connected" && !transactionPending;
  const deadlineOpen = (value: number | string | null) =>
    value !== null && nowNs < BigInt(value);
  const otherParty = record
    ? record.proposal_by === record.opener
      ? record.affected_party
      : record.opener
    : null;
  const resolverAgreementOpen = Boolean(
    record &&
    record.status === "open" &&
    deadlineOpen(record.resolver_deadline_ns),
  );
  const responsePeriodOpen = Boolean(
    record && deadlineOpen(record.response_deadline_ns),
  );
  const canRespond = Boolean(
    record &&
    accountId === record.affected_party &&
    responsePeriodOpen &&
    !responseRecord &&
    (record.status === "open" || record.status === "under_review"),
  );
  const canPropose = Boolean(
    record &&
    accountId === otherParty &&
    resolverAgreementOpen &&
    !record.counterproposal_used,
  );
  const canAcceptProposal = Boolean(
    record &&
    accountId === otherParty &&
    resolverAgreementOpen &&
    !record.other_party_accepted,
  );
  const canAcceptAppointment = Boolean(
    record &&
    accountId === record.proposed_resolver &&
    resolverAgreementOpen &&
    !record.resolver_accepted,
  );
  const canResolve = Boolean(
    record &&
    !resolutionRecord &&
    accountId === record.proposed_resolver &&
    record.status === "under_review" &&
    record.other_party_accepted &&
    record.resolver_accepted &&
    deadlineOpen(record.resolution_deadline_ns) &&
    (responseRecord || !responsePeriodOpen),
  );
  const canExpire = Boolean(
    record &&
    ((record.status === "open" && !deadlineOpen(record.resolver_deadline_ns)) ||
      (record.status === "under_review" &&
        !deadlineOpen(record.resolution_deadline_ns))),
  );

  async function run(
    event: FormEvent<HTMLFormElement>,
    method: string,
    args: Record<string, unknown> | (() => Record<string, unknown>),
    label: string,
  ) {
    event.preventDefault();
    setError(null);
    setConfirmed(null);
    try {
      const result = await submitRegistryFunction<Record<string, unknown>>(
        method,
        typeof args === "function" ? args() : args,
        storageAllowance(deposit),
      );
      const returnedId =
        result.value.id ?? result.value.dispute_id ?? disputeId;
      setConfirmed({
        id: String(returnedId),
        hash: result.transactionHash,
        label,
      });
      if (method === "respond_to_dispute")
        setResponseRecord(result.value as unknown as DisputeResponse);
      if (
        [
          "counterpropose_dispute_resolver",
          "accept_dispute_resolver",
          "accept_dispute_appointment",
          "expire_dispute",
        ].includes(method)
      )
        setRecord(result.value as unknown as DisputeRecord);
      if (method === "resolve_dispute") {
        setResolutionRecord(result.value as unknown as DisputeResolutionRecord);
        setRecord((current) =>
          current ? { ...current, status: "resolved" } : current,
        );
      }
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  async function refresh() {
    setError(null);
    setRecord(null);
    setResponseRecord(null);
    setResolutionRecord(null);
    try {
      const id = positiveU64(disputeId, "dispute ID");
      const client = getRegistryClient();
      const [dispute, disputeResponse, resolution] = await Promise.all([
        client.getDispute(id),
        client.getDisputeResponse(id),
        client.getDisputeResolution(id),
      ]);
      if (!dispute)
        throw new Error(
          "That dispute ID was not found in the configured registry.",
        );
      setRecord(dispute);
      setResponseRecord(disputeResponse);
      setResolutionRecord(resolution);
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  function changeDisputeId(value: string) {
    setDisputeId(value);
    setRecord(null);
    setResponseRecord(null);
    setResolutionRecord(null);
    setConfirmed(null);
    setError(null);
  }

  async function openDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmed(null);
    try {
      if (!isValidAccountId(resolver.trim()))
        throw new Error(
          "Enter a valid NEAR account ID for the proposed resolver.",
        );
      if (resolver.trim() === accountId)
        throw new Error("The proposed resolver must be a third party.");
      const target =
        targetKind === "commitment"
          ? {
              commitment: {
                commitment_id: positiveU64(targetId, "commitment ID"),
                version: positiveU32(version, "commitment version"),
              },
            }
          : { evidence: { evidence_id: positiveU64(targetId, "evidence ID") } };
      const result = await submitRegistryFunction<DisputeRecord>(
        "open_dispute",
        {
          target,
          reason: reason.trim(),
          proposed_resolver: resolver.trim(),
        },
        storageAllowance(deposit),
      );
      setDisputeId(String(result.value.id));
      setRecord(result.value);
      setResponseRecord(null);
      setResolutionRecord(null);
      setConfirmed({
        id: String(result.value.id),
        hash: result.transactionHash,
        label: "Dispute opened.",
      });
    } catch (cause) {
      setError(explainTransactionError(cause));
    }
  }

  return (
    <>
      <div className="overview-grid">
        <section className="panel form-main">
          <form onSubmit={openDispute}>
            <h2>Open a dispute</h2>
            <p className="form-hint">
              The affected party cannot open the dispute. Propose a third party
              as resolver.
            </p>
            <WalletRequirement />
            <label className="field-label">
              Dispute target
              <select
                value={targetKind}
                onChange={(e) =>
                  setTargetKind(e.target.value as "commitment" | "evidence")
                }
              >
                <option value="commitment">Commitment version</option>
                <option value="evidence">Evidence record</option>
              </select>
            </label>
            <label className="field-label">
              {targetKind === "commitment" ? "Commitment ID" : "Evidence ID"}
              <input
                required
                inputMode="numeric"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </label>
            {targetKind === "commitment" && (
              <label className="field-label">
                Version
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </label>
            )}
            <label className="field-label">
              Reason
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="field-label">
              Proposed resolver NEAR account
              <input
                required
                maxLength={64}
                value={resolver}
                onChange={(e) => setResolver(e.target.value)}
                placeholder="resolver.testnet"
              />
            </label>
            <label className="field-label">
              Storage allowance (NEAR)
              <input
                required
                type="number"
                min="0.000000000000000000000001"
                step="any"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </label>
            <button className="button button-primary" disabled={!canSubmit}>
              {transactionPending
                ? "Waiting for wallet…"
                : "Open dispute on NEAR"}
            </button>
          </form>
        </section>
        <section className="panel form-main">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void refresh();
            }}
          >
            <h2>Dispute record & actions</h2>
            <label className="field-label">
              Dispute ID
              <input
                required
                inputMode="numeric"
                value={disputeId}
                onChange={(e) => changeDisputeId(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button button-secondary"
              disabled={transactionPending}
            >
              Load on-chain dispute
            </button>
            {record && (
              <div className="form-hint" aria-live="polite">
                <b>
                  Dispute #{record.id} · {record.status}
                </b>
                <p>
                  Opener: {record.opener}
                  <br />
                  Affected party: {record.affected_party}
                  <br />
                  Proposed resolver: {record.proposed_resolver}
                  <br />
                  Party accepted: {String(record.other_party_accepted)} ·
                  Resolver accepted: {String(record.resolver_accepted)}
                </p>
                {responseRecord && (
                  <p>
                    Response by {responseRecord.responder}:{" "}
                    {responseRecord.response}
                  </p>
                )}
                {resolutionRecord && (
                  <p>
                    Resolution: {resolutionRecord.disposition} —{" "}
                    {resolutionRecord.rationale}
                  </p>
                )}
              </div>
            )}
            <label className="field-label">
              Storage allowance (NEAR)
              <input
                required
                type="number"
                min="0.000000000000000000000001"
                step="any"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </label>
            <label className="field-label">
              Response
              <textarea
                rows={2}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!canSubmit || !canRespond || !response.trim()}
              onClick={(e) => {
                e.preventDefault();
                void run(
                  e as unknown as FormEvent<HTMLFormElement>,
                  "respond_to_dispute",
                  () => ({
                    dispute_id: positiveU64(disputeId, "dispute ID"),
                    response: response.trim(),
                  }),
                  "Dispute response recorded.",
                );
              }}
            >
              Submit affected party response
            </button>
            <label className="field-label">
              Counterproposed resolver
              <input
                maxLength={64}
                value={resolver}
                onChange={(e) => setResolver(e.target.value)}
                placeholder="resolver.testnet"
              />
            </label>
            <button
              className="button button-secondary"
              disabled={
                !canSubmit ||
                !canPropose ||
                !resolver.trim() ||
                !isValidAccountId(resolver.trim()) ||
                resolver.trim() === record?.opener ||
                resolver.trim() === record?.affected_party
              }
              onClick={(e) => {
                e.preventDefault();
                void run(
                  e as unknown as FormEvent<HTMLFormElement>,
                  "counterpropose_dispute_resolver",
                  () => ({
                    dispute_id: positiveU64(disputeId, "dispute ID"),
                    resolver: resolver.trim(),
                  }),
                  "Resolver counterproposal recorded.",
                );
              }}
            >
              Counterpropose resolver
            </button>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={!canSubmit || !canAcceptProposal}
                onClick={(e) => {
                  void run(
                    e as unknown as FormEvent<HTMLFormElement>,
                    "accept_dispute_resolver",
                    () => ({
                      dispute_id: positiveU64(disputeId, "dispute ID"),
                    }),
                    "Resolver proposal accepted by the other party.",
                  );
                }}
              >
                Accept proposed resolver
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={!canSubmit || !canAcceptAppointment}
                onClick={(e) => {
                  void run(
                    e as unknown as FormEvent<HTMLFormElement>,
                    "accept_dispute_appointment",
                    () => ({
                      dispute_id: positiveU64(disputeId, "dispute ID"),
                    }),
                    "Resolver appointment accepted.",
                  );
                }}
              >
                Accept resolver appointment
              </button>
            </div>
            <label className="field-label">
              Resolution outcome
              <select
                value={disposition}
                onChange={(e) =>
                  setDisposition(e.target.value as DisputeDisposition)
                }
              >
                <option value="upheld">Upheld</option>
                <option value="rejected">Rejected</option>
                <option value="inconclusive">Inconclusive</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </label>
            <label className="field-label">
              Resolution rationale
              <textarea
                rows={3}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!canSubmit || !canResolve || !rationale.trim()}
              onClick={(e) => {
                e.preventDefault();
                void run(
                  e as unknown as FormEvent<HTMLFormElement>,
                  "resolve_dispute",
                  () => ({
                    dispute_id: positiveU64(disputeId, "dispute ID"),
                    disposition,
                    rationale: rationale.trim(),
                  }),
                  "Dispute resolution confirmed.",
                );
              }}
            >
              Resolve dispute
            </button>
            <button
              className="button button-secondary"
              disabled={!canSubmit || !canExpire}
              onClick={(e) => {
                e.preventDefault();
                void run(
                  e as unknown as FormEvent<HTMLFormElement>,
                  "expire_dispute",
                  () => ({ dispute_id: positiveU64(disputeId, "dispute ID") }),
                  "Dispute expiry recorded.",
                );
              }}
            >
              Record dispute expiry
            </button>
          </form>
        </section>
      </div>
      <ActionFeedback
        pending={transactionPending}
        error={error}
        confirmed={confirmed}
      />
    </>
  );
}
