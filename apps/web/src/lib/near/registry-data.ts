import type {
  CommitmentWithCurrentVersion,
  CommitmentVersion,
  DisputeRecord,
  EvidenceRecord,
  HistoryEvent,
  NearInteger,
  NearRegistryClient,
  ReviewRecord,
  TokenRecord,
} from "./registry";

const PAGE_SIZE = 50;
const READ_CACHE_TTL_MS = 5_000;
type CacheEntry = { expiresAt: number; promise: Promise<unknown> };
let readCache = new WeakMap<object, Map<string, CacheEntry>>();

function cachedRead<T>(client: object, key: string, load: () => Promise<T>): Promise<T> {
  let entries = readCache.get(client);
  if (!entries) {
    entries = new Map();
    readCache.set(client, entries);
  }
  const existing = entries.get(key);
  if (existing && (existing.expiresAt > Date.now() || existing.expiresAt === 0)) {
    return existing.promise as Promise<T>;
  }

  const entry: CacheEntry = { expiresAt: 0, promise: Promise.resolve().then(load) };
  entries.set(key, entry);
  entry.promise.then(
    () => { entry.expiresAt = Date.now() + READ_CACHE_TTL_MS; },
    () => { if (entries?.get(key) === entry) entries.delete(key); },
  );
  return entry.promise as Promise<T>;
}

