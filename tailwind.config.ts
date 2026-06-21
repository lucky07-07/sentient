import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Agent log line types — used by AgentLog.tsx
        log: {
          fetch: "#38bdf8",
          embed: "#a78bfa",
          retrieve: "#34d399",
          draft: "#fbbf24",
          verify: "#f472b6",
          revise: "#fb923c",
          publish: "#4ade80",
          error: "#f87171",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
