export type NearInteger = number | string;

export interface TokenIdentity {
  network_id: "testnet";
  token_contract_address: string;
}

export interface TokenRecord {
  id: NearInteger;
  identity: TokenIdentity;
  registrant: string;
  created_at_ns: NearInteger;
  metadata_uri: string | null;
  status: "active";
}

export interface TokenPage {
  records: TokenRecord[];
  next_cursor: NearInteger | null;
}

export interface CommitmentRecord {
  id: NearInteger;
  token_id: NearInteger;
  creator: string;
  current_version: number;
  created_at_ns: NearInteger;
}

export interface CommitmentVersion {
  version: number;
  title: string;
  description: string;
  criteria: string;
  deadline_at_ns: NearInteger;
  created_at_ns: NearInteger;
}

export interface CommitmentWithCurrentVersion {
  commitment: CommitmentRecord;
  current_version: CommitmentVersion;
}

export interface CommitmentVersionPage {
  versions: CommitmentVersion[];
  next_cursor: number | null;
}

export interface EvidenceRecord {
  id: NearInteger;
  commitment_id: NearInteger;
  version: number;
  reference: string;
  content_hash: string;
  submitter: string;
  submitted_at_ns: NearInteger;
}

export interface EvidencePage {
  records: EvidenceRecord[];
  next_cursor: NearInteger | null;
}

export type ReviewOutcome = "supports" | "challenges" | "inconclusive";

export interface ReviewRecord {
  id: NearInteger;
  reviewer: string;
  commitment_id: NearInteger;
  evidence_id: NearInteger;
  version: number;
  outcome: ReviewOutcome;
  explanation: string;
  submitted_at_ns: NearInteger;
}

export interface ReviewPage {
  records: ReviewRecord[];
  next_cursor: NearInteger | null;
}

export type DisputeTarget =
  | { commitment: { commitment_id: NearInteger; version: number } }
  | { evidence: { evidence_id: NearInteger } };

export type DisputeStatus = "open" | "under_review" | "resolved" | "expired";

export interface DisputeRecord {
  id: NearInteger;
  target: DisputeTarget;
  commitment_id: NearInteger;
  version: number;
  evidence_id: NearInteger | null;
  opener: string;
  affected_party: string;
  proposed_resolver: string;
  proposal_by: string;
  other_party_accepted: boolean;
  resolver_accepted: boolean;
  counterproposal_used: boolean;
  reason: string;
  created_at_ns: NearInteger;
  response_deadline_ns: NearInteger;
  resolver_deadline_ns: NearInteger;
  resolution_deadline_ns: NearInteger | null;
  status: DisputeStatus;
}

export interface DisputeResponse {
  dispute_id: NearInteger;
  responder: string;
  response: string;
  responded_at_ns: NearInteger;
}

export type DisputeDisposition =
  "upheld" | "rejected" | "inconclusive" | "dismissed";

export interface DisputeResolutionRecord {
  dispute_id: NearInteger;
  resolver: string;
  disposition: DisputeDisposition;
  rationale: string;
  resolved_at_ns: NearInteger;
}

export interface DisputePage {
  records: DisputeRecord[];
  next_cursor: NearInteger | null;
}

export interface HistoryEvent {
  id: NearInteger;
  actor: string;
  occurred_at_ns: NearInteger;
  kind: Record<string, unknown>;
}

export interface HistoryEventPage {
  records: HistoryEvent[];
  next_cursor: NearInteger | null;
}

export interface RegistryConfig {
  network_id: "testnet";
  schema_version: number;
  max_text_bytes: number;
  max_metadata_uri_bytes: number;
  max_page_size: number;
}

export interface RegisterTokenArgs {
  token_contract_address: string;
  metadata_uri: string | null;
}

export interface CreateCommitmentArgs {
  token_id: string;
  title: string;
  description: string;
  criteria: string;
  deadline_at_ns: string;
}

export interface RegistryClientConfig {
  networkId: "testnet";
  rpcUrl: string;
  contractId: string;
}

