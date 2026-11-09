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
  | "transaction"
  | "submission_uncertain";

export type RegistryReadFailureKind =
  | "rpc_unavailable"
  | "rate_limited"
  | "timeout"
  | "contract_call"
  | "invalid_response"
  | "configuration";

export class RegistryReadError extends Error {
  constructor(
    message: string,
    readonly kind: RegistryReadFailureKind,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
    readonly httpStatus?: number,
  ) {
    super(message, options);
    this.name = "RegistryReadError";
  }
}

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
const SECONDARY_TESTNET_RPC_URL = "https://rpc.testnet.fastnear.com";
const DEFAULT_RPC_TIMEOUT_MS = 4_500;
const DEFAULT_RPC_RETRIES_PER_PROVIDER = 1;
const DEFAULT_RPC_BACKOFF_BASE_MS = 180;
const DEFAULT_RPC_BACKOFF_MAX_MS = 1_500;
const VIEW_CACHE_TTL_MS = 5_000;
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
    throw new RegistryReadError(
      "MemeProof registry actions are restricted to NEAR testnet.",
      "configuration",
    );
  }

  const contractId = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID?.trim();
  if (!contractId) {
    throw new RegistryReadError(
      "Set NEXT_PUBLIC_REGISTRY_CONTRACT_ID to the deployed testnet registry account.",
      "configuration",
    );
  }
  if (
    contractId.length > 64 ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId)
  ) {
    throw new RegistryReadError(
      "NEXT_PUBLIC_REGISTRY_CONTRACT_ID must be a valid NEAR testnet account ID.",
      "configuration",
    );
  }

  return {
    networkId,
    rpcUrl: validateTestnetRpcUrl(process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() || DEFAULT_RPC_URL),
    contractId,
  };
}

function validateTestnetRpcUrl(value: string): string {
  try {
    const url = new URL(value);
    const labels = url.hostname.split(".");
    if (url.protocol !== "https:" || !labels.includes("testnet") || labels.includes("mainnet")) throw new Error();
    return url.toString();
  } catch {
    throw new RegistryReadError("NEAR RPC URL must be a valid HTTPS testnet endpoint.", "configuration");
  }
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

export interface RegistryRpcReadOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retriesPerProvider?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onDiagnostic?: (details: { method: string; provider: "primary" | "secondary"; failure: RegistryReadFailureKind; httpStatus?: number }) => void;
}

interface RpcProvider {
  name: "primary" | "secondary";
  url: string;
}

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableReadError(error: RegistryReadError): boolean {
  return error.kind === "rpc_unavailable" || error.kind === "rate_limited" || error.kind === "timeout";
}

export class NearRegistryClient {
  private readonly activeViews = new Map<string, Promise<unknown>>();
  private readonly cachedViews = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();
  private readCacheGeneration = 0;
  private readonly readOptions: Required<RegistryRpcReadOptions>;

  constructor(
    private readonly config: RegistryClientConfig,
    readOptions: RegistryRpcReadOptions = {},
  ) {
    let primaryUrl: URL;
    try { primaryUrl = new URL(config.rpcUrl); } catch {
      throw new RegistryReadError("NEAR RPC URL must be an HTTPS testnet endpoint.", "configuration");
    }
    const primaryLabels = primaryUrl.hostname.split(".");
    if (config.networkId !== "testnet" || primaryUrl.protocol !== "https:" || !primaryLabels.includes("testnet") || primaryLabels.includes("mainnet")) {
      throw new RegistryReadError("NEAR RPC URL must be an HTTPS testnet endpoint.", "configuration");
    }
    this.readOptions = {
      fetch: readOptions.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      timeoutMs: readOptions.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
      retriesPerProvider: readOptions.retriesPerProvider ?? DEFAULT_RPC_RETRIES_PER_PROVIDER,
      backoffBaseMs: readOptions.backoffBaseMs ?? DEFAULT_RPC_BACKOFF_BASE_MS,
      backoffMaxMs: readOptions.backoffMaxMs ?? DEFAULT_RPC_BACKOFF_MAX_MS,
      random: readOptions.random ?? Math.random,
      sleep: readOptions.sleep ?? defaultSleep,
      onDiagnostic: readOptions.onDiagnostic ?? ((details) => console.warn("[MemeProof] NEAR testnet read failed", details)),
    };
  }

