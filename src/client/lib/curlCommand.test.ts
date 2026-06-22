import { describe, expect, it } from "vitest";
import type { CapturedFlow } from "../types.js";
import { curlCommandForFlow, flowRequestUrl, shellQuote } from "./curlCommand.js";

describe("curl command helpers", () => {
  it("builds a reusable cURL command for JSON POST requests", () => {
    const flow: CapturedFlow = {
      id: "flow-1",
      scheme: "https",
      host: "api.rela.me",
      path: "/v1/me?debug=1",
      method: "POST",
      requestHeaders: [
        ["content-type", "application/json"],
        ["authorization", "Bearer token"],
        ["content-length", "16"]
      ],
      requestBodyPreview: {
        kind: "text",
        preview: "{\"hello\":\"rela\"}",
        sizeBytes: 16
      }
    };

    expect(curlCommandForFlow(flow)).toBe(
      [
        "curl 'https://api.rela.me/v1/me?debug=1'",
        "  -X 'POST'",
        "  -H 'content-type: application/json'",
        "  -H 'authorization: Bearer token'",
        "  --data-raw '{\"hello\":\"rela\"}'"
      ].join(" \\\n")
    );
  });

  it("quotes shell-sensitive values safely", () => {
    expect(shellQuote("it's rela")).toBe("'it'\\''s rela'");
    expect(
      flowRequestUrl({
        id: "flow-2",
        scheme: "https",
        host: "api.rela.me",
        path: "/v1/search?q=it's"
      })
    ).toBe("https://api.rela.me/v1/search?q=it's");
    expect(
      curlCommandForFlow({
        id: "flow-2",
        scheme: "https",
        host: "api.rela.me",
        path: "/v1/search?q=it's",
        method: "GET",
        requestHeaders: [["x-debug", "it's on"]]
      })
    ).toBe(
      ["curl 'https://api.rela.me/v1/search?q=it'\\''s'", "  -H 'x-debug: it'\\''s on'"].join(
        " \\\n"
      )
    );
  });

  it("omits transient headers and empty request bodies", () => {
    expect(
      curlCommandForFlow({
        id: "flow-3",
        scheme: "http",
        host: "127.0.0.1",
        port: 5178,
        path: "/relay/rela/ping",
        method: "GET",
        requestHeaders: [
          ["host", "127.0.0.1:5178"],
          ["connection", "keep-alive"],
          ["accept-encoding", "gzip"],
          ["accept", "application/json"]
        ],
        requestBodyPreview: { kind: "empty" }
      })
    ).toBe(
      ["curl 'http://127.0.0.1:5178/relay/rela/ping'", "  -H 'accept: application/json'"].join(
        " \\\n"
      )
    );
  });
});
