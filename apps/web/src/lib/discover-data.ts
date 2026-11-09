export type DiscoverSource = "meme.cooking" | "sync_snapshot" | "stale_cache";

export type DiscoverResult<T> = {
  data: T[];
  source: DiscoverSource;
  stale: boolean;
  retrievedAt: string | null;
};

export type DiscoverSnapshotMetadata = {
  retrievedAt: string | null;
  stale: boolean;
};

let lastKnownGood: {
  data: unknown[];
  source: Exclude<DiscoverSource, "stale_cache">;
  retrievedAt: string | null;
  stale: boolean;
} | null = null;

export async function resolveDiscoverTokens<T>(dependencies: {
  readSnapshot: () => Promise<T[]>;
  readSnapshotMetadata?: () => Promise<DiscoverSnapshotMetadata>;
  readLive: () => Promise<T[]>;
  now?: () => string;
}): Promise<DiscoverResult<T>> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  let staleSnapshot: { data: T[]; retrievedAt: string | null } | null = null;
  try {
    const snapshot = await dependencies.readSnapshot();
    if (snapshot.length > 0) {
      let metadata: DiscoverSnapshotMetadata;
      if (!dependencies.readSnapshotMetadata) {
        metadata = { retrievedAt: null, stale: true };
      } else {
        try {
          metadata = await dependencies.readSnapshotMetadata();
        } catch {
          metadata = { retrievedAt: null, stale: true };
        }
      }
      const timestamp = metadata.retrievedAt ?? (metadata.stale ? null : now());
      lastKnownGood = { data: snapshot, source: "sync_snapshot", retrievedAt: timestamp, stale: metadata.stale };
      if (!metadata.stale) {
        return { data: snapshot, source: "sync_snapshot", stale: false, retrievedAt: timestamp };
      }
      staleSnapshot = { data: snapshot, retrievedAt: timestamp };
    }
  } catch {
    // A broken optional snapshot store must not prevent a live provider request.
  }

  try {
    const live = await dependencies.readLive();
    const retrievedAt = now();
    if (live.length > 0) lastKnownGood = { data: live, source: "meme.cooking", retrievedAt, stale: false };
    return { data: live, source: "meme.cooking", stale: false, retrievedAt };
  } catch (error) {
    if (staleSnapshot) {
      return {
        data: staleSnapshot.data,
        source: "sync_snapshot",
        stale: true,
        retrievedAt: staleSnapshot.retrievedAt,
      };
    }
    if (lastKnownGood) {
      return {
        data: lastKnownGood.data as T[],
        source: "stale_cache",
        stale: true,
        retrievedAt: lastKnownGood.retrievedAt,
      };
    }
    throw error;
  }
}
