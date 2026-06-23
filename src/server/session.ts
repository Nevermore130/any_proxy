import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";

export const captureSessionCookieName = "rela_capture_sid";
export const captureSessionHeaderName = "X-Rela-Capture-Session";
export const unboundCaptureSessionId = "__unbound__";

export type CaptureSessionQrPayload = {
  type: "rela_capture_session";
  version: 1;
  relayBaseUrl: string;
  sessionId: string;
  headerName: typeof captureSessionHeaderName;
};

export function ensureCaptureSession(request: Request, response: Response): string {
  const existing = sessionIdFromCookie(request.headers.cookie);
  if (existing) {
    return existing;
  }

  const sessionId = createCaptureSessionId();
  response.cookie(captureSessionCookieName, sessionId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
  return sessionId;
}

export function captureSessionQrPayload(
  relayBaseUrl: string,
  sessionId: string
): CaptureSessionQrPayload {
  return {
    type: "rela_capture_session",
    version: 1,
    relayBaseUrl,
    sessionId,
    headerName: captureSessionHeaderName
  };
}

export function captureSessionIdFromHeader(request: Request): string {
  const value = request.get(captureSessionHeaderName);
  return sanitizeCaptureSessionId(value) || unboundCaptureSessionId;
}

function createCaptureSessionId(): string {
  return `cap_${randomBytes(18).toString("base64url")}`;
}

function sessionIdFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name !== captureSessionCookieName) {
      continue;
    }

    return sanitizeCaptureSessionId(decodeURIComponent(valueParts.join("=")));
  }

  return undefined;
}

function sanitizeCaptureSessionId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^cap_[A-Za-z0-9_-]{24,}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}
