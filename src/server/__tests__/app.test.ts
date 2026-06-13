import { EventEmitter } from "node:events";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { broadcastFlow, createApp, createCaptureApp, createEventHub } from "../app.js";
import { FlowStore } from "../flowStore.js";
import type { CapturedFlow, RawAddonFlow } from "../types.js";

afterEach(() => {
  vi.doUnmock("node:http");
  vi.doUnmock("../config.js");
  vi.doUnmock("../lan.js");
  vi.doUnmock("../mitm.js");
});

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

  it("prefers concrete configured hosts in status", async () => {
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    const app = createApp({
      store,
      lanAddresses: [{ interfaceName: "en0", address: "192.168.1.10" }],
      dashboardHost: "127.0.0.1",
      dashboardPort: 5177,
      proxyHost: "127.0.0.2",
      proxyPort: 8088,
      mitmState: () => ({ running: false, message: "not started" })
    });

    const response = await request(app).get("/api/status").expect(200);
    expect(response.body.dashboard.host).toBe("127.0.0.1");
    expect(response.body.proxy.host).toBe("127.0.0.2");
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

  it("exports a compatibility broadcastFlow for createApp SSE clients", async () => {
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

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const address = server.address() as AddressInfo;
      const sseResponse = await fetch(`http://127.0.0.1:${address.port}/api/events`);
      expect(sseResponse.body).not.toBeNull();

      reader = sseResponse.body!.getReader();
      const flowEvent = withTimeout(readUntil(reader, '"type":"flow"'), 1000);

      broadcastFlow(createCapturedFlow({ id: "compat-flow" }));

      const body = await flowEvent;
      expect(body).toContain('"type":"flow"');
      expect(body).toContain('"id":"compat-flow"');
    } finally {
      await reader?.cancel();
      await closeServer(server);
    }
  });

  it("keeps SSE clients isolated per app instance", async () => {
    const first = createCaptureApp({
      store: new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 }),
      lanAddresses: [],
      dashboardPort: 5177,
      proxyPort: 8088,
      mitmState: () => ({ running: true })
    });
    const second = createCaptureApp({
      store: new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 }),
      lanAddresses: [],
      dashboardPort: 5178,
      proxyPort: 8089,
      mitmState: () => ({ running: true })
    });
    const firstServer = first.app.listen(0);
    const secondServer = second.app.listen(0);
    await Promise.all([
      new Promise<void>((resolve) => firstServer.once("listening", resolve)),
      new Promise<void>((resolve) => secondServer.once("listening", resolve))
    ]);

    let firstReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let secondReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const firstAddress = firstServer.address() as AddressInfo;
      const secondAddress = secondServer.address() as AddressInfo;
      const firstResponse = await fetch(`http://127.0.0.1:${firstAddress.port}/api/events`);
      const secondResponse = await fetch(`http://127.0.0.1:${secondAddress.port}/api/events`);
      expect(firstResponse.body).not.toBeNull();
      expect(secondResponse.body).not.toBeNull();

      firstReader = firstResponse.body!.getReader();
      secondReader = secondResponse.body!.getReader();

      const firstClear = withTimeout(readUntil(firstReader, '"type":"clear"'), 1000);
      const secondClear = readUntil(secondReader, '"type":"clear"');

      await request(firstServer).post("/api/flows/clear").expect(200);

      expect(await firstClear).toContain('data: {"type":"clear"}');
      await expect(withTimeout(secondClear, 100)).rejects.toThrow("Timed out");
    } finally {
      await Promise.all([firstReader?.cancel(), secondReader?.cancel()]);
      first.closeEvents();
      second.closeEvents();
      await Promise.all([closeServer(firstServer), closeServer(secondServer)]);
    }
  });

  it("removes failed SSE clients without surfacing broadcast errors", () => {
    const hub = createEventHub();
    const client = createFakeSseClient({
      write: () => {
        throw new Error("socket closed");
      }
    });

    hub.add(client);

    expect(() => hub.broadcastClear()).not.toThrow();
    expect(() => hub.broadcastClear()).not.toThrow();
    expect(client.write).toHaveBeenCalledTimes(1);
  });
});

