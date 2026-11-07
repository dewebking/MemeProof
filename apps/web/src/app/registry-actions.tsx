"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  explainTransactionError,
  nearToYocto,
  type CommitmentWithCurrentVersion,
  type TokenRecord,
} from "../lib/near/registry";
import { useNearWallet } from "./wallet-context";

const DEFAULT_STORAGE_DEPOSIT = "1";
const U64_MAX = BigInt(2) ** BigInt(64) - BigInt(1);

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
