import "server-only";
import type { MarketAttempt, RefreshSummary, SourceToken, SyncedToken } from "./core";
import { describeLockRpcResult, describeTransportError, isNextDynamicUsageError, lockWasAcquired, safeRpcErrorMessage } from "./lock-rpc";
import { validateSupabaseServerKey } from "./supabase-key";

type DbRow = Record<string, unknown>;

export class SyncStoreError extends Error {
  public readonly code: string;
  constructor(code: string, message = "Persistent synchronization storage is unavailable.") { super(message); this.code = code; }
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  let projectRef = "unknown";
  try { projectRef = new URL(url).hostname.split(".")[0] || "unknown"; } catch { /* Keep diagnostic output free of the configured URL. */ }
  const rawCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  const deployment = rawCommit && /^[a-f0-9]{7,40}$/i.test(rawCommit) ? rawCommit : "unknown";
  const keyValidation = validateSupabaseServerKey(key, projectRef);
  return { url, key, projectRef, deployment, keyValidation };
}

function logInvalidKey(settings: NonNullable<ReturnType<typeof config>>) {
  console.error("[sync] Supabase server key validation failed", {
    diagnosticVersion: "lock-rpc-v1",
    projectRef: settings.projectRef,
    deployment: settings.deployment,
    keyConfigured: settings.key.length > 0,
    keyFormat: settings.keyValidation.format,
    keyRole: settings.keyValidation.role,
    keyMatchesProject: settings.keyValidation.matchesProject,
    issue: settings.keyValidation.issue,
  });
}

export function isSyncStoreConfigured(): boolean {
  const settings = config();
  if (!settings) return false;
  if (!settings.keyValidation.valid) logInvalidKey(settings);
  return settings.keyValidation.valid;
}

