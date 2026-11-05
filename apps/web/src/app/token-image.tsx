"use client";

import { useState } from "react";
import Image from "next/image";

function candidates(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const source = value.trim();
  const gateways = ["https://dweb.link/ipfs/", "https://cloudflare-ipfs.com/ipfs/", "https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
  let path: string | undefined;
  if (/^ipfs:\/\//i.test(source)) path = source.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
  else if (/^https?:\/\/(?:[^/]+\/)?ipfs\//i.test(source)) {
    try {
      const url = new URL(source);
      const ipfsIndex = url.pathname.toLowerCase().indexOf("/ipfs/");
      path = url.pathname.slice(ipfsIndex + 6).replace(/^\//, "") + url.search + url.hash;
    } catch { return []; }
  }
  else if (/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{20,})(\/.*)?$/i.test(source)) path = source;
  if (path) return [...new Set(gateways.map(gateway => `${gateway}${path}`))];
  if (/^https:\/\//i.test(source)) return [source];
  return [];
}

function imageValue(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["image", "image_url", "image_uri", "logo", "icon", "url"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

export default function TokenImage({ value, name, className, width, height }: { value: unknown; name: string; className: string; width: number; height: number }) {
  const sources = candidates(imageValue(value));
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const source = sources[attempt];
  if (!source || failed) return <span className={`${className} image-fallback`} aria-label={`${name} image unavailable`}>{name.slice(0, 1).toUpperCase()}</span>;
  return <Image className={className} src={source} alt={`${name} logo`} width={width} height={height} unoptimized onError={() => { if (attempt + 1 < sources.length) setAttempt(attempt + 1); else setFailed(true); }} />;
}
