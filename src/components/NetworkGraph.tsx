"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { BriefingSection } from "@/lib/types";

const COMPANIES: { id: string; kw: string[] }[] = [
  { id: "OpenAI", kw: ["openai"] },
  { id: "Anthropic", kw: ["anthropic", "claude"] },
  { id: "Google DeepMind", kw: ["deepmind", "google"] },
  { id: "Meta AI", kw: ["meta ai", "llama", "meta"] },
  { id: "xAI", kw: ["xai", "grok"] },
  { id: "Mistral", kw: ["mistral"] },
  { id: "Cohere", kw: ["cohere"] },
  { id: "DeepSeek", kw: ["deepseek"] },
];
const TOPICS = ["benchmark", "model", "paper", "research", "funding", "investment", "open source", "dataset", "agent", "reasoning", "multimodal", "vision", "language", "fine-tuning", "deployment"];
const EVENTS = new Set(["funding", "investment", "deployment"]);

interface GNode extends d3.SimulationNodeDatum {
  id: string;
  type: "company" | "topic" | "event";
  r: number;
  color: string;
  mentions: number;
  sections: string[];
}
interface GLink extends d3.SimulationLinkDatum<GNode> {
  weight: number;
  phase?: number;
  speed?: number;
  dotSpeed?: number;
  dotOff?: number;
}

function build(sections: BriefingSection[]): { nodes: GNode[]; links: GLink[] } {
  const nodeMap = new Map<string, GNode>();
  const linkMap = new Map<string, GLink>();
  const ensure = (id: string, type: GNode["type"]): GNode => {
    let n = nodeMap.get(id);
    if (!n) {
      n = {
        id,
        type,
        r: type === "company" ? 18 : type === "topic" ? 12 : 10,
        color: type === "company" ? "#ff6600" : type === "topic" ? "#00d4aa" : "#a855f7",
        mentions: 0,
        sections: [],
      };
      nodeMap.set(id, n);
    }
    return n;
  };

  for (const s of sections) {
    const text = s.content.toLowerCase();
    const here = COMPANIES.filter((c) => c.kw.some((k) => text.includes(k))).map((c) => c.id);
    const topicsHere = TOPICS.filter((t) => text.includes(t));
    for (const c of here) {
      const n = ensure(c, "company");
      n.mentions++;
      if (!n.sections.includes(s.title)) n.sections.push(s.title);
    }
    for (const t of topicsHere) {
      const n = ensure(t, EVENTS.has(t) ? "event" : "topic");
      n.mentions++;
      if (!n.sections.includes(s.title)) n.sections.push(s.title);
    }
    for (const c of here) {
      for (const t of topicsHere) {
        const key = `${c}|${t}`;
        const existing = linkMap.get(key);
        if (existing) existing.weight++;
        else linkMap.set(key, { source: c, target: t, weight: 1 });
      }
    }
  }
  return { nodes: [...nodeMap.values()], links: [...linkMap.values()] };
}

