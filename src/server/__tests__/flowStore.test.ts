import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowStore } from "../flowStore.js";
import type { CaptureFlowEvent } from "../types.js";

const requestEvent: CaptureFlowEvent = {
  eventType: "request",
  flow: {
    id: "flow-1",
    clientIp: "192.168.1.20",
    startedAtEpochMs: 1781337600000,
    protocol: "https",
    method: "GET",
    scheme: "https",
    host: "api.example.com",
    port: 443,
    path: "/v1/me",
    requestHeaders: [["accept", "application/json"]],
    requestBody: "",
    requestContentType: "application/json",
    isTlsIntercepted: true
  }
};

describe("FlowStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds request events and updates with response events", () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    store.ingest(requestEvent);
    store.ingest({
      eventType: "response",
      flow: {
        ...requestEvent.flow,
        durationMs: 25,
        statusCode: 200,
        responseHeaders: [["content-type", "application/json"]],
        responseBody: "{\"ok\":true}",
        responseContentType: "application/json"
      }
    });

    const flow = store.getFlow("flow-1");
    expect(flow?.statusCode).toBe(200);
    expect(flow?.durationMs).toBe(25);
    expect(flow?.responseBodyPreview.preview).toBe("{\"ok\":true}");
  });

  it("preserves existing request previews when later events omit request body", () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 5 });
    store.ingest({
      ...requestEvent,
      flow: {
        ...requestEvent.flow,
        requestBody: "hello world",
        requestContentType: "text/plain"
      }
    });

    const initialPreview = store.getFlow("flow-1")?.requestBodyPreview;
    const flowWithoutRequestBody = { ...requestEvent.flow };
    delete flowWithoutRequestBody.requestBody;
    store.ingest({
      eventType: "response",
      flow: {
        ...flowWithoutRequestBody,
        durationMs: 25,
        statusCode: 200,
        responseBody: "ok",
        responseContentType: "text/plain"
      }
    });

    const flow = store.getFlow("flow-1");
    expect(flow?.requestBodyPreview).toBe(initialPreview);
    expect(flow?.requestBodyPreview.preview).toBe("hello");
    expect(flow?.responseBodyPreview.preview).toBe("ok");
  });

  it("passes request and response body encodings to preview creation", () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 3 });
    const requestBytes = Buffer.from([0, 1, 2, 3]);
    const responseBytes = Buffer.from([255, 254, 253, 252]);

    store.ingest({
      ...requestEvent,
      flow: {
        ...requestEvent.flow,
        requestBody: requestBytes.toString("base64"),
        requestBodyEncoding: "base64",
        requestContentType: "application/octet-stream"
      }
    });
    const flowWithoutRequestBody = { ...requestEvent.flow };
    delete flowWithoutRequestBody.requestBody;
    store.ingest({
      eventType: "response",
      flow: {
        ...flowWithoutRequestBody,
        durationMs: 25,
        statusCode: 200,
        responseBody: responseBytes.toString("base64"),
        responseBodyEncoding: "base64",
        responseContentType: "application/octet-stream"
      }
    });

    const flow = store.getFlow("flow-1");
    expect(flow?.requestBodyPreview.sizeBytes).toBe(4);
    expect(flow?.requestBodyPreview.preview).toBe(requestBytes.subarray(0, 3).toString("base64"));
    expect(flow?.requestBodyPreview.truncated).toBe(true);
    expect(flow?.responseBodyPreview.sizeBytes).toBe(4);
    expect(flow?.responseBodyPreview.preview).toBe(
      responseBytes.subarray(0, 3).toString("base64")
    );
    expect(flow?.responseBodyPreview.truncated).toBe(true);
  });

  it("keeps the newest flows when capped", () => {
    const store = new FlowStore({ maxFlows: 2, bodyPreviewBytes: 1024 });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "one" } });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "two" } });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "three" } });

    expect(store.getFlow("one")).toBeUndefined();
    expect(store.listFlows({}).map((flow) => flow.id)).toEqual(["three", "two"]);
  });

  it("removes flows older than the retention window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00.000Z"));
    const store = new FlowStore({
      maxFlows: 10,
      bodyPreviewBytes: 1024,
      flowTtlMs: 60_000
    });

    store.ingest({
      ...requestEvent,
      flow: {
        ...requestEvent.flow,
        id: "expired",
        startedAtEpochMs: Date.now() - 61_000
      }
    });
    store.ingest({
      ...requestEvent,
      flow: {
        ...requestEvent.flow,
        id: "fresh",
        startedAtEpochMs: Date.now() - 60_000
      }
    });

    expect(store.getFlow("expired")).toBeUndefined();
    expect(store.listFlows({}).map((flow) => flow.id)).toEqual(["fresh"]);

    vi.setSystemTime(new Date("2026-06-22T10:00:01.000Z"));

    expect(store.listFlows({})).toEqual([]);
    expect(store.size()).toBe(0);
  });

  it("does not store new events while paused", () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    store.setPaused(true);
    store.ingest(requestEvent);
    expect(store.listFlows({})).toEqual([]);
  });
});
