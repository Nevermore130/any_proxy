import type { BodyPreview } from "../types.js";

type JsonParseResult = { ok: true; value: unknown } | { ok: false };

export function parseJsonBodyPreview(body: BodyPreview | undefined): JsonParseResult {
  if (!body || body.kind !== "text" || body.truncated) {
    return { ok: false };
  }

  const preview = typeof body.preview === "string" ? body.preview.trim() : "";
  if (!preview || !looksLikeJson(body.contentType, preview)) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(preview) as unknown };
  } catch {
    return { ok: false };
  }
}

export function summarizeJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "[]";
  }

  if (value && typeof value === "object") {
    return "{}";
  }

  if (typeof value === "string") {
    return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}...` : value);
  }

  return String(value);
}

function looksLikeJson(contentType: string | undefined, preview: string): boolean {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("json")) {
    return true;
  }

  return preview.startsWith("{") || preview.startsWith("[");
}
