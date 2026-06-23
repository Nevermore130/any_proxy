export type BodyPreview = {
  contentType?: string;
  kind: string;
  preview?: string;
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
};

export type FlowFilters = {
  deviceIp: string;
  host: string;
  protocol: string;
  statusClass: string;
};

export type StatusResponse = {
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
