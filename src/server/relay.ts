import type { Request, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { FlowStore } from "./flowStore.js";
import type { CapturedFlow, HeaderPair, RawAddonFlow, RawBodyEncoding } from "./types.js";

export type RelayOptions = {
  broadcastFlow: (flow: CapturedFlow) => void;
  prefix: string;
  store: FlowStore;
  targetOrigin: string;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const REQUEST_HEADERS_TO_DROP = new Set([...HOP_BY_HOP_HEADERS, "content-length", "host"]);
const RESPONSE_HEADERS_TO_DROP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length"
]);

export function createRelayHandler(options: RelayOptions): RequestHandler {
  const targetOrigin = normalizeTargetOrigin(options.targetOrigin);

  return async (request, response) => {
    const startedAt = Date.now();
    const targetUrl = createTargetUrl(request, options.prefix, targetOrigin);
    const requestBody = requestBodyBuffer(request);
    const requestHeaders = headerPairs(request.headers);
    const target = new URL(targetUrl);

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamRequestHeaders(request),
        body: methodAllowsBody(request.method) ? new Uint8Array(requestBody) : undefined,
        redirect: "manual"
      });
      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      const responseHeaders = responseHeaderPairs(upstreamResponse.headers);

      for (const [name, value] of responseHeaders) {
        if (!RESPONSE_HEADERS_TO_DROP.has(name.toLowerCase())) {
          response.setHeader(name, value);
        }
      }

      response.status(upstreamResponse.status).send(responseBody);
      recordRelayFlow(options, {
        clientIp: clientIp(request),
        durationMs: Date.now() - startedAt,
        method: request.method,
        requestBody,
        requestHeaders,
        responseBody,
        responseHeaders,
        startedAtEpochMs: startedAt,
        statusCode: upstreamResponse.status,
        target
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const responseBody = Buffer.from(JSON.stringify({ error: "relay request failed" }));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.status(502).send(responseBody);
      recordRelayFlow(options, {
        clientIp: clientIp(request),
        durationMs: Date.now() - startedAt,
        error: `Relay request failed: ${message}`,
        method: request.method,
        requestBody,
        requestHeaders,
        responseBody,
        responseHeaders: [["content-type", "application/json; charset=utf-8"]],
        startedAtEpochMs: startedAt,
        statusCode: 502,
        target
      });
    }
  };
}

function normalizeTargetOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Relay target origin must use http or https");
  }

  return parsed.origin;
}

function createTargetUrl(request: Request, prefix: string, targetOrigin: string): string {
  const originalUrl = request.originalUrl || request.url;
  const suffix = originalUrl.slice(prefix.length);
  const pathAndQuery = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return new URL(pathAndQuery, targetOrigin).toString();
}

function requestBodyBuffer(request: Request): Buffer {
  return Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
}

function methodAllowsBody(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}

function upstreamRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase();
    if (REQUEST_HEADERS_TO_DROP.has(normalized) || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }

  return headers;
}

function responseHeaderPairs(headers: Headers): HeaderPair[] {
  const pairs: HeaderPair[] = [];
  headers.forEach((value, name) => {
    pairs.push([name, value]);
  });
  return pairs;
}

function headerPairs(headers: Request["headers"]): HeaderPair[] {
  return Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => [name, item] as HeaderPair);
    }
    return [[name, value] as HeaderPair];
  });
}

function recordRelayFlow(
  options: RelayOptions,
  details: {
    clientIp: string;
    durationMs: number;
    error?: string;
    method: string;
    requestBody: Buffer;
    requestHeaders: HeaderPair[];
    responseBody: Buffer;
    responseHeaders: HeaderPair[];
    startedAtEpochMs: number;
    statusCode: number;
    target: URL;
  }
): void {
  const requestPayload = bodyPayload(details.requestBody, contentType(details.requestHeaders));
  const responsePayload = bodyPayload(details.responseBody, contentType(details.responseHeaders));
  const flow: RawAddonFlow = {
    id: `relay-${randomUUID()}`,
    clientIp: details.clientIp,
    startedAtEpochMs: details.startedAtEpochMs,
    durationMs: details.durationMs,
    protocol: details.target.protocol === "https:" ? "https" : "http",
    method: details.method,
    scheme: details.target.protocol.replace(":", ""),
    host: details.target.hostname,
    port: targetPort(details.target),
    path: `${details.target.pathname}${details.target.search}`,
    statusCode: details.statusCode,
    requestHeaders: details.requestHeaders,
    responseHeaders: details.responseHeaders,
    requestBody: requestPayload.body,
    responseBody: responsePayload.body,
    requestBodyEncoding: requestPayload.encoding,
    responseBodyEncoding: responsePayload.encoding,
    requestContentType: contentType(details.requestHeaders),
    responseContentType: contentType(details.responseHeaders),
    error: details.error,
    isTlsIntercepted: false
  };

  const captured = options.store.ingest({ eventType: details.error ? "error" : "response", flow });
  if (captured) {
    options.broadcastFlow(captured);
  }
}

function bodyPayload(
  buffer: Buffer,
  type: string | undefined
): { body: string | null; encoding: RawBodyEncoding } {
  if (buffer.length === 0) {
    return { body: null, encoding: "text" };
  }

  if (isTextualContentType(type)) {
    return { body: buffer.toString("utf8"), encoding: "text" };
  }

  return { body: buffer.toString("base64"), encoding: "base64" };
}

function isTextualContentType(type: string | undefined): boolean {
  const normalized = type?.toLowerCase() ?? "";
  return (
    !normalized ||
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    normalized.includes("javascript") ||
    normalized.includes("x-www-form-urlencoded")
  );
}

function contentType(headers: HeaderPair[]): string | undefined {
  return headers.find(([name]) => name.toLowerCase() === "content-type")?.[1];
}

function targetPort(target: URL): number {
  if (target.port) {
    return Number(target.port);
  }

  return target.protocol === "https:" ? 443 : 80;
}

function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}
