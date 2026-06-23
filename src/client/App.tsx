import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { bodyCopyButtonState } from "./lib/bodyActions.js";
import { curlCommandForFlow, flowRequestUrl } from "./lib/curlCommand.js";
import { compactRelayUrl } from "./lib/dashboardSetup.js";
import { detailTabButtonState, type DetailTabId } from "./lib/detailTabs.js";
import { parseJsonBodyPreview, summarizeJsonValue } from "./lib/jsonBody.js";
import type { BodyPreview, CapturedFlow, FlowFilters, StatusResponse } from "./types.js";

type FlowsResponse = {
  flows?: CapturedFlow[];
};

type FlowResponse = {
  flow?: CapturedFlow;
};

type BannerState = {
  statusError: string | null;
  flowsError: string | null;
  eventsError: string | null;
};

type DashboardTheme = "light" | "dark";

const themeStorageKey = "rela-capture-theme";

const defaultFilters: FlowFilters = {
  deviceIp: "",
  host: "",
  protocol: "all",
  statusClass: "all"
};

export function App() {
  const [flows, setFlows] = useState<CapturedFlow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<CapturedFlow | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [filters, setFilters] = useState<FlowFilters>(defaultFilters);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [theme, setTheme] = useState<DashboardTheme>(() => readStoredTheme());
  const [banner, setBanner] = useState<BannerState>({
    eventsError: null,
    flowsError: null,
    statusError: null
  });

  const filtersRef = useRef(filters);
  const selectedIdRef = useRef(selectedId);
  const latestFlowsRequestId = useRef(0);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme]);

  const exportUrl = useMemo(() => {
    const query = filtersToParams(filters).toString();
    return query ? `/api/export?${query}` : "/api/export";
  }, [filters]);

  const apiBanner = [banner.statusError, banner.flowsError, banner.eventsError]
    .filter(Boolean)
    .join(" ");

  async function loadStatus() {
    try {
      const nextStatus = await fetchJson<StatusResponse>("/api/status");
      setStatus(nextStatus);
      setPaused(Boolean(nextStatus.capture?.paused));
      setBanner((current) => ({ ...current, statusError: null }));
    } catch (error) {
      setBanner((current) => ({
        ...current,
        statusError: `Status unavailable: ${errorMessage(error)}`
      }));
    }
  }

  async function loadFlows(nextFilters = filtersRef.current) {
    const requestId = ++latestFlowsRequestId.current;
    setFlowsLoading(true);
    setBanner((current) => ({ ...current, flowsError: null }));

    try {
      const params = filtersToParams(nextFilters);
      const query = params.toString();
      const data = await fetchJson<FlowsResponse>(query ? `/api/flows?${query}` : "/api/flows");
      if (requestId !== latestFlowsRequestId.current) {
        return;
      }

      const nextFlows = Array.isArray(data.flows) ? data.flows : [];
      setFlows(nextFlows);
      setSelectedId((currentSelectedId) => {
        if (!currentSelectedId || nextFlows.some((flow) => flow.id === currentSelectedId)) {
          return currentSelectedId;
        }
        setSelectedFlow(null);
        return null;
      });
    } catch (error) {
      if (requestId !== latestFlowsRequestId.current) {
        return;
      }

      setFlows([]);
      setBanner((current) => ({
        ...current,
        flowsError: `Could not load requests: ${errorMessage(error)}`
      }));
    } finally {
      if (requestId === latestFlowsRequestId.current) {
        setFlowsLoading(false);
      }
    }
  }

  async function showDetails(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetailLoadingId(id);
    setSelectedFlow(null);

    try {
      const data = await fetchJson<FlowResponse>(`/api/flows/${encodeURIComponent(id)}`);
      if (selectedIdRef.current !== id) {
        return;
      }
      setSelectedFlow(data.flow ?? null);
    } catch (error) {
      if (selectedIdRef.current !== id) {
        return;
      }
      setSelectedFlow({
        id,
        error: `Could not load flow ${id}: ${errorMessage(error)}`
      });
    } finally {
      if (selectedIdRef.current === id) {
        setDetailLoadingId(null);
      }
    }
  }

  async function runAction(action: () => Promise<void>) {
    setActionInFlight(true);
    setBanner((current) => ({ ...current, flowsError: null }));
    try {
      await action();
    } catch (error) {
      setBanner((current) => ({ ...current, flowsError: errorMessage(error) }));
    } finally {
      setActionInFlight(false);
    }
  }

  async function togglePause() {
    await runAction(async () => {
      await fetchJson(paused ? "/api/capture/resume" : "/api/capture/pause", { method: "POST" });
      await loadStatus();
    });
  }

  async function clearFlows() {
    await runAction(async () => {
      await fetchJson("/api/flows/clear", { method: "POST" });
      setFlows([]);
      setSelectedId(null);
      setSelectedFlow(null);
    });
  }

  function updateFilter<K extends keyof FlowFilters>(key: K, value: FlowFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFlows(filters);
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filters]);

  useEffect(() => {
    const events = new EventSource("/api/events");

    events.onopen = () => {
      setBanner((current) => ({ ...current, eventsError: null }));
    };

    events.onerror = () => {
      setBanner((current) => ({
        ...current,
        eventsError: "Live updates disconnected; retrying in the background."
      }));
    };

    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "clear" }
          | { type: "flow"; flow?: CapturedFlow };

        if (payload.type === "clear") {
          setFlows([]);
          setSelectedId(null);
          setSelectedFlow(null);
          return;
        }

        if (payload.type === "flow" && payload.flow) {
          const incomingFlow = payload.flow;
          setFlows((current) => upsertFlowList(current, incomingFlow, filtersRef.current));
          setSelectedFlow((current) =>
            selectedIdRef.current === incomingFlow.id ? incomingFlow : current
          );
        }
      } catch (error) {
        setBanner((current) => ({
          ...current,
          eventsError: `Live update parse error: ${errorMessage(error)}`
        }));
      }
    };

    return () => {
      events.close();
    };
  }, []);

  const relayUrl = status?.relay?.rela?.baseUrl || "/relay/rela";
  const relayDisplayUrl = compactRelayUrl(relayUrl);
  const captureSessionId = status?.session?.id || "";
  const sessionQrUrl = captureSessionId
    ? `/api/session/qr.svg?sid=${encodeURIComponent(captureSessionId)}`
    : "";
  const errorCount = flows.filter((flow) => flow.error || (flow.statusCode ?? 0) >= 400).length;
  const lastFlowTime = flows[0] ? formatTime(flows[0].startedAt) : "-";
  const statusLine = banner.statusError
    ? "Dashboard API unavailable"
    : paused
      ? "Capture paused"
      : "Capturing relay traffic";
  const statusState = banner.statusError ? "error" : paused ? "paused" : "running";
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <main className="shell" data-theme={theme}>
      <header className="topbar">
        <div className="topbar__identity">
          <div className="product-mark">RC</div>
          <div>
            <h1>Rela Capture</h1>
            <p className="status-line" data-state={statusState}>
              {statusLine}
            </p>
          </div>
        </div>
        <div className="topbar__stats" aria-label="Capture summary">
          <SummaryStat label="Requests" value={flows.length} />
          <SummaryStat label="Errors" value={errorCount} tone={errorCount > 0 ? "error" : "ok"} />
          <SummaryStat label="Latest" value={lastFlowTime} />
        </div>
        <div className="actions" aria-label="Capture controls">
          <button
            aria-label={`Switch to ${nextTheme} mode`}
            className="tool-button theme-toggle"
            title={`Switch to ${nextTheme} mode`}
            type="button"
            onClick={() => setTheme(nextTheme)}
          >
            {theme === "dark" ? (
              <SunIcon size={15} weight="bold" />
            ) : (
              <MoonIcon size={15} weight="bold" />
            )}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={actionInFlight}
            onClick={() => void togglePause()}
          >
            {paused ? <PlayIcon size={15} weight="bold" /> : <PauseIcon size={15} weight="bold" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={actionInFlight || flowsLoading}
            onClick={() => void clearFlows()}
          >
            <TrashIcon size={15} weight="bold" />
            Clear
          </button>
          <a className="button tool-button button--primary" href={exportUrl}>
            <DownloadSimpleIcon size={15} weight="bold" />
            Export
          </a>
        </div>
      </header>

      <section className="setup" aria-label="Relay setup">
        <div className="setup__item setup__relay">
          <div className="setup__head">
            <span className="label">App relay</span>
            <RelayCopyButton relayUrl={relayUrl} />
          </div>
          <strong title={relayUrl}>{relayDisplayUrl}</strong>
        </div>
        <div className="setup__qr">
          {sessionQrUrl ? (
            <img alt="App capture binding QR code" src={sessionQrUrl} />
          ) : (
            <div className="setup__qr-placeholder" aria-hidden="true" />
          )}
          <div>
            <span className="label">Bind App</span>
            <strong>{captureSessionId ? "Scan QR" : "Loading..."}</strong>
            {captureSessionId ? (
              <span className="setup__session" title={captureSessionId}>
                Session {shortSessionId(captureSessionId)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="banner" hidden={!apiBanner} role="status">
        {apiBanner}
      </section>

      <section className="filters" aria-label="Request filters">
        <label>
          <span>Device IP</span>
          <input
            value={filters.deviceIp}
            placeholder="192.168"
            autoComplete="off"
            onChange={(event) => updateFilter("deviceIp", event.target.value)}
          />
        </label>
        <label>
          <span>Host contains</span>
          <input
            value={filters.host}
            placeholder="api.example.com"
            autoComplete="off"
            onChange={(event) => updateFilter("host", event.target.value)}
          />
        </label>
        <label>
          <span>Protocol</span>
          <select
            value={filters.protocol}
            onChange={(event) => updateFilter("protocol", event.target.value)}
          >
            <option value="all">All protocols</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="websocket">WebSocket</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={filters.statusClass}
            onChange={(event) => updateFilter("statusClass", event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="1xx">1xx</option>
            <option value="2xx">2xx</option>
            <option value="3xx">3xx</option>
            <option value="4xx">4xx</option>
            <option value="5xx">5xx</option>
            <option value="none">No response</option>
          </select>
        </label>
      </section>

      <section className="content">
        <RequestTable
          flows={flows}
          filters={filters}
          loading={flowsLoading}
          selectedId={selectedId}
          error={banner.flowsError}
          onSelect={(id) => void showDetails(id)}
        />
        <RequestDetail flow={selectedFlow} loadingId={detailLoadingId} />
      </section>
    </main>
  );
}

function readStoredTheme(): DashboardTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function writeStoredTheme(theme: DashboardTheme) {
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Theme persistence is a convenience; the toggle still works without storage access.
  }
}

function SummaryStat({
  label,
  tone,
  value
}: {
  label: string;
  tone?: "error" | "ok";
  value: ReactNode;
}) {
  return (
    <div className={`summary-stat${tone ? ` summary-stat--${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RelayCopyButton({ relayUrl }: { relayUrl: string }) {
  const [labelText, setLabelText] = useState("Copy");
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await copyText(relayUrl);
      setLabelText("Copied");
      setFailed(false);
    } catch {
      setLabelText("Failed");
      setFailed(true);
    } finally {
      window.setTimeout(() => {
        setLabelText("Copy");
        setFailed(false);
      }, 1200);
    }
  }

  return (
    <button
      aria-label="Copy App relay URL"
      className={`relay-copy-button${failed ? " is-error" : ""}`}
      title="Copy App relay URL"
      type="button"
      onClick={() => void copy()}
    >
      <CopySimpleIcon size={12} weight="bold" />
      {labelText}
    </button>
  );
}

function RequestTable({
  error,
  filters,
  flows,
  loading,
  onSelect,
  selectedId
}: {
  error: string | null;
  filters: FlowFilters;
  flows: CapturedFlow[];
  loading: boolean;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const tableState = tableStateText({ error, filters, flows, loading });

  return (
    <div className="table-pane" aria-live="polite" aria-busy={loading ? "true" : "false"}>
      <div className="pane-header">
        <div>
          <h2>Captured Requests</h2>
          <p>Live relay traffic from the debug API base URL.</p>
        </div>
        <div className="pane-header__meta" aria-label="Table state">
          <span>{filtersAreActive(filters) ? "Filtered" : "All traffic"}</span>
          <span>{flows.length} rows</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Device</th>
            <th scope="col">Method</th>
            <th scope="col">Host</th>
            <th scope="col">Path</th>
            <th scope="col">Status</th>
            <th scope="col">Duration</th>
            <th scope="col">Protocol</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((flow) => (
            <RequestRow
              flow={flow}
              key={flow.id}
              selected={flow.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
      <div className="table-state" hidden={!tableState}>
        {tableState}
      </div>
    </div>
  );
}

function RequestRow({
  flow,
  onSelect,
  selected
}: {
  flow: CapturedFlow;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(flow.id);
    }
  }

  return (
    <tr
      className={selected ? "selected" : ""}
      tabIndex={0}
      onClick={() => onSelect(flow.id)}
      onKeyDown={handleKeyDown}
    >
      <td className="time">{formatTime(flow.startedAt)}</td>
      <td className="mono">{flow.clientIp}</td>
      <td className="method-cell">
        <span className="method">{flow.method || "UNKNOWN"}</span>
      </td>
      <td className="clip">{flow.host}</td>
      <td className="path">{flow.path}</td>
      <td className="status-cell">
        <span className={`status-badge status-badge--${statusClass(flow.statusCode, flow.error)}`}>
          {flow.statusCode === undefined ? (flow.error ? "ERR" : "...") : String(flow.statusCode)}
        </span>
      </td>
      <td className="mono">{formatDuration(flow.durationMs)}</td>
      <td className="protocol-cell">
        <span className={`protocol protocol--${safeToken(flow.protocol)}`}>
          {flow.protocol || "unknown"}
        </span>
      </td>
    </tr>
  );
}

function RequestDetail({ flow, loadingId }: { flow: CapturedFlow | null; loadingId: string | null }) {
  if (loadingId) {
    return (
      <aside className="details" aria-live="polite">
        <h2 className="details-title">Request Detail</h2>
        <p className="muted detail-loading">Loading {loadingId}...</p>
      </aside>
    );
  }

  if (!flow) {
    return (
      <aside className="details" aria-live="polite">
        <div className="details__empty">
          <h2 className="details-title">Request Detail</h2>
          <p>Select a request to inspect headers, body previews, and capture errors.</p>
        </div>
      </aside>
    );
  }

  if (flow.error && !flow.host) {
    return (
      <aside className="details" aria-live="polite">
        <h2 className="details-title">Request Detail</h2>
        <p className="error">{flow.error}</p>
      </aside>
    );
  }

  return (
    <aside className="details" aria-live="polite">
      <div className="details-title-row">
        <h2 className="details-title">
          {flow.method || "UNKNOWN"} {flow.host || ""}
        </h2>
        <CurlCopyButton flow={flow} />
      </div>
      <p className="muted breakable request-url">{flowRequestUrl(flow)}</p>
      <DetailTabs flow={flow} />
    </aside>
  );
}

function DetailTabs({ flow }: { flow: CapturedFlow }) {
  const [activeTab, setActiveTab] = useState<DetailTabId>("request");
  const tabs = detailTabButtonState(activeTab);

  return (
    <div className="detail-tab-shell">
      <div className="detail-tab-list" role="tablist" aria-label="Request detail sections">
        {tabs.map((tab) => (
          <button
            aria-controls={tab.panelId}
            aria-selected={tab.selected}
            className="detail-tab"
            id={tab.tabId}
            key={tab.id}
            role="tab"
            tabIndex={tab.selected ? 0 : -1}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setActiveTab(tab.id === "request" ? "response" : "request");
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <RequestPanel flow={flow} hidden={activeTab !== "request"} />
      <ResponsePanel flow={flow} hidden={activeTab !== "response"} />
    </div>
  );
}

function RequestPanel({ flow, hidden }: { flow: CapturedFlow; hidden: boolean }) {
  return (
    <section
      aria-labelledby="detail-tab-request"
      className="detail-tab-panel"
      data-detail-panel="request"
      hidden={hidden}
      id="detail-panel-request"
      role="tabpanel"
    >
      <MetaGrid
        rows={[
          ["Device", flow.clientIp],
          ["Started", formatDateTime(flow.startedAt)],
          ["Method", flow.method || "UNKNOWN"],
          ["Protocol", flow.protocol]
        ]}
      />
      <DetailHeading>Headers</DetailHeading>
      <HeadersViewer headers={flow.requestHeaders} label="Request Headers" />
      <DetailHeading action={<BodyCopyButton body={flow.requestBodyPreview} label="Request Body" />}>
        Body
      </DetailHeading>
      <BodyViewer body={flow.requestBodyPreview} label="Request Body" />
    </section>
  );
}

function ResponsePanel({ flow, hidden }: { flow: CapturedFlow; hidden: boolean }) {
  return (
    <section
      aria-labelledby="detail-tab-response"
      className="detail-tab-panel"
      data-detail-panel="response"
      hidden={hidden}
      id="detail-panel-response"
      role="tabpanel"
    >
      {flow.error ? <p className="error">{flow.error}</p> : null}
      <MetaGrid
        rows={[
          ["Status", flow.statusCode === undefined ? "No response" : String(flow.statusCode)],
          ["Duration", formatDuration(flow.durationMs)],
          ["TLS", flow.isTlsIntercepted ? "intercepted" : "passthrough"],
          ["Host", hostWithPort(flow)]
        ]}
      />
      <DetailHeading>Headers</DetailHeading>
      <HeadersViewer headers={flow.responseHeaders} label="Response Headers" />
      <DetailHeading
        action={<BodyCopyButton body={flow.responseBodyPreview} label="Response Body" />}
      >
        Body
      </DetailHeading>
      <BodyViewer body={flow.responseBodyPreview} label="Response Body" />
    </section>
  );
}

function MetaGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="meta-grid">
      {rows.map(([label, value]) => (
        <Pair key={label} label={label} value={value || "-"} />
      ))}
    </dl>
  );
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function DetailHeading({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    <div className="detail-heading">
      <h3>{children}</h3>
      {action}
    </div>
  );
}

function HeadersViewer({
  headers,
  label
}: {
  headers: Array<[string, string]> | undefined;
  label: string;
}) {
  if (!Array.isArray(headers) || headers.length === 0) {
    return <p className="muted detail-empty-line">No {label.toLowerCase()} captured.</p>;
  }

  return (
    <div className="header-viewer">
      <div className="header-viewer__meta">
        {headers.length} {headers.length === 1 ? "header" : "headers"}
      </div>
      <div className="header-list">
        {headers.map(([name, value]) => (
          <div className="header-row" key={`${name}:${value}`}>
            <span className="header-name">{name}</span>
            <span className="header-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyCopyButton({ body, label }: { body: BodyPreview | undefined; label: string }) {
  const buttonState = bodyCopyButtonState(body, label);
  const [labelText, setLabelText] = useState(buttonState.idleLabel);
  const [failed, setFailed] = useState(false);

  if (!buttonState.enabled) {
    return null;
  }

  async function copy() {
    try {
      await copyText(buttonState.text);
      setLabelText(buttonState.successLabel);
      setFailed(false);
    } catch {
      setLabelText(buttonState.failedLabel);
      setFailed(true);
    } finally {
      window.setTimeout(() => {
        setLabelText(buttonState.idleLabel);
        setFailed(false);
      }, 1200);
    }
  }

  return (
    <button
      aria-label={buttonState.ariaLabel}
      className={`body-copy-button${failed ? " is-error" : ""}`}
      title={buttonState.ariaLabel}
      type="button"
      onClick={() => void copy()}
    >
      <CopySimpleIcon size={13} weight="bold" />
      {labelText}
    </button>
  );
}

function CurlCopyButton({ flow }: { flow: CapturedFlow }) {
  const [labelText, setLabelText] = useState("cURL");
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await copyText(curlCommandForFlow(flow));
      setLabelText("Copied");
      setFailed(false);
    } catch {
      setLabelText("Failed");
      setFailed(true);
    } finally {
      window.setTimeout(() => {
        setLabelText("cURL");
        setFailed(false);
      }, 1200);
    }
  }

  return (
    <button
      aria-label="Copy request as cURL"
      className={`curl-copy-button${failed ? " is-error" : ""}`}
      title="Copy request as cURL"
      type="button"
      onClick={() => void copy()}
    >
      <TerminalWindowIcon size={12} weight="bold" />
      {labelText}
    </button>
  );
}

function BodyViewer({ body, label }: { body: BodyPreview | undefined; label: string }) {
  if (!body || body.kind === "empty") {
    return <p className="muted detail-empty-line">No {label.toLowerCase()} captured.</p>;
  }

  const json = parseJsonBodyPreview(body);
  if (json.ok) {
    return (
      <div className="body-viewer json-viewer">
        <div className="body-viewer__meta">{bodyMetaText(body, "JSON")}</div>
        <div className="json-tree">
          <JsonRoot value={json.value} />
        </div>
      </div>
    );
  }

  const preview = body.preview || "";
  const meta = [
    body.contentType,
    body.kind,
    `${body.sizeBytes ?? 0} bytes`,
    body.truncated ? "truncated" : ""
  ]
    .filter(Boolean)
    .join(" | ");
  const text = meta ? `${meta}\n\n${preview}` : preview;

  return (
    <div className="body-viewer raw-body-viewer">
      <div className="body-viewer__meta">{bodyMetaText(body, body.kind || "text")}</div>
      <pre className="raw-body">{text}</pre>
    </div>
  );
}

function JsonRoot({ value }: { value: unknown }) {
  if (!isExpandableJsonValue(value)) {
    return (
      <div className="json-root">
        <JsonLeaf value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = jsonEntries(value);

  return (
    <div className="json-root">
      <div className="json-bracket">{isArray ? "[" : "{"}</div>
      <div className="json-children">
        {entries.map(([key, childValue]) => (
          <JsonNode key={key} depth={1} label={key} value={childValue} />
        ))}
      </div>
      <div className="json-bracket">{isArray ? "]" : "}"}</div>
    </div>
  );
}

function JsonNode({ depth, label, value }: { depth: number; label: string; value: unknown }) {
  if (!isExpandableJsonValue(value)) {
    return <JsonLeaf label={label} value={value} />;
  }

  return (
    <details className="json-node" open={depth === 0}>
      <summary>
        <JsonKey value={label} />
        <span className="json-summary">{summarizeJsonValue(value)}</span>
      </summary>
      <div className="json-children">
        {jsonEntries(value).map(([childKey, childValue]) => (
          <JsonNode key={childKey} depth={depth + 1} label={childKey} value={childValue} />
        ))}
      </div>
    </details>
  );
}

function JsonLeaf({ label, value }: { label?: string; value: unknown }) {
  return (
    <div className="json-leaf">
      {label ? <JsonKey value={label} /> : null}
      <span className={`json-value json-value--${jsonPrimitiveClass(value)}`}>
        {summarizeJsonValue(value)}
      </span>
    </div>
  );
}

function JsonKey({ value }: { value: string }) {
  return <span className="json-key">{value}</span>;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.className = "copy-fallback-textarea";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function upsertFlowList(
  current: CapturedFlow[],
  incomingFlow: CapturedFlow,
  filters: FlowFilters
): CapturedFlow[] {
  const index = current.findIndex((flow) => flow.id === incomingFlow.id);
  const matches = flowMatchesFilters(incomingFlow, filters);

  if (index >= 0 && matches) {
    return current.map((flow) => (flow.id === incomingFlow.id ? incomingFlow : flow));
  }

  if (index >= 0) {
    return current.filter((flow) => flow.id !== incomingFlow.id);
  }

  if (matches) {
    return [incomingFlow, ...current];
  }

  return current;
}

function flowMatchesFilters(flow: CapturedFlow, filters: FlowFilters): boolean {
  if (filters.deviceIp && !String(flow.clientIp || "").includes(filters.deviceIp)) {
    return false;
  }

  if (
    filters.host &&
    !String(flow.host || "").toLowerCase().includes(filters.host.toLowerCase())
  ) {
    return false;
  }

  if (filters.protocol !== "all" && flow.protocol !== filters.protocol) {
    return false;
  }

  if (filters.statusClass !== "all") {
    if (filters.statusClass === "none") {
      return flow.statusCode === undefined;
    }
    if (flow.statusCode === undefined) {
      return false;
    }
    return String(flow.statusCode).startsWith(filters.statusClass[0] ?? "");
  }

  return true;
}

function tableStateText({
  error,
  filters,
  flows,
  loading
}: {
  error: string | null;
  filters: FlowFilters;
  flows: CapturedFlow[];
  loading: boolean;
}): string {
  if (loading) {
    return "Loading requests...";
  }

  if (error) {
    return error;
  }

  if (flows.length === 0) {
    return filtersAreActive(filters)
      ? "No requests match the current filters."
      : "No requests captured yet.";
  }

  return "";
}

function filtersToParams(filters: FlowFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.deviceIp) {
    params.set("deviceIp", filters.deviceIp);
  }
  if (filters.host) {
    params.set("host", filters.host);
  }
  if (filters.protocol && filters.protocol !== "all") {
    params.set("protocol", filters.protocol);
  }
  if (filters.statusClass && filters.statusClass !== "all") {
    params.set("statusClass", filters.statusClass);
  }

  return params;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as T;
}

function filtersAreActive(filters: FlowFilters): boolean {
  return Boolean(
    filters.deviceIp ||
      filters.host ||
      filters.protocol !== "all" ||
      filters.statusClass !== "all"
  );
}

function statusClass(statusCode: number | undefined, error: string | undefined): string {
  if (statusCode === undefined) {
    return error ? "error" : "none";
  }
  if (statusCode >= 500) {
    return "server";
  }
  if (statusCode >= 400) {
    return "client";
  }
  if (statusCode >= 300) {
    return "redirect";
  }
  if (statusCode >= 200) {
    return "ok";
  }
  return "info";
}

function formatTime(value: string | undefined): string {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDateTime(value: string | undefined): string {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatDuration(value: number | undefined): string {
  if (value === undefined || value === null) {
    return "...";
  }
  return `${value} ms`;
}

function hostWithPort(flow: CapturedFlow): string {
  if (!flow.port) {
    return flow.host || "";
  }
  const defaultPort =
    (flow.scheme === "https" && flow.port === 443) || (flow.scheme === "http" && flow.port === 80);
  return defaultPort ? flow.host || "" : `${flow.host}:${flow.port}`;
}

function shortSessionId(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function safeToken(value: string | undefined): string {
  return String(value || "unknown").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "unknown";
}

function bodyMetaText(body: BodyPreview, format: string): string {
  if (body.kind === "empty") {
    return "";
  }

  const meta = [
    body.contentType,
    format,
    `${body.sizeBytes ?? 0} bytes`,
    body.truncated ? "truncated" : ""
  ].filter(Boolean);
  return meta.join(" | ");
}

function isExpandableJsonValue(value: unknown): value is Array<unknown> | Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function jsonEntries(value: Array<unknown> | Record<string, unknown>): Array<[string, unknown]> {
  return Array.isArray(value)
    ? Array.from(value.entries()).map(([key, childValue]) => [String(key), childValue])
    : Object.entries(value);
}

function jsonPrimitiveClass(value: unknown): string {
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
