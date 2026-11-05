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

function normalizeTokens(payload: unknown): MemeCookingToken[] {
  if (Array.isArray(payload) && payload.every(isToken)) return payload;
  if (isRecord(payload)) {
    for (const key of ["data", "memes", "items", "results"]) {
      const value = payload[key];
      if (Array.isArray(value) && value.every(isToken)) return value;
    }
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unexpected token response.", 502);
}

export async function getMemes(): Promise<MemeCookingToken[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/meme`, {
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
    throw new MemeCookingApiError(
      `Meme.Cooking returned HTTP ${response.status}.`,
      response.status === 429 ? 503 : 502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MemeCookingApiError("Meme.Cooking returned invalid JSON.", 502);
  }
  return normalizeTokens(payload);
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
