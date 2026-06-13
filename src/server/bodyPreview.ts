import type { BodyPreview } from "./types.js";

const TEXTUAL_CONTENT_TYPES = [
  "application/json",
  "application/javascript",
  "application/xml",
  "application/x-www-form-urlencoded",
  "text/"
];

export function createBodyPreview(
  body: string | null | undefined,
  contentType: string | undefined,
  limitBytes: number
): BodyPreview {
  const normalizedType = contentType || undefined;
  if (!body) {
    return {
      kind: "empty",
      sizeBytes: 0,
      preview: "",
      truncated: false,
      contentType: normalizedType
    };
  }

  const buffer = Buffer.from(body, "utf8");
  const sizeBytes = buffer.byteLength;
  const truncated = sizeBytes > limitBytes;
  const limited = truncated ? buffer.subarray(0, limitBytes) : buffer;
  const looksTextual =
    !body.includes("\u0000") &&
    (!normalizedType ||
      TEXTUAL_CONTENT_TYPES.some((prefix) => normalizedType.toLowerCase().startsWith(prefix)));

  return {
    kind: looksTextual ? "text" : "base64",
    sizeBytes,
    preview: looksTextual ? limited.toString("utf8") : limited.toString("base64"),
    truncated,
    contentType: normalizedType
  };
}