export interface NearWalletSigner {
  signAndSendTransaction(params: {
    network: "testnet";
    signerId: string;
    receiverId: string;
    actions: Array<{
      type: "FunctionCall";
      params: {
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      };
    }>;
  }): Promise<unknown>;
}

export type RegistryTransactionFailureKind =
  | "configuration"
  | "rpc"
  | "wallet_rejected"
  | "storage_deposit"
  | "contract"
  | "transaction";

export class RegistryTransactionError extends Error {
  constructor(
    message: string,
    readonly kind: RegistryTransactionFailureKind,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RegistryTransactionError";
  }
}

export interface RegistryTransactionResult<T> {
  value: T;
  transactionHash: string | null;
}

const DEFAULT_RPC_URL = "https://rpc.testnet.near.org";
const FUNCTION_CALL_GAS = "100000000000000";
const PAGE_LIMIT = 50;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const U64_ARGUMENT_KEYS = new Set([
  "after_id",
  "token_id",
  "commitment_id",
  "evidence_id",
  "review_id",
  "dispute_id",
]);

function normalizeViewArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      U64_ARGUMENT_KEYS.has(key) &&
      typeof value === "string" &&
      /^\d+$/.test(value)
        ? BigInt(value)
        : value,
    ]),
  );
}

function checkedPageLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT) {
    throw new RegistryTransactionError(
      `Page limit must be between 1 and ${PAGE_LIMIT}.`,
      "configuration",
    );
  }
  return limit;
}

function registryConfig(): RegistryClientConfig {
  const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK_ID ?? "testnet";
  if (networkId !== "testnet") {
    throw new RegistryTransactionError(
      "MemeProof registry actions are restricted to NEAR testnet.",
      "configuration",
    );
  }

  const contractId = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID?.trim();
  if (!contractId) {
    throw new RegistryTransactionError(
      "Set NEXT_PUBLIC_REGISTRY_CONTRACT_ID to the deployed testnet registry account.",
      "configuration",
    );
  }
  if (
    contractId.length > 64 ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId)
  ) {
    throw new RegistryTransactionError(
      "NEXT_PUBLIC_REGISTRY_CONTRACT_ID must be a valid NEAR testnet account ID.",
      "configuration",
    );
  }

  return {
    networkId,
    rpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() || DEFAULT_RPC_URL,
    contractId,
  };
}

function jsonWithBigInts(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? { __near_u64__: item.toString() } : item,
  ).replace(/\{"__near_u64__":"(\d+)"\}/g, "$1");
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function preserveLargeIntegers(json: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < json.length;) {
    const char = json[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      let end = index + 1;
      while (end < json.length && /[0-9.eE+-]/.test(json[end])) end += 1;
      const numeric = json.slice(index, end);
      if (/^-?\d+$/.test(numeric)) {
        try {
          if (
            BigInt(numeric) > MAX_SAFE_BIGINT ||
            BigInt(numeric) < -MAX_SAFE_BIGINT
          ) {
            output += `"${numeric}"`;
          } else {
            output += numeric;
          }
        } catch {
          output += numeric;
        }
      } else {
        output += numeric;
      }
      index = end;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

function parseNearJson<T>(json: string): T {
  return JSON.parse(preserveLargeIntegers(json)) as T;
}

function errorMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error_message", "name"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
    return JSON.stringify(body);
  }
  return String(body);
}

function getRpcError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.error !== undefined) return errorMessage(record.error);
  const result = record.result;
  if (result && typeof result === "object" && "error" in result) {
    return errorMessage((result as Record<string, unknown>).error);
  }
  return null;
}

export class NearRegistryClient {
  constructor(private readonly config: RegistryClientConfig) {}

  static fromEnvironment(): NearRegistryClient {
    return new NearRegistryClient(registryConfig());
  }

