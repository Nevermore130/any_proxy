export const INSIGHTS_WINDOWS = ["15m", "1h", "24h", "all"] as const;

export type InsightsWindow = (typeof INSIGHTS_WINDOWS)[number];

export type InsightsFlowInput = {
  id?: string;
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
  passRate: number;
  avgLatencyMs: number | null;
  p90LatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type InsightsSeriesPoint = {
  t: string;
  value: number;
};

export type InsightsErrorSample = {
  id: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  error?: string;
  startedAt: string | null;
  durationMs: number | null;
};

export type InsightsNamedCount = {
  label: string;
  count: number;
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
  collectionHealth: {
    passRate: InsightsMetric;
    totalRuns: InsightsMetric;
    avgResponseMs: InsightsMetric;
    lastRunAt: string | null;
  };
  endpointHealth: {
    monitoredCount: number;
    mostErrors: InsightsEndpoint[];
    busiest: InsightsEndpoint[];
  };
  endpointPerformance: InsightsEndpoint[];
  errors: {
    volume: InsightsSeriesPoint[];
    previousVolume: InsightsSeriesPoint[];
    topFailing: InsightsEndpoint[];
    recentSamples: InsightsErrorSample[];
  };
  latency: {
    avg: InsightsSeriesPoint[];
    p90: InsightsSeriesPoint[];
    slowest: InsightsEndpoint[];
    statusDistribution: InsightsNamedCount[];
    latencyDistribution: InsightsNamedCount[];
  };
};

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const ENDPOINT_LIMIT = 10;
const PERFORMANCE_LIMIT = 100;
const ERROR_SAMPLE_LIMIT = 25;

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

const LATENCY_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "<50 ms", max: 50 },
  { label: "50–100 ms", max: 100 },
  { label: "100–200 ms", max: 200 },
  { label: "200–500 ms", max: 500 },
  { label: "500–1000 ms", max: 1000 },
  { label: "1s+", max: Number.POSITIVE_INFINITY }
];

type BucketKind = "requests" | "errors" | "p90" | "avg" | "passRate";

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

