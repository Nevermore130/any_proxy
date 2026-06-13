import { describe, expect, it } from "vitest";
import { ADDON_EVENT_PREFIX, parseAddonLine } from "../addonEvents.js";

const validFlow = {
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
};

function eventLine(payload: unknown): string {
  return ADDON_EVENT_PREFIX + JSON.stringify(payload);
}

describe("parseAddonLine", () => {
  it("ignores normal mitmproxy log lines", () => {
    expect(parseAddonLine("[12:00:00] proxy server listening")).toBeUndefined();
  });

  it("parses prefixed JSON events", () => {
    const line =
      ADDON_EVENT_PREFIX +
      JSON.stringify({
        eventType: "request",
        flow: validFlow
      });

    expect(parseAddonLine(line)?.flow.host).toBe("api.example.com");
  });

  it("rejects malformed payloads", () => {
    expect(parseAddonLine(`${ADDON_EVENT_PREFIX}{`)).toBeUndefined();
    expect(parseAddonLine(`${ADDON_EVENT_PREFIX}{"eventType":"request"}`)).toBeUndefined();
  });

  it("rejects non-finite timestamps", () => {
    const line = `${ADDON_EVENT_PREFIX}{"eventType":"request","flow":{"id":"abc","clientIp":"192.168.1.20","startedAtEpochMs":1e999,"protocol":"https","method":"GET","scheme":"https","host":"api.example.com","path":"/v1/me","requestHeaders":[],"isTlsIntercepted":true}}`;

    expect(parseAddonLine(line)).toBeUndefined();
  });

  it("rejects invalid body shapes", () => {
    expect(
      parseAddonLine(eventLine({ eventType: "request", flow: { ...validFlow, requestBody: {} } }))
    ).toBeUndefined();
    expect(
      parseAddonLine(eventLine({ eventType: "response", flow: { ...validFlow, responseBody: [] } }))
    ).toBeUndefined();
  });

  it("rejects invalid body encodings", () => {
    expect(
      parseAddonLine(
        eventLine({ eventType: "request", flow: { ...validFlow, requestBodyEncoding: "utf8" } })
      )
    ).toBeUndefined();
    expect(
      parseAddonLine(
        eventLine({ eventType: "response", flow: { ...validFlow, responseBodyEncoding: false } })
      )
    ).toBeUndefined();
  });

  it("rejects invalid header lists", () => {
    expect(
      parseAddonLine(
        eventLine({
          eventType: "request",
          flow: { ...validFlow, requestHeaders: [["accept", 12]] }
        })
      )
    ).toBeUndefined();
    expect(
      parseAddonLine(
        eventLine({
          eventType: "response",
          flow: { ...validFlow, responseHeaders: [["content-type"]] }
        })
      )
    ).toBeUndefined();
  });

  it("rejects non-finite optional numeric fields", () => {
    const line = `${ADDON_EVENT_PREFIX}{"eventType":"response","flow":{"id":"abc","clientIp":"192.168.1.20","startedAtEpochMs":1781337600000,"protocol":"https","method":"GET","scheme":"https","host":"api.example.com","path":"/v1/me","requestHeaders":[],"isTlsIntercepted":true,"durationMs":1e999}}`;

    expect(parseAddonLine(line)).toBeUndefined();
    expect(
      parseAddonLine(eventLine({ eventType: "response", flow: { ...validFlow, port: Number.NaN } }))
    ).toBeUndefined();
    expect(
      parseAddonLine(
        eventLine({ eventType: "response", flow: { ...validFlow, statusCode: "200" } })
      )
    ).toBeUndefined();
  });

  it("parses valid response events with duplicate headers and body encoding", () => {
    const event = parseAddonLine(
      eventLine({
        eventType: "response",
        flow: {
          ...validFlow,
          statusCode: 200,
          durationMs: 42,
          port: 443,
          requestHeaders: [
            ["accept", "application/json"],
            ["accept", "text/plain"]
          ],
          responseHeaders: [
            ["set-cookie", "a=1"],
            ["set-cookie", "b=2"]
          ],
          responseBody: "eyJvayI6dHJ1ZX0=",
          responseBodyEncoding: "base64"
        }
      })
    );

    expect(event?.flow.responseHeaders).toEqual([
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"]
    ]);
    expect(event?.flow.responseBodyEncoding).toBe("base64");
  });
});
