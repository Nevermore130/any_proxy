export type RuntimeConfig = {
  dashboardHost: string;
  advertiseHost?: string;
  dashboardPort: number;
  proxyHost: string;
  proxyPort: number;
  maxFlows: number;
  bodyPreviewBytes: number;
  includeHosts: string[];
  excludeHosts: string[];
  relayTargetOrigin: string;
  mitmproxyBlockGlobal: boolean;
};

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function optionalHostFromEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw || undefined;
}

function listFromEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
}

function originFromEnv(name: string, fallback: string): string {
  const raw = process.env[name] || fallback;
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return parsed.origin;
}

export function loadConfig(): RuntimeConfig {
  return {
    dashboardHost: process.env.RELA_CAPTURE_DASHBOARD_HOST || "0.0.0.0",
    advertiseHost: optionalHostFromEnv("RELA_CAPTURE_ADVERTISE_HOST"),
    dashboardPort: intFromEnv("RELA_CAPTURE_DASHBOARD_PORT", 5177),
    proxyHost: process.env.RELA_CAPTURE_PROXY_HOST || "0.0.0.0",
    proxyPort: intFromEnv("RELA_CAPTURE_PROXY_PORT", 8088),
    maxFlows: intFromEnv("RELA_CAPTURE_MAX_FLOWS", 2000),
    bodyPreviewBytes: intFromEnv("RELA_CAPTURE_BODY_PREVIEW_BYTES", 65536),
    includeHosts: listFromEnv("RELA_CAPTURE_INCLUDE_HOSTS"),
    excludeHosts: listFromEnv("RELA_CAPTURE_EXCLUDE_HOSTS"),
    relayTargetOrigin: originFromEnv("RELA_RELAY_TARGET_ORIGIN", "https://api.rela.me"),
    mitmproxyBlockGlobal: booleanFromEnv("RELA_CAPTURE_MITMPROXY_BLOCK_GLOBAL", true)
  };
}
