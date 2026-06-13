import type { AddonFlowEvent, Protocol } from "./types.js";

export const ADDON_EVENT_PREFIX = "RELA_CAPTURE_EVENT ";

const allowedEventTypes = new Set(["request", "response", "error", "websocket"]);
const allowedProtocols = new Set(["http", "https", "websocket", "unknown"]);

export function parseAddonLine(line: string): AddonFlowEvent | undefined {
  if (!line.startsWith(ADDON_EVENT_PREFIX)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(line.slice(ADDON_EVENT_PREFIX.length)) as Partial<AddonFlowEvent>;
    if (!parsed.eventType || !allowedEventTypes.has(parsed.eventType)) {
      return undefined;
    }
    if (!parsed.flow || typeof parsed.flow !== "object") {
      return undefined;
    }

    const flow = parsed.flow as Record<string, unknown>;
    if (
      typeof flow.id !== "string" ||
      typeof flow.clientIp !== "string" ||
      typeof flow.startedAtEpochMs !== "number" ||
      typeof flow.method !== "string" ||
      typeof flow.scheme !== "string" ||
      typeof flow.host !== "string" ||
      typeof flow.path !== "string" ||
      typeof flow.isTlsIntercepted !== "boolean"
    ) {
      return undefined;
    }

    const protocol =
      typeof flow.protocol === "string" && allowedProtocols.has(flow.protocol)
        ? (flow.protocol as Protocol)
        : "unknown";

    return {
      eventType: parsed.eventType,
      flow: {
        ...parsed.flow,
        protocol
      }
    } as AddonFlowEvent;
  } catch {
    return undefined;
  }
}
