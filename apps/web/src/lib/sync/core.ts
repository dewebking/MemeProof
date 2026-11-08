import { safeRpcErrorMessage } from "./lock-rpc.ts";

export type SourceToken = Record<string, unknown>;

export type SyncedToken = {
  meme_id: number;
  token_id: string | null;
  pool_id: string | null;
  is_finalized: boolean | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  market_eligible: boolean;
  market_failure_count?: number;
  source_record: SourceToken;
};

export type SyncChanges = {
  rows: SyncedToken[];
  newTokens: number;
  updatedTokens: number;
  unchangedTokens: number;
  duplicatesRemoved: number;
};

export type RefreshSummary = {
  trigger: "scheduled" | "manual";
  lockAcquired: boolean;
  sourceSync: "success" | "skipped" | "failed";
  totalTokensDiscovered: number;
  newTokensFound: number;
  tokensUpdated: number;
  marketLookupsAttempted: number;
  successfulMarketMatches: number;
  unavailableMarketRecords: number;
  failedProviderRequests: number;
  startedAt: string;
  finishedAt: string;
};

export type MarketAttempt = {
  marketData: Record<string, unknown> | null;
  providers: { geckoterminal: string; dexscreener: string };
  state: "available" | "contract_unavailable" | "no_matching_pair" | "provider_unavailable" | "pending";
  fetchedAt: string;
};

export function isValidNearAccountId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)+$/.test(value)
  );
}

