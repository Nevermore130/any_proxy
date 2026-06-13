import { createBodyPreview } from "./bodyPreview.js";
import { flowMatchesFilters } from "./filters.js";
import type { AddonFlowEvent, CapturedFlow, FlowFilters, FlowStoreOptions } from "./types.js";

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
      requestBodyPreview: createBodyPreview(
        event.flow.requestBody ?? existing?.requestBodyPreview.preview ?? null,
        event.flow.requestContentType,
        this.options.bodyPreviewBytes
      ),
      responseBodyPreview: createBodyPreview(
        event.flow.responseBody ?? existing?.responseBodyPreview.preview ?? null,
        event.flow.responseContentType,
        this.options.bodyPreviewBytes
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
    return this.flows.get(id);
  }

  listFlows(filters: FlowFilters): CapturedFlow[] {
    return this.order
      .map((id) => this.flows.get(id))
      .filter((flow): flow is CapturedFlow => Boolean(flow))
      .filter((flow) => flowMatchesFilters(flow, filters));
  }

  size(): number {
    return this.flows.size;
  }

  private trim(): void {
    while (this.order.length > this.options.maxFlows) {
      const removed = this.order.pop();
      if (removed) {
        this.flows.delete(removed);
      }
    }
  }
}
