import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { FlowStore } from "../flowStore.js";
import type { RawAddonFlow } from "../types.js";

describe("createApp", () => {
  it("returns status", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    const app = createApp({
      store,
      lanAddresses: [{ interfaceName: "en0", address: "192.168.1.10" }],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: false, message: "not started" })
    });

    const response = await request(app).get("/api/status").expect(200);
    expect(response.body.proxy.port).toBe(8088);
    expect(response.body.lanAddresses[0].address).toBe("192.168.1.10");
  });

  it("lists, filters, clears, pauses, resumes, and exports flows", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    store.ingest({
      eventType: "response",
      flow: createRawFlow({
        id: "flow-1",
        host: "api.example.com",
        path: "/v1/me",
        statusCode: 200
      })
    });

    const app = createApp({
      store,
      lanAddresses: [],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: true })
    });

    expect((await request(app).get("/api/flows?host=example").expect(200)).body.flows).toHaveLength(
      1
    );
    expect((await request(app).get("/api/flows/flow-1").expect(200)).body.flow.host).toBe(
      "api.example.com"
    );
    expect((await request(app).get("/api/export").expect(200)).headers["content-type"]).toContain(
      "application/json"
    );

    await request(app).post("/api/capture/pause").expect(200);
    expect(store.isPaused()).toBe(true);
    await request(app).post("/api/capture/resume").expect(200);
    expect(store.isPaused()).toBe(false);
    await request(app).post("/api/flows/clear").expect(200);
    expect(store.size()).toBe(0);
  });

  it("ignores invalid protocol and statusClass query values", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    store.ingest({
      eventType: "response",
      flow: createRawFlow({
        id: "flow-1",
        protocol: "https",
        host: "api.example.com",
        statusCode: 200
      })
    });
    store.ingest({
      eventType: "response",
      flow: createRawFlow({
        id: "flow-2",
        protocol: "http",
        scheme: "http",
        host: "cdn.example.com",
        port: 80,
        statusCode: 404
      })
    });

    const app = createApp({
      store,
      lanAddresses: [],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: true })
    });

    const invalidOnly = await request(app)
      .get("/api/flows?protocol=ftp&statusClass=9xx")
      .expect(200);
    expect(invalidOnly.body.flows).toHaveLength(2);

    const withValidHost = await request(app)
      .get("/api/flows?protocol=ftp&statusClass=9xx&host=api")
      .expect(200);
    expect(withValidHost.body.flows.map((flow: { id: string }) => flow.id)).toEqual(["flow-1"]);
  });

  it("returns 404 for missing flows", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    const app = createApp({
      store,
      lanAddresses: [],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: true })
    });

    await request(app).get("/api/flows/missing-flow").expect(404);
  });

  it("emits a clear event to SSE clients when flows are cleared", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    const app = createApp({
      store,
      lanAddresses: [],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: true })
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address() as AddressInfo;
      const sseResponse = await fetch(`http://127.0.0.1:${address.port}/api/events`);
      expect(sseResponse.status).toBe(200);
      expect(sseResponse.body).not.toBeNull();

      const reader = sseResponse.body!.getReader();
      const clearEvent = withTimeout(readUntil(reader, '"type":"clear"'), 1000);

      await request(server).post("/api/flows/clear").expect(200);

      const body = await clearEvent;
      expect(body).toContain('data: {"type":"clear"}');
      await reader.cancel();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});

function createRawFlow(overrides: Partial<RawAddonFlow> = {}): RawAddonFlow {
  return {
    id: "flow-1",
    clientIp: "192.168.1.20",
    startedAtEpochMs: 1781337600000,
    durationMs: 10,
    protocol: "https",
    method: "GET",
    scheme: "https",
    host: "api.example.com",
    port: 443,
    path: "/v1/me",
    statusCode: 200,
    requestHeaders: [],
    responseHeaders: [],
    isTlsIntercepted: true,
    ...overrides
  };
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string
): Promise<string> {
  const decoder = new TextDecoder();
  let body = "";

  while (!body.includes(expected)) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();
  return body;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
