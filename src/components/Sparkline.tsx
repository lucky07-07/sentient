"use client";

// Minimal inline SVG sparkline with a draw-in animation on mount.
export default function Sparkline({
  values,
  color = "#34d399",
  width = 120,
  height = 28,
  animate = true,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  animate?: boolean;
}) {
  if (values.length < 2) return <span className="text-xs text-gray-600">—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        pathLength={1}
        className={animate ? "anim-draw" : ""}
      />
    </svg>
  );
}
