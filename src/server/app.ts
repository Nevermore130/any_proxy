import express, { type Express, type Response } from "express";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { FlowStore } from "./flowStore.js";
import type { LanAddress } from "./lan.js";
import { createRelayHandler, relayAllowedTargetHosts } from "./relay.js";
import { captureSessionQrPayload, ensureCaptureSession } from "./session.js";
import type { CapturedFlow, FlowFilters } from "./types.js";

export type CreateAppOptions = {
  store: FlowStore;
  lanAddresses: LanAddress[];
  advertiseHost?: string;
  dashboardHost?: string;
  dashboardPort: number;
  relayAllowedHosts?: readonly string[];
  relayHostOverrides?: Record<string, string>;
  relayTargetOrigin?: string;
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
  add: (captureSessionId: string | SseClient, client?: SseClient) => void;
  remove: (client: SseClient) => void;
  broadcastFlow: (flow: CapturedFlow) => void;
  broadcastClear: (captureSessionId?: string) => void;
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
  const clientsBySession = new Map<string, Set<SseClient>>();

  const remove = (client: SseClient): void => {
    for (const clients of clientsBySession.values()) {
      clients.delete(client);
    }
  };

  const closeClient = (client: SseClient): void => {
    remove(client);
    if (client.destroyed || client.writableEnded) {
      return;
    }

    try {
      client.end();
    } catch {
      // The connection is already unusable; dropping it is enough.
    }
  };

  const broadcast = (payload: BroadcastPayload, captureSessionId?: string): void => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    const clients = captureSessionId
      ? (clientsBySession.get(captureSessionId) ?? new Set<SseClient>())
      : new Set(Array.from(clientsBySession.values()).flatMap((sessionClients) => Array.from(sessionClients)));

    for (const client of Array.from(clients)) {
      if (client.destroyed || client.writableEnded) {
        remove(client);
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
    add: (captureSessionIdOrClient, maybeClient) => {
      const captureSessionId =
        typeof captureSessionIdOrClient === "string" ? captureSessionIdOrClient : "__compat__";
      const client =
        typeof captureSessionIdOrClient === "string" ? maybeClient : captureSessionIdOrClient;
      if (!client) {
        return;
      }
      const clients = clientsBySession.get(captureSessionId) ?? new Set<SseClient>();
      clients.add(client);
      clientsBySession.set(captureSessionId, clients);
      client.once("close", () => remove(client));
      client.once("error", () => remove(client));
    },
    remove,
    broadcastFlow: (flow) => broadcast({ type: "flow", flow }, flow.captureSessionId),
    broadcastClear: (captureSessionId) => broadcast({ type: "clear" }, captureSessionId),
    closeEvents: () => {
      for (const client of Array.from(clientsBySession.values()).flatMap((sessionClients) =>
        Array.from(sessionClients)
      )) {
        closeClient(client);
      }
    }
  };
}

function createExpressApp(options: CreateAppOptions, eventHub: EventHub): Express {
  const app = express();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const dashboardHost = advertisedHost(
    options.advertiseHost ?? options.dashboardHost,
    options.lanAddresses
  );
  const relayTargetOrigin = options.relayTargetOrigin ?? "https://api.rela.me";
  const relayAllowedHosts = relayAllowedTargetHosts(options.relayAllowedHosts);
  const relayBaseUrl = `${publicHttpOrigin(dashboardHost, options.dashboardPort)}/relay/rela`;

  app.all(
    /^\/relay\/rela(?:\/.*)?$/,
    express.raw({ type: "*/*", limit: "20mb" }),
    createRelayHandler({
      broadcastFlow: eventHub.broadcastFlow,
      allowedTargetHosts: relayAllowedHosts,
      hostOriginOverrides: options.relayHostOverrides,
      prefix: "/relay/rela",
      store: options.store,
      targetOrigin: relayTargetOrigin
    })
  );

  app.use(express.json());
  for (const staticDir of dashboardStaticDirs(rootDir)) {
    app.use(express.static(staticDir));
  }

  app.get("/api/status", (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    response.json({
      capture: { paused: options.store.isPaused() },
      dashboard: { host: dashboardHost, port: options.dashboardPort },
      relay: {
        rela: {
          allowedHosts: relayAllowedHosts,
          baseUrl: relayBaseUrl,
          targetOrigin: relayTargetOrigin
        }
      },
      session: {
        id: captureSessionId,
        qrPayload: captureSessionQrPayload(relayBaseUrl, captureSessionId)
      },
      lanAddresses: options.lanAddresses
    });
  });

  app.get("/api/session/qr.svg", async (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    const payload = captureSessionQrPayload(relayBaseUrl, captureSessionId);
    const svg = await QRCode.toString(JSON.stringify(payload), {
      errorCorrectionLevel: "M",
      margin: 1,
      type: "svg",
      width: 220
    });
    response.type("image/svg+xml").send(svg);
  });

  app.get("/api/flows", (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    response.json({
      flows: options.store.listFlows(filtersFromQuery(request.query), captureSessionId)
    });
  });

  app.get("/api/flows/:id", (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    const flow = options.store.getFlow(request.params.id, captureSessionId);
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
    const captureSessionId = ensureCaptureSession(_request, response);
    options.store.clear(captureSessionId);
    eventHub.broadcastClear(captureSessionId);
    response.json({ cleared: true });
  });

  app.get("/api/export", (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    const flows = options.store.listFlows(filtersFromQuery(request.query), captureSessionId);
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader(
      "content-disposition",
      `attachment; filename="rela-capture-${Date.now()}.json"`
    );
    response.send(JSON.stringify({ exportedAt: new Date().toISOString(), flows }, null, 2));
  });

  app.get("/api/events", (request, response) => {
    const captureSessionId = ensureCaptureSession(request, response);
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    response.write(": connected\n\n");

    eventHub.add(captureSessionId, response);
    request.on("close", () => {
      eventHub.remove(response);
    });
  });

  return app;
}

export function dashboardStaticDirs(rootDir: string): string[] {
  return [path.join(rootDir, "dist", "public"), path.join(rootDir, "public")];
}

export function publicHttpOrigin(host: string, port: number): string {
  const value = host.trim();
  const origin = originFromConfiguredHost(value);
  if (!origin) {
    return `http://localhost:${port}`;
  }

  const url = new URL(origin);
  if (hasExplicitPort(value) || isPublicDnsHost(url.hostname)) {
    return url.origin;
  }

  return `http://${hostForUrl(url.hostname)}:${port}`;
}

function originFromConfiguredHost(host: string): string | undefined {
  if (!host) {
    return undefined;
  }

  try {
    const url = new URL(host);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch {
    // Continue below: most configs are bare hosts, not full URLs.
  }

  try {
    return new URL(`http://${hostForParsing(host)}`).origin;
  } catch {
    return undefined;
  }
}

function hasExplicitPort(host: string): boolean {
  const value = host.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return new URL(value).port !== "";
  }

  if (value.startsWith("[")) {
    return /\]:\d+$/.test(value);
  }
  if (isIP(value) !== 0) {
    return false;
  }

  return /:\d+$/.test(value);
}

function isPublicDnsHost(hostname: string): boolean {
  return hostname !== "localhost" && isIP(hostname) === 0;
}

function hostForParsing(host: string): string {
  if (isIP(host) === 6) {
    return `[${host}]`;
  }
  if (host.includes(":") && !host.startsWith("[") && !/:\d+$/.test(host)) {
    return `[${host}]`;
  }
  return host;
}

function hostForUrl(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
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
