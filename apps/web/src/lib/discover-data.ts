export type DiscoverSource = "meme.cooking" | "sync_snapshot" | "stale_cache";

export type DiscoverResult<T> = {
  data: T[];
  source: DiscoverSource;
  stale: boolean;
};

let lastKnownGood: { data: unknown[]; source: Exclude<DiscoverSource, "stale_cache"> } | null = null;

export async function resolveDiscoverTokens<T>(dependencies: {
  readSnapshot: () => Promise<T[]>;
  readLive: () => Promise<T[]>;
}): Promise<DiscoverResult<T>> {
  try {
    const snapshot = await dependencies.readSnapshot();
    if (snapshot.length > 0) {
      lastKnownGood = { data: snapshot, source: "sync_snapshot" };
      return { data: snapshot, source: "sync_snapshot", stale: false };
    }
  } catch {
    // A broken optional snapshot store must not prevent a live provider request.
  }

  try {
    const live = await dependencies.readLive();
    lastKnownGood = { data: live, source: "meme.cooking" };
    return { data: live, source: "meme.cooking", stale: false };
  } catch (error) {
    if (lastKnownGood) {
      return {
        data: lastKnownGood.data as T[],
        source: "stale_cache",
        stale: true,
      };
    }
    throw error;
  }
}
