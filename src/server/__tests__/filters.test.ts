import { describe, expect, it } from "vitest";
import { flowMatchesFilters } from "../filters.js";
import type { CapturedFlow } from "../types.js";

const baseFlow: CapturedFlow = {
  id: "flow-1",
  clientIp: "192.168.1.20",
  startedAt: "2026-06-13T08:00:00.000Z",
  durationMs: 42,
  protocol: "https",
  method: "POST",
  scheme: "https",
  host: "api.example.com",
  port: 443,
  path: "/v1/login",
  statusCode: 200,
  requestHeaders: [],
  responseHeaders: [],
  requestBodyPreview: { kind: "empty", sizeBytes: 0, preview: "", truncated: false },
  responseBodyPreview: { kind: "empty", sizeBytes: 0, preview: "", truncated: false },
  isTlsIntercepted: true
};

describe("flowMatchesFilters", () => {
  it("matches empty filters", () => {
    expect(flowMatchesFilters(baseFlow, {})).toBe(true);
  });

  it("filters by client IP substring", () => {
    expect(flowMatchesFilters(baseFlow, { deviceIp: "1.20" })).toBe(true);
    expect(flowMatchesFilters(baseFlow, { deviceIp: "1.99" })).toBe(false);
  });

  it("filters by path substring case-insensitively", () => {
    expect(flowMatchesFilters(baseFlow, { path: "LOGIN" })).toBe(true);
    expect(flowMatchesFilters(baseFlow, { path: "logout" })).toBe(false);
  });

  it("filters by protocol and status class", () => {
    expect(flowMatchesFilters(baseFlow, { protocol: "https", statusClass: "2xx" })).toBe(true);
    expect(flowMatchesFilters(baseFlow, { protocol: "http" })).toBe(false);
    expect(flowMatchesFilters(baseFlow, { statusClass: "5xx" })).toBe(false);
  });
});
