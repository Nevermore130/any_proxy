import { useState } from "react";
import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import type { CapturedFlow } from "../types.js";
import { curlCommandForFlow, flowRequestUrl } from "../lib/curlCommand.js";
import { parseJsonBodyPreview } from "../lib/jsonBody.js";
import { bodyCopyText } from "../lib/bodyActions.js";
import {
  defaultRequestPaneTab,
  isFormUrlEncodedBody,
  parseQueryString,
  queryStringFromFlow,
  shouldHideRequestBody,
  type QueryParam,
  type RequestPaneTabId
} from "../lib/queryParams.js";

type RequestPaneProps = {
  flow: CapturedFlow | null;
  onCreateRule?: (flow: CapturedFlow) => void;
};

export function RequestPane({ flow, onCreateRule }: RequestPaneProps) {
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

  return <RequestPaneContent key={flow.id} flow={flow} onCreateRule={onCreateRule} />;
}

function RequestPaneContent({
  flow,
  onCreateRule
}: {
  flow: CapturedFlow;
  onCreateRule?: (flow: CapturedFlow) => void;
}) {
  const requestUrl = flowRequestUrl(flow);
  const rawQuery = queryStringFromFlow(flow);
  const queryParams = parseQueryString(rawQuery);
  const [activeTab, setActiveTab] = useState<RequestPaneTabId>(() =>
    defaultRequestPaneTab(queryParams.length)
  );

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
          Params ({queryParams.length})
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
          <EncodedPairView
            emptyMessage="This request has no query parameters"
            pairs={queryParams}
            raw={rawQuery}
            rawLabel="Raw"
          />
        )}
        {activeTab === "headers" && <HeadersView headers={flow.requestHeaders} />}
        {activeTab === "body" && (
          <BodyView
            body={flow.requestBodyPreview}
            label="Request Body"
            method={flow.method}
            queryString={rawQuery}
          />
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
    <KeyValueTable
      rows={headers.map(([name, value]) => ({
        key: name,
        title: `${name}: ${value}`,
        value
      }))}
    />
  );
}

function BodyView({
  body,
  label,
  method,
  queryString
}: {
  body: CapturedFlow["requestBodyPreview"];
  label: string;
  method?: string;
  queryString: string;
}) {
  if (shouldHideRequestBody(method, body, queryString)) {
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

  if (isFormUrlEncodedBody(body, rawText)) {
    return (
      <EncodedPairView
        emptyMessage={`No ${label.toLowerCase()} captured`}
        pairs={parseQueryString(rawText)}
        raw={rawText.replace(/^\?/, "")}
        rawLabel="Raw"
      />
    );
  }

  return (
    <div className="postman-body-viewer">
      <pre className="postman-code-block">{rawText}</pre>
    </div>
  );
}

function EncodedPairView({
  emptyMessage,
  pairs,
  raw,
  rawLabel
}: {
  emptyMessage: string;
  pairs: QueryParam[];
  raw: string;
  rawLabel: string;
}) {
  if (pairs.length === 0 && !raw) {
    return <p className="postman-muted">{emptyMessage}</p>;
  }

  return (
    <div className="postman-kv-view">
      {pairs.length > 0 ? (
        <KeyValueTable
          rows={pairs.map((param, index) => ({
            key: param.key,
            title: `${param.rawKey}=${param.rawValue}`,
            value: param.value,
            wrap: true,
            rowKey: `${param.rawKey}:${param.rawValue}:${index}`
          }))}
        />
      ) : (
        <p className="postman-muted">{emptyMessage}</p>
      )}
      {raw ? <RawStringView label={rawLabel} text={raw} /> : null}
    </div>
  );
}

function KeyValueTable({
  rows
}: {
  rows: Array<{ key: string; rowKey?: string; title?: string; value: string; wrap?: boolean }>;
}) {
  return (
    <div className="postman-headers-table">
      <div className="postman-headers-row postman-headers-row--header">
        <div className="postman-headers-cell">Key</div>
        <div className="postman-headers-cell">Value</div>
      </div>
      {rows.map((row, index) => (
        <div key={row.rowKey ?? `${row.key}:${row.value}:${index}`} className="postman-headers-row">
          <div className="postman-headers-cell postman-headers-cell--key" title={row.title || row.key}>
            {row.key}
          </div>
          <div
            className={`postman-headers-cell postman-headers-cell--value${row.wrap ? " postman-headers-cell--wrap" : ""}`}
            title={row.title || row.value}
          >
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RawStringView({ label, text }: { label: string; text: string }) {
  return (
    <div className="postman-raw-block">
      <div className="postman-raw-block__header">
        <div className="postman-raw-block__title">{label}</div>
        <CopyTextButton text={text} />
      </div>
      <pre className="postman-code-block">{text}</pre>
    </div>
  );
}

function CopyTextButton({ text }: { text: string }) {
  const [labelText, setLabelText] = useState("Copy");
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await copyText(text);
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
      className={`postman-btn postman-btn--secondary postman-btn--sm ${failed ? "postman-btn--error" : ""}`}
      type="button"
      onClick={() => void copy()}
      disabled={!text}
    >
      <CopySimpleIcon size={14} weight="bold" />
      {labelText}
    </button>
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
