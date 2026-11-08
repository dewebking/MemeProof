import "server-only";
import { withRetry } from "./retry";

const API_BASE_URL = "https://api.meme.cooking";
const CACHE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 8_000;

export type MemeCookingToken = {
  [field: string]: unknown;
};

export class MemeCookingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "MemeCookingApiError";
  }
}

class UpstreamHttpError extends Error {
  constructor(public readonly status: number) {
    super(`http_${status}`);
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof UpstreamHttpError)
    return error.status === 408 || error.status === 429 || error.status >= 500;
  return true;
}

async function requestMemeCooking(url: string, cacheFirstAttempt = true): Promise<Response> {
  try {
    return await withRetry(async (attempt) => {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        ...(attempt === 0 && cacheFirstAttempt ? { next: { revalidate: CACHE_SECONDS } } : { cache: "no-store" as const }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new UpstreamHttpError(response.status);
      return response;
    }, retryable);
  } catch (error) {
    if (error instanceof UpstreamHttpError) {
      const status = error.status === 404 ? 404 : error.status === 429 ? 503 : error.status >= 500 ? error.status : 502;
      throw new MemeCookingApiError(
        `Meme.Cooking returned HTTP ${error.status}.`,
        status,
        error.status,
      );
    }
    if (error instanceof Error && error.name === "TimeoutError")
      throw new MemeCookingApiError("Meme.Cooking request timed out.", 504);
    throw new MemeCookingApiError("Meme.Cooking could not be reached.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is MemeCookingToken {
  return isRecord(value) && (
    typeof value.meme_id === "string" ||
    typeof value.meme_id === "number" ||
    typeof value.id === "string" ||
    typeof value.id === "number"
  );
}

function normalizeMemePage(payload: unknown): { records: MemeCookingToken[]; next: string | null } {
  if (Array.isArray(payload) && payload.every(isToken)) return { records: payload, next: null };
  if (isRecord(payload)) {
    for (const key of ["data", "memes", "items", "results"]) {
      const value = payload[key];
      if (!Array.isArray(value) || !value.every(isToken)) continue;
      const links = isRecord(payload.links) ? payload.links : {};
      const pagination = isRecord(payload.pagination) ? payload.pagination : {};
      const nextValue = links.next ?? pagination.next ?? payload.next;
      return { records: value, next: typeof nextValue === "string" && nextValue.trim() ? nextValue : null };
    }
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unexpected token response.", 502);
}

function safeMemePageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, `${API_BASE_URL}/meme`);
  } catch {
    throw new MemeCookingApiError("Meme.Cooking returned an invalid pagination link.", 502);
  }
  if (url.origin !== API_BASE_URL || url.pathname !== "/meme") {
    throw new MemeCookingApiError("Meme.Cooking returned an unsafe pagination link.", 502);
  }
  return url.href;
}

async function fetchMemePage(url: string): Promise<unknown> {
  const response = await requestMemeCooking(url, false);
  try {
    return await response.json();
  } catch {
    throw new MemeCookingApiError("Meme.Cooking returned invalid JSON.", 502);
  }
}

export async function getMemes(): Promise<MemeCookingToken[]> {
  const pageLimit = 100;
  const visited = new Set<string>();
  const byId = new Map<string, MemeCookingToken>();
  let pageUrl: string | null = `${API_BASE_URL}/meme`;
  let pages = 0;
  while (pageUrl) {
    pageUrl = safeMemePageUrl(pageUrl);
    if (visited.has(pageUrl)) throw new MemeCookingApiError("Meme.Cooking pagination loop detected.", 502);
    if (pages >= pageLimit) throw new MemeCookingApiError("Meme.Cooking pagination exceeded the safe page limit.", 502);
    visited.add(pageUrl);
    const payload = await fetchMemePage(pageUrl);
    const page = normalizeMemePage(payload);
    for (const token of page.records) {
      const id = token.meme_id ?? token.id;
      if (id !== undefined && id !== null) byId.set(String(id), token);
    }
    pageUrl = page.next ? safeMemePageUrl(page.next) : null;
    pages += 1;
  }
  return [...byId.values()];
}

export async function getMeme(id: string): Promise<MemeCookingToken> {
  const response = await requestMemeCooking(`${API_BASE_URL}/meme/${encodeURIComponent(id)}`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new MemeCookingApiError("Meme.Cooking returned invalid JSON.", 502); }
  if (isToken(payload)) return payload;
  if (isRecord(payload)) {
    for (const key of ["data", "meme", "token", "result"]) {
      const value = payload[key];
      if (isToken(value)) return value;
    }
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unexpected token response.", 502);
}