  static fromEnvironment(): NearRegistryClient {
    return new NearRegistryClient(registryConfig());
  }

  async view<T>(
    methodName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    let normalizedArgs: Record<string, unknown>;
    try {
      normalizedArgs = normalizeViewArguments(args);
    } catch (cause) {
      throw new RegistryReadError("Invalid registry view arguments.", "configuration", undefined, { cause });
    }
    const key = `${methodName}:${jsonWithBigInts(normalizedArgs)}`;
    const cached = this.cachedViews.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise as Promise<T>;
    const existing = this.activeViews.get(key);
    if (existing) return existing as Promise<T>;

    const request = this.readFromProviders<T>(methodName, normalizedArgs);
    const generation = this.readCacheGeneration;
    this.activeViews.set(key, request);
    request.then((value) => {
      if (generation === this.readCacheGeneration) {
        this.cachedViews.set(key, { expiresAt: Date.now() + VIEW_CACHE_TTL_MS, promise: Promise.resolve(value) });
      }
    }, () => undefined);
    void request.finally(() => {
      if (this.activeViews.get(key) === request) this.activeViews.delete(key);
    }).catch(() => undefined);
    return request;
  }

  clearReadCache(): void {
    this.readCacheGeneration += 1;
    this.cachedViews.clear();
    this.activeViews.clear();
  }

