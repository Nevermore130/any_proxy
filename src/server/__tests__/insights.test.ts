import { describe, expect, it } from "vitest";
import {
  aggregateInsights,
  isErrorFlow,
  isPassFlow,
  normalizePath,
  parseInsightsWindow,
  percentile,
  windowDurationMs,
  type InsightsFlowInput
} from "../insights.js";

function flow(overrides: InsightsFlowInput & { startedAt?: string } = {}): InsightsFlowInput {
  return {
    id: overrides.id ?? "flow-default",
    method: "GET",
    path: "/v1/me",
    statusCode: 200,
    durationMs: 100,
    startedAt: "2026-09-05T12:00:00.000Z",
    ...overrides
  };
}

describe("parseInsightsWindow", () => {
  it("accepts known windows and defaults unknown values to 1h", () => {
    expect(parseInsightsWindow("15m")).toBe("15m");
    expect(parseInsightsWindow("24H")).toBe("24h");
    expect(parseInsightsWindow("all")).toBe("all");
    expect(parseInsightsWindow("week")).toBe("1h");
    expect(parseInsightsWindow(undefined)).toBe("1h");
  });
});

describe("windowDurationMs", () => {
  it("returns millisecond spans for bounded windows", () => {
    expect(windowDurationMs("15m")).toBe(15 * 60 * 1000);
    expect(windowDurationMs("1h")).toBe(60 * 60 * 1000);
    expect(windowDurationMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(windowDurationMs("all")).toBeNull();
  });
});

describe("normalizePath", () => {
  it("strips query strings and keeps static segments", () => {
    expect(normalizePath("/v1/me?debug=1")).toBe("/v1/me");
    expect(normalizePath("v1/feed")).toBe("/v1/feed");
    expect(normalizePath(undefined)).toBe("/");
  });

  it("collapses numeric IDs and UUIDs to {id}", () => {
    expect(normalizePath("/accounts/42/transactions/99")).toBe("/accounts/{id}/transactions/{id}");
    expect(normalizePath("/users/550e8400-e29b-41d4-a716-446655440000/profile")).toBe(
      "/users/{id}/profile"
    );
    expect(normalizePath("/users/550E8400-E29B-41D4-A716-446655440000")).toBe("/users/{id}");
  });

  it("does not collapse non-id tokens", () => {
    expect(normalizePath("/v2/collections/featured")).toBe("/v2/collections/featured");
    expect(normalizePath("/v1/2fa/status")).toBe("/v1/2fa/status");
  });
});

describe("isErrorFlow", () => {
  it("treats status >= 400 or an error string as an error", () => {
    expect(isErrorFlow(flow({ statusCode: 200 }))).toBe(false);
    expect(isErrorFlow(flow({ statusCode: 399 }))).toBe(false);
    expect(isErrorFlow(flow({ statusCode: 400 }))).toBe(true);
    expect(isErrorFlow(flow({ statusCode: 503 }))).toBe(true);
    expect(isErrorFlow(flow({ statusCode: 200, error: "upstream timeout" }))).toBe(true);
    expect(isErrorFlow(flow({ statusCode: undefined, error: "  " }))).toBe(false);
    expect(isPassFlow(flow({ statusCode: 204 }))).toBe(true);
    expect(isPassFlow(flow({ statusCode: 200, error: "boom" }))).toBe(false);
  });
});

describe("percentile", () => {
  it("returns null for empty samples and interpolates otherwise", () => {
    expect(percentile([], 90)).toBeNull();
    expect(percentile([42], 90)).toBe(42);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
  });
});

describe("aggregateInsights", () => {
  const now = Date.parse("2026-09-05T12:00:00.000Z");

  it("returns an empty overview when there are no flows", () => {
    const overview = aggregateInsights([], { window: "1h", now });

    expect(overview.flowCount).toBe(0);
    expect(overview.retainedCount).toBe(0);
    expect(overview.systemHealth.totalRequests.value).toBe(0);
    expect(overview.systemHealth.p90LatencyMs.value).toBeNull();
    expect(overview.systemHealth.errors.value).toBe(0);
    expect(overview.systemHealth.totalRequests.sparkline).toHaveLength(12);
    expect(overview.endpointHealth).toEqual({
      monitoredCount: 0,
      mostErrors: [],
      busiest: []
    });
  });

  it("filters by window and compares against the previous window", () => {
    const overview = aggregateInsights(
      [
        flow({
          path: "/v1/me",
          durationMs: 80,
          startedAt: "2026-09-05T11:50:00.000Z"
        }),
        flow({
          path: "/v1/me",
          durationMs: 120,
          statusCode: 500,
          startedAt: "2026-09-05T11:55:00.000Z"
        }),
        flow({
          path: "/v1/me",
          durationMs: 40,
          startedAt: "2026-09-05T10:30:00.000Z"
        })
      ],
      { window: "1h", now }
    );

    expect(overview.flowCount).toBe(2);
    expect(overview.retainedCount).toBe(3);
    expect(overview.systemHealth.totalRequests.value).toBe(2);
    expect(overview.systemHealth.totalRequests.previousValue).toBe(1);
    expect(overview.systemHealth.totalRequests.changePercent).toBe(100);
    expect(overview.systemHealth.errors.value).toBe(1);
    expect(overview.systemHealth.errors.previousValue).toBe(0);
    expect(overview.systemHealth.errors.changePercent).toBeNull();
    expect(overview.systemHealth.p90LatencyMs.value).toBe(116);
    expect(overview.systemHealth.p90LatencyMs.previousValue).toBe(40);
  });

  it("does not invent a previous window for all retained traffic", () => {
    const overview = aggregateInsights(
      [
        flow({ startedAt: "2026-09-01T00:00:00.000Z", durationMs: 10 }),
        flow({ startedAt: "2026-09-05T11:00:00.000Z", durationMs: 20, statusCode: 404 })
      ],
      { window: "all", now }
    );

    expect(overview.windowMs).toBeNull();
    expect(overview.flowCount).toBe(2);
    expect(overview.systemHealth.totalRequests.previousValue).toBeNull();
    expect(overview.systemHealth.totalRequests.changePercent).toBeNull();
    expect(overview.systemHealth.totalRequests.previousSparkline).toEqual([]);
    expect(overview.systemHealth.totalRequests.sparkline).toHaveLength(12);
  });

  it("groups endpoints by method and normalized path", () => {
    const overview = aggregateInsights(
      [
        flow({
          method: "GET",
          path: "/accounts/11/cards?x=1",
          statusCode: 500,
          durationMs: 200,
          startedAt: "2026-09-05T11:50:00.000Z"
        }),
        flow({
          method: "GET",
          path: "/accounts/22/cards",
          statusCode: 200,
          durationMs: 100,
          startedAt: "2026-09-05T11:51:00.000Z"
        }),
        flow({
          method: "POST",
          path: "/photos/upload",
          statusCode: 201,
          durationMs: 50,
          startedAt: "2026-09-05T11:52:00.000Z"
        }),
        flow({
          method: "GET",
          path: "/feed",
          statusCode: 200,
          durationMs: 30,
          startedAt: "2026-09-05T11:53:00.000Z"
        })
      ],
      { window: "1h", now }
    );

    expect(overview.endpointHealth.monitoredCount).toBe(3);
    expect(overview.endpointHealth.mostErrors).toEqual([
      expect.objectContaining({
        method: "GET",
        path: "/accounts/{id}/cards",
        requestCount: 2,
        errorCount: 1,
        errorRate: 50
      })
    ]);
    expect(overview.endpointHealth.busiest[0]).toMatchObject({
      method: "GET",
      path: "/accounts/{id}/cards",
      requestCount: 2
    });
    expect(overview.endpointHealth.busiest.map((row) => `${row.method} ${row.path}`)).toEqual([
      "GET /accounts/{id}/cards",
      "POST /photos/upload",
      "GET /feed"
    ]);
    expect(overview.endpointPerformance[0]).toMatchObject({
      method: "GET",
      path: "/accounts/{id}/cards",
      passRate: 50,
      p95LatencyMs: expect.any(Number)
    });
  });

  it("computes collection-style pass rate, runs, average, and last run", () => {
    const overview = aggregateInsights(
      [
        flow({
          id: "ok",
          path: "/v1/me",
          durationMs: 80,
          startedAt: "2026-09-05T11:50:00.000Z"
        }),
        flow({
          id: "err",
          path: "/v1/me",
          durationMs: 120,
          statusCode: 500,
          startedAt: "2026-09-05T11:55:00.000Z"
        }),
        flow({
          id: "older",
          path: "/v1/me",
          durationMs: 40,
          startedAt: "2026-09-05T10:30:00.000Z"
        })
      ],
      { window: "1h", now }
    );

    expect(overview.collectionHealth.totalRuns.value).toBe(2);
    expect(overview.collectionHealth.passRate.value).toBe(50);
    expect(overview.collectionHealth.passRate.previousValue).toBe(100);
    expect(overview.collectionHealth.passRate.changePercent).toBe(-50);
    expect(overview.collectionHealth.avgResponseMs.value).toBe(100);
    expect(overview.collectionHealth.lastRunAt).toBe("2026-09-05T11:55:00.000Z");
  });

  it("builds error volume, samples, latency series, and distributions", () => {
    const overview = aggregateInsights(
      [
        flow({
          id: "slow-ok",
          method: "GET",
          path: "/accounts/11",
          durationMs: 400,
          startedAt: "2026-09-05T11:40:00.000Z"
        }),
        flow({
          id: "fail-500",
          method: "GET",
          path: "/accounts/11",
          statusCode: 500,
          durationMs: 220,
          startedAt: "2026-09-05T11:50:00.000Z"
        }),
        flow({
          id: "fail-timeout",
          method: "POST",
          path: "/photos/upload?x=1",
          statusCode: 200,
          error: "upstream timeout",
          durationMs: 80,
          startedAt: "2026-09-05T11:58:00.000Z"
        }),
        flow({
          id: "fast-ok",
          method: "GET",
          path: "/feed",
          durationMs: 30,
          startedAt: "2026-09-05T11:59:00.000Z"
        })
      ],
      { window: "1h", now }
    );

    expect(overview.errors.volume).toHaveLength(12);
    expect(overview.errors.volume.reduce((sum, point) => sum + point.value, 0)).toBe(2);
    expect(overview.errors.topFailing.map((row) => `${row.method} ${row.path}`)).toEqual([
      "POST /photos/upload",
      "GET /accounts/{id}"
    ]);
    expect(overview.errors.recentSamples).toEqual([
      expect.objectContaining({
        id: "fail-timeout",
        method: "POST",
        path: "/photos/upload",
        statusCode: 200,
        error: "upstream timeout",
        startedAt: "2026-09-05T11:58:00.000Z"
      }),
      expect.objectContaining({
        id: "fail-500",
        method: "GET",
        path: "/accounts/11",
        statusCode: 500
      })
    ]);

    expect(overview.latency.avg).toHaveLength(12);
    expect(overview.latency.p90).toHaveLength(12);
    expect(overview.latency.slowest[0]).toMatchObject({
      method: "GET",
      path: "/accounts/{id}",
      avgLatencyMs: 310
    });
    expect(overview.latency.statusDistribution).toEqual([
      { label: "2xx", count: 3 },
      { label: "3xx", count: 0 },
      { label: "4xx", count: 0 },
      { label: "5xx", count: 1 },
      { label: "Other", count: 0 }
    ]);
    expect(overview.latency.latencyDistribution.find((bucket) => bucket.label === "200–500 ms")?.count).toBe(
      2
    );
    expect(overview.latency.latencyDistribution.find((bucket) => bucket.label === "<50 ms")?.count).toBe(1);
  });

  it("includes untimestamped flows only in the all-retained window", () => {
    const untimed = flow({ startedAt: undefined, path: "/v1/orphan", statusCode: 502 });

    expect(aggregateInsights([untimed], { window: "15m", now }).flowCount).toBe(0);
    expect(aggregateInsights([untimed], { window: "all", now }).flowCount).toBe(1);
  });
});
