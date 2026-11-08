import type {
  CommitmentWithCurrentVersion,
  CommitmentVersion,
  DisputeRecord,
  DisputeResolutionRecord,
  EvidenceRecord,
  HistoryEvent,
  NearInteger,
  NearRegistryClient,
  ReviewRecord,
  TokenIdentity,
  TokenRecord,
} from "./registry";

const PAGE_SIZE = 50;

export interface PassportEvidence {
  record: EvidenceRecord;
  reviews: ReviewRecord[];
}

export interface PassportCommitment {
  record: CommitmentWithCurrentVersion;
  versions: CommitmentVersion[];
  evidence: PassportEvidence[];
}

export interface PassportDispute {
  record: DisputeRecord;
  resolution: DisputeResolutionRecord | null;
}

export interface TokenPassportRecords {
  commitments: PassportCommitment[];
  disputes: PassportDispute[];
}

export function canonicalTokenIdentity(
  networkId: string,
  tokenContractAddress: string,
): TokenIdentity | null {
  const address = tokenContractAddress.trim().toLowerCase();
  if (networkId !== "testnet" || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(address)) {
    return null;
  }
  return { network_id: "testnet", token_contract_address: address };
}

export function sameTokenIdentity(
  left: TokenIdentity,
  right: TokenIdentity,
): boolean {
  const canonicalLeft = canonicalTokenIdentity(left.network_id, left.token_contract_address);
  const canonicalRight = canonicalTokenIdentity(right.network_id, right.token_contract_address);
  return Boolean(
    canonicalLeft && canonicalRight &&
    canonicalLeft.network_id === canonicalRight.network_id &&
    canonicalLeft.token_contract_address === canonicalRight.token_contract_address,
  );
}

export type TokenRegistrationStatus = "registered" | "unregistered" | "identity_unavailable";

export function tokenRegistrationStatus(
  identity: TokenIdentity | null,
  token: TokenRecord | null,
): TokenRegistrationStatus {
  if (!identity) return "identity_unavailable";
  return token && sameTokenIdentity(identity, token.identity)
    ? "registered"
    : "unregistered";
}

async function allPages<T>(
  read: (cursor: NearInteger | null, limit: number) => Promise<{
    records: T[];
    next_cursor: NearInteger | null;
  }>,
): Promise<T[]> {
  const records: T[] = [];
  let cursor: NearInteger | null = null;
  do {
    const page = await read(cursor, PAGE_SIZE);
    records.push(...page.records);
    if (page.next_cursor !== null && BigInt(page.next_cursor) <= BigInt(cursor ?? 0)) {
      throw new Error("Registry returned an invalid pagination cursor.");
    }
    cursor = page.next_cursor;
  } while (cursor !== null);
  return records;
}

export function getHistoryEventCommitmentId(event: HistoryEvent): NearInteger | null {
  const created = event.kind.commitment_created;
  if (!created || typeof created !== "object" || !("commitment_id" in created)) return null;
  const id = (created as { commitment_id: unknown }).commitment_id;
  return typeof id === "number" || typeof id === "string" ? id : null;
}

export async function findTokenByIdentity(
  client: Pick<NearRegistryClient, "getTokens">,
  identity: TokenIdentity,
): Promise<TokenRecord | null> {
  const tokens = await allPages((cursor, limit) => client.getTokens(cursor, limit));
  return tokens.find((token) => sameTokenIdentity(token.identity, identity)) ?? null;
}

async function loadCreatedCommitments(
  client: Pick<NearRegistryClient, "getCommitment" | "getHistoryEvents">,
): Promise<CommitmentWithCurrentVersion[]> {
  const events = await allPages((cursor, limit) => client.getHistoryEvents(cursor, limit));
  const ids = [...new Set(events.map(getHistoryEventCommitmentId).filter((id): id is NearInteger => id !== null))];
  const commitments: CommitmentWithCurrentVersion[] = [];
  for (let start = 0; start < ids.length; start += 8) {
    const batch = await Promise.all(ids.slice(start, start + 8).map((id) => client.getCommitment(id)));
    commitments.push(...batch.filter((item): item is CommitmentWithCurrentVersion => item !== null));
  }
  return commitments;
}

export async function getTokenPassportRecords(
  client: Pick<
    NearRegistryClient,
    | "getHistoryEvents"
    | "getCommitment"
    | "getCommitmentVersions"
    | "getCommitmentEvidences"
    | "getReviewsByEvidence"
    | "getDisputesByCommitment"
    | "getDisputesByEvidence"
    | "getDisputeResolution"
  >,
  tokenId: NearInteger,
): Promise<TokenPassportRecords> {
  const commitments = (await loadCreatedCommitments(client))
    .filter((item) => String(item.commitment.token_id) === String(tokenId))
    .sort((a, b) => BigInt(a.commitment.id) < BigInt(b.commitment.id) ? -1 : 1);

  const evidenceByCommitment = await Promise.all(commitments.map(async (commitment) => {
    const versions: CommitmentVersion[] = [];
    let versionCursor: number | null = null;
    do {
      const page = await client.getCommitmentVersions(
        commitment.commitment.id,
        versionCursor,
        PAGE_SIZE,
      );
      versions.push(...page.versions);
      versionCursor = page.next_cursor;
    } while (versionCursor !== null);
    const evidence = await allPages((cursor, limit) =>
      client.getCommitmentEvidences(commitment.commitment.id, cursor, limit),
    );
    return { commitment, versions, evidence };
  }));

  const passportCommitments: PassportCommitment[] = await Promise.all(
    evidenceByCommitment.map(async ({ commitment, versions, evidence }) => ({
      record: commitment,
      versions,
      evidence: await Promise.all(evidence.map(async (record) => ({
        record,
        reviews: await allPages((cursor, limit) =>
          client.getReviewsByEvidence(record.id, cursor, limit),
        ),
      }))),
    })),
  );

  const disputeRecords = new Map<string, DisputeRecord>();
  for (const commitment of commitments) {
    const records = await allPages((cursor, limit) =>
      client.getDisputesByCommitment(commitment.commitment.id, cursor, limit),
    );
    for (const dispute of records) disputeRecords.set(String(dispute.id), dispute);
  }
  for (const { evidence } of evidenceByCommitment) {
    for (const record of evidence) {
      const records = await allPages((cursor, limit) =>
        client.getDisputesByEvidence(record.id, cursor, limit),
      );
      for (const dispute of records) disputeRecords.set(String(dispute.id), dispute);
    }
  }

  const disputes = await Promise.all(
    [...disputeRecords.values()].map(async (record) => ({
      record,
      resolution: record.status === "resolved"
        ? await client.getDisputeResolution(record.id)
        : null,
    })),
  );
  disputes.sort((a, b) => BigInt(a.record.id) > BigInt(b.record.id) ? -1 : 1);
  return { commitments: passportCommitments, disputes };
}
