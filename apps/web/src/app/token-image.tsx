"use client";

import { useState } from "react";
import Image from "next/image";
import { tokenImageCandidates } from "./token-image-source";

export default function TokenImage({ value, name, className, width, height }: { value: unknown; name: string; className: string; width: number; height: number }) {
  const sources = tokenImageCandidates(value);
  const sourceKey = sources.join("\n");
  const [imageState, setImageState] = useState({ sourceKey, attempt: 0, failed: false });
  const attempt = imageState.sourceKey === sourceKey ? imageState.attempt : 0;
  const failed = imageState.sourceKey === sourceKey && imageState.failed;
  const source = sources[attempt];
  if (!source || failed) return <span className={`${className} image-fallback`} aria-label={`${name} image unavailable`}>{name.slice(0, 1).toUpperCase()}</span>;
  return <Image className={className} src={source} alt={`${name} logo`} width={width} height={height} unoptimized onError={() => setImageState({
    sourceKey,
    attempt: attempt + 1 < sources.length ? attempt + 1 : attempt,
    failed: attempt + 1 >= sources.length,
  })} />;
}
