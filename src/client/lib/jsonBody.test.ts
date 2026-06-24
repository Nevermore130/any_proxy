import { describe, expect, it } from "vitest";
import { parseJsonBodyPreview, summarizeJsonValue } from "./jsonBody.js";

describe("jsonBody helpers", () => {
  it("parses textual JSON body previews", () => {
    const result = parseJsonBodyPreview({
      kind: "text",
      contentType: "application/json; charset=utf-8",
      preview: "{\"ok\":true,\"items\":[1,2]}",
      sizeBytes: 25,
      truncated: false
    });

    expect(result).toEqual({
      ok: true,
      value: { ok: true, items: [1, 2] }
    });
  });

  it("parses full raw JSON when the preview is truncated", () => {
    const result = parseJsonBodyPreview({
      kind: "text",
      contentType: "application/json",
      preview: "{\"ok\":",
      raw: "{\"ok\":true,\"items\":[1,2,3]}",
      sizeBytes: 27,
      truncated: true
    });

    expect(result).toEqual({
      ok: true,
      value: { ok: true, items: [1, 2, 3] }
    });
  });

  it("does not parse truncated JSON previews without raw data", () => {
    expect(
      parseJsonBodyPreview({
        kind: "text",
        contentType: "application/json",
        preview: "{\"ok\":",
        sizeBytes: 6,
        truncated: true
      })
    ).toEqual({ ok: false });
  });

  it("keeps collapsed container labels close to raw JSON", () => {
    expect(summarizeJsonValue({ ok: true, user: { id: 1 } })).toBe("{}");
    expect(summarizeJsonValue(["a", "b"])).toBe("[]");
    expect(summarizeJsonValue("hello")).toBe("\"hello\"");
    expect(summarizeJsonValue(null)).toBe("null");
  });
});
