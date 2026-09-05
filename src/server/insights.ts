export const INSIGHTS_WINDOWS = ["15m", "1h", "24h", "all"] as const;

export type InsightsWindow = (typeof INSIGHTS_WINDOWS)[number];

export type InsightsFlowInput = {
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  startedAt?: string;
  error?: string;
};

export type InsightsMetric = {
  value: number | null;
  previousValue: number | null;
  changePercent: number | null;
  sparkline: number[];
  previousSparkline: number[];
};

export type InsightsEndpoint = {
  method: string;
  path: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p90LatencyMs: number | null;
};

export type InsightsOverview = {
  window: InsightsWindow;
  windowMs: number | null;
  generatedAt: string;
  from: string | null;
  to: string;
  flowCount: number;
  retainedCount: number;
  systemHealth: {
    totalRequests: InsightsMetric;
    p90LatencyMs: InsightsMetric;
    errors: InsightsMetric;
  };
  endpointHealth: {
    monitoredCount: number;
    mostErrors: InsightsEndpoint[];
    busiest: InsightsEndpoint[];
  };
};

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const ENDPOINT_LIMIT = 10;

const WINDOW_MS: Record<Exclude<InsightsWindow, "all">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000
};

const WINDOW_BUCKETS: Record<InsightsWindow, number> = {
  "15m": 15,
  "1h": 12,
  "24h": 24,
  all: 12
};

export function parseInsightsWindow(value: unknown): InsightsWindow {
  const selected = Array.isArray(value) ? value[0] : value;
  if (typeof selected !== "string") {
    return "1h";
  }

  const normalized = selected.trim().toLowerCase();
  return INSIGHTS_WINDOWS.includes(normalized as InsightsWindow)
    ? (normalized as InsightsWindow)
    : "1h";
}

export function windowDurationMs(window: InsightsWindow): number | null {
  return window === "all" ? null : WINDOW_MS[window];
}

export function normalizePath(rawPath: string | undefined): string {
  const source = (rawPath ?? "").trim();
  const withoutQuery = source.split("?")[0] ?? "";
  const withLeading = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const collapsed = withLeading
    .split("/")
    .map((segment) => (isDynamicPathSegment(segment) ? "{id}" : segment))
    .join("/");

  return collapsed === "" ? "/" : collapsed.replace(/\/{2,}/g, "/");
}

export function isErrorFlow(flow: InsightsFlowInput): boolean {
  if (flow.error?.trim()) {
    return true;
  }

  return typeof flow.statusCode === "number" && flow.statusCode >= 400;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }

  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

export function aggregateInsights(
  flows: readonly InsightsFlowInput[],
  options: { window?: InsightsWindow | string; now?: number } = {}
): InsightsOverview {
  const window = parseInsightsWindow(options.window);
  const now = options.now ?? Date.now();
  const windowMs = windowDurationMs(window);
  const to = now;
  const currentStart = windowMs == null ? Number.NEGATIVE_INFINITY : to - windowMs;
  const previousStart = windowMs == null ? null : to - windowMs * 2;
  const currentFlows = flows.filter((flow) => inRange(flow, currentStart, to));
  const previousFlows =
    previousStart == null ? [] : flows.filter((flow) => inRange(flow, previousStart, currentStart - 1));
  const bucketCount = WINDOW_BUCKETS[window];
  const currentRangeStart =
    windowMs == null ? earliestFlowTime(currentFlows) ?? to : currentStart;
  const previousRangeStart = previousStart ?? currentRangeStart;

  const currentDurations = durationsOf(currentFlows);
  const previousDurations = durationsOf(previousFlows);
  const currentErrors = currentFlows.filter(isErrorFlow).length;
  const previousErrors = previousFlows.filter(isErrorFlow).length;
  const currentP90 = percentile(currentDurations, 90);
  const previousP90 = percentile(previousDurations, 90);
  const endpoints = aggregateEndpoints(currentFlows);

  return {
    window,
    windowMs,
    generatedAt: new Date(now).toISOString(),
    from: Number.isFinite(currentRangeStart) ? new Date(currentRangeStart).toISOString() : null,
    to: new Date(to).toISOString(),
    flowCount: currentFlows.length,
    retainedCount: flows.length,
    systemHealth: {
      totalRequests: metric(
        currentFlows.length,
        previousStart == null ? null : previousFlows.length,
        sparkline(currentFlows, currentRangeStart, to, bucketCount, "requests"),
        previousStart == null
          ? []
          : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "requests")
      ),
      p90LatencyMs: metric(
        currentP90,
        previousStart == null ? null : previousP90,
        sparkline(currentFlows, currentRangeStart, to, bucketCount, "p90"),
        previousStart == null
          ? []
          : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "p90")
      ),
      errors: metric(
        currentErrors,
        previousStart == null ? null : previousErrors,
        sparkline(currentFlows, currentRangeStart, to, bucketCount, "errors"),
        previousStart == null
          ? []
          : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "errors")
      )
    },
    endpointHealth: {
      monitoredCount: endpoints.length,
      mostErrors: [...endpoints]
        .sort((left, right) => right.errorCount - left.errorCount || right.errorRate - left.errorRate)
        .filter((endpoint) => endpoint.errorCount > 0)
        .slice(0, ENDPOINT_LIMIT),
      busiest: [...endpoints]
        .sort((left, right) => right.requestCount - left.requestCount || right.errorCount - left.errorCount)
        .slice(0, ENDPOINT_LIMIT)
    }
  };
}

