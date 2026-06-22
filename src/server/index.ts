import type { Express } from "express";
import http, { type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCaptureApp, type MitmState } from "./app.js";
import { loadConfig, type RuntimeConfig } from "./config.js";
import { FlowStore } from "./flowStore.js";
import { getLanAddresses, type LanAddress } from "./lan.js";
import {
  startMitmproxy as startMitmproxyProcess,
  type MitmproxyRuntime,
  type StartMitmproxyOptions
} from "./mitm.js";

type Logger = Pick<Console, "error" | "log">;

export type StartRelaCaptureOptions = {
  config?: RuntimeConfig;
  createServer?: (app: Express) => Server;
  lanAddresses?: LanAddress[];
  logger?: Logger;
  registerSignals?: boolean;
  setExitCode?: (code: number) => void;
  shutdownTimeoutMs?: number;
  startMitmproxy?: (options: StartMitmproxyOptions) => MitmproxyRuntime;
  store?: FlowStore;
};

export type RelaCaptureRuntime = {
  app: Express;
  close: () => void;
  closeEvents: () => void;
  mitmState: () => MitmState;
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
  const startMitmproxy = options.startMitmproxy ?? startMitmproxyProcess;
  const registerSignals = options.registerSignals ?? true;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 2000;

  let mitmRunning = false;
  let mitmMessage = "starting";
  let mitmRuntime: MitmproxyRuntime | undefined;
  let dashboardListening = false;
  let closing = false;

  const captureApp = createCaptureApp({
    store,
    lanAddresses,
    advertiseHost: config.advertiseHost,
    dashboardHost: config.dashboardHost,
    dashboardPort: config.dashboardPort,
    proxyHost: config.proxyHost,
    proxyPort: config.proxyPort,
    relayTargetOrigin: config.relayTargetOrigin,
    mitmState: () => ({ running: mitmRunning, message: mitmMessage })
  });
  const server = createServer(captureApp.app);

  const startCaptureProxy = (): void => {
    try {
      mitmRuntime = startMitmproxy({
        proxyHost: config.proxyHost,
        proxyPort: config.proxyPort,
        blockGlobal: config.mitmproxyBlockGlobal,
        onEvent: (event) => {
          try {
            const flow = store.ingest(event);
            if (flow) {
              captureApp.broadcastFlow(flow);
            }
          } catch (error) {
            logger.error("Failed to process mitmproxy event", error);
          }
        },
        onLog: (message) => {
          mitmMessage = message;
          logger.log(`[mitmproxy] ${message}`);
        },
        onExit: (code, signal) => {
          mitmRunning = false;
          const exitMessage = `exited with code ${code ?? "null"} signal ${signal ?? "null"}`;
          if (!shouldPreserveMitmMessage(mitmMessage, code, signal)) {
            mitmMessage = exitMessage;
          }
          logger.log(`[mitmproxy] ${exitMessage}`);
        }
      });
      mitmRunning = true;
      mitmMessage = "running";
    } catch (error) {
      mitmRunning = false;
      mitmMessage = error instanceof Error ? error.message : String(error);
      logger.error(mitmMessage);
    }
  };

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
    const proxyHost = advertisedHost(config.advertiseHost ?? config.proxyHost, lanAddresses);
    logger.log(`Rela Capture dashboard: http://${dashboardHost}:${config.dashboardPort}`);
    logger.log(`Rela App relay: http://${dashboardHost}:${config.dashboardPort}/relay/rela -> ${config.relayTargetOrigin}`);
    logger.log(`Phone proxy: ${proxyHost}:${config.proxyPort}`);
    logger.log("Certificate install page after proxy setup: http://mitm.it");
    startCaptureProxy();
  });

  const close = (onClosed?: () => void): void => {
    if (closing) {
      onClosed?.();
      return;
    }

    closing = true;
    captureApp.closeEvents();
    mitmRuntime?.stop();

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
    mitmState: () => ({ running: mitmRunning, message: mitmMessage }),
    server,
    store
  };
}

function shouldPreserveMitmMessage(
  currentMessage: string,
  code: number | null,
  signal: NodeJS.Signals | null
): boolean {
  return code === null && signal === null && /\berror\b/i.test(currentMessage);
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