/** Drop fresh read snapshots after a successful state-changing wallet transaction. */
export function invalidateRegistryDataCache(): void {
  readCache = new WeakMap();
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

export function historyKind(event: HistoryEvent): string {
  return Object.keys(event.kind)[0] ?? "unknown";
}

export async function getAllHistoryEvents(
  client: Pick<NearRegistryClient, "getHistoryEvents">,
): Promise<HistoryEvent[]> {
  return cachedRead(client, "history", async () => {
  const records: HistoryEvent[] = [];
  let cursor: NearInteger | null = null;
  do {
    const page = await client.getHistoryEvents(cursor, PAGE_SIZE);
    records.push(...page.records);
    if (page.next_cursor !== null && String(page.next_cursor) === String(cursor)) {
      throw new Error("Registry history returned a repeated page cursor.");
    }
    cursor = page.next_cursor;
  } while (cursor !== null);
  return records;
  });
}

export async function getAllTokens(
  client: Pick<NearRegistryClient, "getTokens">,
): Promise<TokenRecord[]> {
  return cachedRead(client, "tokens", async () => {
  const records: TokenRecord[] = [];
  let cursor: NearInteger | null = null;
  do {
    const page = await client.getTokens(cursor, PAGE_SIZE);
    records.push(...page.records);
    if (page.next_cursor !== null && String(page.next_cursor) === String(cursor)) {
      throw new Error("Registry token list returned a repeated page cursor.");
    }
    cursor = page.next_cursor;
  } while (cursor !== null);
  return records;
  });
}

async function getAllRecords<T>(
  fetchPage: (cursor: NearInteger | null, limit: number) => Promise<{
    records: T[];
    next_cursor: NearInteger | null;
  }>,
  label: string,
): Promise<T[]> {
  const records: T[] = [];
  let cursor: NearInteger | null = null;
  do {
    const page = await fetchPage(cursor, PAGE_SIZE);
    records.push(...page.records);
    if (page.next_cursor !== null && String(page.next_cursor) === String(cursor)) {
      throw new Error(`Registry ${label} returned a repeated page cursor.`);
    }
    cursor = page.next_cursor;
  } while (cursor !== null);
  return records;
}

export function getAllEvidences(
  client: Pick<NearRegistryClient, "getEvidences">,
): Promise<EvidenceRecord[]> {
  return cachedRead(client, "evidences", () => getAllRecords((cursor, limit) => client.getEvidences(cursor, limit), "evidence list"));
}

export function getAllReviews(
  client: Pick<NearRegistryClient, "getReviews">,
): Promise<ReviewRecord[]> {
  return cachedRead(client, "reviews", () => getAllRecords((cursor, limit) => client.getReviews(cursor, limit), "review list"));
}

export function getReviewsForEvidence(
  client: Pick<NearRegistryClient, "getReviewsByEvidence">,
  evidenceId: NearInteger,
): Promise<ReviewRecord[]> {
  const key = `evidence-reviews:${String(evidenceId)}`;
  return cachedRead(client, key, () => getAllRecords(
    (cursor, limit) => client.getReviewsByEvidence(evidenceId, cursor, limit),
    "evidence review list",
  ));
}

export function getCommitmentVersionsForCommitment(
  client: Pick<NearRegistryClient, "getCommitmentVersions">,
  commitmentId: NearInteger,
): Promise<CommitmentVersion[]> {
  return cachedRead(client, `commitment-versions:${String(commitmentId)}`, async () => {
    const versions: CommitmentVersion[] = [];
    let cursor: number | null = null;
    do {
      const page = await client.getCommitmentVersions(commitmentId, cursor, PAGE_SIZE);
      versions.push(...page.versions);
      if (page.next_cursor !== null && page.next_cursor === cursor) {
        throw new Error("Registry commitment versions returned a repeated cursor.");
      }
      cursor = page.next_cursor;
    } while (cursor !== null);
    return versions.sort((a, b) => b.version - a.version);
  });
}

export function getAllDisputes(
  client: Pick<NearRegistryClient, "getDisputes">,
): Promise<DisputeRecord[]> {
  return cachedRead(client, "disputes", () => getAllRecords((cursor, limit) => client.getDisputes(cursor, limit), "dispute list"));
}

export async function getAllCommitments(
  client: Pick<NearRegistryClient, "getCommitment" | "getHistoryEvents">,
): Promise<CommitmentWithCurrentVersion[]> {
  return cachedRead(client, "commitments", async () => {
  const events = await getAllHistoryEvents(client);
  const ids = new Set<string>();
  for (const event of events) {
    if (historyKind(event) !== "commitment_created") continue;
    const value = event.kind.commitment_created;
    if (value && typeof value === "object" && "commitment_id" in value) {
      ids.add(String(value.commitment_id));
    }
  }
  const records = await mapWithConcurrency([...ids], 6, (id) => client.getCommitment(id));
  return records
    .filter((record): record is CommitmentWithCurrentVersion => record !== null)
    .sort((a, b) => {
      const left = BigInt(a.commitment.created_at_ns);
      const right = BigInt(b.commitment.created_at_ns);
      return left === right ? 0 : left > right ? -1 : 1;
    });
  });
}

export async function getCommitmentsForCreator(
  client: Pick<NearRegistryClient, "getCommitment" | "getHistoryEvents">,
  accountId: string,
): Promise<CommitmentWithCurrentVersion[]> {
  const events = await getAllHistoryEvents(client);
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actor !== accountId || historyKind(event) !== "commitment_created") continue;
    const id = event.kind.commitment_created;
    if (id && typeof id === "object" && "commitment_id" in id) {
      ids.add(String(id.commitment_id));
    }
  }
  const records = await mapWithConcurrency([...ids], 6, (id) => client.getCommitment(id));
  return records
    .filter((record): record is CommitmentWithCurrentVersion => record !== null)
    .sort((a, b) => {
      const left = BigInt(a.commitment.created_at_ns);
      const right = BigInt(b.commitment.created_at_ns);
      return left === right ? 0 : left > right ? -1 : 1;
    });
}

export interface RegistrySummary {
  tokenCount: number;
  commitmentCount: number;
  evidenceCount: number;
  reviewCount: number;
  disputeCount: number;
  events: HistoryEvent[];
}

export async function getRegistrySummary(
  client: Pick<NearRegistryClient, "getTokens" | "getHistoryEvents">,
): Promise<RegistrySummary> {
  const [tokens, events] = await Promise.all([
    getAllTokens(client),
    getAllHistoryEvents(client),
  ]);
  const count = (kind: string) => events.filter((event) => historyKind(event) === kind).length;
  return {
    tokenCount: tokens.length,
    commitmentCount: count("commitment_created"),
    evidenceCount: count("evidence_submitted"),
    reviewCount: count("review_recorded"),
    disputeCount: count("dispute_raised"),
    events: [...events].sort((a, b) => {
      const left = BigInt(a.id);
      const right = BigInt(b.id);
      return left === right ? 0 : left > right ? -1 : 1;
    }),
  };
}
