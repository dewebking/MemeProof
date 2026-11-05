import "server-only";

const API_BASE_URL = "https://api.meme.cooking";
const CACHE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;

export type MemeCookingToken = {
  [field: string]: unknown;
};

export class MemeCookingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MemeCookingApiError";
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
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MemeCookingApiError("Meme.Cooking request timed out.", 504);
    }
    throw new MemeCookingApiError("Meme.Cooking could not be reached.", 502);
  }
  if (!response.ok) {
    throw new MemeCookingApiError(`Meme.Cooking returned HTTP ${response.status}.`, response.status === 429 ? 503 : 502);
  }
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
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/meme/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MemeCookingApiError("Meme.Cooking request timed out.", 504);
    }
    throw new MemeCookingApiError("Meme.Cooking could not be reached.", 502);
  }
  if (!response.ok) throw new MemeCookingApiError(`Meme.Cooking returned HTTP ${response.status}.`, response.status === 429 ? 503 : response.status === 404 ? 404 : 502);
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
