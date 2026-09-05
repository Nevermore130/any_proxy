import type { InsightsWindow } from "../types.js";

export const INSIGHTS_WINDOW_OPTIONS: Array<{ value: InsightsWindow; label: string }> = [
  { value: "15m", label: "Last 15m" },
  { value: "1h", label: "Last 1h" },
  { value: "24h", label: "Last 24h" },
  { value: "all", label: "All retained" }
];

export function windowLabel(window: InsightsWindow): string {
  return INSIGHTS_WINDOW_OPTIONS.find((option) => option.value === window)?.label ?? "Last 1h";
}

export function formatCount(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${trimFloat(value / 1_000_000)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${trimFloat(value / 1_000)}k`;
  }
  return Math.round(value).toLocaleString();
}

export function formatLatency(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${Math.round(value)} ms`;
}

export function formatRate(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)}%`;
}

export function formatChange(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function changeTone(
  kind: "requests" | "latency" | "errors",
  changePercent: number | null
): "good" | "bad" | "neutral" | "none" {
  if (changePercent == null) {
    return "none";
  }
  if (changePercent === 0) {
    return "neutral";
  }
  if (kind === "requests") {
    return changePercent > 0 ? "good" : "neutral";
  }
  return changePercent > 0 ? "bad" : "good";
}

function trimFloat(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
