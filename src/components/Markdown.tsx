"use client";

import React from "react";

export type CiteHandler = (chunkId: string, e: React.MouseEvent) => void;

// Inline tokenizer: **bold**, [text](url) links, and [chunk_id: id] citation pills.
const INLINE = /(\*\*([^*]+)\*\*)|(\[chunk_id:\s*([^\]]+)\])|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;

function renderInline(text: string, onCite: CiteHandler, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <strong key={`${kp}-b${i}`} className="font-semibold text-gray-100">
          {m[2]}
        </strong>,
      );
    } else if (m[3]) {
      const id = m[4].trim();
      out.push(
        <button
          key={`${kp}-c${i}`}
          onClick={(e) => onCite(id, e)}
          className="mx-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold hover:brightness-110"
          style={{ background: "#0e7490", color: "#67e8f9" }}
        >
          {id}
        </button>,
      );
    } else if (m[5]) {
      out.push(
        <a key={`${kp}-l${i}`} href={m[7]} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
          {m[6]}
        </a>,
      );
    }
    last = INLINE.lastIndex;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ content, onCite }: { content: string; onCite: CiteHandler }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul${key++}`} className="ml-4 list-disc space-y-1">
        {items.map((b, j) => (
          <li key={j}>{renderInline(b, onCite, `li${key}-${j}`)}</li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p${key++}`} className="leading-relaxed">
          {renderInline(line, onCite, `p${key}`)}
        </p>,
      );
    }
  }
  flush();

  return <div className="space-y-2 text-sm text-gray-300">{blocks}</div>;
}
