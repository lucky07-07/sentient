// Chunking: ~500 tokens per chunk with ~50-token overlap.
// Tokens are approximated at ~4 chars/token (no tokenizer dependency), so the
// window is ~2000 chars with ~200-char overlap, split on whitespace boundaries.

const CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    // Prefer to break on a space so we don't split words.
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start) end = lastSpace;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }
  return chunks;
}
