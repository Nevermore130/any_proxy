import { describe, expect, it } from "vitest";
import { FlowStore } from "../flowStore.js";
import type { AddonFlowEvent } from "../types.js";

const requestEvent: AddonFlowEvent = {
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

  it("keeps the newest flows when capped", () => {
    const store = new FlowStore({ maxFlows: 2, bodyPreviewBytes: 1024 });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "one" } });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "two" } });
    store.ingest({ ...requestEvent, flow: { ...requestEvent.flow, id: "three" } });

    expect(store.getFlow("one")).toBeUndefined();
    expect(store.listFlows({}).map((flow) => flow.id)).toEqual(["three", "two"]);
  });

  it("does not store new events while paused", () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    store.setPaused(true);
    store.ingest(requestEvent);
    expect(store.listFlows({})).toEqual([]);
  });
});
