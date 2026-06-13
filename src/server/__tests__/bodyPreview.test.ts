import { describe, expect, it } from "vitest";
import { createBodyPreview } from "../bodyPreview.js";

describe("createBodyPreview", () => {
  it("marks empty bodies", () => {
    expect(createBodyPreview(null, "text/plain", 8)).toEqual({
      kind: "empty",
      sizeBytes: 0,
      preview: "",
      truncated: false,
      contentType: "text/plain"
    });
  });

  it("keeps readable text and truncates by byte limit", () => {
    expect(createBodyPreview("hello world", "text/plain", 5)).toEqual({
      kind: "text",
      sizeBytes: 11,
      preview: "hello",
      truncated: true,
      contentType: "text/plain"
    });
  });

  it("base64 encodes binary-looking content", () => {
    const preview = createBodyPreview("a\u0000b", "application/octet-stream", 16);
    expect(preview.kind).toBe("base64");
    expect(preview.truncated).toBe(false);
    expect(preview.preview).toBe(Buffer.from("a\u0000b", "utf8").toString("base64"));
  });
});
