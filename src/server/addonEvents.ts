import type { AddonFlowEvent, Protocol } from "./types.js";

export const ADDON_EVENT_PREFIX = "RELA_CAPTURE_EVENT ";

const allowedEventTypes = new Set(["request", "response", "error", "websocket"]);
const allowedProtocols = new Set(["http", "https", "websocket", "unknown"]);
const allowedBodyEncodings = new Set(["text", "base64"]);

export function parseAddonLine(line: string): AddonFlowEvent | undefined {
  if (!line.startsWith(ADDON_EVENT_PREFIX)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(line.slice(ADDON_EVENT_PREFIX.length)) as unknown;
    if (!isRecord(parsed) || !isEventType(parsed.eventType)) {
      return undefined;
    }
    if (!isRecord(parsed.flow)) {
      return undefined;
    }

    const flow = parsed.flow;
    if (
      typeof flow.id !== "string" ||
      typeof flow.clientIp !== "string" ||
      !isFiniteNumber(flow.startedAtEpochMs) ||
      typeof flow.method !== "string" ||
      typeof flow.scheme !== "string" ||
      typeof flow.host !== "string" ||
      typeof flow.path !== "string" ||
      typeof flow.isTlsIntercepted !== "boolean" ||
      !isOptionalFiniteNumber(flow.durationMs) ||
      !isOptionalFiniteNumber(flow.statusCode) ||
      !isOptionalFiniteNumber(flow.port) ||
      !isOptionalBody(flow.requestBody) ||
      !isOptionalBody(flow.responseBody) ||
      !isOptionalBodyEncoding(flow.requestBodyEncoding) ||
      !isOptionalBodyEncoding(flow.responseBodyEncoding) ||
      !isOptionalHeaderPairs(flow.requestHeaders) ||
      !isOptionalHeaderPairs(flow.responseHeaders)
    ) {
      return undefined;
    }

    const protocol = isProtocol(flow.protocol) ? flow.protocol : "unknown";

    return {
      eventType: parsed.eventType,
      flow: {
        ...flow,
        protocol
      }
    } as AddonFlowEvent;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEventType(value: unknown): value is AddonFlowEvent["eventType"] {
  return typeof value === "string" && allowedEventTypes.has(value);
}

function isProtocol(value: unknown): value is Protocol {
  return typeof value === "string" && allowedProtocols.has(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalBody(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalBodyEncoding(value: unknown): value is "text" | "base64" | undefined {
  return value === undefined || (typeof value === "string" && allowedBodyEncodings.has(value));
}

function isOptionalHeaderPairs(value: unknown): value is [string, string][] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (header) =>
          Array.isArray(header) &&
          header.length === 2 &&
          typeof header[0] === "string" &&
          typeof header[1] === "string"
      ))
  );
}