function readMemeId(record: SourceToken): number | null {
  const value = record.meme_id ?? record.id;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!/^\d{1,10}$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 4_294_967_295 ? id : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 1_000_000_000_000
    ? new Date(numeric)
    : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function toSyncedToken(record: SourceToken): SyncedToken | null {
  const memeId = readMemeId(record);
  if (memeId === null) return null;
  const rawTokenId = record.token_id;
  const tokenId = typeof rawTokenId === "string" && rawTokenId.trim() ? rawTokenId.trim() : null;
  const rawPoolId = record.pool_id;
  const poolId = typeof rawPoolId === "string" || typeof rawPoolId === "number"
    ? String(rawPoolId)
    : null;
  return {
    meme_id: memeId,
    token_id: tokenId,
    pool_id: poolId,
    is_finalized: typeof record.is_finalized === "boolean" ? record.is_finalized : null,
    source_created_at: timestamp(record.created_timestamp_ms ?? record.created_at ?? record.createdAt),
    source_updated_at: timestamp(record.last_change_ms ?? record.updated_at ?? record.updatedAt),
    market_eligible: isValidNearAccountId(tokenId),
    source_record: record,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function prepareSyncChanges(records: SourceToken[], existing: SyncedToken[]): SyncChanges {
  const deduplicated = new Map<number, SyncedToken>();
  let duplicatesRemoved = 0;
  for (const record of records) {
    const token = toSyncedToken(record);
    if (!token) continue;
    if (deduplicated.has(token.meme_id)) duplicatesRemoved += 1;
    deduplicated.set(token.meme_id, token);
  }
  if (records.length > 0 && deduplicated.size === 0) {
    throw new Error("Meme.Cooking returned no records with valid meme IDs.");
  }

  const oldById = new Map(existing.map((token) => [token.meme_id, token]));
  let newTokens = 0;
  let updatedTokens = 0;
  let unchangedTokens = 0;
  for (const [id, token] of deduplicated) {
    const old = oldById.get(id);
    if (!old) newTokens += 1;
    else if (stableJson(old.source_record) !== stableJson(token.source_record)) updatedTokens += 1;
    else unchangedTokens += 1;
  }
  return { rows: [...deduplicated.values()], newTokens, updatedTokens, unchangedTokens, duplicatesRemoved };
}

export function calculateRetryAt(now: Date, failureCount: number): string {
  const exponent = Math.min(Math.max(failureCount - 1, 0), 7);
  const delayMinutes = Math.min(5 * 2 ** exponent, 360);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

export function isMarketSnapshotStale(
  lastSuccessfulRefreshAt: string | null,
  lastAttemptStatus: string | null,
  now: Date,
  refreshIntervalMinutes: number,
): boolean {
  if (!lastSuccessfulRefreshAt) return false;
  const refreshed = Date.parse(lastSuccessfulRefreshAt);
  return (
    lastAttemptStatus !== "matched" ||
    !Number.isFinite(refreshed) ||
    now.getTime() - refreshed >= refreshIntervalMinutes * 60_000
  );
}

export type RefreshJobDependencies = {
  acquireLock(owner: string, leaseSeconds: number): Promise<boolean>;
  releaseLock(owner: string): Promise<void>;
  startRun(trigger: "scheduled" | "manual", startedAt: string): Promise<string>;
  finishRun(id: string, summary: RefreshSummary, errorCode: string | null): Promise<void>;
  getSyncState(): Promise<{ lastSuccessAt: string | null; nextRetryAt: string | null; failureCount: number }>;
  getExistingTokens(): Promise<SyncedToken[]>;
  fetchSourceTokens(): Promise<SourceToken[]>;
  upsertTokens(tokens: SyncedToken[], seenAt: string): Promise<void>;
  markSyncSuccessful(at: string): Promise<void>;
  markSyncFailed(nextRetryAt: string, failureCount: number): Promise<void>;
  countTokens(): Promise<number>;
  getDueMarketTokens(now: string, limit: number): Promise<SyncedToken[]>;
  refreshMarket(token: SyncedToken): Promise<MarketAttempt>;
  recordMarketAttempt(token: SyncedToken, attempt: MarketAttempt, nextAttemptAt: string, failureCount: number): Promise<void>;
  recordMarketFailure(token: SyncedToken, at: string, nextAttemptAt: string, failureCount: number): Promise<void>;
  countUnavailableMarketRecords(): Promise<number>;
  now(): Date;
};

export async function runRefreshJob(
  dependencies: RefreshJobDependencies,
  options: {
    trigger: "scheduled" | "manual";
    owner: string;
    syncIntervalMinutes: number;
    marketBatchSize: number;
    marketRefreshIntervalMinutes: number;
    leaseSeconds?: number;
  },
): Promise<RefreshSummary> {
  const started = dependencies.now();
  const base: RefreshSummary = {
    trigger: options.trigger,
    lockAcquired: false,
    sourceSync: "skipped",
    totalTokensDiscovered: 0,
    newTokensFound: 0,
    tokensUpdated: 0,
    marketLookupsAttempted: 0,
    successfulMarketMatches: 0,
    unavailableMarketRecords: 0,
    failedProviderRequests: 0,
    startedAt: started.toISOString(),
    finishedAt: started.toISOString(),
  };

  let runId: string | null = null;
  let runError: string | null = null;
  try {
    runId = await dependencies.startRun(options.trigger, base.startedAt);
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "refresh_run_start_failed";
    const errorMessage = error instanceof Error ? safeRpcErrorMessage(error.message) : "Refresh run initialization failed.";
    console.error("[sync] refresh run initialization failed", { diagnosticVersion: "lock-rpc-v1", errorCode, errorMessage });
    throw new Error("Refresh run could not be started.");
  }

  let acquired = false;
  try { acquired = await dependencies.acquireLock(options.owner, options.leaseSeconds ?? 900); }
  catch { runError = "refresh_lock_failed"; }
  if (!acquired) {
    base.unavailableMarketRecords = await dependencies.countUnavailableMarketRecords();
    base.finishedAt = dependencies.now().toISOString();
    try { await dependencies.finishRun(runId, base, runError ?? "refresh_lock_unavailable"); } catch { /* Lock contention must not start a second job. */ }
    if (runError) throw new Error("Refresh lock storage is unavailable.");
    return base;
  }
  base.lockAcquired = true;
  try {
    const syncState = await dependencies.getSyncState();
    const now = dependencies.now().getTime();
    const intervalElapsed = !syncState.lastSuccessAt || now - Date.parse(syncState.lastSuccessAt) >= options.syncIntervalMinutes * 60_000;
    const retryElapsed = !syncState.nextRetryAt || now >= Date.parse(syncState.nextRetryAt);
    const syncIsDue = intervalElapsed && retryElapsed;
    if (syncIsDue) {
      try {
        const sourceRecords = await dependencies.fetchSourceTokens();
        const changes = prepareSyncChanges(sourceRecords, await dependencies.getExistingTokens());
        await dependencies.upsertTokens(changes.rows, dependencies.now().toISOString());
        await dependencies.markSyncSuccessful(dependencies.now().toISOString());
        base.sourceSync = "success";
        base.newTokensFound = changes.newTokens;
        base.tokensUpdated = changes.updatedTokens;
      } catch {
        base.sourceSync = "failed";
        runError = "meme_cooking_sync_failed";
        const nextFailureCount = syncState.failureCount + 1;
        await dependencies.markSyncFailed(calculateRetryAt(dependencies.now(), nextFailureCount), nextFailureCount);
      }
    }

    base.totalTokensDiscovered = await dependencies.countTokens();
    const due = await dependencies.getDueMarketTokens(dependencies.now().toISOString(), options.marketBatchSize);
    for (const token of due) {
      if (!token.market_eligible || !isValidNearAccountId(token.token_id)) continue;
      base.marketLookupsAttempted += 1;
      try {
        const result = await dependencies.refreshMarket(token);
        const providerFailures = Object.values(result.providers).filter((state) => state === "unavailable").length;
        base.failedProviderRequests += providerFailures;
        if (result.marketData) base.successfulMarketMatches += 1;
        const failureCount = providerFailures > 0 ? (token.market_failure_count ?? 0) + 1 : 0;
        const nextAttemptAt = failureCount > 0
          ? calculateRetryAt(dependencies.now(), failureCount)
          : new Date(dependencies.now().getTime() + options.marketRefreshIntervalMinutes * 60_000).toISOString();
        await dependencies.recordMarketAttempt(token, result, nextAttemptAt, failureCount);
      } catch {
        base.failedProviderRequests += 1;
        const failureCount = (token.market_failure_count ?? 0) + 1;
        await dependencies.recordMarketFailure(token, dependencies.now().toISOString(), calculateRetryAt(dependencies.now(), failureCount), failureCount);
      }
    }
    base.unavailableMarketRecords = await dependencies.countUnavailableMarketRecords();
  } catch {
    runError = runError ?? "refresh_job_failed";
  } finally {
    base.finishedAt = dependencies.now().toISOString();
    if (runId) {
      try { await dependencies.finishRun(runId, base, runError); } catch { runError = "refresh_history_write_failed"; }
    }
    await dependencies.releaseLock(options.owner);
  }
  return base;
}
