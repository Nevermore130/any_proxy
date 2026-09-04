export type Protocol = "http" | "https" | "websocket" | "unknown";

export type HeaderPair = [name: string, value: string];

export type RawBodyEncoding = "text" | "base64";

export type BodyPreview = {
  kind: "empty" | "text" | "base64";
  sizeBytes: number;
  preview: string;
  raw?: string;
  truncated: boolean;
  contentType?: string;
};

export type RawCapturedFlow = {
  id: string;
  captureSessionId?: string;
  clientIp: string;
  startedAtEpochMs: number;
  durationMs?: number;
  protocol: Protocol;
  projectId?: string;
  projectName?: string;
  projectType?: string;
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
  appliedRule?: {
    ruleId: string;
    ruleName: string;
    delayed: boolean;
    delayMs: number;
    rewritten: boolean;
    mocked: boolean;
  };
};

export type CaptureFlowEvent = {
  eventType: "request" | "response" | "error" | "websocket";
  flow: RawCapturedFlow;
};

export type CapturedFlow = {
  id: string;
  captureSessionId?: string;
  clientIp: string;
  startedAt: string;
  durationMs?: number;
  protocol: Protocol;
  projectId?: string;
  projectName?: string;
  projectType?: string;
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
  appliedRule?: {
    ruleId: string;
    ruleName: string;
    delayed: boolean;
    delayMs: number;
    rewritten: boolean;
    mocked: boolean;
  };
};

export type FlowFilters = {
  deviceIp?: string;
  path?: string;
  projectId?: string;
  protocol?: Protocol | "all";
  statusClass?: "all" | "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";
};

export type FlowStoreOptions = {
  maxFlows: number;
  bodyPreviewBytes: number;
  flowTtlMs?: number;
};

export type RequestRule = {
  id: string;
  name: string;
  enabled: boolean;
  match: {
    method?: string;
    pathMatch?: string;
    pathMatchType: "prefix" | "glob";
    originalHost?: string;
  };
  actions: {
    delayMs: number;
    mockMode: boolean;
    mockStatusCode?: number;
    mockBody?: string;
    rewriteStatusCode?: number;
    rewriteBody?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
};

export type RuleMatchResult = {
  matched: boolean;
  rule?: RequestRule;
};

export type RuleApplicationResult = {
  appliedRules: Array<{
    ruleId: string;
    ruleName: string;
    delayed: boolean;
    delayMs: number;
    rewritten: boolean;
    mocked: boolean;
  }>;
};
