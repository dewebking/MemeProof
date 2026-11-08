import type {
  CommitmentWithCurrentVersion,
  HistoryEvent,
  NearInteger,
  NearRegistryClient,
  TokenRecord,
} from "./registry";

const PAGE_SIZE = 50;

export function historyKind(event: HistoryEvent): string {
  return Object.keys(event.kind)[0] ?? "unknown";
}

export async function getAllHistoryEvents(
  client: Pick<NearRegistryClient, "getHistoryEvents">,
): Promise<HistoryEvent[]> {
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
}

export async function getAllTokens(
  client: Pick<NearRegistryClient, "getTokens">,
): Promise<TokenRecord[]> {
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
  const records = await Promise.all(
    [...ids].map((id) => client.getCommitment(id)),
  );
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
    events: events.sort((a, b) => {
      const left = BigInt(a.id);
      const right = BigInt(b.id);
      return left === right ? 0 : left > right ? -1 : 1;
    }),
  };
}
