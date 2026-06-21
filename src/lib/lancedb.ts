// LanceDB vector store. Holds today's embedded chunks at ./lancedb.

import * as lancedb from "@lancedb/lancedb";
import path from "node:path";
import type { Chunk, SourceName } from "./types";

const DB_DIR = path.join(process.cwd(), "lancedb");
const TABLE = "chunks";

let conn: lancedb.Connection | null = null;
async function db(): Promise<lancedb.Connection> {
  if (!conn) conn = await lancedb.connect(DB_DIR);
  return conn;
}

async function tableExists(): Promise<boolean> {
  return (await (await db()).tableNames()).includes(TABLE);
}

// Replace the store with a fresh set of chunks (one per fetch run).
export async function resetChunks(chunks: Chunk[]): Promise<void> {
  if (!chunks.length) return;
  const rows = chunks as unknown as Record<string, unknown>[];
  await (await db()).createTable(TABLE, rows, { mode: "overwrite" });
}

export async function countChunks(): Promise<number> {
  if (!(await tableExists())) return 0;
  const tbl = await (await db()).openTable(TABLE);
  return tbl.countRows();
}

export interface ChunkFilters {
  source?: SourceName;
  category?: string;
  from?: string; // ISO
  to?: string; // ISO
}

function whereClause(f: ChunkFilters): string | null {
  const parts: string[] = [];
  if (f.source) parts.push(`source = '${f.source}'`);
  if (f.category) parts.push(`category = '${f.category}'`);
  if (f.from) parts.push(`fetched_at >= '${f.from}'`);
  if (f.to) parts.push(`fetched_at <= '${f.to}'`);
  return parts.length ? parts.join(" AND ") : null;
}

type Row = Omit<Chunk, "vector"> & { vector: number[]; _distance?: number };

// Semantic search by query vector, with optional metadata filters.
export async function searchChunks(
  vector: number[],
  k: number,
  filters: ChunkFilters = {},
): Promise<Row[]> {
  if (!(await tableExists())) return [];
  const tbl = await (await db()).openTable(TABLE);
  let q = tbl.search(vector).limit(k);
  const where = whereClause(filters);
  if (where) q = q.where(where);
  return (await q.toArray()) as Row[];
}

// Metadata-only query (no vector), for the data explorer.
export async function queryChunks(filters: ChunkFilters, limit = 200): Promise<Row[]> {
  if (!(await tableExists())) return [];
  const tbl = await (await db()).openTable(TABLE);
  let q = tbl.query();
  const where = whereClause(filters);
  if (where) q = q.where(where);
  return (await q.limit(limit).toArray()) as Row[];
}
