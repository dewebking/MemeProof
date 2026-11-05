export type LaunchStatusFilter =
  "all" | "finalized" | "not_finalized" | "unknown";

type DiscoverToken = Record<string, unknown>;

function searchableText(
  record: DiscoverToken,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

export function matchesLaunchStatus(
  token: DiscoverToken,
  status: LaunchStatusFilter,
): boolean {
  if (status === "all") return true;
  if (status === "finalized") return token.is_finalized === true;
  if (status === "not_finalized") return token.is_finalized === false;
  return typeof token.is_finalized !== "boolean";
}

export function filterDiscoverTokens<T extends DiscoverToken>(
  tokens: T[],
  query: string,
  status: LaunchStatusFilter,
): T[] {
  const search = query.trim().toLowerCase();
  return tokens.filter((token) => {
    const matchesSearch =
      !search ||
      ["name", "symbol", "token_id", "owner"].some((key) =>
        searchableText(token, key)?.trim().toLowerCase().includes(search),
      );
    return matchesSearch && matchesLaunchStatus(token, status);
  });
}
