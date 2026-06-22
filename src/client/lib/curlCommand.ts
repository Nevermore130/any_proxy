import type { BodyPreview, CapturedFlow } from "../types.js";

const transientHeaderNames = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function flowRequestUrl(flow: CapturedFlow): string {
  const scheme = flow.scheme || "http";
  const path = flow.path || "";
  return `${scheme}://${flowHostWithPort(flow)}${path}`;
}

export function curlCommandForFlow(flow: CapturedFlow): string {
  const lines = [`curl ${shellQuote(flowRequestUrl(flow))}`];
  const method = flow.method?.trim().toUpperCase();

  if (method && method !== "GET") {
    lines.push(`  -X ${shellQuote(method)}`);
  }

  for (const [name, value] of reusableHeaders(flow.requestHeaders)) {
    lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`);
  }

  const body = requestBodyText(flow.requestBodyPreview);
  if (body) {
    lines.push(`  --data-raw ${shellQuote(body)}`);
  }

  return lines.join(" \\\n");
}

function reusableHeaders(headers: CapturedFlow["requestHeaders"]): Array<[string, string]> {
  if (!Array.isArray(headers)) {
    return [];
  }

  return headers.filter(([name]) => {
    const normalizedName = name.trim().toLowerCase();
    return normalizedName.length > 0 && !normalizedName.startsWith(":") && !transientHeaderNames.has(normalizedName);
  });
}

function requestBodyText(body: BodyPreview | undefined): string {
  if (!body || body.kind === "empty" || typeof body.preview !== "string") {
    return "";
  }
  return body.preview;
}

function flowHostWithPort(flow: CapturedFlow): string {
  const host = flow.host || "";
  if (!flow.port) {
    return host;
  }

  const scheme = flow.scheme || "http";
  const defaultPort = (scheme === "https" && flow.port === 443) || (scheme === "http" && flow.port === 80);
  return defaultPort ? host : `${host}:${flow.port}`;
}
