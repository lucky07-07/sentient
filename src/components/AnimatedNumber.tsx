"use client";

import { useEffect, useRef, useState } from "react";

// Count-up tween via requestAnimationFrame + a brief scale pulse when the value
// changes. No animation library.
export default function AnimatedNumber({
  value,
  duration = 300,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    setPulseKey((k) => k + 1);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span key={pulseKey} className={`anim-scale-pulse ${className}`}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
