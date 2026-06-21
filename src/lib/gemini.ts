// AI client wrapper. Embeddings run on Gemini (gemini-embedding-001); text
// generation runs on Groq (OpenAI-compatible chat + tool calling).

import { GoogleGenAI, type FunctionDeclaration, type Schema } from "@google/genai";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "groq-sdk/resources/chat/completions";

const GEN_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
export const EMBED_DIM = 768;

// Generation rides out transient 429s (e.g. a cron run hitting the per-minute
// burst limit) for 3 attempts total, then fails so the route returns ok:false.
const GEN_RETRIES = 2;

// Reasoning models (qwen3, deepseek-r1, gpt-oss…) emit chain-of-thought that
// breaks json_object validation. Hide it server-side; skip the param for plain
// models that don't support it.
const REASONING_MODEL = /qwen3|deepseek-r1|gpt-oss|o1|o3|reasoning/i.test(GEN_MODEL);
const reasoningOpt = REASONING_MODEL ? ({ reasoning_format: "hidden" } as const) : {};

// Gemini client — embeddings only.
let geminiClient: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

// Groq client — generation + tool calling.
let groqClient: Groq | null = null;
function groq(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

export interface GenResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reasoning models (e.g. qwen3) emit a <think>…</think> chain-of-thought in the
// content. Strip it so only the final answer reaches briefings/chat.
const stripThinking = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

// Retry on 429/rate-limit, honoring the server's suggested retry delay. Used by
// Gemini embeddings (≈100 req/min cap) and Groq generation (also bursts to 429).
async function withRetry<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number })?.status;
      const is429 = status === 429 || status === 503 || msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("UNAVAILABLE") || /rate.?limit|overloaded/i.test(msg);
      if (!is429 || attempt >= max) throw e;
      const suggested = Number(msg.match(/(?:retry|try again) in ([\d.]+)s/i)?.[1]);
      const waitMs = Math.min((Number.isFinite(suggested) ? suggested : 2 ** attempt) * 1000 + 500, 45000);
      await sleep(waitMs);
    }
  }
}

// --- Embeddings (Gemini) ---

export async function embed(text: string): Promise<number[]> {
  const r = await withRetry(() =>
    ai().models.embedContent({
      model: EMBED_MODEL,
      contents: text,
      config: { outputDimensionality: EMBED_DIM },
    }),
  );
  const values = r.embeddings?.[0]?.values;
  if (!values) throw new Error("embedding returned no values");
  return values;
}

// Convert a Gemini FunctionDeclaration schema (uppercase Type enum) to the
// lowercase JSON-schema shape Groq/OpenAI tool calling expects.
function toJsonSchema(s: Schema | undefined): Record<string, unknown> {
  if (!s) return { type: "object", properties: {} };
  const out: Record<string, unknown> = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties)) props[k] = toJsonSchema(v as Schema);
    out.properties = props;
  }
  if (s.required) out.required = s.required;
  if (s.items) out.items = toJsonSchema(s.items as Schema);
  return out;
}

// --- Plain generation (Groq) ---

export async function generate(system: string, prompt: string, json = false): Promise<GenResult> {
  // No response_format json_object — qwen3 reasoning mode intermittently trips
  // Groq's strict JSON validator. Instead nudge via the prompt and extract with
  // stripThinking() + parseJson() at the call site.
  const sys = json ? `${system}\n\nRespond with ONLY a single valid JSON object — no prose, no markdown, no code fences.` : system;
  const resp = await withRetry(
    () =>
      groq().chat.completions.create({
        model: GEN_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
        ...reasoningOpt,
      }),
    GEN_RETRIES,
  );
  return {
    text: stripThinking(resp.choices[0]?.message?.content ?? ""),
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    outputTokens: resp.usage?.completion_tokens ?? 0,
  };
}

// Parse a JSON object from a model response, tolerating ```json fences.
export function parseJson<T>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// --- Generation with tools (Groq function-calling loop) ---

export async function generateWithTools(opts: {
  system: string;
  prompt: string;
  tools: FunctionDeclaration[];
  handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  maxHops?: number;
}): Promise<GenResult & { toolCalls: ToolCallRecord[] }> {
  const { system, prompt, tools, handlers, maxHops = 6 } = opts;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
  const groqTools: ChatCompletionTool[] = tools.map((t) => ({
    type: "function",
    function: { name: t.name ?? "", description: t.description ?? "", parameters: toJsonSchema(t.parameters) },
  }));
  const toolCalls: ToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let hop = 0; hop < maxHops; hop++) {
    const resp = await withRetry(
      () =>
        groq().chat.completions.create({
          model: GEN_MODEL,
          messages,
          tools: groqTools,
          tool_choice: "auto",
          ...reasoningOpt,
        }),
      GEN_RETRIES,
    );
    inputTokens += resp.usage?.prompt_tokens ?? 0;
    outputTokens += resp.usage?.completion_tokens ?? 0;

    const msg = resp.choices[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!msg || calls.length === 0) {
      return { text: stripThinking(msg?.content ?? ""), inputTokens, outputTokens, toolCalls };
    }

    // Record the assistant's tool-call turn, then answer each call.
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      toolCalls.push({ name, args });
      let result: unknown;
      try {
        result = handlers[name] ? await handlers[name](args) : { error: `unknown tool ${name}` };
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ result }) });
    }
  }

  // Ran out of hops — make one final no-tools call to force a textual answer.
  const final = await withRetry(
    () => groq().chat.completions.create({ model: GEN_MODEL, messages, ...reasoningOpt }),
    GEN_RETRIES,
  );
  inputTokens += final.usage?.prompt_tokens ?? 0;
  outputTokens += final.usage?.completion_tokens ?? 0;
  return { text: stripThinking(final.choices[0]?.message?.content ?? ""), inputTokens, outputTokens, toolCalls };
}