describe("startRelaCapture", () => {
  it("starts mitmproxy only after the dashboard server listens", async () => {
    const { startRelaCapture } = await importIndexForTest();
    const server = createFakeServer();
    const startMitmproxy = vi.fn(() => ({ stop: vi.fn(), child: {} }));
    const runtime = startRelaCapture({
      config: createRuntimeConfig(),
      createServer: () => server as unknown as http.Server,
      lanAddresses: [{ interfaceName: "en0", address: "192.168.1.10" }],
      logger: createLogger(),
      registerSignals: false,
      startMitmproxy
    });

    expect(startMitmproxy).not.toHaveBeenCalled();
    emitListenCallback(server);
    expect(startMitmproxy).toHaveBeenCalledTimes(1);

    runtime.close();
  });

  it("does not start mitmproxy when the dashboard server fails to listen", async () => {
    const { startRelaCapture } = await importIndexForTest();
    const server = createFakeServer();
    const startMitmproxy = vi.fn(() => ({ stop: vi.fn(), child: {} }));
    const setExitCode = vi.fn();
    const runtime = startRelaCapture({
      config: createRuntimeConfig(),
      createServer: () => server as unknown as http.Server,
      lanAddresses: [{ interfaceName: "en0", address: "192.168.1.10" }],
      logger: createLogger(),
      registerSignals: false,
      setExitCode,
      startMitmproxy
    });

    server.emit("error", Object.assign(new Error("busy"), { code: "EADDRINUSE" }));

    expect(startMitmproxy).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);

    runtime.close();
  });

  it("logs mitm event processing errors and keeps the runtime alive", async () => {
    const { startRelaCapture } = await importIndexForTest();
    const server = createFakeServer();
    const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
    const logger = createLogger();
    let onEvent: ((event: { eventType: "response"; flow: RawAddonFlow }) => void) | undefined;
    const startMitmproxy = vi.fn((options) => {
      onEvent = options.onEvent;
      return { stop: vi.fn(), child: {} };
    });
    vi.spyOn(store, "ingest").mockImplementation(() => {
      throw new Error("ingest failed");
    });

    const runtime = startRelaCapture({
      config: createRuntimeConfig(),
      createServer: () => server as unknown as http.Server,
      lanAddresses: [{ interfaceName: "en0", address: "192.168.1.10" }],
      logger,
      registerSignals: false,
      startMitmproxy,
      store
    });
    emitListenCallback(server);

    expect(() => onEvent?.({ eventType: "response", flow: createRawFlow() })).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to process mitmproxy event"),
      expect.any(Error)
    );

    runtime.close();
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

function createCapturedFlow(overrides: Partial<RawAddonFlow> = {}): CapturedFlow {
  const store = new FlowStore({ maxFlows: 10, bodyPreviewBytes: 1024 });
  const flow = store.ingest({ eventType: "response", flow: createRawFlow(overrides) });
  if (!flow) {
    throw new Error("Failed to create captured flow");
  }

  return flow;
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

function createFakeSseClient(options: { write?: () => void } = {}) {
  const client = new EventEmitter() as EventEmitter & {
    destroyed: boolean;
    writableEnded: boolean;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  client.destroyed = false;
  client.writableEnded = false;
  client.write = vi.fn(options.write ?? (() => undefined));
  client.end = vi.fn(() => {
    client.writableEnded = true;
    client.emit("close");
  });
  return client;
}

type FakeServer = EventEmitter & {
  close: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
};

function createFakeServer(): FakeServer {
  const server = new EventEmitter() as FakeServer;
  server.listen = vi.fn(() => server);
  server.close = vi.fn((callback?: (error?: Error) => void) => {
    callback?.();
    return server;
  });
  return server;
}

function emitListenCallback(server: FakeServer): void {
  const callback = server.listen.mock.calls[0]?.[2] as (() => void) | undefined;
  callback?.();
}

async function importIndexForTest(): Promise<{
  startRelaCapture: (options: Record<string, unknown>) => { close: () => void };
}> {
  vi.resetModules();
  const importTimeServer = createFakeServer();

  vi.doMock("node:http", () => ({
    default: { createServer: vi.fn(() => importTimeServer) },
    createServer: vi.fn(() => importTimeServer)
  }));
  vi.doMock("../config.js", () => ({ loadConfig: () => createRuntimeConfig() }));
  vi.doMock("../lan.js", () => ({
    getLanAddresses: () => [{ interfaceName: "en0", address: "192.168.1.10" }]
  }));
  vi.doMock("../mitm.js", () => ({
    startMitmproxy: vi.fn(() => ({ stop: vi.fn(), child: {} }))
  }));

  return (await import("../index.js")) as {
    startRelaCapture: (options: Record<string, unknown>) => { close: () => void };
  };
}

function createRuntimeConfig() {
  return {
    dashboardHost: "127.0.0.1",
    dashboardPort: 5177,
    proxyHost: "127.0.0.1",
    proxyPort: 8088,
    maxFlows: 10,
    bodyPreviewBytes: 1024,
    includeHosts: [],
    excludeHosts: []
  };
}

function createLogger() {
  return {
    log: vi.fn(),
    error: vi.fn()
  };
}

async function closeServer(server: http.Server): Promise<void> {
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
