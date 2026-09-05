import { useEffect, useState } from "react";
import { ChartLineIcon } from "@phosphor-icons/react/dist/csr/ChartLine";
import {
  INSIGHTS_WINDOW_OPTIONS,
  changeTone,
  formatChange,
  formatCount,
  formatLatency,
  formatRate,
  windowLabel
} from "../lib/insightsFormat.js";
import type { InsightsEndpoint, InsightsMetric, InsightsOverview, InsightsWindow } from "../types.js";

type InsightsTab = "overview" | "errors" | "latency";

type InsightsPanelProps = {
  projectId: string;
  projectName?: string;
  refreshNonce: string;
};

export function InsightsPanel({ projectId, projectName, refreshNonce }: InsightsPanelProps) {
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

      {tab !== "overview" ? (
        <ComingSoon tab={tab} />
      ) : loading && !data ? (
        <div className="insights-empty">
          <ChartLineIcon size={28} />
          <p>Loading traffic health…</p>
        </div>
      ) : empty ? (
        <EmptyState timeWindow={data?.window ?? timeWindow} retainedCount={data?.retainedCount ?? 0} />
      ) : (
        <Overview data={data} />
      )}
    </section>
  );
}

function Overview({ data }: { data: InsightsOverview }) {
  return (
    <div className="insights-overview">
      <section className="insights-section">
        <div className="insights-section__heading">
          <h2>System health</h2>
          <p>Compared with the previous {windowLabel(data.window).toLowerCase()} when enough traffic exists.</p>
        </div>
        <div className="insights-cards">
          <HealthCard
            label="Total requests observed"
            kind="requests"
            metric={data.systemHealth.totalRequests}
            format={formatCount}
            color="#0A85D1"
          />
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
          <h2>Endpoint health</h2>
          <p>
            Monitoring {data.endpointHealth.monitoredCount} endpoint
            {data.endpointHealth.monitoredCount === 1 ? "" : "s"}. Data shown is for the{" "}
            {windowLabel(data.window).toLowerCase()}.
          </p>
        </div>
        <div className="insights-tables">
          <EndpointTable
            title="Endpoints with the most errors"
            rows={data.endpointHealth.mostErrors}
            empty="No errors in this window."
            primary="errors"
          />
          <EndpointTable
            title="Busiest endpoints"
            rows={data.endpointHealth.busiest}
            empty="No requests in this window."
            primary="volume"
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
  kind: "requests" | "latency" | "errors";
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
          <i className="insights-dot insights-dot--current" /> Current window
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

function EndpointTable({
  title,
  rows,
  empty,
  primary
}: {
  title: string;
  rows: InsightsEndpoint[];
  empty: string;
  primary: "errors" | "volume";
}) {
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
              <th>{primary === "errors" ? "Error count" : "Requests"}</th>
              <th>Error rate</th>
              <th>Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.method} ${row.path}`}>
                <td>
                  <div className="insights-endpoint">
                    <span className={`postman-method-badge postman-method-badge--${row.method.toLowerCase()}`}>
                      {row.method}
                    </span>
                    <code>{row.path}</code>
                  </div>
                </td>
                <td>{formatCount(primary === "errors" ? row.errorCount : row.requestCount)}</td>
                <td>{formatRate(row.errorRate)}</td>
                <td>{formatLatency(row.avgLatencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

function ComingSoon({ tab }: { tab: Exclude<InsightsTab, "overview"> }) {
  return (
    <div className="insights-empty">
      <ChartLineIcon size={32} weight="duotone" />
      <h2>{tab === "errors" ? "Error drill-down" : "Latency drill-down"} coming soon</h2>
      <p>
        Phase 1 ships the Overview. Use the error and busiest endpoint tables there for traffic-derived
        health.
      </p>
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
    >
      {children}
    </button>
  );
}
