// Hugging Face Hub: most-recently-created models.

import { fetchJson } from "../http";
import type { RawItem } from "../types";

interface HFModel {
  id: string;
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  createdAt?: string;
}

export async function fetchHuggingFace(): Promise<RawItem[]> {
  const models = await fetchJson<HFModel[]>(
    "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=25",
  );
  const now = new Date().toISOString();
  return models.map((m) => ({
    source: "huggingface" as const,
    url: `https://huggingface.co/${m.id}`,
    title: m.id,
    text:
      `Model ${m.id}` +
      (m.pipeline_tag ? `, task: ${m.pipeline_tag}` : "") +
      (m.tags?.length ? `, tags: ${m.tags.slice(0, 8).join(", ")}` : "") +
      (typeof m.likes === "number" ? `, likes: ${m.likes}` : "") +
      (typeof m.downloads === "number" ? `, downloads: ${m.downloads}` : ""),
    fetched_at: now,
    published_at: m.createdAt || now,
    category: "opensource",
  }));
}
