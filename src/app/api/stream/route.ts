import { getBuffer, getCounts, subscribe } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events: live log lines, running counts, and published sections.
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      // Replay recent buffer + current counts to a freshly-connected client.
      getBuffer().forEach((line) => send("line", line));
      send("counts", getCounts());

      const unsubscribe = subscribe({
        onLine: (line) => send("line", line),
        onCounts: (c) => send("counts", c),
        onSection: (s) => send("section", s),
      });
      const keepalive = setInterval(() => send("ping", Date.now()), 15000);

      cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
