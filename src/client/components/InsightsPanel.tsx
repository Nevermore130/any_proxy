import { useEffect, useMemo, useState } from "react";
import { ChartLineIcon } from "@phosphor-icons/react/dist/csr/ChartLine";
import {
  INSIGHTS_WINDOW_OPTIONS,
  changeTone,
  formatChange,
  formatClock,
  formatCount,
  formatLatency,
  formatRate,
  formatRelativeTime,
  windowLabel
} from "../lib/insightsFormat.js";
import type {
  InsightsEndpoint,
  InsightsErrorSample,
  InsightsMetric,
  InsightsNamedCount,
  InsightsOverview,
  InsightsSeriesPoint,
  InsightsWindow
} from "../types.js";

type InsightsTab = "overview" | "errors" | "latency";

type InsightsPanelProps = {
  projectId: string;
  projectName?: string;
  refreshNonce: string;
  onOpenFlow?: (flowId: string) => void;
};

export function InsightsPanel({
  projectId,
  projectName,
  refreshNonce,
  onOpenFlow
}: InsightsPanelProps) {
  const [timeWindow, setTimeWindow] = useState<InsightsWindow>("1h");
  const [tab, setTab] = useState<InsightsTab>("overview");
  const [data, setData] = useState<InsightsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const query = new URLSearchParams({ window: timeWindow });
        if (projectId) {
          query.set("projectId", projectId);
        }
        const response = await fetch(`/api/insights?${query.toString()}`);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const next = (await response.json()) as InsightsOverview;
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const timer = globalThis.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [timeWindow, projectId, refreshNonce]);

  const empty = !data || data.flowCount === 0;

  return (
    <section className="insights-panel" data-testid="insights-panel">
      <header className="insights-panel__header">
        <div>
          <p className="insights-panel__eyebrow">Traffic insights</p>
          <h1 className="insights-panel__title">{projectName || "Captured traffic"}</h1>
        </div>
        <label className="insights-window">
          <span>Window</span>
          <select
            className="postman-select"
            value={timeWindow}
            onChange={(event) => setTimeWindow(event.target.value as InsightsWindow)}
          >
            {INSIGHTS_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="insights-tabs" role="tablist" aria-label="Insights views">
        <TabButton id="overview" selected={tab === "overview"} onSelect={setTab}>
          Overview
        </TabButton>
        <TabButton id="errors" selected={tab === "errors"} onSelect={setTab}>
          Errors
        </TabButton>
        <TabButton id="latency" selected={tab === "latency"} onSelect={setTab}>
          Latency
        </TabButton>
      </div>

      {error ? <div className="insights-banner">{error}</div> : null}

      {loading && !data ? (
        <div className="insights-empty">
          <ChartLineIcon size={28} />
          <p>Loading traffic health…</p>
        </div>
      ) : empty ? (
        <EmptyState timeWindow={data?.window ?? timeWindow} retainedCount={data?.retainedCount ?? 0} />
      ) : tab === "overview" ? (
        <Overview data={data} />
      ) : tab === "errors" ? (
        <ErrorsTab data={data} onOpenFlow={onOpenFlow} />
      ) : (
        <LatencyTab data={data} />
      )}
    </section>
  );
}

function Overview({ data }: { data: InsightsOverview }) {
  return (
    <div className="insights-overview">
      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Recent history</h2>
          <p>
            Traffic-derived run health for the {windowLabel(data.window).toLowerCase()}. Pass rate is
            the share of flows without an error and with status &lt; 400.
          </p>
        </div>
        <div className="insights-cards insights-cards--quad">
          <HealthCard
            label="Pass rate"
            kind="passRate"
            metric={data.collectionHealth.passRate}
            format={formatRate}
            color="#16A34A"
          />
          <HealthCard
            label="Total runs"
            kind="requests"
            metric={data.collectionHealth.totalRuns}
            format={formatCount}
            color="#0A85D1"
          />
          <HealthCard
            label="Average response time"
            kind="latency"
            metric={data.collectionHealth.avgResponseMs}
            format={formatLatency}
            color="#7C3AED"
          />
          <LastRunCard value={data.collectionHealth.lastRunAt} />
        </div>
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>System health</h2>
          <p>P90 and error volume compared with the previous {windowLabel(data.window).toLowerCase()}.</p>
        </div>
        <div className="insights-cards insights-cards--pair">
          <HealthCard
            label="P90 Latency"
            kind="latency"
            metric={data.systemHealth.p90LatencyMs}
            format={formatLatency}
            color="#7C3AED"
          />
          <HealthCard
            label="Errors"
            kind="errors"
            metric={data.systemHealth.errors}
            format={formatCount}
            color="#EF4444"
          />
        </div>
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Endpoint performance</h2>
          <p>
            Monitoring {data.endpointHealth.monitoredCount} endpoint
            {data.endpointHealth.monitoredCount === 1 ? "" : "s"}. Search filters the table by path.
          </p>
        </div>
        <PerformanceTable rows={data.endpointPerformance} />
      </section>
    </div>
  );
}

