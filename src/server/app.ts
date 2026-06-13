import express, { type Express, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlowStore } from "./flowStore.js";
import type { LanAddress } from "./lan.js";
import type { CapturedFlow, FlowFilters, Protocol } from "./types.js";

export type MitmState = {
  running: boolean;
  message?: string;
};

export type CreateAppOptions = {
  store: FlowStore;
  lanAddresses: LanAddress[];
  dashboardPort: number;
  proxyPort: number;
  mitmState: () => MitmState;
};

type BroadcastPayload = { type: "flow"; flow: CapturedFlow } | { type: "clear" };

const clients = new Set<Response>();
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

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  app.use(express.json());
  app.use(express.static(path.join(rootDir, "public")));

  app.get("/api/status", (_request, response) => {
    response.json({
      capture: { paused: options.store.isPaused() },
      dashboard: { port: options.dashboardPort },
      proxy: {
        host: options.lanAddresses[0]?.address ?? "localhost",
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
    broadcast({ type: "clear" });
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

    clients.add(response);
    request.on("close", () => {
      clients.delete(response);
    });
  });

  return app;
}

export function broadcastFlow(flow: CapturedFlow): void {
  broadcast({ type: "flow", flow });
}

function broadcast(payload: BroadcastPayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }

    client.write(data);
  }
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
  if (!protocol || !allowedProtocols.has(protocol as Protocol | "all")) {
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
