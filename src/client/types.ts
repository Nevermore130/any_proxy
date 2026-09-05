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
  projectId?: string;
  projectName?: string;
  projectType?: string;
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
  projects?: {
    defaultProjectId?: string;
    items?: CaptureProject[];
  };
};

export type CaptureProject = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  relayPath: string;
  relayBaseUrl: string;
  targetOrigin: string;
  allowedHosts: string[];
  sessionHeaderName: string;
  originalHostHeaderName: string;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
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

export type InsightsWindow = "15m" | "1h" | "24h" | "all";

export type InsightsMetric = {
  value: number | null;
  previousValue: number | null;
  changePercent: number | null;
  sparkline: number[];
  previousSparkline: number[];
};

export type InsightsEndpoint = {
  method: string;
  path: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  passRate: number;
  avgLatencyMs: number | null;
  p90LatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type InsightsSeriesPoint = {
  t: string;
  value: number;
};

export type InsightsErrorSample = {
  id: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  error?: string;
  startedAt: string | null;
  durationMs: number | null;
};

export type InsightsNamedCount = {
  label: string;
  count: number;
};

export type InsightsOverview = {
  window: InsightsWindow;
  windowMs: number | null;
  generatedAt: string;
  from: string | null;
  to: string;
  flowCount: number;
  retainedCount: number;
  systemHealth: {
    totalRequests: InsightsMetric;
    p90LatencyMs: InsightsMetric;
    errors: InsightsMetric;
  };
  collectionHealth: {
    passRate: InsightsMetric;
    totalRuns: InsightsMetric;
    avgResponseMs: InsightsMetric;
    lastRunAt: string | null;
  };
  endpointHealth: {
    monitoredCount: number;
    mostErrors: InsightsEndpoint[];
    busiest: InsightsEndpoint[];
  };
  endpointPerformance: InsightsEndpoint[];
  errors: {
    volume: InsightsSeriesPoint[];
    previousVolume: InsightsSeriesPoint[];
    topFailing: InsightsEndpoint[];
    recentSamples: InsightsErrorSample[];
  };
  latency: {
    avg: InsightsSeriesPoint[];
    p90: InsightsSeriesPoint[];
    slowest: InsightsEndpoint[];
    statusDistribution: InsightsNamedCount[];
    latencyDistribution: InsightsNamedCount[];
  };
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
