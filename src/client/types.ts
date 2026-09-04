export type BodyPreview = {
  contentType?: string;
  kind: string;
  preview?: string;
  raw?: string;
  sizeBytes?: number;
  truncated?: boolean;
};

export type CapturedFlow = {
  id: string;
  captureSessionId?: string;
  clientIp?: string;
  startedAt?: string;
  method?: string;
  protocol?: string;
  scheme?: string;
  host?: string;
  port?: number;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  isTlsIntercepted?: boolean;
  error?: string;
  requestHeaders?: Array<[string, string]>;
  responseHeaders?: Array<[string, string]>;
  requestBodyPreview?: BodyPreview;
  responseBodyPreview?: BodyPreview;
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
  deviceIp: string;
  path: string;
  protocol: string;
  statusClass: string;
};

export type StatusResponse = {
  version?: string;
  capture?: {
    paused?: boolean;
  };
  session?: {
    id?: string;
    qrPayload?: {
      type?: string;
      version?: number;
      relayBaseUrl?: string;
      sessionId?: string;
      headerName?: string;
    };
  };
  relay?: {
    rela?: {
      allowedHosts?: string[];
      baseUrl?: string;
      targetOrigin?: string;
    };
  };
};

export type WhatsNewTourStep = {
  id: string;
  targetSelector: string;
  title: string;
  body: string;
};

export type WhatsNewEntry = {
  version: string;
  title: string;
  publishedAt: string;
  showModal: boolean;
  body: string[];
  tour?: WhatsNewTourStep[];
};

export type WhatsNewResponse = {
  entries: WhatsNewEntry[];
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