function ErrorsTab({
  data,
  onOpenFlow
}: {
  data: InsightsOverview;
  onOpenFlow?: (flowId: string) => void;
}) {
  return (
    <div className="insights-overview" data-testid="insights-errors">
      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Error volume</h2>
          <p>Bucketed error counts for the {windowLabel(data.window).toLowerCase()}.</p>
        </div>
        <SeriesChart
          series={data.errors.volume}
          previous={data.errors.previousVolume}
          color="#EF4444"
          label="Errors"
          previousLabel="Previous window"
          formatValue={(value) => formatCount(value)}
        />
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Top failing endpoints</h2>
          <p>Highest error counts first. Rates are traffic-derived for this window only.</p>
        </div>
        <EndpointTable
          title="Endpoints with the most errors"
          rows={data.errors.topFailing}
          empty="No errors in this window."
          columns={["errors", "rate", "checks"]}
        />
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Recent error samples</h2>
          <p>
            Last {data.errors.recentSamples.length} error flow
            {data.errors.recentSamples.length === 1 ? "" : "s"}
            {onOpenFlow ? ". Click a row to open it in Captured Traffic." : "."}
          </p>
        </div>
        <ErrorSampleTable rows={data.errors.recentSamples} onOpenFlow={onOpenFlow} />
      </section>
    </div>
  );
}

function LatencyTab({ data }: { data: InsightsOverview }) {
  return (
    <div className="insights-overview" data-testid="insights-latency">
      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Response time</h2>
          <p>Average and P90 latency over the {windowLabel(data.window).toLowerCase()}.</p>
        </div>
        <SeriesChart
          series={data.latency.avg}
          secondary={data.latency.p90}
          color="#0A85D1"
          secondaryColor="#7C3AED"
          label="Average"
          secondaryLabel="P90"
          formatValue={(value) => formatLatency(value)}
        />
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Slowest endpoints</h2>
          <p>Sorted by average response time, then P90.</p>
        </div>
        <EndpointTable
          title="Slowest endpoints"
          rows={data.latency.slowest}
          empty="No timed requests in this window."
          columns={["avg", "p90", "p95", "checks"]}
        />
      </section>

      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>Distribution</h2>
          <p>Status-class mix and latency buckets from captured flows in this window.</p>
        </div>
        <div className="insights-dist">
          <DistributionCard
            title="Status codes"
            items={data.latency.statusDistribution}
            color="#0A85D1"
          />
          <DistributionCard
            title="Latency"
            items={data.latency.latencyDistribution}
            color="#7C3AED"
          />
        </div>
      </section>
    </div>
  );
}