export function isPassFlow(flow: InsightsFlowInput): boolean {
  return !isErrorFlow(flow);
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
  const currentAvg = average(currentDurations);
  const previousAvg = average(previousDurations);
  const currentPassRate = rate(currentFlows.length - currentErrors, currentFlows.length);
  const previousPassRate = rate(previousFlows.length - previousErrors, previousFlows.length);
  const endpoints = aggregateEndpoints(currentFlows);
  const totalRequests = metric(
    currentFlows.length,
    previousStart == null ? null : previousFlows.length,
    sparkline(currentFlows, currentRangeStart, to, bucketCount, "requests"),
    previousStart == null
      ? []
      : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "requests")
  );
  const mostErrors = [...endpoints]
    .sort((left, right) => right.errorCount - left.errorCount || right.errorRate - left.errorRate)
    .filter((endpoint) => endpoint.errorCount > 0)
    .slice(0, ENDPOINT_LIMIT);
  const busiest = [...endpoints]
    .sort((left, right) => right.requestCount - left.requestCount || right.errorCount - left.errorCount)
    .slice(0, ENDPOINT_LIMIT);

  return {
    window,
    windowMs,
    generatedAt: new Date(now).toISOString(),
    from: Number.isFinite(currentRangeStart) ? new Date(currentRangeStart).toISOString() : null,
    to: new Date(to).toISOString(),
    flowCount: currentFlows.length,
    retainedCount: flows.length,
    systemHealth: {
      totalRequests,
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
    collectionHealth: {
      passRate: metric(
        currentPassRate,
        previousStart == null ? null : previousPassRate,
        sparkline(currentFlows, currentRangeStart, to, bucketCount, "passRate"),
        previousStart == null
          ? []
          : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "passRate")
      ),
      totalRuns: totalRequests,
      avgResponseMs: metric(
        currentAvg,
        previousStart == null ? null : previousAvg,
        sparkline(currentFlows, currentRangeStart, to, bucketCount, "avg"),
        previousStart == null
          ? []
          : sparkline(previousFlows, previousRangeStart, currentStart, bucketCount, "avg")
      ),
      lastRunAt: latestFlowIso(currentFlows)
    },
    endpointHealth: {
      monitoredCount: endpoints.length,
      mostErrors,
      busiest
    },
    endpointPerformance: [...endpoints]
      .sort((left, right) => right.requestCount - left.requestCount || right.errorCount - left.errorCount)
      .slice(0, PERFORMANCE_LIMIT),
    errors: {
      volume: series(currentFlows, currentRangeStart, to, bucketCount, "errors"),
      previousVolume:
        previousStart == null
          ? []
          : series(previousFlows, previousRangeStart, currentStart, bucketCount, "errors"),
      topFailing: mostErrors,
      recentSamples: recentErrorSamples(currentFlows, ERROR_SAMPLE_LIMIT)
    },
    latency: {
      avg: series(currentFlows, currentRangeStart, to, bucketCount, "avg"),
      p90: series(currentFlows, currentRangeStart, to, bucketCount, "p90"),
      slowest: [...endpoints]
        .filter((endpoint) => endpoint.avgLatencyMs != null)
        .sort(
          (left, right) =>
            (right.avgLatencyMs ?? 0) - (left.avgLatencyMs ?? 0) ||
            (right.p90LatencyMs ?? 0) - (left.p90LatencyMs ?? 0) ||
            right.requestCount - left.requestCount
        )
        .slice(0, ENDPOINT_LIMIT),
      statusDistribution: statusDistribution(currentFlows),
      latencyDistribution: latencyDistribution(currentFlows)
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

function latestFlowIso(flows: readonly InsightsFlowInput[]): string | null {
  let latest: number | null = null;
  for (const flow of flows) {
    const time = flowTimeMs(flow);
    if (time == null) {
      continue;
    }
    if (latest == null || time > latest) {
      latest = time;
    }
  }
  return latest == null ? null : new Date(latest).toISOString();
}

function durationsOf(flows: readonly InsightsFlowInput[]): number[] {
  return flows
    .map((flow) => flow.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(part: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return (part / total) * 100;
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

function bucketize(
  flows: readonly InsightsFlowInput[],
  startMs: number,
  endMs: number,
  bucketCount: number
): InsightsFlowInput[][] {
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

  return buckets;
}

function bucketValue(bucket: readonly InsightsFlowInput[], kind: BucketKind): number {
  if (kind === "requests") {
    return bucket.length;
  }
  if (kind === "errors") {
    return bucket.filter(isErrorFlow).length;
  }
  if (kind === "passRate") {
    if (bucket.length === 0) {
      return 0;
    }
    return ((bucket.length - bucket.filter(isErrorFlow).length) / bucket.length) * 100;
  }
  if (kind === "avg") {
    return average(durationsOf(bucket)) ?? 0;
  }

  return percentile(durationsOf(bucket), 90) ?? 0;
}

function sparkline(
  flows: readonly InsightsFlowInput[],
  startMs: number,
  endMs: number,
  bucketCount: number,
  kind: BucketKind
): number[] {
  return bucketize(flows, startMs, endMs, bucketCount).map((bucket) => bucketValue(bucket, kind));
}

function series(
  flows: readonly InsightsFlowInput[],
  startMs: number,
  endMs: number,
  bucketCount: number,
  kind: BucketKind
): InsightsSeriesPoint[] {
  const span = Math.max(endMs - startMs, 1);
  return bucketize(flows, startMs, endMs, bucketCount).map((bucket, index) => ({
    t: new Date(startMs + (index / bucketCount) * span).toISOString(),
    value: bucketValue(bucket, kind)
  }));
}

function samplePath(rawPath: string | undefined): string {
  const source = (rawPath ?? "").trim();
  const withoutQuery = source.split("?")[0] ?? "";
  const withLeading = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withLeading === "" ? "/" : withLeading.replace(/\/{2,}/g, "/");
}

function recentErrorSamples(
  flows: readonly InsightsFlowInput[],
  limit: number
): InsightsErrorSample[] {
  return flows
    .filter(isErrorFlow)
    .slice()
    .sort((left, right) => (flowTimeMs(right) ?? Number.NEGATIVE_INFINITY) - (flowTimeMs(left) ?? Number.NEGATIVE_INFINITY))
    .slice(0, limit)
    .map((flow) => ({
      id: flow.id ?? null,
      method: (flow.method || "GET").toUpperCase(),
      path: samplePath(flow.path),
      statusCode: typeof flow.statusCode === "number" ? flow.statusCode : null,
      error: flow.error?.trim() || undefined,
      startedAt: latestIso(flow),
      durationMs:
        typeof flow.durationMs === "number" && Number.isFinite(flow.durationMs) ? flow.durationMs : null
    }));
}

function latestIso(flow: InsightsFlowInput): string | null {
  const time = flowTimeMs(flow);
  return time == null ? null : new Date(time).toISOString();
}

function statusDistribution(flows: readonly InsightsFlowInput[]): InsightsNamedCount[] {
  const counts: Record<string, number> = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
    Other: 0
  };

  for (const flow of flows) {
    const status = flow.statusCode;
    if (typeof status !== "number") {
      counts.Other += 1;
    } else if (status >= 500) {
      counts["5xx"] += 1;
    } else if (status >= 400) {
      counts["4xx"] += 1;
    } else if (status >= 300) {
      counts["3xx"] += 1;
    } else if (status >= 200) {
      counts["2xx"] += 1;
    } else {
      counts.Other += 1;
    }
  }

  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}

function latencyDistribution(flows: readonly InsightsFlowInput[]): InsightsNamedCount[] {
  const counts = LATENCY_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));

  for (const duration of durationsOf(flows)) {
    const index = LATENCY_BUCKETS.findIndex((bucket) => duration < bucket.max);
    const target = counts[index === -1 ? counts.length - 1 : index];
    if (target) {
      target.count += 1;
    }
  }

  return counts;
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
      passRate: group.length === 0 ? 0 : ((group.length - errorCount) / group.length) * 100,
      avgLatencyMs: durations.length === 0 ? null : total / durations.length,
      p90LatencyMs: percentile(durations, 90),
      p95LatencyMs: percentile(durations, 95)
    };
  });
}
