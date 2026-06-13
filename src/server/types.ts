export type Protocol = "http" | "https" | "websocket" | "unknown";

export type HeaderPair = [name: string, value: string];

export type RawBodyEncoding = "text" | "base64";

export type BodyPreview = {
  kind: "empty" | "text" | "base64";
  sizeBytes: number;
  preview: string;
  truncated: boolean;
  contentType?: string;
};

export type RawAddonFlow = {
  id: string;
  clientIp: string;
  startedAtEpochMs: number;
  durationMs?: number;
  protocol: Protocol;
  method: string;
  scheme: string;
  host: string;
  port?: number;
  path: string;
  statusCode?: number;
  requestHeaders?: HeaderPair[];
  responseHeaders?: HeaderPair[];
  requestBody?: string | null;
  responseBody?: string | null;
  requestBodyEncoding?: RawBodyEncoding;
  responseBodyEncoding?: RawBodyEncoding;
  requestContentType?: string;
  responseContentType?: string;
  error?: string;
  isTlsIntercepted: boolean;
};

export type AddonFlowEvent = {
  eventType: "request" | "response" | "error" | "websocket";
  flow: RawAddonFlow;
};

export type CapturedFlow = {
  id: string;
  clientIp: string;
  startedAt: string;
  durationMs?: number;
  protocol: Protocol;
  method: string;
  scheme: string;
  host: string;
  port?: number;
  path: string;
  statusCode?: number;
  requestHeaders: HeaderPair[];
  responseHeaders: HeaderPair[];
  requestBodyPreview: BodyPreview;
  responseBodyPreview: BodyPreview;
  error?: string;
  isTlsIntercepted: boolean;
};

export type FlowFilters = {
  deviceIp?: string;
  host?: string;
  protocol?: Protocol | "all";
  statusClass?: "all" | "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";
};

export type FlowStoreOptions = {
  maxFlows: number;
  bodyPreviewBytes: number;
};
