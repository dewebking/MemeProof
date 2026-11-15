const IMAGE_FIELDS = [
  "image",
  "image_url",
  "image_uri",
  "imageUrl",
  "imageUri",
  "token_image",
  "token_image_url",
  "logo",
  "logo_url",
  "logo_uri",
  "logoUrl",
  "icon",
  "icon_url",
  "icon_uri",
  "thumbnail",
  "thumbnail_url",
  "url",
] as const;

const NESTED_METADATA_FIELDS = ["metadata", "token", "meme", "media"] as const;

function imageValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value) || depth > 3) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of IMAGE_FIELDS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "object" && candidate !== null) {
      const nested = imageValue(candidate, depth + 1);
      if (nested) return nested;
    }
  }
  for (const key of NESTED_METADATA_FIELDS) {
    const nested = imageValue(record[key], depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

export function tokenImageCandidates(value: unknown): string[] {
  const candidate = imageValue(value);
  if (typeof candidate !== "string" || !candidate.trim()) return [];
  const source = candidate.trim();
  const gateways = [
    "https://dweb.link/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
  ];
  let path: string | undefined;
  if (/^ipfs:\/\//i.test(source)) {
    path = source.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
  } else if (/^https?:\/\/(?:[^/]+\/)?ipfs\//i.test(source)) {
    try {
      const url = new URL(source);
      const ipfsIndex = url.pathname.toLowerCase().indexOf("/ipfs/");
      path = url.pathname.slice(ipfsIndex + 6).replace(/^\//, "") + url.search + url.hash;
    } catch {
      return [];
    }
  } else if (/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{20,})(\/.*)?$/i.test(source)) {
    path = source;
  }
  if (path) return [...new Set(gateways.map((gateway) => `${gateway}${path}`))];
  if (/^https:\/\//i.test(source)) return [source];
  return [];
}