  async view<T>(
    methodName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "memeproof-registry-view",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: this.config.contractId,
            method_name: methodName,
            args_base64: encodeBase64Utf8(
              jsonWithBigInts(normalizeViewArguments(args)),
            ),
          },
        }),
      });
    } catch (cause) {
      throw new RegistryTransactionError(
        "Could not reach the configured NEAR testnet RPC.",
        "rpc",
        { cause },
      );
    }

    if (!response.ok) {
      throw new RegistryTransactionError(
        `NEAR RPC returned HTTP ${response.status}.`,
        "rpc",
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new RegistryTransactionError(
        "NEAR RPC returned an invalid JSON response.",
        "rpc",
        { cause },
      );
    }
    const rpcError = getRpcError(body);
    if (rpcError) throw new RegistryTransactionError(rpcError, "rpc");

    const rpcResult = (body as { result?: { result?: number[] } }).result
      ?.result;
    if (
      !Array.isArray(rpcResult) ||
      !rpcResult.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
      )
    ) {
      throw new RegistryTransactionError(
        "NEAR RPC returned an invalid view result.",
        "rpc",
      );
    }

    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(rpcResult),
      );
      return parseNearJson<T>(text);
    } catch (cause) {
      throw new RegistryTransactionError(
        "NEAR RPC returned an invalid view result payload.",
        "rpc",
        { cause },
      );
    }
  }

  async submit<T>(
    wallet: NearWalletSigner,
    signerId: string,
    methodName: string,
    args: Record<string, unknown>,
    attachedDepositYocto: bigint,
  ): Promise<RegistryTransactionResult<T>> {
    if (attachedDepositYocto < BigInt(0)) {
      throw new RegistryTransactionError(
        "Storage deposit cannot be negative.",
        "configuration",
      );
    }

    let outcome: unknown;
    try {
      outcome = await wallet.signAndSendTransaction({
        network: "testnet",
        signerId,
        receiverId: this.config.contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName,
              args: serializeTransactionArgs(args, methodName),
              gas: FUNCTION_CALL_GAS,
              deposit: attachedDepositYocto.toString(),
            },
          },
        ],
      });
    } catch (cause) {
      throw normalizeTransactionError(cause);
    }

    const failed = failedOutcomeMessage(outcome);
    if (failed) throw normalizeTransactionError(failed);

    const result = successfulReturnValue<T>(outcome);
    return {
      value: result,
      transactionHash: transactionHash(outcome),
    };
  }

  getConfig(): Promise<RegistryConfig> {
    return this.view("get_config");
  }

  getToken(tokenId: NearInteger): Promise<TokenRecord | null> {
    return this.view("get_token", { token_id: tokenId });
  }

  getTokens(
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<TokenPage> {
    return this.view("get_tokens", {
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getCommitment(
    commitmentId: NearInteger,
  ): Promise<CommitmentWithCurrentVersion | null> {
    return this.view("get_commitment", { commitment_id: commitmentId });
  }

  getCommitmentVersion(
    commitmentId: NearInteger,
    version: number,
  ): Promise<CommitmentVersion | null> {
    return this.view("get_commitment_version", {
      commitment_id: commitmentId,
      version,
    });
  }

  getCommitmentVersions(
    commitmentId: NearInteger,
    afterVersion: number | null = null,
    limit = PAGE_LIMIT,
  ): Promise<CommitmentVersionPage> {
    return this.view("get_commitment_versions", {
      commitment_id: commitmentId,
      after_version: afterVersion,
      limit: checkedPageLimit(limit),
    });
  }

  getEvidence(evidenceId: NearInteger): Promise<EvidenceRecord | null> {
    return this.view("get_evidence", { evidence_id: evidenceId });
  }

  getEvidences(
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<EvidencePage> {
    return this.view("get_evidences", {
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getCommitmentEvidences(
    commitmentId: NearInteger,
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<EvidencePage> {
    return this.view("get_commitment_evidences", {
      commitment_id: commitmentId,
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getReview(reviewId: NearInteger): Promise<ReviewRecord | null> {
    return this.view("get_review", { review_id: reviewId });
  }

  getReviews(
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<ReviewPage> {
    return this.view("get_reviews", {
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getReviewsByEvidence(
    evidenceId: NearInteger,
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<ReviewPage> {
    return this.view("get_reviews_by_evidence", {
      evidence_id: evidenceId,
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getDispute(disputeId: NearInteger): Promise<DisputeRecord | null> {
    return this.view("get_dispute", { dispute_id: disputeId });
  }

  getDisputeResponse(disputeId: NearInteger): Promise<DisputeResponse | null> {
    return this.view("get_dispute_response", { dispute_id: disputeId });
  }

  getDisputeResolution(
    disputeId: NearInteger,
  ): Promise<DisputeResolutionRecord | null> {
    return this.view("get_dispute_resolution", { dispute_id: disputeId });
  }

  getDisputes(
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<DisputePage> {
    return this.view("get_disputes", {
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getDisputesByCommitment(
    commitmentId: NearInteger,
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<DisputePage> {
    return this.view("get_disputes_by_commitment", {
      commitment_id: commitmentId,
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getDisputesByEvidence(
    evidenceId: NearInteger,
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<DisputePage> {
    return this.view("get_disputes_by_evidence", {
      evidence_id: evidenceId,
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  getHistoryEvents(
    afterId: NearInteger | null = null,
    limit = PAGE_LIMIT,
  ): Promise<HistoryEventPage> {
    return this.view("get_history_events", {
      after_id: afterId,
      limit: checkedPageLimit(limit),
    });
  }

  registerToken(
    wallet: NearWalletSigner,
    signerId: string,
    args: RegisterTokenArgs,
    deposit: bigint,
  ): Promise<RegistryTransactionResult<TokenRecord>> {
    return this.submit(
      wallet,
      signerId,
      "register_token",
      { ...args },
      deposit,
    );
  }

  createCommitment(
    wallet: NearWalletSigner,
    signerId: string,
    args: CreateCommitmentArgs,
    deposit: bigint,
  ): Promise<RegistryTransactionResult<CommitmentWithCurrentVersion>> {
    return this.submit(
      wallet,
      signerId,
      "create_commitment_decimal",
      { ...args },
      deposit,
    );
  }
}

const U64_TRANSACTION_ARGUMENTS: Record<string, ReadonlySet<string>> = {
  submit_evidence: new Set(["commitment_id"]),
  submit_review: new Set(["evidence_id"]),
  open_dispute: new Set(["commitment_id", "evidence_id"]),
  respond_to_dispute: new Set(["dispute_id"]),
  counterpropose_dispute_resolver: new Set(["dispute_id"]),
  accept_dispute_resolver: new Set(["dispute_id"]),
  accept_dispute_appointment: new Set(["dispute_id"]),
  resolve_dispute: new Set(["dispute_id"]),
  expire_dispute: new Set(["dispute_id"]),
  amend_commitment: new Set(["commitment_id", "deadline_at_ns"]),
  create_commitment: new Set(["token_id", "deadline_at_ns"]),
};

function encodeJsonU64(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new RegistryTransactionError(
      `Transaction argument ${field} must be an unsigned integer.`,
      "configuration",
    );
  }
  const decimal = String(value);
  if (!/^\d+$/.test(decimal)) {
    throw new RegistryTransactionError(
      `Transaction argument ${field} must be an unsigned integer.`,
      "configuration",
    );
  }
  const parsed = BigInt(decimal);
  if (parsed > BigInt("18446744073709551615")) {
    throw new RegistryTransactionError(
      `Transaction argument ${field} exceeds the contract's u64 range.`,
      "configuration",
    );
  }
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RegistryTransactionError(
      `Transaction argument ${field} exceeds the safe integer range supported by this wallet serializer.`,
      "configuration",
    );
  }
  return Number(parsed);
}

function encodeTransactionU64Fields(
  value: unknown,
  fields: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => encodeTransactionU64Fields(item, fields));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      fields.has(key)
        ? encodeJsonU64(child, key)
        : encodeTransactionU64Fields(child, fields),
    ]),
  );
}

/**
 * HOT Connect accepts JSON-compatible argument objects. Rust `u64` parameters
 * must be JSON numbers, while create_commitment_decimal deliberately accepts
 * token IDs and nanosecond deadlines as decimal strings to preserve precision.
 */
export function serializeTransactionArgs(
  args: Record<string, unknown>,
  methodName?: string,
): Record<string, unknown> {
  try {
    const fields = methodName ? U64_TRANSACTION_ARGUMENTS[methodName] : undefined;
    const encoded = fields ? encodeTransactionU64Fields(args, fields) : args;
    return JSON.parse(JSON.stringify(encoded)) as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof RegistryTransactionError) throw cause;
    throw new RegistryTransactionError(
      "Transaction arguments must match the contract JSON types and be JSON-compatible.",
      "configuration",
      { cause },
    );
  }
}

let defaultClient: NearRegistryClient | null = null;

export function getRegistryClient(): NearRegistryClient {
  if (!defaultClient) defaultClient = NearRegistryClient.fromEnvironment();
  return defaultClient;
}

export function nearToYocto(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,24}))?$/.exec(value.trim());
  if (!match)
    throw new Error("Enter a NEAR amount with up to 24 decimal places.");
  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(24, "0") || "0");
  return whole * BigInt(10) ** BigInt(24) + fractional;
}

export function explainTransactionError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (/attached deposit does not cover .*storage/i.test(raw)) {
    return "The attached storage deposit was insufficient. Increase the storage allowance and retry.";
  }
  if (/reject|denied|cancel(?:led|ed)? by (?:the )?user/i.test(raw)) {
    return "The wallet request was rejected. No registry record was created.";
  }
  return raw;
}

function normalizeTransactionError(cause: unknown): RegistryTransactionError {
  const raw = cause instanceof Error ? cause.message : errorMessage(cause);
  if (/attached deposit does not cover .*storage/i.test(raw)) {
    return new RegistryTransactionError(
      explainTransactionError(raw),
      "storage_deposit",
      { cause },
    );
  }
  if (/reject|denied|cancel(?:led|ed)? by (?:the )?user/i.test(raw)) {
    return new RegistryTransactionError(
      explainTransactionError(raw),
      "wallet_rejected",
      { cause },
    );
  }
  return new RegistryTransactionError(raw, "transaction", { cause });
}

function failedOutcomeMessage(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== "object")
    return "Wallet returned an invalid transaction result.";
  const root = outcome as Record<string, unknown>;
  const failure = (status: unknown): string | null => {
    if (!status || typeof status !== "object") return null;
    const record = status as Record<string, unknown>;
    return record.Failure === undefined ? null : errorMessage(record.Failure);
  };
  const topFailure = failure(root.status);
  if (topFailure) return topFailure;

  const outcomes: unknown[] = [
    root.transaction_outcome,
    ...(Array.isArray(root.receipts_outcome) ? root.receipts_outcome : []),
  ];
  for (const item of outcomes) {
    if (!item || typeof item !== "object") continue;
    const outcomeRecord = (item as Record<string, unknown>).outcome;
    if (!outcomeRecord || typeof outcomeRecord !== "object") continue;
    const message = failure((outcomeRecord as Record<string, unknown>).status);
    if (message) return message;
  }
  return null;
}

function successfulReturnValue<T>(outcome: unknown): T {
  const status = (outcome as { status?: Record<string, unknown> }).status;
  const encoded = status?.SuccessValue;
  if (typeof encoded !== "string") {
    throw new RegistryTransactionError(
      "The transaction completed without a contract return value.",
      "transaction",
    );
  }
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return parseNearJson<T>(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new RegistryTransactionError(
      "The transaction succeeded, but its contract return value could not be decoded.",
      "transaction",
      { cause },
    );
  }
}

function transactionHash(outcome: unknown): string | null {
  const transaction = (outcome as { transaction?: { hash?: unknown } })
    .transaction;
  return typeof transaction?.hash === "string" ? transaction.hash : null;
}
