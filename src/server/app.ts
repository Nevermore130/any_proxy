import express, { type Express, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlowStore } from "./flowStore.js";
import type { LanAddress } from "./lan.js";
import type { CapturedFlow, FlowFilters } from "./types.js";

export type MitmState = {
  running: boolean;
  message?: string;
};

export type CreateAppOptions = {
  store: FlowStore;
  lanAddresses: LanAddress[];
  dashboardHost?: string;
  dashboardPort: number;
  proxyHost?: string;
  proxyPort: number;
  mitmState: () => MitmState;
};

type BroadcastPayload = { type: "flow"; flow: CapturedFlow } | { type: "clear" };

export type SseClient = {
  destroyed?: boolean;
  writableEnded?: boolean;
  write: (chunk: string) => unknown;
  end: () => unknown;
  once: (event: "close" | "error", listener: () => void) => unknown;
};

export type EventHub = {
  add: (client: SseClient) => void;
  remove: (client: SseClient) => void;
  broadcastFlow: (flow: CapturedFlow) => void;
  broadcastClear: () => void;
  closeEvents: () => void;
};

export type CaptureApp = {
  app: Express;
  broadcastFlow: (flow: CapturedFlow) => void;
  closeEvents: () => void;
};

const allowedProtocols = new Set<FlowFilters["protocol"]>([
  "all",
  "http",
  "https",
  "websocket",
  "unknown"
]);
const allowedStatusClasses = new Set<FlowFilters["statusClass"]>([
  "all",
  "1xx",
  "2xx",
  "3xx",
  "4xx",
  "5xx",
  "none"
]);
let compatibilityBroadcastFlow: ((flow: CapturedFlow) => void) | undefined;

export function createApp(options: CreateAppOptions): Express {
  const captureApp = createCaptureApp(options);
  compatibilityBroadcastFlow = captureApp.broadcastFlow;
  return captureApp.app;
}

export function broadcastFlow(flow: CapturedFlow): void {
  compatibilityBroadcastFlow?.(flow);
}

export function createCaptureApp(options: CreateAppOptions): CaptureApp {
  const eventHub = createEventHub();
  const app = createExpressApp(options, eventHub);

  return {
    app,
    broadcastFlow: eventHub.broadcastFlow,
    closeEvents: eventHub.closeEvents
  };
}

export function createEventHub(): EventHub {
  const clients = new Set<SseClient>();

  const remove = (client: SseClient): void => {
    clients.delete(client);
  };

  const closeClient = (client: SseClient): void => {
    clients.delete(client);
    if (client.destroyed || client.writableEnded) {
      return;
    }

    try {
      client.end();
    } catch {
      // The connection is already unusable; dropping it is enough.
    }
  };

  const broadcast = (payload: BroadcastPayload): void => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;

    for (const client of Array.from(clients)) {
      if (client.destroyed || client.writableEnded) {
        clients.delete(client);
        continue;
      }

      try {
        client.write(data);
      } catch {
        closeClient(client);
      }
    }
  };

  return {
    add: (client) => {
      clients.add(client);
      client.once("close", () => remove(client));
      client.once("error", () => remove(client));
    },
    remove,
    broadcastFlow: (flow) => broadcast({ type: "flow", flow }),
    broadcastClear: () => broadcast({ type: "clear" }),
    closeEvents: () => {
      for (const client of Array.from(clients)) {
        closeClient(client);
      }
    }
  };
}

function createExpressApp(options: CreateAppOptions, eventHub: EventHub): Express {
  const app = express();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const dashboardHost = advertisedHost(options.dashboardHost, options.lanAddresses);
  const proxyHost = advertisedHost(options.proxyHost, options.lanAddresses);

  app.use(express.json());
  app.use(express.static(path.join(rootDir, "public")));

  app.get("/api/status", (_request, response) => {
    response.json({
      capture: { paused: options.store.isPaused() },
      dashboard: { host: dashboardHost, port: options.dashboardPort },
      proxy: {
        host: proxyHost,
        port: options.proxyPort,
        certificateUrl: "http://mitm.it"
      },
      lanAddresses: options.lanAddresses,
      mitmproxy: options.mitmState()
    });
  });

  app.get("/api/flows", (request, response) => {
    response.json({ flows: options.store.listFlows(filtersFromQuery(request.query)) });
  });

  app.get("/api/flows/:id", (request, response) => {
    const flow = options.store.getFlow(request.params.id);
    if (!flow) {
      response.status(404).json({ error: "flow not found" });
      return;
    }

    response.json({ flow });
  });

  app.post("/api/capture/pause", (_request, response) => {
    options.store.setPaused(true);
    response.json({ paused: true });
  });

  app.post("/api/capture/resume", (_request, response) => {
    options.store.setPaused(false);
    response.json({ paused: false });
  });

  app.post("/api/flows/clear", (_request, response) => {
    options.store.clear();
    eventHub.broadcastClear();
    response.json({ cleared: true });
  });

  app.get("/api/export", (request, response) => {
    const flows = options.store.listFlows(filtersFromQuery(request.query));
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader(
      "content-disposition",
      `attachment; filename="rela-capture-${Date.now()}.json"`
    );
    response.send(JSON.stringify({ exportedAt: new Date().toISOString(), flows }, null, 2));
  });

  app.get("/api/events", (request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    response.write(": connected\n\n");

    eventHub.add(response);
    request.on("close", () => {
      eventHub.remove(response);
    });
  });

  return app;
}

function filtersFromQuery(query: Record<string, unknown>): FlowFilters {
  const protocol = protocolFromQuery(query.protocol);
  const statusClass = statusClassFromQuery(query.statusClass);

  return {
    deviceIp: stringQuery(query.deviceIp),
    host: stringQuery(query.host),
    ...(protocol ? { protocol } : {}),
    ...(statusClass ? { statusClass } : {})
  };
}

function protocolFromQuery(value: unknown): FlowFilters["protocol"] | undefined {
  const protocol = stringQuery(value);
  if (!protocol || !allowedProtocols.has(protocol as FlowFilters["protocol"])) {
    return undefined;
  }

  return protocol as FlowFilters["protocol"];
}

function statusClassFromQuery(value: unknown): FlowFilters["statusClass"] | undefined {
  const statusClass = stringQuery(value);
  if (!statusClass || !allowedStatusClasses.has(statusClass as FlowFilters["statusClass"])) {
    return undefined;
  }

  return statusClass as FlowFilters["statusClass"];
}

function stringQuery(value: unknown): string | undefined {
  const selected = Array.isArray(value) ? value[0] : value;
  if (typeof selected !== "string") {
    return undefined;
  }

  const trimmed = selected.trim();
  return trimmed || undefined;
}

function advertisedHost(configuredHost: string | undefined, lanAddresses: LanAddress[]): string {
  const host = configuredHost?.trim();
  if (host && !isWildcardHost(host)) {
    return host;
  }

  return lanAddresses[0]?.address ?? "localhost";
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "[::]";
}
