"use client";

import { useState } from "react";

// Clearbit logo with a graceful fallback to a colored initial circle on 404.
const PALETTE = ["#0ea5e9", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#4ade80", "#f87171"];
function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Logo({
  domain,
  name,
  size = 24,
  className = "",
}: {
  domain?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (name || domain || "?").trim()[0]?.toUpperCase() ?? "?";

  if (failed || !domain) {
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-black ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.5, background: colorFor(name || domain || "?") }}
        aria-label={name}
      >
        {letter}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo?domain=${domain}`}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded bg-white/5 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
