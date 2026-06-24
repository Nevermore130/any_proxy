import type { BodyPreview, RawBodyEncoding } from "./types.js";

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
  limitBytes: number,
  encoding: RawBodyEncoding = "text"
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

  const byteLimit = Math.max(0, limitBytes);
  if (encoding === "base64") {
    const buffer = decodeBase64Strict(body) ?? Buffer.from(body, "utf8");
    const sizeBytes = buffer.byteLength;
    const truncated = sizeBytes > byteLimit;
    const limited = truncated ? buffer.subarray(0, byteLimit) : buffer;

    return {
      kind: "base64",
      sizeBytes,
      preview: limited.toString("base64"),
      ...(truncated ? { raw: buffer.toString("base64") } : {}),
      truncated,
      contentType: normalizedType
    };
  }

  const buffer = Buffer.from(body, "utf8");
  const sizeBytes = buffer.byteLength;
  const truncated = sizeBytes > byteLimit;
  const limited = truncated ? buffer.subarray(0, byteLimit) : buffer;
  const looksTextual =
    !body.includes("\u0000") &&
    (!normalizedType ||
      TEXTUAL_CONTENT_TYPES.some((prefix) => normalizedType.toLowerCase().startsWith(prefix)));

  return {
    kind: looksTextual ? "text" : "base64",
    sizeBytes,
    preview: looksTextual ? truncateUtf8Text(body, byteLimit) : limited.toString("base64"),
    ...(truncated ? { raw: looksTextual ? body : buffer.toString("base64") } : {}),
    truncated,
    contentType: normalizedType
  };
}

function truncateUtf8Text(text: string, limitBytes: number): string {
  let usedBytes = 0;
  let preview = "";

  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > limitBytes) {
      break;
    }

    preview += character;
    usedBytes += characterBytes;
  }

  return preview;
}

function decodeBase64Strict(body: string): Buffer | undefined {
  const compact = body.replace(/\s/g, "");

  if (
    compact.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    return undefined;
  }

  const decoded = Buffer.from(compact, "base64");
  const encoded = decoded.toString("base64").replace(/=+$/, "");
  const input = compact.replace(/=+$/, "");

  return encoded === input ? decoded : undefined;
}