export default function NetworkGraph({ sections }: { sections: BriefingSection[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node: GNode } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { nodes, links } = build(sections);
    if (!nodes.length) return;

    const TAU = Math.PI * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const maxW = Math.max(...links.map((l) => l.weight), 1);
    const nodePulse: Record<string, number> = {};
    let hoverId: string | null = null;
    let dragNode: GNode | null = null;
    let downAt: { x: number; y: number } | null = null;
    let moved = false;

    links.forEach((l) => {
      l.phase = Math.random() * TAU;
      l.speed = 0.5 + Math.random() * 1.2;
      l.dotSpeed = 0.2 + Math.random() * 0.3;
      l.dotOff = Math.random();
    });

    const sim = d3
      .forceSimulation<GNode>(nodes)
      .force("link", d3.forceLink<GNode, GLink>(links).id((d) => d.id).distance(70))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide<GNode>().radius((d) => d.r + 6));

    const size = () => {
      W = wrap.clientWidth || 300;
      H = wrap.clientHeight || 300;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.force("center", d3.forceCenter(W / 2, H / 2));
      sim.alpha(0.4).restart();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    const src = (l: GLink) => l.source as GNode;
    const tgt = (l: GLink) => l.target as GNode;
    const connectedToHover = (id: string) =>
      !!hoverId && links.some((l) => (src(l).id === hoverId && tgt(l).id === id) || (tgt(l).id === hoverId && src(l).id === id));

    let raf = 0;
    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";

      for (const l of links) {
        const a = src(l);
        const b = tgt(l);
        if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
        const linkDim = hoverId && a.id !== hoverId && b.id !== hoverId ? 0.12 : 1;
        const breathe = 0.35 + 0.35 * Math.sin(t * (l.speed || 1) + (l.phase || 0));
        ctx.strokeStyle = "#ffffff14";
        ctx.globalAlpha = linkDim;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = linkDim * breathe * (0.3 + 0.5 * (l.weight / maxW));
        ctx.lineWidth = 1 + (l.weight / maxW) * 2.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Travelling pulse dot.
        const p = (t * (l.dotSpeed || 0.25) + (l.dotOff || 0)) % 1;
        const dx = a.x + (b.x - a.x) * p;
        const dy = a.y + (b.y - a.y) * p;
        const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 4);
        g.addColorStop(0, a.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.globalAlpha = linkDim;
        ctx.beginPath();
        ctx.arc(dx, dy, 4, 0, TAU);
        ctx.fill();
        if (p > 0.9) nodePulse[b.id] = 1;
      }
      ctx.globalAlpha = 1;

      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const dim = hoverId && !(n.id === hoverId || connectedToHover(n.id)) ? 0.18 : 1;
        ctx.globalAlpha = dim;
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r + 10);
        glow.addColorStop(0, n.color + "44");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 10, 0, TAU);
        ctx.fill();

        const pl = nodePulse[n.id] || 0;
        if (pl > 0) {
          ctx.strokeStyle = n.color;
          ctx.globalAlpha = dim * pl * 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + (1 - pl) * 14, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = dim;
          nodePulse[n.id] = Math.max(0, pl - 0.04);
        }

        ctx.fillStyle = "#0a0a0f";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 0.3, 0, TAU);
        ctx.fill();

        ctx.fillStyle = n.type === "company" ? "#ffffff" : "#9ca3af";
        ctx.font = `${n.type === "company" ? "bold " : ""}10px monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, n.x + n.r + 4, n.y);
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // ---- Interactions ----
    const pos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { mx: e.clientX - r.left, my: e.clientY - r.top };
    };
    const nodeAt = (mx: number, my: number): GNode | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x == null || n.y == null) continue;
        const dx = mx - n.x;
        const dy = my - n.y;
        if (dx * dx + dy * dy <= (n.r + 3) * (n.r + 3)) return n;
      }
      return null;
    };
    const onDown = (e: MouseEvent) => {
      const { mx, my } = pos(e);
      const n = nodeAt(mx, my);
      downAt = { x: mx, y: my };
      moved = false;
      if (n) {
        dragNode = n;
        sim.alphaTarget(0.3).restart();
        n.fx = n.x;
        n.fy = n.y;
      }
    };
    const onMove = (e: MouseEvent) => {
      const { mx, my } = pos(e);
      if (downAt && (Math.abs(mx - downAt.x) > 4 || Math.abs(my - downAt.y) > 4)) moved = true;
      if (dragNode) {
        dragNode.fx = mx;
        dragNode.fy = my;
      } else {
        const n = nodeAt(mx, my);
        hoverId = n ? n.id : null;
        canvas.style.cursor = n ? "pointer" : "default";
      }
    };
    const onUp = () => {
      if (dragNode) {
        sim.alphaTarget(0);
        dragNode.fx = null;
        dragNode.fy = null;
        dragNode = null;
      }
      downAt = null;
    };
    const onClick = (e: MouseEvent) => {
      if (moved) return;
      const { mx, my } = pos(e);
      const n = nodeAt(mx, my);
      setTip(n ? { x: mx, y: my, node: n } : null);
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sim.stop();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("click", onClick);
    };
  }, [sections]);

  const empty = sections.length === 0;

  return (
    <div className="flex h-full flex-col bg-[#0a0a0f]">
      <div className="border-b border-gray-800 px-3 py-1.5">
        <span className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: "#00d4aa" }}>
          Knowledge Graph
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {empty ? (
          <div className="grid h-full place-items-center text-xs text-gray-600">Run Briefing to populate graph</div>
        ) : (
          <canvas ref={canvasRef} className="h-full w-full" />
        )}
        {tip && (
          <div
            className="anim-fade-up pointer-events-none absolute z-10 w-48 rounded border border-gray-700 bg-[#0d0d14] p-2 text-[11px] shadow-xl"
            style={{ left: Math.min(tip.x, (wrapRef.current?.clientWidth ?? 300) - 190), top: tip.y }}
          >
            <div className="font-bold" style={{ color: tip.node.color }}>
              {tip.node.id}
            </div>
            <div className="text-gray-400">{tip.node.mentions} mention(s)</div>
            <div className="mt-1 text-gray-500">in: {tip.node.sections.join(", ") || "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
