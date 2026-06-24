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
      raw: "hello world",
      truncated: true,
      contentType: "text/plain"
    });
  });

  it("truncates readable text on UTF-8 character boundaries", () => {
    expect(createBodyPreview("你好", "text/plain", 4)).toEqual({
      kind: "text",
      sizeBytes: 6,
      preview: "你",
      raw: "你好",
      truncated: true,
      contentType: "text/plain"
    });
  });

  it("keeps the full raw text body even when the preview is truncated", () => {
    const body = JSON.stringify({ items: Array.from({ length: 10 }, (_, index) => index) });

    expect(createBodyPreview(body, "application/json", 12)).toMatchObject({
      kind: "text",
      preview: body.slice(0, 12),
      raw: body,
      truncated: true
    });
  });

  it("base64 encodes binary-looking content", () => {
    const preview = createBodyPreview("a\u0000b", "application/octet-stream", 16);
    expect(preview.kind).toBe("base64");
    expect(preview.truncated).toBe(false);
    expect(preview.preview).toBe(Buffer.from("a\u0000b", "utf8").toString("base64"));
  });

  it("uses decoded bytes for base64-encoded raw bodies", () => {
    const bodyBytes = Buffer.from([0, 255, 1, 2, 3]);
    expect(
      createBodyPreview(bodyBytes.toString("base64"), "application/octet-stream", 3, "base64")
    ).toEqual({
      kind: "base64",
      sizeBytes: 5,
      preview: bodyBytes.subarray(0, 3).toString("base64"),
      raw: bodyBytes.toString("base64"),
      truncated: true,
      contentType: "application/octet-stream"
    });
  });

  it("falls back to raw string bytes when base64 decoding fails", () => {
    const rawBody = "not-base64!";
    expect(createBodyPreview(rawBody, "application/octet-stream", 64, "base64")).toEqual({
      kind: "base64",
      sizeBytes: Buffer.byteLength(rawBody, "utf8"),
      preview: Buffer.from(rawBody, "utf8").toString("base64"),
      truncated: false,
      contentType: "application/octet-stream"
    });
  });
});
