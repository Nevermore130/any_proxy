import { useState } from "react";
import type { CapturedFlow } from "../types.js";
import { parseJsonBodyPreview } from "../lib/jsonBody.js";
import { bodyCopyText } from "../lib/bodyActions.js";

type ResponsePaneProps = {
  flow: CapturedFlow | null;
};

type TabId = "body" | "headers" | "info";

export function ResponsePane({ flow }: ResponsePaneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("body");

  if (!flow) {
    return (
      <div className="postman-empty-pane">
        <p>No response to display</p>
      </div>
    );
  }

  const statusClass = getStatusClass(flow.statusCode, flow.error);

  return (
    <div className="postman-response-pane">
      <div className="postman-response-header">
        <div className="postman-tabs postman-tabs--secondary">
          <button
            type="button"
            className={`postman-tab ${activeTab === "body" ? "postman-tab--active" : ""}`}
            onClick={() => setActiveTab("body")}
          >
            Body
          </button>
          <button
            type="button"
            className={`postman-tab ${activeTab === "headers" ? "postman-tab--active" : ""}`}
            onClick={() => setActiveTab("headers")}
          >
            Headers {flow.responseHeaders ? `(${flow.responseHeaders.length})` : ""}
          </button>
          <button
            type="button"
            className={`postman-tab ${activeTab === "info" ? "postman-tab--active" : ""}`}
            onClick={() => setActiveTab("info")}
          >
            Info
          </button>
        </div>
        <div className="postman-response-meta">
          <span
            className={`postman-status-badge postman-status-badge--${statusClass} postman-status-badge--lg`}
          >
            {flow.statusCode === undefined
              ? flow.error
                ? "Error"
                : "Pending"
              : `${flow.statusCode} ${getStatusText(flow.statusCode)}`}
          </span>
          <span className="postman-response-stat">
            Time: <strong>{formatDuration(flow.durationMs)}</strong>
          </span>
          <span className="postman-response-stat">
            Size:{" "}
            <strong>
              {flow.responseBodyPreview?.sizeBytes
                ? `${flow.responseBodyPreview.sizeBytes} B`
                : "0 B"}
            </strong>
          </span>
        </div>
      </div>

      <div className="postman-tab-content">
        {flow.error && <div className="postman-error-banner">{flow.error}</div>}

        {activeTab === "body" && (
          <BodyView body={flow.responseBodyPreview} label="Response Body" />
        )}
        {activeTab === "headers" && <HeadersView headers={flow.responseHeaders} />}
        {activeTab === "info" && (
          <InfoView flow={flow} />
        )}
      </div>
    </div>
  );
}

function HeadersView({ headers }: { headers: Array<[string, string]> | undefined }) {
  if (!Array.isArray(headers) || headers.length === 0) {
    return <p className="postman-muted">No headers captured</p>;
  }

  return (
    <div className="postman-headers-table">
      <div className="postman-headers-row postman-headers-row--header">
        <div className="postman-headers-cell">Key</div>
        <div className="postman-headers-cell">Value</div>
      </div>
      {headers.map(([name, value]) => (
        <div key={`${name}:${value}`} className="postman-headers-row">
          <div className="postman-headers-cell postman-headers-cell--key">{name}</div>
          <div className="postman-headers-cell postman-headers-cell--value">{value}</div>
        </div>
      ))}
    </div>
  );
}

function BodyView({
  body,
  label
}: {
  body: CapturedFlow["responseBodyPreview"];
  label: string;
}) {
  if (!body || body.kind === "empty") {
    return <p className="postman-muted">No {label.toLowerCase()} captured</p>;
  }

  const rawText = bodyCopyText(body);
  const json = parseJsonBodyPreview(body);

  if (json.ok) {
    return (
      <div className="postman-json-viewer">
        <pre className="postman-code-block">{JSON.stringify(json.value, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="postman-body-viewer">
      <pre className="postman-code-block">{rawText}</pre>
    </div>
  );
}

function InfoView({ flow }: { flow: CapturedFlow }) {
  return (
    <div className="postman-info-grid">
      <div className="postman-info-row">
        <div className="postman-info-label">Device IP</div>
        <div className="postman-info-value">{flow.clientIp || "-"}</div>
      </div>
      <div className="postman-info-row">
        <div className="postman-info-label">Method</div>
        <div className="postman-info-value">{flow.method || "UNKNOWN"}</div>
      </div>
      <div className="postman-info-row">
        <div className="postman-info-label">Protocol</div>
        <div className="postman-info-value">{flow.protocol || "unknown"}</div>
      </div>
      <div className="postman-info-row">
        <div className="postman-info-label">Host</div>
        <div className="postman-info-value">{flow.host || "-"}</div>
      </div>
      <div className="postman-info-row">
        <div className="postman-info-label">TLS</div>
        <div className="postman-info-value">
          {flow.isTlsIntercepted ? "intercepted" : "passthrough"}
        </div>
      </div>
      <div className="postman-info-row">
        <div className="postman-info-label">Started</div>
        <div className="postman-info-value">{formatDateTime(flow.startedAt)}</div>
      </div>
    </div>
  );
}

function getStatusClass(statusCode: number | undefined, error: string | undefined): string {
  if (statusCode === undefined) {
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

function getStatusText(statusCode: number): string {
  const statusTexts: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable"
  };
  return statusTexts[statusCode] || "";
}

function formatDuration(value: number | undefined): string {
  if (value === undefined || value === null) {
    return "...";
  }
  return `${value} ms`;
}

function formatDateTime(value: string | undefined): string {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}