function isDynamicPathSegment(segment: string): boolean {
  if (!segment) {
    return false;
  }

  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }

  return NUMERIC_SEGMENT.test(decoded) || UUID_SEGMENT.test(decoded);
}

function flowTimeMs(flow: InsightsFlowInput): number | null {
  if (!flow.startedAt) {
    return null;
  }

  const value = Date.parse(flow.startedAt);
  return Number.isNaN(value) ? null : value;
}

function inRange(flow: InsightsFlowInput, startMs: number, endMs: number): boolean {
  const time = flowTimeMs(flow);
  if (time == null) {
    return startMs === Number.NEGATIVE_INFINITY;
  }

  return time >= startMs && time <= endMs;
}

function earliestFlowTime(flows: readonly InsightsFlowInput[]): number | null {
  let earliest: number | null = null;
  for (const flow of flows) {
    const time = flowTimeMs(flow);
    if (time == null) {
      continue;
    }
    if (earliest == null || time < earliest) {
      earliest = time;
    }
  }
  return earliest;
}

function durationsOf(flows: readonly InsightsFlowInput[]): number[] {
  return flows
    .map((flow) => flow.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function changePercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) {
    return null;
  }
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / previous) * 100;
}

function metric(
  value: number | null,
  previousValue: number | null,
  sparklineValues: number[],
  previousSparkline: number[]
): InsightsMetric {
  return {
    value,
    previousValue,
    changePercent: changePercent(value, previousValue),
    sparkline: sparklineValues,
    previousSparkline
  };
}

function sparkline(
  flows: readonly InsightsFlowInput[],
  startMs: number,
  endMs: number,
  bucketCount: number,
  kind: "requests" | "errors" | "p90"
): number[] {
  const span = Math.max(endMs - startMs, 1);
  const buckets = Array.from({ length: bucketCount }, () => [] as InsightsFlowInput[]);

  for (const flow of flows) {
    const time = flowTimeMs(flow);
    if (time == null) {
      buckets[bucketCount - 1]?.push(flow);
      continue;
    }

    const ratio = (time - startMs) / span;
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
    buckets[index]?.push(flow);
  }

  return buckets.map((bucket) => {
    if (kind === "requests") {
      return bucket.length;
    }
    if (kind === "errors") {
      return bucket.filter(isErrorFlow).length;
    }

    return percentile(durationsOf(bucket), 90) ?? 0;
  });
}

function aggregateEndpoints(flows: readonly InsightsFlowInput[]): InsightsEndpoint[] {
  const groups = new Map<string, InsightsFlowInput[]>();

  for (const flow of flows) {
    const method = (flow.method || "GET").toUpperCase();
    const path = normalizePath(flow.path);
    const key = `${method} ${path}`;
    const group = groups.get(key);
    if (group) {
      group.push(flow);
    } else {
      groups.set(key, [flow]);
    }
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const space = key.indexOf(" ");
    const durations = durationsOf(group);
    const errorCount = group.filter(isErrorFlow).length;
    const total = durations.reduce((sum, value) => sum + value, 0);

    return {
      method: key.slice(0, space),
      path: key.slice(space + 1),
      requestCount: group.length,
      errorCount,
      errorRate: group.length === 0 ? 0 : (errorCount / group.length) * 100,
      avgLatencyMs: durations.length === 0 ? null : total / durations.length,
      p90LatencyMs: percentile(durations, 90)
    };
  });
}
