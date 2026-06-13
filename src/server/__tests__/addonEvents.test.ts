import { describe, expect, it } from "vitest";
import { ADDON_EVENT_PREFIX, parseAddonLine } from "../addonEvents.js";

describe("parseAddonLine", () => {
  it("ignores normal mitmproxy log lines", () => {
    expect(parseAddonLine("[12:00:00] proxy server listening")).toBeUndefined();
  });

  it("parses prefixed JSON events", () => {
    const line =
      ADDON_EVENT_PREFIX +
      JSON.stringify({
        eventType: "request",
        flow: {
          id: "abc",
          clientIp: "192.168.1.20",
          startedAtEpochMs: 1781337600000,
          protocol: "https",
          method: "GET",
          scheme: "https",
          host: "api.example.com",
          path: "/v1/me",
          requestHeaders: [],
          isTlsIntercepted: true
        }
      });

    expect(parseAddonLine(line)?.flow.host).toBe("api.example.com");
  });

  it("rejects malformed payloads", () => {
    expect(parseAddonLine(`${ADDON_EVENT_PREFIX}{`)).toBeUndefined();
    expect(parseAddonLine(`${ADDON_EVENT_PREFIX}{"eventType":"request"}`)).toBeUndefined();
  });
});
