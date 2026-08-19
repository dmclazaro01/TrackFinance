"use client";

import { useEffect, useState } from "react";

// Chart colours are read from the CSS token block at runtime so the palette
// has a single source of truth (no inline hex, no generic indigo/violet).
const CHART_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

export function useThemeColors() {
  const [colors, setColors] = useState({
    pie: ["#0000", "#0000", "#0000", "#0000", "#0000"],
    grid: "#26304a",
    accent: "#0000",
    negative: "#0000",
    muted: "#93a0bd",
  });
  useEffect(() => {
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      const read = (v: string) => s.getPropertyValue(v).trim();
      setColors({
        pie: CHART_TOKENS.map((t) => read(t)),
        grid: read("--chart-grid"),
        accent: read("--accent"),
        negative: read("--negative"),
        muted: read("--muted"),
      });
    };
    readColors();
    // Re-read when the theme (data-theme on <html>) changes.
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return colors;
}
