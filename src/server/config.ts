export type RuntimeConfig = {
  dashboardHost: string;
  dashboardPort: number;
  proxyHost: string;
  proxyPort: number;
  maxFlows: number;
  bodyPreviewBytes: number;
  includeHosts: string[];
  excludeHosts: string[];
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

export function loadConfig(): RuntimeConfig {
  return {
    dashboardHost: process.env.RELA_CAPTURE_DASHBOARD_HOST || "0.0.0.0",
    dashboardPort: intFromEnv("RELA_CAPTURE_DASHBOARD_PORT", 5177),
    proxyHost: process.env.RELA_CAPTURE_PROXY_HOST || "0.0.0.0",
    proxyPort: intFromEnv("RELA_CAPTURE_PROXY_PORT", 8088),
    maxFlows: intFromEnv("RELA_CAPTURE_MAX_FLOWS", 2000),
    bodyPreviewBytes: intFromEnv("RELA_CAPTURE_BODY_PREVIEW_BYTES", 65536),
    includeHosts: listFromEnv("RELA_CAPTURE_INCLUDE_HOSTS"),
    excludeHosts: listFromEnv("RELA_CAPTURE_EXCLUDE_HOSTS")
  };
}
