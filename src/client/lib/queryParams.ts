import type { BodyPreview, CapturedFlow } from "../types.js";
import { bodyCopyText } from "./bodyActions.js";

export type QueryParam = {
  key: string;
  rawKey: string;
  rawValue: string;
  value: string;
};

export type RequestPaneTabId = "params" | "headers" | "body";

export function queryStringFromUrl(urlOrPath: string | undefined): string {
  if (!urlOrPath) {
    return "";
  }

  const questionIndex = urlOrPath.indexOf("?");
  if (questionIndex < 0) {
    return "";
  }

  const search = urlOrPath.slice(questionIndex + 1);
  const hashIndex = search.indexOf("#");
  return hashIndex >= 0 ? search.slice(0, hashIndex) : search;
}

export function queryStringFromFlow(flow: Pick<CapturedFlow, "path">): string {
  return queryStringFromUrl(flow.path);
}

export function parseQueryString(raw: string | undefined): QueryParam[] {
  const query = normalizeQueryString(raw);
  if (!query) {
    return [];
  }

  return query
    .split("&")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const equalsIndex = segment.indexOf("=");
      const rawKey = equalsIndex === -1 ? segment : segment.slice(0, equalsIndex);
      const rawValue = equalsIndex === -1 ? "" : segment.slice(equalsIndex + 1);
      return {
        key: decodeQueryComponent(rawKey),
        rawKey,
        rawValue,
        value: decodeQueryComponent(rawValue)
      };
    });
}

export function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function looksLikeFormUrlEncoded(text: string | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (
    !trimmed ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("<") ||
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    !trimmed.includes("=")
  ) {
    return false;
  }

  return trimmed.split("&").every((segment) => {
    if (segment.length === 0) {
      return true;
    }

    const equalsIndex = segment.indexOf("=");
    const key = equalsIndex === -1 ? segment : segment.slice(0, equalsIndex);
    return key.length > 0 && !/\s/.test(key);
  });
}

export function isFormUrlEncodedBody(body: BodyPreview | undefined, text = bodyCopyText(body)): boolean {
  if (!body || body.kind === "empty" || !text.trim()) {
    return false;
  }

  const contentType = String(body.contentType || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return true;
  }

  return body.kind === "text" && looksLikeFormUrlEncoded(text);
}

export function isBodylessHttpMethod(method: string | undefined): boolean {
  const normalized = method?.trim().toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

export function isQueryEchoedAsBody(
  method: string | undefined,
  bodyText: string,
  queryString: string
): boolean {
  if (!isBodylessHttpMethod(method)) {
    return false;
  }

  const normalizedBody = normalizeQueryString(bodyText);
  const normalizedQuery = normalizeQueryString(queryString);
  return normalizedQuery.length > 0 && normalizedBody === normalizedQuery;
}

export function shouldHideRequestBody(
  method: string | undefined,
  body: BodyPreview | undefined,
  queryString: string
): boolean {
  const text = bodyCopyText(body);
  if (!body || body.kind === "empty" || !text) {
    return true;
  }

  return isQueryEchoedAsBody(method, text, queryString);
}

export function defaultRequestPaneTab(paramCount: number): RequestPaneTabId {
  return paramCount > 0 ? "params" : "headers";
}

function normalizeQueryString(raw: string | undefined): string {
  return (raw ?? "").replace(/^\?/, "").trim();
}
