import express, { type Express, type Response } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { FlowStore } from "./flowStore.js";
import type { LanAddress } from "./lan.js";
import { createRelayHandler } from "./relay.js";
import type { CapturedFlow, FlowFilters } from "./types.js";

export type MitmState = {
  running: boolean;
  message?: string;
};

export type CreateAppOptions = {
  store: FlowStore;
  lanAddresses: LanAddress[];
  advertiseHost?: string;
  dashboardHost?: string;
  dashboardPort: number;
  proxyHost?: string;
  proxyPort: number;
  relayTargetOrigin?: string;
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
  const dashboardHost = advertisedHost(
    options.advertiseHost ?? options.dashboardHost,
    options.lanAddresses
  );
  const proxyHost = advertisedHost(options.advertiseHost ?? options.proxyHost, options.lanAddresses);
  const onboarding = createOnboardingInfo({
    dashboardHost,
    dashboardPort: options.dashboardPort,
    proxyHost,
    proxyPort: options.proxyPort
  });
  const relayTargetOrigin = options.relayTargetOrigin ?? "https://api.rela.me";
  const relayBaseUrl = `${absoluteHttpUrl(dashboardHost, options.dashboardPort)}/relay/rela`;

  app.all(
    /^\/relay\/rela(?:\/.*)?$/,
    express.raw({ type: "*/*", limit: "20mb" }),
    createRelayHandler({
      broadcastFlow: eventHub.broadcastFlow,
      prefix: "/relay/rela",
      store: options.store,
      targetOrigin: relayTargetOrigin
    })
  );

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
      onboarding: {
        mobileSetupUrl: onboarding.mobileSetupUrl,
        qrCodeUrl: onboarding.qrCodeUrl,
        iosProfileUrl: onboarding.iosProfileUrl
      },
      relay: {
        rela: {
          baseUrl: relayBaseUrl,
          targetOrigin: relayTargetOrigin
        }
      },
      lanAddresses: options.lanAddresses,
      mitmproxy: options.mitmState()
    });
  });

  app.get("/api/onboarding", (_request, response) => {
    response.json(onboarding);
  });

  app.get("/api/onboarding/qr.svg", async (_request, response) => {
    try {
      const svg = await QRCode.toString(onboarding.mobileSetupUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220
      });
      response.setHeader("content-type", "image/svg+xml; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.send(svg);
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : "could not create onboarding QR code"
      });
    }
  });

  app.get("/mobile-setup", (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.send(renderMobileSetupPage(onboarding));
  });

  app.get("/profiles/ios-proxy.mobileconfig", (_request, response) => {
    response.setHeader("content-type", "application/x-apple-aspen-config; charset=utf-8");
    response.setHeader(
      "content-disposition",
      'attachment; filename="rela-capture-proxy.mobileconfig"'
    );
    response.setHeader("cache-control", "no-store");
    response.send(renderIosProxyProfile(onboarding));
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

type OnboardingInfo = {
  dashboardUrl: string;
  mobileSetupUrl: string;
  qrCodeUrl: string;
  certificateUrl: string;
  iosProfileUrl: string;
  proxy: {
    host: string;
    port: number;
    url: string;
  };
};

function createOnboardingInfo(options: {
  dashboardHost: string;
  dashboardPort: number;
  proxyHost: string;
  proxyPort: number;
}): OnboardingInfo {
  const dashboardUrl = absoluteHttpUrl(options.dashboardHost, options.dashboardPort);
  const proxyUrl = absoluteHttpUrl(options.proxyHost, options.proxyPort);

  return {
    dashboardUrl,
    mobileSetupUrl: `${dashboardUrl}/mobile-setup`,
    qrCodeUrl: `${dashboardUrl}/api/onboarding/qr.svg`,
    certificateUrl: "http://mitm.it",
    iosProfileUrl: `${dashboardUrl}/profiles/ios-proxy.mobileconfig`,
    proxy: {
      host: options.proxyHost,
      port: options.proxyPort,
      url: proxyUrl
    }
  };
}

function absoluteHttpUrl(host: string, port: number): string {
  return `http://${hostForUrl(host)}:${port}`;
}

function hostForUrl(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }
  return host;
}

function renderMobileSetupPage(onboarding: OnboardingInfo): string {
  const proxyAddress = `${onboarding.proxy.host}:${onboarding.proxy.port}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rela Capture 手机配置</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202e; background: #f6f7f9; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; }
      main { max-width: 680px; margin: 0 auto; }
      h1 { margin: 0 0 6px; font-size: 24px; }
      h2 { margin: 24px 0 10px; font-size: 16px; }
      p, li { color: #435066; line-height: 1.55; }
      .panel { margin-top: 16px; padding: 16px; border: 1px solid #d9e0e8; border-radius: 8px; background: #fff; }
      .proxy { display: grid; gap: 10px; }
      .row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; }
      .label { color: #657187; font-weight: 700; }
      code { padding: 2px 5px; border-radius: 4px; background: #eef2f6; overflow-wrap: anywhere; }
      a.button { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; margin: 8px 8px 0 0; padding: 0 14px; border-radius: 6px; background: #2463eb; color: #fff; text-decoration: none; font-weight: 700; }
      a.button.secondary { background: #eef2f6; color: #243248; }
      .warning { border-color: #f1d59b; background: #fff8e8; }
      ol { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Rela Capture 手机配置</h1>
      <p>保持手机和电脑在同一个 Wi-Fi 下，然后按下面的信息配置 HTTP 代理。</p>

      <section class="panel proxy">
        <div class="row"><span class="label">代理地址</span><code>${escapeHtml(proxyAddress)}</code></div>
        <div class="row"><span class="label">服务器</span><code>${escapeHtml(onboarding.proxy.host)}</code></div>
        <div class="row"><span class="label">端口</span><code>${onboarding.proxy.port}</code></div>
        <div class="row"><span class="label">证书页</span><code>${escapeHtml(onboarding.certificateUrl)}</code></div>
      </section>

      <section class="panel">
        <h2>下一步</h2>
        <a class="button" href="${escapeHtml(onboarding.certificateUrl)}">打开证书安装页</a>
        <a class="button secondary" href="${escapeHtml(onboarding.iosProfileUrl)}">下载 iOS 代理描述文件</a>
        <a class="button secondary" href="${escapeHtml(onboarding.dashboardUrl)}">打开 Dashboard</a>
      </section>

      <section class="panel warning">
        <h2>iOS 提示</h2>
        <p>iOS 描述文件使用 Global HTTP Proxy 载荷，部分设备需要受监管模式才会生效。普通测试机如果安装后仍不走代理，请在当前 Wi-Fi 里手动设置 HTTP 代理。</p>
        <ol>
          <li>设置 -> Wi-Fi -> 当前网络 -> 配置代理 -> 手动。</li>
          <li>服务器填 <code>${escapeHtml(onboarding.proxy.host)}</code>，端口填 <code>${onboarding.proxy.port}</code>。</li>
          <li>用 Safari 打开 <code>${escapeHtml(onboarding.certificateUrl)}</code>，安装证书。</li>
          <li>设置 -> 通用 -> 关于本机 -> 证书信任设置，信任 mitmproxy。</li>
        </ol>
      </section>

      <section class="panel">
        <h2>Android 提示</h2>
        <ol>
          <li>长按当前 Wi-Fi，进入网络详情或修改网络。</li>
          <li>代理选择手动，主机填 <code>${escapeHtml(onboarding.proxy.host)}</code>，端口填 <code>${onboarding.proxy.port}</code>。</li>
          <li>浏览器打开 <code>${escapeHtml(onboarding.certificateUrl)}</code> 安装 CA。</li>
          <li>Android 7+ 的 App 抓 HTTPS，debug 包通常还需要允许用户 CA。</li>
        </ol>
      </section>
    </main>
  </body>
</html>`;
}

function renderIosProxyProfile(onboarding: OnboardingInfo): string {
  const rootUuid = randomUUID().toUpperCase();
  const payloadUuid = randomUUID().toUpperCase();
  const host = escapeXml(onboarding.proxy.host);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDescription</key>
      <string>Routes HTTP traffic through the local Rela Capture mitmproxy instance.</string>
      <key>PayloadDisplayName</key>
      <string>Rela Capture Proxy</string>
      <key>PayloadIdentifier</key>
      <string>com.rela.capture.proxy.global</string>
      <key>PayloadType</key>
      <string>com.apple.proxy.http.global</string>
      <key>PayloadUUID</key>
      <string>${payloadUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>ProxyServer</key>
      <string>${host}</string>
      <key>ProxyServerPort</key>
      <integer>${onboarding.proxy.port}</integer>
      <key>ProxyType</key>
      <string>Manual</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Configures an iOS device to use the Rela Capture local HTTP proxy when supported by the device.</string>
  <key>PayloadDisplayName</key>
  <string>Rela Capture Local Proxy</string>
  <key>PayloadIdentifier</key>
  <string>com.rela.capture.proxy</string>
  <key>PayloadOrganization</key>
  <string>Rela</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${rootUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
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