function HealthCard({
  label,
  kind,
  metric,
  format,
  color
}: {
  label: string;
  kind: "requests" | "latency" | "errors" | "passRate";
  metric: InsightsMetric;
  format: (value: number | null) => string;
  color: string;
}) {
  const change = formatChange(metric.changePercent);
  const tone = changeTone(kind, metric.changePercent);

  return (
    <article className="insights-card">
      <div className="insights-card__top">
        <h3>{label}</h3>
        {change ? (
          <span className={`insights-change insights-change--${tone}`}>
            {change}
            {metric.changePercent != null && metric.changePercent !== 0 ? (
              <span aria-hidden="true">{metric.changePercent > 0 ? " ↑" : " ↓"}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      <p className="insights-card__value">{format(metric.value)}</p>
      <Sparkline current={metric.sparkline} previous={metric.previousSparkline} color={color} />
      <div className="insights-card__legend">
        <span>
          <i className="insights-dot insights-dot--current" style={{ background: color }} /> Current
          window
        </span>
        {metric.previousSparkline.length > 0 ? (
          <span>
            <i className="insights-dot insights-dot--previous" /> Previous window
          </span>
        ) : null}
      </div>
    </article>
  );
}

function LastRunCard({ value }: { value: string | null }) {
  return (
    <article className="insights-card">
      <div className="insights-card__top">
        <h3>Last run</h3>
      </div>
      <p className="insights-card__value">{formatRelativeTime(value)}</p>
      <p className="insights-card__hint">{formatClock(value)}</p>
    </article>
  );
}

function PerformanceTable({ rows }: { rows: InsightsEndpoint[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter(
      (row) => row.path.toLowerCase().includes(needle) || row.method.toLowerCase().includes(needle)
    );
  }, [query, rows]);

  return (
    <div className="insights-table-card">
      <div className="insights-toolbar">
        <input
          type="search"
          className="postman-search insights-search"
          placeholder="Search endpoints"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="insights-endpoint-search"
        />
        <p className="insights-toolbar__meta">
          {filtered.length} of {rows.length}
        </p>
      </div>
      {filtered.length === 0 ? (
        <p className="insights-table-empty">
          {rows.length === 0 ? "No requests in this window." : "No endpoints match that search."}
        </p>
      ) : (
        <table className="insights-table" data-testid="insights-performance-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Pass rate</th>
              <th>Checks</th>
              <th>Avg</th>
              <th>P95</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.method} ${row.path}`}>
                <td>
                  <EndpointCell method={row.method} path={row.path} />
                </td>
                <td>{formatRate(row.passRate)}</td>
                <td>{formatCount(row.requestCount)}</td>
                <td>{formatLatency(row.avgLatencyMs)}</td>
                <td>{formatLatency(row.p95LatencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EndpointTable({
  title,
  rows,
  empty,
  columns
}: {
  title: string;
  rows: InsightsEndpoint[];
  empty: string;
  columns: Array<"errors" | "rate" | "checks" | "avg" | "p90" | "p95">;
}) {
  const headers: Record<(typeof columns)[number], string> = {
    errors: "Error count",
    rate: "Error rate",
    checks: "Checks",
    avg: "Avg",
    p90: "P90",
    p95: "P95"
  };

  return (
    <div className="insights-table-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="insights-table-empty">{empty}</p>
      ) : (
        <table className="insights-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              {columns.map((column) => (
                <th key={column}>{headers[column]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.method} ${row.path}`}>
                <td>
                  <EndpointCell method={row.method} path={row.path} />
                </td>
                {columns.map((column) => (
                  <td key={column}>{endpointColumnValue(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function endpointColumnValue(
  row: InsightsEndpoint,
  column: "errors" | "rate" | "checks" | "avg" | "p90" | "p95"
): string {
  if (column === "errors") {
    return formatCount(row.errorCount);
  }
  if (column === "rate") {
    return formatRate(row.errorRate);
  }
  if (column === "checks") {
    return formatCount(row.requestCount);
  }
  if (column === "avg") {
    return formatLatency(row.avgLatencyMs);
  }
  if (column === "p90") {
    return formatLatency(row.p90LatencyMs);
  }
  return formatLatency(row.p95LatencyMs);
}

function ErrorSampleTable({
  rows,
  onOpenFlow
}: {
  rows: InsightsErrorSample[];
  onOpenFlow?: (flowId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="insights-table-card">
        <p className="insights-table-empty">No error samples in this window.</p>
      </div>
    );
  }

  return (
    <div className="insights-table-card">
      <table className="insights-table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const clickable = Boolean(row.id && onOpenFlow);
            return (
              <tr
                key={`${row.id ?? "sample"}-${index}`}
                className={clickable ? "insights-table__row--clickable" : undefined}
                onClick={() => {
                  if (row.id && onOpenFlow) {
                    onOpenFlow(row.id);
                  }
                }}
              >
                <td>
                  <EndpointCell method={row.method} path={row.path} />
                </td>
                <td>
                  <div className="insights-sample-status">
                    <span
                      className={`postman-status-badge postman-status-badge--${statusClass(row.statusCode, row.error)}`}
                    >
                      {row.statusCode ?? (row.error ? "ERR" : "—")}
                    </span>
                    {row.error ? <span className="insights-sample-error">{row.error}</span> : null}
                  </div>
                </td>
                <td>{formatRelativeTime(row.startedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCell({ method, path }: { method: string; path: string }) {
  return (
    <div className="insights-endpoint">
      <span className={`postman-method-badge postman-method-badge--${method.toLowerCase()}`}>
        {method}
      </span>
      <code>{path}</code>
    </div>
  );
}

function Sparkline({
  current,
  previous,
  color
}: {
  current: number[];
  previous: number[];
  color: string;
}) {
  const width = 240;
  const height = 52;
  const max = Math.max(1, ...current, ...previous);

  function points(values: number[]): string {
    if (values.length === 0) {
      return "";
    }
    return values
      .map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
        const y = height - (value / max) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg className="insights-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      {previous.length > 1 ? (
        <polyline fill="none" stroke="#D4D4D4" strokeWidth="1.75" points={points(previous)} />
      ) : null}
      {current.length > 1 ? (
        <polyline fill="none" stroke={color} strokeWidth="2.25" points={points(current)} />
      ) : null}
    </svg>
  );
}

function SeriesChart({
  series,
  previous,
  secondary,
  color,
  secondaryColor = "#7C3AED",
  label,
  previousLabel,
  secondaryLabel,
  formatValue
}: {
  series: InsightsSeriesPoint[];
  previous?: InsightsSeriesPoint[];
  secondary?: InsightsSeriesPoint[];
  color: string;
  secondaryColor?: string;
  label: string;
  previousLabel?: string;
  secondaryLabel?: string;
  formatValue: (value: number) => string;
}) {
  const width = 720;
  const height = 196;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const values = [
    ...series.map((point) => point.value),
    ...(previous ?? []).map((point) => point.value),
    ...(secondary ?? []).map((point) => point.value)
  ];
  const max = Math.max(1, ...values);
  const ticks = [0, 0.5, 1].map((ratio) => max * ratio);

  function pointsOf(points: InsightsSeriesPoint[]): string {
    if (points.length === 0) {
      return "";
    }
    return points
      .map((point, index) => {
        const x =
          pad.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
        const y = pad.top + innerHeight - (point.value / max) * innerHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const first = series[0]?.t;
  const last = series[series.length - 1]?.t;

  return (
    <div className="insights-chart-card">
      <svg className="insights-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {ticks.map((tick) => {
          const y = pad.top + innerHeight - (tick / max) * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#F0F0F0"
                strokeWidth="1"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="insights-chart__tick">
                {formatValue(tick)}
              </text>
            </g>
          );
        })}
        {previous && previous.length > 1 ? (
          <polyline fill="none" stroke="#D4D4D4" strokeWidth="1.75" points={pointsOf(previous)} />
        ) : null}
        {secondary && secondary.length > 1 ? (
          <polyline
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2"
            points={pointsOf(secondary)}
          />
        ) : null}
        {series.length > 1 ? (
          <polyline fill="none" stroke={color} strokeWidth="2.25" points={pointsOf(series)} />
        ) : null}
        <text x={pad.left} y={height - 8} className="insights-chart__tick">
          {formatClock(first ?? null)}
        </text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" className="insights-chart__tick">
          {formatClock(last ?? null)}
        </text>
      </svg>
      <div className="insights-card__legend">
        <span>
          <i className="insights-dot" style={{ background: color }} /> {label}
        </span>
        {secondary ? (
          <span>
            <i className="insights-dot" style={{ background: secondaryColor }} /> {secondaryLabel}
          </span>
        ) : null}
        {previous && previous.length > 0 ? (
          <span>
            <i className="insights-dot insights-dot--previous" /> {previousLabel ?? "Previous window"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  items,
  color
}: {
  title: string;
  items: InsightsNamedCount[];
  color: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="insights-table-card">
      <h3>{title}</h3>
      <ul className="insights-dist-list">
        {items.map((item) => (
          <li key={item.label} className="insights-dist-row">
            <span>{item.label}</span>
            <div className="insights-dist-track" aria-hidden="true">
              <i style={{ width: `${(item.count / max) * 100}%`, background: color }} />
            </div>
            <span>
              {formatCount(item.count)}
              {total > 0 ? ` · ${formatRate((item.count / total) * 100)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({
  timeWindow,
  retainedCount
}: {
  timeWindow: InsightsWindow;
  retainedCount: number;
}) {
  return (
    <div className="insights-empty">
      <ChartLineIcon size={32} weight="duotone" />
      <h2>No traffic in this window</h2>
      <p>
        Insights are derived from captured relay flows. Send traffic through this session, or switch
        the time window.
      </p>
      {retainedCount > 0 && timeWindow !== "all" ? (
        <p className="insights-empty__hint">
          {retainedCount} request{retainedCount === 1 ? "" : "s"} still retained — try All retained.
        </p>
      ) : null}
    </div>
  );
}

function TabButton({
  id,
  selected,
  onSelect,
  children
}: {
  id: InsightsTab;
  selected: boolean;
  onSelect: (tab: InsightsTab) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`insights-tab ${selected ? "insights-tab--active" : ""}`}
      onClick={() => onSelect(id)}
      data-testid={`insights-tab-${id}`}
    >
      {children}
    </button>
  );
}

function statusClass(statusCode: number | undefined | null, error?: string): string {
  if (statusCode == null) {
    return error ? "error" : "pending";
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
