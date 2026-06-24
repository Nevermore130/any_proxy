import type { Express } from "express";
import http, { type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCaptureApp, publicHttpOrigin } from "./app.js";
import { loadConfig, type RuntimeConfig } from "./config.js";
import { FlowStore } from "./flowStore.js";
import { getLanAddresses, type LanAddress } from "./lan.js";

type Logger = Pick<Console, "error" | "log">;

export type StartRelaCaptureOptions = {
  config?: RuntimeConfig;
  createServer?: (app: Express) => Server;
  lanAddresses?: LanAddress[];
  logger?: Logger;
  registerSignals?: boolean;
  setExitCode?: (code: number) => void;
  shutdownTimeoutMs?: number;
  store?: FlowStore;
};

export type RelaCaptureRuntime = {
  app: Express;
  close: () => void;
  closeEvents: () => void;
  server: Server;
  store: FlowStore;
};

export function startRelaCapture(options: StartRelaCaptureOptions = {}): RelaCaptureRuntime {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? console;
  const setExitCode =
    options.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });
  const store =
    options.store ??
    new FlowStore({
      maxFlows: config.maxFlows,
      bodyPreviewBytes: config.bodyPreviewBytes,
      flowTtlMs: config.flowTtlMs
    });
  const lanAddresses = options.lanAddresses ?? getLanAddresses();
  const createServer = options.createServer ?? ((app: Express) => http.createServer(app));
  const registerSignals = options.registerSignals ?? true;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 2000;

  let dashboardListening = false;
  let closing = false;

  const captureApp = createCaptureApp({
    store,
    lanAddresses,
    advertiseHost: config.advertiseHost,
    dashboardHost: config.dashboardHost,
    dashboardPort: config.dashboardPort,
    relayTargetOrigin: config.relayTargetOrigin
  });
  const server = createServer(captureApp.app);

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(
        `Dashboard port ${config.dashboardPort} is already in use. Set RELA_CAPTURE_DASHBOARD_PORT to use another port.`
      );
      if (!dashboardListening) {
        setExitCode(1);
      }
      return;
    }

    logger.error(error);
    if (!dashboardListening) {
      setExitCode(1);
    }
  });

  server.listen(config.dashboardPort, config.dashboardHost, () => {
    dashboardListening = true;
    const dashboardHost = advertisedHost(config.advertiseHost ?? config.dashboardHost, lanAddresses);
    const publicOrigin = publicHttpOrigin(dashboardHost, config.dashboardPort);
    logger.log(`Rela Capture dashboard: ${publicOrigin}`);
    logger.log(`Rela App relay: ${publicOrigin}/relay/rela -> ${config.relayTargetOrigin}`);
  });

  const close = (onClosed?: () => void): void => {
    if (closing) {
      onClosed?.();
      return;
    }

    closing = true;
    captureApp.closeEvents();

    let finished = false;
    const timeout = setTimeout(() => {
      logger.error("Timed out waiting for dashboard server to close.");
      finish();
    }, shutdownTimeoutMs);
    timeout.unref?.();

    const finish = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      onClosed?.();
    };

    try {
      server.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          logger.error(error);
        }
        finish();
      });
    } catch (error) {
      logger.error(error);
      finish();
    }
  };

  if (registerSignals) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        close(() => {
          process.exit(0);
        });
      });
    }
  }

  return {
    app: captureApp.app,
    close,
    closeEvents: captureApp.closeEvents,
    server,
    store
  };
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

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && path.resolve(entrypoint) === fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  startRelaCapture();
}
