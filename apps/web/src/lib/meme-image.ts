export function resolveMemeImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  const source = value.trim();
  if (/^ipfs:\/\//i.test(source)) {
    const path = source.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
    return `https://dweb.link/ipfs/${path}`;
  }
  if (/^https:\/\//i.test(source)) return source;
  if (/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{20,})(\/.*)?$/i.test(source)) return `https://dweb.link/ipfs/${source}`;
  return;
}
