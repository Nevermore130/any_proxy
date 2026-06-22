import { createBodyPreview } from "./bodyPreview.js";
import { flowMatchesFilters } from "./filters.js";
import type {
  AddonFlowEvent,
  BodyPreview,
  CapturedFlow,
  FlowFilters,
  FlowStoreOptions,
  RawBodyEncoding
} from "./types.js";

export class FlowStore {
  private readonly flows = new Map<string, CapturedFlow>();
  private readonly order: string[] = [];
  private paused = false;

  constructor(private readonly options: FlowStoreOptions) {}

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  clear(): void {
    this.flows.clear();
    this.order.splice(0, this.order.length);
  }

  ingest(event: AddonFlowEvent): CapturedFlow | undefined {
    if (this.paused) {
      return undefined;
    }

    const existing = this.flows.get(event.flow.id);
    const next: CapturedFlow = {
      id: event.flow.id,
      clientIp: event.flow.clientIp,
      startedAt: new Date(event.flow.startedAtEpochMs).toISOString(),
      durationMs: event.flow.durationMs ?? existing?.durationMs,
      protocol: event.flow.protocol,
      method: event.flow.method,
      scheme: event.flow.scheme,
      host: event.flow.host,
      port: event.flow.port,
      path: event.flow.path,
      statusCode: event.flow.statusCode ?? existing?.statusCode,
      requestHeaders: event.flow.requestHeaders ?? existing?.requestHeaders ?? [],
      responseHeaders: event.flow.responseHeaders ?? existing?.responseHeaders ?? [],
      requestBodyPreview: this.nextBodyPreview(
        event.flow.requestBody,
        event.flow.requestContentType,
        event.flow.requestBodyEncoding,
        existing?.requestBodyPreview
      ),
      responseBodyPreview: this.nextBodyPreview(
        event.flow.responseBody,
        event.flow.responseContentType,
        event.flow.responseBodyEncoding,
        existing?.responseBodyPreview
      ),
      error: event.flow.error ?? existing?.error,
      isTlsIntercepted: event.flow.isTlsIntercepted
    };

    if (!existing) {
      this.order.unshift(event.flow.id);
    }

    this.flows.set(event.flow.id, next);
    this.trim();
    return next;
  }

  getFlow(id: string): CapturedFlow | undefined {
    this.trim();
    return this.flows.get(id);
  }

  listFlows(filters: FlowFilters): CapturedFlow[] {
    this.trim();
    return this.order
      .map((id) => this.flows.get(id))
      .filter((flow): flow is CapturedFlow => Boolean(flow))
      .filter((flow) => flowMatchesFilters(flow, filters));
  }

  size(): number {
    this.trim();
    return this.flows.size;
  }

  private trim(nowEpochMs = Date.now()): void {
    for (const id of Array.from(this.order)) {
      const flow = this.flows.get(id);
      if (!flow || this.isExpired(flow, nowEpochMs)) {
        this.flows.delete(id);
        this.order.splice(this.order.indexOf(id), 1);
      }
    }

    while (this.order.length > this.options.maxFlows) {
      const removed = this.order.pop();
      if (removed) {
        this.flows.delete(removed);
      }
    }
  }

  private isExpired(flow: CapturedFlow, nowEpochMs: number): boolean {
    if (!this.options.flowTtlMs) {
      return false;
    }

    return nowEpochMs - Date.parse(flow.startedAt) > this.options.flowTtlMs;
  }

  private nextBodyPreview(
    body: string | null | undefined,
    contentType: string | undefined,
    encoding: RawBodyEncoding | undefined,
    existing: BodyPreview | undefined
  ): BodyPreview {
    if (body === undefined) {
      return existing ?? createEmptyBodyPreview(contentType);
    }

    return createBodyPreview(body, contentType, this.options.bodyPreviewBytes, encoding);
  }
}

function createEmptyBodyPreview(contentType: string | undefined): BodyPreview {
  return {
    kind: "empty",
    sizeBytes: 0,
    preview: "",
    truncated: false,
    contentType: contentType || undefined
  };
}
