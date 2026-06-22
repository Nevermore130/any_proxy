export type RuntimeConfig = {
  dashboardHost: string;
  advertiseHost?: string;
  dashboardPort: number;
  maxFlows: number;
  bodyPreviewBytes: number;
  flowTtlMs: number;
  relayTargetOrigin: string;
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
    maxFlows: intFromEnv("RELA_CAPTURE_MAX_FLOWS", 5000),
    bodyPreviewBytes: intFromEnv("RELA_CAPTURE_BODY_PREVIEW_BYTES", 32768),
    flowTtlMs: intFromEnv("RELA_CAPTURE_FLOW_TTL_SECONDS", 600) * 1000,
    relayTargetOrigin: originFromEnv("RELA_RELAY_TARGET_ORIGIN", "https://api.rela.me")
  };
}
