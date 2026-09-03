import type { Request, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { FlowStore } from "./flowStore.js";
import { RuleStore } from "./ruleStore.js";
import { captureSessionHeaderName, captureSessionIdFromHeader } from "./session.js";
import type { CapturedFlow, HeaderPair, RawBodyEncoding, RawCapturedFlow, RequestRule } from "./types.js";

export type RelayOptions = {
  broadcastFlow: (flow: CapturedFlow) => void;
  allowedTargetHosts?: readonly string[];
  hostOriginOverrides?: Record<string, string>;
  prefix: string;
  store: FlowStore;
  ruleStore?: RuleStore;
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
export const relayOriginalHostHeaderName = "X-Rela-Original-Host";

const REQUEST_HEADERS_TO_DROP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-length",
  "host",
  relayOriginalHostHeaderName.toLowerCase(),
  captureSessionHeaderName.toLowerCase()
]);
const RESPONSE_HEADERS_TO_DROP = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length"
]);
export const DEFAULT_RELA_RELAY_TARGET_HOSTS = [
  "api.rela.me",
  "test-api.rela.me",
  "pre-api.rela.me",
  "ali-pre-api.rela.me",
  "go-rela.me",
  "test-go-room-server.rela.me",
  "test-go.rela.me",
  "go-rela-pre.rela.me",
  "report-api.rela.me",
  "test-report-api.rela.me",
  "pre-report-api.rela.me"
] as const;

export function createRelayHandler(options: RelayOptions): RequestHandler {
  const targetOrigin = normalizeTargetOrigin(options.targetOrigin);
  const allowedTargetHosts = normalizedAllowedTargetHosts(options.allowedTargetHosts);
  const hostOriginOverrides = normalizedHostOriginOverrides(options.hostOriginOverrides);

  return async (request, response) => {
    const startedAt = Date.now();
    const requestTargetOrigin = relayTargetOriginForRequest(
      request,
      targetOrigin,
      allowedTargetHosts,
      hostOriginOverrides
    );
    const targetUrl = createTargetUrl(request, options.prefix, requestTargetOrigin);
    const requestBody = requestBodyBuffer(request);
    const requestHeaders = headerPairs(request.headers);

    const target = new URL(targetUrl);
    const captureSessionId = captureSessionIdFromHeader(request);

    const originalHost = originalRequestHostname(request);
    const matchedRule = options.ruleStore?.findMatchingRule(
      request.method,
      target.pathname + target.search,
      originalHost
    );

    try {
      let statusCode: number;
      let responseBody: Buffer;
      let responseHeaders: HeaderPair[];

      if (matchedRule?.actions.mockMode) {
        statusCode = matchedRule.actions.mockStatusCode ?? 200;
        responseBody = Buffer.from(matchedRule.actions.mockBody ?? "");
        responseHeaders = [["content-type", "application/json; charset=utf-8"]];
      } else {
        const upstreamResponse = await fetch(targetUrl, {
          method: request.method,
          headers: upstreamRequestHeaders(request),
          body: methodAllowsBody(request.method) ? new Uint8Array(requestBody) : undefined,
          redirect: "manual"
        });

        statusCode = upstreamResponse.status;
        responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
        responseHeaders = responseHeaderPairs(upstreamResponse.headers);

        if (matchedRule?.actions.rewriteStatusCode !== undefined) {
          statusCode = matchedRule.actions.rewriteStatusCode;
        }

        if (matchedRule?.actions.rewriteBody) {
          responseBody = applyBodyRewrite(responseBody, matchedRule.actions.rewriteBody);
        }
      }

      if (matchedRule?.actions.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, matchedRule.actions.delayMs));
      }

      for (const [name, value] of responseHeaders) {
        if (!RESPONSE_HEADERS_TO_DROP.has(name.toLowerCase())) {
          response.setHeader(name, value);
        }
      }

      response.status(statusCode).send(responseBody);

      recordRelayFlow(options, {
        captureSessionId,
        clientIp: clientIp(request),
        durationMs: Date.now() - startedAt,
        matchedRule,
        method: request.method,
        requestBody,
        requestHeaders,
        responseBody,
        responseHeaders,
        startedAtEpochMs: startedAt,
        statusCode,
        target
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const responseBody = Buffer.from(JSON.stringify({ error: "relay request failed" }));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.status(502).send(responseBody);
      recordRelayFlow(options, {
        captureSessionId,
        clientIp: clientIp(request),
        durationMs: Date.now() - startedAt,
        error: `Relay request failed: ${message}`,
        matchedRule,
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

export function relayAllowedTargetHosts(allowedTargetHosts?: readonly string[]): string[] {
  return Array.from(
    new Set(
      (allowedTargetHosts ?? DEFAULT_RELA_RELAY_TARGET_HOSTS)
        .map(normalizedHostname)
        .filter((host): host is string => Boolean(host))
    )
  );
}

function normalizedAllowedTargetHosts(allowedTargetHosts?: readonly string[]): Set<string> {
  return new Set(relayAllowedTargetHosts(allowedTargetHosts));
}

function normalizedHostOriginOverrides(overrides?: Record<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [host, origin] of Object.entries(overrides ?? {})) {
    const normalizedHost = normalizedHostname(host);
    if (!normalizedHost) {
      throw new Error(`Invalid relay host override host: ${host}`);
    }
    result.set(normalizedHost, normalizeTargetOrigin(origin));
  }
  return result;
}

function relayTargetOriginForRequest(
  request: Request,
  fallbackTargetOrigin: string,
  allowedTargetHosts: Set<string>,
  hostOriginOverrides: Map<string, string>
): string {
  const originalHost = originalRequestHostname(request);
  if (!originalHost || !allowedTargetHosts.has(originalHost)) {
    return fallbackTargetOrigin;
  }

  return (
    hostOriginOverrides.get(originalHost) ??
    `${new URL(fallbackTargetOrigin).protocol}//${originalHost}`
  );
}

function originalRequestHostname(request: Request): string | undefined {
  const originalHostHeader = request.headers[relayOriginalHostHeaderName.toLowerCase()];
  const originalHost = Array.isArray(originalHostHeader)
    ? originalHostHeader[0]
    : originalHostHeader;
  return typeof originalHost === "string" ? normalizedHostname(originalHost) : undefined;
}

function normalizedHostname(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(`http://${trimmed}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
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

function applyBodyRewrite(body: Buffer, rewriteBody: Record<string, unknown>): Buffer {
  try {
    const bodyStr = body.toString("utf8");
    const parsed = JSON.parse(bodyStr);
    const merged = { ...parsed, ...rewriteBody };
    return Buffer.from(JSON.stringify(merged));
  } catch {
    return body;
  }
}

function recordRelayFlow(
  options: RelayOptions,
  details: {
    captureSessionId: string;
    clientIp: string;
    durationMs: number;
    error?: string;
    matchedRule?: RequestRule;
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
  
  const appliedRule = details.matchedRule
    ? {
        ruleId: details.matchedRule.id,
        ruleName: details.matchedRule.name,
        delayed: (details.matchedRule.actions.delayMs ?? 0) > 0,
        delayMs: details.matchedRule.actions.delayMs ?? 0,
        rewritten: Boolean(details.matchedRule.actions.rewriteBody || details.matchedRule.actions.rewriteStatusCode),
        mocked: details.matchedRule.actions.mockMode
      }
    : undefined;

  const flow: RawCapturedFlow = {
    id: `relay-${randomUUID()}`,
    captureSessionId: details.captureSessionId,
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
    isTlsIntercepted: false,
    appliedRule
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
