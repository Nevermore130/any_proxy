import http from "node:http";
import { createApp, broadcastFlow } from "./app.js";
import { loadConfig } from "./config.js";
import { FlowStore } from "./flowStore.js";
import { getLanAddresses } from "./lan.js";
import { startMitmproxy, type MitmproxyRuntime } from "./mitm.js";

const config = loadConfig();
const store = new FlowStore({
  maxFlows: config.maxFlows,
  bodyPreviewBytes: config.bodyPreviewBytes
});
const lanAddresses = getLanAddresses();

let mitmRunning = false;
let mitmMessage = "starting";
let mitmRuntime: MitmproxyRuntime | undefined;

const app = createApp({
  store,
  lanAddresses,
  dashboardPort: config.dashboardPort,
  proxyPort: config.proxyPort,
  mitmState: () => ({ running: mitmRunning, message: mitmMessage })
});

const server = http.createServer(app);

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Dashboard port ${config.dashboardPort} is already in use. Set RELA_CAPTURE_DASHBOARD_PORT to use another port.`
    );
    return;
  }

  console.error(error);
});

server.listen(config.dashboardPort, config.dashboardHost, () => {
  const dashboardHost = lanAddresses[0]?.address ?? "localhost";
  console.log(`Rela Capture dashboard: http://${dashboardHost}:${config.dashboardPort}`);
  console.log(`Phone proxy: ${dashboardHost}:${config.proxyPort}`);
  console.log("Certificate install page after proxy setup: http://mitm.it");
});

try {
  mitmRuntime = startMitmproxy({
    proxyHost: config.proxyHost,
    proxyPort: config.proxyPort,
    onEvent: (event) => {
      const flow = store.ingest(event);
      if (flow) {
        broadcastFlow(flow);
      }
    },
    onLog: (message) => {
      mitmMessage = message;
      console.log(`[mitmproxy] ${message}`);
    },
    onExit: (code, signal) => {
      mitmRunning = false;
      const exitMessage = `exited with code ${code ?? "null"} signal ${signal ?? "null"}`;
      if (!shouldPreserveMitmMessage(mitmMessage, code, signal)) {
        mitmMessage = exitMessage;
      }
      console.log(`[mitmproxy] ${exitMessage}`);
    }
  });
  mitmRunning = true;
  mitmMessage = "running";
} catch (error) {
  mitmRunning = false;
  mitmMessage = error instanceof Error ? error.message : String(error);
  console.error(mitmMessage);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    mitmRuntime?.stop();
    server.close(() => {
      process.exit(0);
    });
  });
}

function shouldPreserveMitmMessage(
  currentMessage: string,
  code: number | null,
  signal: NodeJS.Signals | null
): boolean {
  return code === null && signal === null && /\berror\b/i.test(currentMessage);
}