async function db(path: string, init: RequestInit = {}): Promise<Response> {
  const settings = config();
  if (!settings) throw new SyncStoreError("storage_not_configured");
  if (!settings.keyValidation.valid) {
    logInvalidKey(settings);
    throw new SyncStoreError("storage_invalid_service_role_key", `Supabase server key validation failed: ${settings.keyValidation.issue}.`);
  }
  let response: Response;
  try {
    response = await fetch(`${settings.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: settings.key,
        Authorization: `Bearer ${settings.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    const diagnostic = describeTransportError(error);
    console.error("[sync] Supabase transport failed before HTTP response", {
      diagnosticVersion: "lock-rpc-v1",
      projectRef: settings.projectRef,
      deployment: settings.deployment,
      operation: path.split("?")[0],
      serviceRoleKeyConfigured: true,
      serviceRoleKeyRole: settings.keyValidation.role,
      ...diagnostic,
    });
    throw new SyncStoreError("storage_request_failed", diagnostic.errorMessage);
  }
  if (!response.ok) {
    let code = `storage_http_${response.status}`;
    let message = `Supabase request failed with HTTP ${response.status}.`;
    try {
      const payload: unknown = await response.clone().json();
      if (typeof payload === "object" && payload !== null) {
        const row = payload as Record<string, unknown>;
        if (typeof row.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(row.code)) code = row.code;
        if (typeof row.message === "string") message = safeRpcErrorMessage(row.message);
      }
    } catch { /* Preserve the status-only diagnostic for non-JSON errors. */ }
    throw new SyncStoreError(code, message);
  }
  return response;
}

async function rows(path: string): Promise<DbRow[]> {
  const result: DbRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await db(path, { headers: { Range: `${offset}-${offset + 999}` } });
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw new SyncStoreError("storage_invalid_response");
    result.push(...page as DbRow[]);
    if (page.length < 1000) return result;
  }
}

function synced(row: DbRow): SyncedToken {
  return {
    meme_id: Number(row.meme_id), token_id: typeof row.token_id === "string" ? row.token_id : null,
    pool_id: typeof row.pool_id === "string" ? row.pool_id : null,
    is_finalized: typeof row.is_finalized === "boolean" ? row.is_finalized : null,
    source_created_at: typeof row.source_created_at === "string" ? row.source_created_at : null,
    source_updated_at: typeof row.source_updated_at === "string" ? row.source_updated_at : null,
    market_eligible: row.market_eligible === true,
    market_failure_count: Number(row.market_failure_count ?? 0),
    source_record: (row.source_record && typeof row.source_record === "object" ? row.source_record : {}) as SourceToken,
  };
}

async function rpc(name: string, body: DbRow): Promise<unknown> {
  const response = await db(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  if (response.status === 204) return null;
  return response.json();
}

export const syncStore = {
  async acquireLock(owner: string, leaseSeconds: number) {
    const settings = config();
    try {
      const result = await rpc("acquire_memeproof_refresh_lock", { p_owner: owner, p_lease_seconds: leaseSeconds });
      const diagnostic = describeLockRpcResult(result);
      console.info("[sync] refresh lock RPC completed", {
        diagnosticVersion: "lock-rpc-v1",
        projectRef: settings?.projectRef ?? "unconfigured",
        deployment: settings?.deployment ?? "unknown",
        ...diagnostic,
      });
      return lockWasAcquired(result);
    } catch (error) {
      const storageError = error instanceof SyncStoreError ? error : null;
      console.error("[sync] refresh lock RPC failed", {
        diagnosticVersion: "lock-rpc-v1",
        projectRef: settings?.projectRef ?? "unconfigured",
        deployment: settings?.deployment ?? "unknown",
        errorCode: storageError?.code ?? "storage_request_failed",
        errorMessage: safeRpcErrorMessage(storageError?.message ?? "Supabase RPC request failed."),
      });
      throw error;
    }
  },
  async releaseLock(owner: string) { await rpc("release_memeproof_refresh_lock", { p_owner: owner }); },
  async startRun(trigger: "scheduled" | "manual", startedAt: string): Promise<string> {
    const response = await db("meme_cooking_refresh_runs", { method: "POST", body: JSON.stringify({ trigger, started_at: startedAt }) });
    const value: unknown = await response.json();
    if (!Array.isArray(value) || typeof value[0]?.id !== "string") throw new SyncStoreError("storage_invalid_response");
    return value[0].id;
  },
  async finishRun(id: string, summary: RefreshSummary, errorCode: string | null) {
    await db(`meme_cooking_refresh_runs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ finished_at: summary.finishedAt, summary, error_code: errorCode }) });
  },
  async getSyncState() {
    const data = await rows("meme_cooking_sync_state?state_key=eq.meme-list&select=last_success_at,next_retry_at,failure_count");
    const row = data[0] ?? {};
    return { lastSuccessAt: typeof row.last_success_at === "string" ? row.last_success_at : null, nextRetryAt: typeof row.next_retry_at === "string" ? row.next_retry_at : null, failureCount: Number(row.failure_count ?? 0) };
  },
  async getExistingTokens() {
    return (await rows("meme_cooking_tokens?select=meme_id,token_id,pool_id,is_finalized,source_created_at,source_updated_at,market_eligible,market_failure_count,source_record")).map(synced);
  },
  async fetchSourceTokens() { throw new Error("The source client must be provided by the sync service."); },
  async upsertTokens(tokens: SyncedToken[], seenAt: string) {
    for (let start = 0; start < tokens.length; start += 250) {
      const batch = tokens.slice(start, start + 250).map((token) => ({ meme_id: token.meme_id, token_id: token.token_id, pool_id: token.pool_id, is_finalized: token.is_finalized, source_created_at: token.source_created_at, source_updated_at: token.source_updated_at, source_record: token.source_record, market_eligible: token.market_eligible, last_seen_at: seenAt }));
      await db("meme_cooking_tokens?on_conflict=meme_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    }
  },
  async markSyncSuccessful(at: string) {
    await db("meme_cooking_sync_state?on_conflict=state_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ state_key: "meme-list", last_success_at: at, next_retry_at: null, failure_count: 0 }) });
  },
  async markSyncFailed(nextRetryAt: string, failureCount: number) {
    await db("meme_cooking_sync_state?on_conflict=state_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ state_key: "meme-list", next_retry_at: nextRetryAt, failure_count: failureCount }) });
  },
  async countTokens() { return (await rows("meme_cooking_tokens?select=meme_id")).length; },
  async getDueMarketTokens(now: string, limit: number) {
    return (await rows(`meme_cooking_tokens?market_eligible=eq.true&token_id=not.is.null&or=(market_next_refresh_at.is.null,market_next_refresh_at.lte.${encodeURIComponent(now)})&select=meme_id,token_id,pool_id,is_finalized,source_created_at,source_updated_at,market_eligible,market_failure_count,source_record&order=market_next_refresh_at.asc.nullsfirst&limit=${limit}`)).map(synced);
  },
  async recordMarketAttempt(token: SyncedToken, attempt: MarketAttempt, nextAttemptAt: string, failureCount: number) {
    const status = attempt.state === "available" ? "available" : attempt.state === "provider_unavailable" ? "provider_unavailable" : attempt.state === "contract_unavailable" ? "contract_unavailable" : "no_matching_pair";
    await rpc("record_memeproof_market_attempt", { p_meme_id: token.meme_id, p_token_contract_address: token.token_id, p_market_data: attempt.marketData, p_providers: attempt.providers, p_status: status, p_attempt_at: attempt.fetchedAt, p_next_refresh_at: nextAttemptAt, p_failure_count: failureCount });
  },
  async recordMarketFailure(token: SyncedToken, at: string, nextAttemptAt: string, failureCount: number) {
    await this.recordMarketAttempt(token, { marketData: null, providers: { geckoterminal: "unavailable", dexscreener: "unavailable" }, state: "provider_unavailable", fetchedAt: at }, nextAttemptAt, failureCount);
  },
  async countUnavailableMarketRecords() {
    const [tokens, snapshots] = await Promise.all([
      rows("meme_cooking_tokens?select=meme_id"),
      rows("market_data_snapshots?select=meme_id,last_attempt_status"),
    ]);
    const matched = new Set(snapshots.filter((row) => row.last_attempt_status === "available").map((row) => String(row.meme_id)));
    return tokens.filter((row) => !matched.has(String(row.meme_id))).length;
  },
  async listTokens() {
    return (await rows("meme_cooking_tokens?select=source_record&order=meme_id.desc")).map((row) => row.source_record as SourceToken);
  },
  async getToken(id: string): Promise<SourceToken | null> {
    const data = await rows(`meme_cooking_tokens?meme_id=eq.${encodeURIComponent(id)}&select=source_record`);
    return data.length ? data[0].source_record as SourceToken : null;
  },
  async getMarketSnapshot(id: string): Promise<DbRow | null> {
    const data = await rows(`market_data_snapshots?meme_id=eq.${encodeURIComponent(id)}&select=*`);
    return data[0] ?? null;
  },
};