  private async readFromProviders<T>(
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const providers: RpcProvider[] = [
      { name: "primary", url: this.config.rpcUrl },
      { name: "secondary", url: SECONDARY_TESTNET_RPC_URL },
    ];
    const candidates = providers.filter((provider, index, all) => all.findIndex((item) => item.url.replace(/\/$/, "") === provider.url.replace(/\/$/, "")) === index);
    const errors: RegistryReadError[] = [];

    for (const provider of candidates) {
      const maxAttempts = this.readOptions.retriesPerProvider + 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          return await this.requestView<T>(provider, methodName, args);
        } catch (cause) {
          const error = cause instanceof RegistryReadError
            ? cause
            : new RegistryReadError("NEAR testnet RPC is unavailable.", "rpc_unavailable", undefined, { cause });
          errors.push(error);
          this.readOptions.onDiagnostic({
            method: methodName,
            provider: provider.name,
            failure: error.kind,
            ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
          });
          if (error.kind === "contract_call" || error.kind === "configuration") throw error;
          if (!isRetryableReadError(error) || attempt + 1 >= maxAttempts) break;

          const backoff = Math.min(
            this.readOptions.backoffBaseMs * 2 ** (errors.length - 1) * (0.75 + this.readOptions.random() * 0.5),
            this.readOptions.backoffMaxMs,
          );
          const waitMs = Math.max(backoff, error.retryAfterMs ?? 0);
          // A long Retry-After is honored by not retrying that provider; the independent testnet provider may still be tried now.
          if (waitMs > this.readOptions.backoffMaxMs) break;
          await this.readOptions.sleep(waitMs);
        }
      }
    }

    const last = errors[errors.length - 1];
    if (!last) throw new RegistryReadError("NEAR testnet RPC is unavailable.", "rpc_unavailable");
    if (last.kind === "contract_call" || last.kind === "configuration") throw last;
    const kinds = new Set(errors.map((error) => error.kind));
    if (kinds.has("rate_limited")) {
      throw new RegistryReadError("NEAR testnet RPC providers are rate limited. Try again shortly.", "rate_limited", undefined, { cause: last });
    }
    if (kinds.has("timeout")) {
      throw new RegistryReadError("NEAR testnet RPC request timed out. Try again.", "timeout", undefined, { cause: last });
    }
    if (kinds.has("invalid_response")) {
      throw new RegistryReadError("NEAR testnet RPC returned an invalid response.", "invalid_response", undefined, { cause: last });
    }
    throw new RegistryReadError("NEAR testnet RPC is unavailable. Try again.", "rpc_unavailable", undefined, { cause: last });
  }

  private async requestView<T>(
    provider: RpcProvider,
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.readOptions.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.readOptions.fetch(provider.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "memeproof-registry-view",
            method: "query",
            params: {
              request_type: "call_function",
              finality: "final",
              account_id: this.config.contractId,
              method_name: methodName,
              args_base64: encodeBase64Utf8(jsonWithBigInts(args)),
            },
          }),
        });
      } catch (cause) {
        if (controller.signal.aborted) throw new RegistryReadError("NEAR testnet RPC request timed out.", "timeout", undefined, { cause });
        throw new RegistryReadError("Could not reach NEAR testnet RPC (network or browser access failure).", "rpc_unavailable", undefined, { cause });
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new RegistryReadError("NEAR testnet RPC rate limited the request.", "rate_limited", retryAfterMilliseconds(response.headers.get("retry-after")), undefined, response.status);
        }
        if (response.status === 408 || response.status === 504) {
          throw new RegistryReadError(`NEAR testnet RPC request timed out (HTTP ${response.status}).`, "timeout", undefined, undefined, response.status);
        }
        if (response.status >= 500) {
          throw new RegistryReadError(`NEAR testnet RPC is unavailable (HTTP ${response.status}).`, "rpc_unavailable", undefined, undefined, response.status);
        }
        throw new RegistryReadError(`NEAR testnet RPC rejected the read request (HTTP ${response.status}).`, "invalid_response", undefined, undefined, response.status);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        if (controller.signal.aborted) throw new RegistryReadError("NEAR testnet RPC request timed out.", "timeout", undefined, { cause });
        throw new RegistryReadError("NEAR testnet RPC returned invalid JSON.", "invalid_response", undefined, { cause });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new RegistryReadError("NEAR testnet RPC returned an invalid response envelope.", "invalid_response");
      }
      const rpcError = getRpcError(body);
      if (rpcError) throw new RegistryReadError(`NEAR contract call failed: ${rpcError}`, "contract_call");

      const rpcResult = (body as { result?: { result?: number[] } }).result?.result;
      if (!Array.isArray(rpcResult) || !rpcResult.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
        throw new RegistryReadError("NEAR testnet RPC returned an invalid view result.", "invalid_response");
      }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(rpcResult));
        return parseNearJson<T>(text);
      } catch (cause) {
        throw new RegistryReadError("NEAR testnet RPC returned an invalid view result payload.", "invalid_response", undefined, { cause });
      }
    } finally {
      clearTimeout(timeout);
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
      if (cause instanceof RegistryTransactionError) throw cause;
      throw normalizeTransactionError(cause);
    }

    const failed = failedOutcomeMessage(outcome);
    if (failed) throw normalizeTransactionError(failed, false);

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
  if (cause instanceof RegistryReadError) {
    switch (cause.kind) {
      case "rpc_unavailable": return "NEAR testnet RPC is unavailable right now. Try again shortly.";
      case "rate_limited": return "NEAR testnet RPC is rate limited. Wait briefly, then try again.";
      case "timeout": return "The NEAR testnet RPC request timed out. Try again.";
      case "contract_call": return cause.message;
      case "invalid_response": return "NEAR testnet RPC returned an invalid response. Try again; if this continues, report it to support.";
      case "configuration": return cause.message;
    }
  }
  if (cause instanceof RegistryTransactionError && cause.kind === "submission_uncertain") {
    return "The wallet request ended before MemeProof could confirm its result. Check the transaction status in your wallet or the NEAR testnet explorer before trying again.";
  }
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (/attached deposit does not cover .*storage/i.test(raw)) {
    return "The attached storage deposit was insufficient. Increase the storage allowance and retry.";
  }
  if (/reject|denied|cancel(?:led|ed)? by (?:the )?user/i.test(raw)) {
    return "The wallet request was rejected. No registry record was created.";
  }
  return raw;
}

function normalizeTransactionError(cause: unknown, submissionUncertain = true): RegistryTransactionError {
  if (cause instanceof RegistryTransactionError) return cause;
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
  return submissionUncertain
    ? new RegistryTransactionError(
        "The wallet request ended before the transaction result was confirmed. Check transaction status before trying again; MemeProof will not resubmit it automatically.",
        "submission_uncertain",
        { cause },
      )
    : new RegistryTransactionError(raw, "transaction", { cause });
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
      "The wallet returned no contract result. Check transaction status before trying again; MemeProof will not resubmit it automatically.",
      "submission_uncertain",
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
      "The wallet reports transaction success, but MemeProof could not read its contract result. Check transaction status before trying again.",
      "submission_uncertain",
      { cause },
    );
  }
}

function transactionHash(outcome: unknown): string | null {
  const transaction = (outcome as { transaction?: { hash?: unknown } })
    .transaction;
  return typeof transaction?.hash === "string" ? transaction.hash : null;
}
