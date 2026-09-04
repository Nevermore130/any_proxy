import { useState } from "react";
import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import type { CapturedFlow } from "../types.js";
import { curlCommandForFlow, flowRequestUrl } from "../lib/curlCommand.js";
import { parseJsonBodyPreview, summarizeJsonValue } from "../lib/jsonBody.js";
import { bodyCopyText } from "../lib/bodyActions.js";

type RequestPaneProps = {
  flow: CapturedFlow | null;
  onCreateRule?: (flow: CapturedFlow) => void;
};

type TabId = "params" | "headers" | "body";

export function RequestPane({ flow, onCreateRule }: RequestPaneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("headers");

  if (!flow) {
    return (
      <div className="postman-empty-pane">
        <div className="postman-empty-pane__icon">HTTP</div>
        <p>Select a request from the sidebar to inspect it</p>
      </div>
    );
  }

  if (flow.error && !flow.host) {
    return (
      <div className="postman-empty-pane">
        <p className="error">{flow.error}</p>
      </div>
    );
  }

  const requestUrl = flowRequestUrl(flow);

  return (
    <div className="postman-request-pane">
      <div className="postman-request-header">
        <div className="postman-request-line">
          <span className={`postman-method-badge postman-method-badge--${(flow.method || "GET").toLowerCase()}`}>
            {flow.method || "GET"}
          </span>
          <div className="postman-url-input">
            <input type="text" value={requestUrl} readOnly />
          </div>
          <div className="postman-request-actions">
            {onCreateRule && (
              <button
                className="postman-btn postman-btn--secondary postman-btn--sm"
                type="button"
                data-tour="create-rule-button"
                onClick={() => onCreateRule(flow)}
              >
                <PlusIcon size={14} weight="bold" />
                New Rule
              </button>
            )}
            <CurlCopyButton flow={flow} />
          </div>
        </div>

        {flow.appliedRule && (
          <div className="postman-applied-rule">
            Rule applied: <strong>{flow.appliedRule.ruleName}</strong>
            {flow.appliedRule.delayed && ` • Delayed ${flow.appliedRule.delayMs}ms`}
            {flow.appliedRule.rewritten && " • Rewritten"}
            {flow.appliedRule.mocked && " • Mocked"}
          </div>
        )}
      </div>

      <div className="postman-tabs">
        <button
          type="button"
          className={`postman-tab ${activeTab === "params" ? "postman-tab--active" : ""}`}
          onClick={() => setActiveTab("params")}
        >
          Params
        </button>
        <button
          type="button"
          className={`postman-tab ${activeTab === "headers" ? "postman-tab--active" : ""}`}
          onClick={() => setActiveTab("headers")}
        >
          Headers {flow.requestHeaders ? `(${flow.requestHeaders.length})` : ""}
        </button>
        <button
          type="button"
          className={`postman-tab ${activeTab === "body" ? "postman-tab--active" : ""}`}
          onClick={() => setActiveTab("body")}
        >
          Body
        </button>
      </div>

      <div className="postman-tab-content">
        {activeTab === "params" && (
          <div className="postman-params-view">
            <p className="postman-muted">Query parameters will be shown here</p>
          </div>
        )}
        {activeTab === "headers" && <HeadersView headers={flow.requestHeaders} />}
        {activeTab === "body" && (
          <BodyView body={flow.requestBodyPreview} label="Request Body" />
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
  body: CapturedFlow["requestBodyPreview"];
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

function CurlCopyButton({ flow }: { flow: CapturedFlow }) {
  const [labelText, setLabelText] = useState("Copy cURL");
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await copyText(curlCommandForFlow(flow));
      setLabelText("Copied!");
      setFailed(false);
    } catch {
      setLabelText("Failed");
      setFailed(true);
    } finally {
      window.setTimeout(() => {
        setLabelText("Copy cURL");
        setFailed(false);
      }, 1200);
    }
  }

  return (
    <button
      className={`postman-btn postman-btn--secondary postman-btn--sm ${failed ? "postman-btn--error" : ""}`}
      type="button"
      onClick={() => void copy()}
    >
      <TerminalWindowIcon size={14} weight="bold" />
      {labelText}
    </button>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command failed");
  }
}
