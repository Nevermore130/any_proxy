import { bodyCopyButtonState } from "./bodyActions.js";
import { detailTabButtonState } from "./detailTabs.js";
import { parseJsonBodyPreview, summarizeJsonValue } from "./jsonBody.js";

const state = {
  flows: [],
  selectedId: null,
  paused: false,
  flowsLoading: false,
  actionInFlight: false,
  statusError: null,
  flowsError: null,
  eventsError: null,
  eventsDisconnected: false
};

let latestFlowsRequestId = 0;

const els = {
  statusLine: document.querySelector("#statusLine"),
  relayAddress: document.querySelector("#relayAddress"),
  targetOrigin: document.querySelector("#targetOrigin"),
  pauseButton: document.querySelector("#pauseButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  apiBanner: document.querySelector("#apiBanner"),
  deviceFilter: document.querySelector("#deviceFilter"),
  hostFilter: document.querySelector("#hostFilter"),
  protocolFilter: document.querySelector("#protocolFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  tablePane: document.querySelector(".table-pane"),
  tableState: document.querySelector("#tableState"),
  flowRows: document.querySelector("#flowRows"),
  details: document.querySelector("#details")
};

const TEXT_FILTER_INPUTS = [
  els.deviceFilter,
  els.hostFilter
];

const SELECT_FILTER_INPUTS = [
  els.protocolFilter,
  els.statusFilter
];

function currentFilters() {
  return {
    deviceIp: els.deviceFilter.value.trim(),
    host: els.hostFilter.value.trim(),
    protocol: els.protocolFilter.value,
    statusClass: els.statusFilter.value
  };
}

function filtersToParams(filters = currentFilters()) {
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

async function loadStatus() {
  try {
    const status = await fetchJson("/api/status");
    state.statusError = null;
    state.paused = Boolean(status.capture?.paused);

    const relayUrl = status.relay?.rela?.baseUrl || "/relay/rela";
    const targetOrigin = status.relay?.rela?.targetOrigin || "unknown";

    els.relayAddress.textContent = relayUrl;
    els.targetOrigin.textContent = targetOrigin;
    els.statusLine.textContent = statusLineFor();
    els.statusLine.dataset.state = state.paused ? "paused" : "running";
  } catch (error) {
    state.statusError = `Status unavailable: ${error.message}`;
    els.statusLine.textContent = "Dashboard API unavailable";
    els.statusLine.dataset.state = "error";
  } finally {
    renderControls();
    renderBanner();
  }
}

function statusLineFor() {
  if (state.paused) {
    return "Capture paused";
  }
  return "Capturing relay traffic";
}

async function loadFlows() {
  const requestId = ++latestFlowsRequestId;
  state.flowsLoading = true;
  state.flowsError = null;
  renderTableState();
  renderControls();

  try {
    const params = filtersToParams();
    const query = params.toString();
    const data = await fetchJson(query ? `/api/flows?${query}` : "/api/flows");
    if (!isLatestFlowsRequest(requestId)) {
      return;
    }

    state.flows = Array.isArray(data.flows) ? data.flows : [];

    if (state.selectedId && !state.flows.some((flow) => flow.id === state.selectedId)) {
      state.selectedId = null;
      renderEmptyDetails();
    }
  } catch (error) {
    if (!isLatestFlowsRequest(requestId)) {
      return;
    }

    state.flowsError = `Could not load requests: ${error.message}`;
    state.flows = [];
  } finally {
    if (!isLatestFlowsRequest(requestId)) {
      return;
    }

    state.flowsLoading = false;
    renderRows();
    renderTableState();
    renderBanner();
    updateExportUrl();
    renderControls();
  }
}

function isLatestFlowsRequest(requestId) {
  return requestId === latestFlowsRequestId;
}

function renderRows() {
  const fragment = document.createDocumentFragment();

  for (const flow of state.flows) {
    const row = document.createElement("tr");
    row.className = flow.id === state.selectedId ? "selected" : "";
    row.tabIndex = 0;
    row.dataset.flowId = flow.id;
    row.append(
      cell(formatTime(flow.startedAt), "time"),
      cell(flow.clientIp, "mono"),
      methodCell(flow.method),
      cell(flow.host, "clip"),
      cell(flow.path, "path"),
      statusCell(flow.statusCode, flow.error),
      cell(formatDuration(flow.durationMs), "mono"),
      protocolCell(flow.protocol)
    );

    row.addEventListener("click", () => {
      showDetails(flow.id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showDetails(flow.id);
      }
    });

    fragment.append(row);
  }

  els.flowRows.replaceChildren(fragment);
}

function cell(value, className = "") {
  const element = document.createElement("td");
  if (className) {
    element.className = className;
  }
  element.textContent = value;
  return element;
}

function methodCell(method) {
  const element = cell("", "method-cell");
  const pill = document.createElement("span");
  pill.className = "method";
  pill.textContent = method || "UNKNOWN";
  element.append(pill);
  return element;
}

function protocolCell(protocol) {
  const element = cell("", "protocol-cell");
  const pill = document.createElement("span");
  pill.className = `protocol protocol--${safeToken(protocol)}`;
  pill.textContent = protocol || "unknown";
  element.append(pill);
  return element;
}

function statusCell(statusCode, error) {
  const element = cell("", "status-cell");
  const badge = document.createElement("span");
  badge.className = `status-badge status-badge--${statusClass(statusCode, error)}`;
  badge.textContent = statusCode === undefined ? (error ? "ERR" : "...") : String(statusCode);
  element.append(badge);
  return element;
}

function renderTableState() {
  els.tablePane.setAttribute("aria-busy", state.flowsLoading ? "true" : "false");

  if (state.flowsLoading) {
    els.tableState.hidden = false;
    els.tableState.textContent = "Loading requests...";
    return;
  }

  if (state.flowsError) {
    els.tableState.hidden = false;
    els.tableState.textContent = state.flowsError;
    return;
  }

  if (state.flows.length === 0) {
    els.tableState.hidden = false;
    els.tableState.textContent = filtersAreActive()
      ? "No requests match the current filters."
      : "No requests captured yet.";
    return;
  }

  els.tableState.hidden = true;
}

async function showDetails(id) {
  state.selectedId = id;
  renderRows();
  renderDetailsLoading(id);

  try {
    const data = await fetchJson(`/api/flows/${encodeURIComponent(id)}`);
    if (state.selectedId !== id) {
      return;
    }

    renderDetails(data.flow);
  } catch (error) {
    if (state.selectedId !== id) {
      return;
    }

    els.details.replaceChildren(
      sectionTitle("Request Detail"),
      paragraph(`Could not load flow ${id}: ${error.message}`, "error")
    );
  }
}

function renderDetailsLoading(id) {
  els.details.replaceChildren(
    sectionTitle("Request Detail", "details-title"),
    paragraph(`Loading ${id}...`, "muted detail-loading")
  );
}

function renderDetails(flow) {
  const title = sectionTitle(`${flow.method || "UNKNOWN"} ${flow.host || ""}`, "details-title");
  const url = paragraph(
    `${flow.scheme || "http"}://${hostWithPort(flow)}${flow.path || ""}`,
    "muted breakable request-url"
  );

  const tabShell = renderDetailTabs(flow);
  const nodes = [title, url, tabShell];
  if (flow.error) {
    tabShell
      .querySelector('[data-detail-panel="response"]')
      ?.prepend(paragraph(flow.error, "error"));
  }

  els.details.replaceChildren(...nodes);
}

function renderDetailTabs(flow) {
  const shell = document.createElement("div");
  shell.className = "detail-tab-shell";

  const tabList = document.createElement("div");
  tabList.className = "detail-tab-list";
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Request detail sections");

  const panels = {
    request: renderRequestPanel(flow),
    response: renderResponsePanel(flow)
  };

  const setActiveTab = (activeTab) => {
    for (const tab of detailTabButtonState(activeTab)) {
      const button = tabList.querySelector(`#${tab.tabId}`);
      const panel = panels[tab.id];
      button?.setAttribute("aria-selected", String(tab.selected));
      button?.setAttribute("tabindex", tab.selected ? "0" : "-1");
      if (panel) {
        panel.hidden = !tab.selected;
      }
    }
  };

  for (const tab of detailTabButtonState("request")) {
    const button = document.createElement("button");
    button.id = tab.tabId;
    button.className = "detail-tab";
    button.type = "button";
    button.setAttribute("role", "tab");
    button.textContent = tab.label;
    button.setAttribute("aria-controls", tab.panelId);
    button.addEventListener("click", () => setActiveTab(tab.id));
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setActiveTab(tab.id === "request" ? "response" : "request");
      }
    });
    tabList.append(button);
  }

  shell.append(tabList, panels.request, panels.response);
  setActiveTab("request");
  return shell;
}

function renderRequestPanel(flow) {
  const panel = detailPanel("request");
  const meta = document.createElement("dl");
  meta.className = "meta-grid";
  appendMeta(meta, "Device", flow.clientIp);
  appendMeta(meta, "Started", formatDateTime(flow.startedAt));
  appendMeta(meta, "Method", flow.method || "UNKNOWN");
  appendMeta(meta, "Protocol", flow.protocol);

  panel.append(
    meta,
    detailHeading("Headers"),
    renderHeaders(flow.requestHeaders, "Request Headers"),
    detailHeading("Body", createBodyCopyButton(flow.requestBodyPreview, "Request Body")),
    renderBody(flow.requestBodyPreview, "Request Body")
  );
  return panel;
}

function renderResponsePanel(flow) {
  const panel = detailPanel("response");
  const meta = document.createElement("dl");
  meta.className = "meta-grid";
  appendMeta(
    meta,
    "Status",
    flow.statusCode === undefined ? "No response" : String(flow.statusCode)
  );
  appendMeta(meta, "Duration", formatDuration(flow.durationMs));
  appendMeta(meta, "TLS", flow.isTlsIntercepted ? "intercepted" : "passthrough");
  appendMeta(meta, "Host", hostWithPort(flow));

  panel.append(
    meta,
    detailHeading("Headers"),
    renderHeaders(flow.responseHeaders, "Response Headers"),
    detailHeading("Body", createBodyCopyButton(flow.responseBodyPreview, "Response Body")),
    renderBody(flow.responseBodyPreview, "Response Body")
  );
  return panel;
}

function detailPanel(id) {
  const panel = document.createElement("section");
  panel.id = `detail-panel-${id}`;
  panel.className = "detail-tab-panel";
  panel.dataset.detailPanel = id;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", `detail-tab-${id}`);
  return panel;
}

function renderEmptyDetails() {
  const wrapper = document.createElement("div");
  wrapper.className = "details__empty";
  wrapper.append(
    sectionTitle("Request Detail", "details-title"),
    paragraph("Select a request to inspect headers, body previews, and capture errors.")
  );
  els.details.replaceChildren(wrapper);
}

function sectionTitle(text, className = "") {
  const title = document.createElement("h2");
  if (className) {
    title.className = className;
  }
  title.textContent = text;
  return title;
}

function detailHeading(text, action = null) {
  const heading = document.createElement("div");
  heading.className = "detail-heading";

  const title = document.createElement("h3");
  title.textContent = text;
  heading.append(title);

  if (action) {
    heading.append(action);
  }

  return heading;
}

function paragraph(text, className = "") {
  const element = document.createElement("p");
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function renderHeaders(headers, label = "Headers") {
  if (!Array.isArray(headers) || headers.length === 0) {
    return paragraph(`No ${label.toLowerCase()} captured.`, "muted detail-empty-line");
  }

  const wrapper = document.createElement("div");
  wrapper.className = "header-viewer";

  const meta = document.createElement("div");
  meta.className = "header-viewer__meta";
  meta.textContent = `${headers.length} ${headers.length === 1 ? "header" : "headers"}`;

  const list = document.createElement("div");
  list.className = "header-list";

  for (const [name, value] of headers) {
    const row = document.createElement("div");
    row.className = "header-row";

    const key = document.createElement("span");
    key.className = "header-name";
    key.textContent = name;

    const headerValue = document.createElement("span");
    headerValue.className = "header-value";
    headerValue.textContent = value;

    row.append(key, headerValue);
    list.append(row);
  }

  wrapper.append(meta, list);
  return wrapper;
}

function renderBody(body, label = "Body") {
  if (!body || body.kind === "empty") {
    return paragraph(`No ${label.toLowerCase()} captured.`, "muted detail-empty-line");
  }

  const json = parseJsonBodyPreview(body);
  if (json.ok) {
    return renderJsonBody(json.value, body);
  }

  const meta = [
    body.contentType,
    body.kind,
    `${body.sizeBytes} bytes`,
    body.truncated ? "truncated" : ""
  ].filter(Boolean);
  const text = meta.length ? `${meta.join(" | ")}\n\n${body.preview}` : body.preview;
  return renderRawBody(text, body);
}

function createBodyCopyButton(body, label) {
  const state = bodyCopyButtonState(body, label);
  if (!state.enabled) {
    return null;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "body-copy-button";
  button.textContent = state.idleLabel;
  button.setAttribute("aria-label", state.ariaLabel);
  button.title = state.ariaLabel;

  button.addEventListener("click", async () => {
    try {
      await copyText(state.text);
      showCopyState(button, state.successLabel);
    } catch {
      showCopyState(button, state.failedLabel, true);
    }
  });

  return button;
}

async function copyText(text) {
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

function showCopyState(button, label, isError = false) {
  button.textContent = label;
  button.classList.toggle("is-error", isError);
  window.clearTimeout(button.copyStateTimer);
  button.copyStateTimer = window.setTimeout(() => {
    button.textContent = "Copy";
    button.classList.remove("is-error");
  }, 1200);
}

function renderJsonBody(value, body) {
  const wrapper = document.createElement("div");
  wrapper.className = "body-viewer json-viewer";

  const meta = document.createElement("div");
  meta.className = "body-viewer__meta";
  meta.textContent = bodyMetaText(body, "JSON");

  const tree = document.createElement("div");
  tree.className = "json-tree";
  tree.append(renderJsonRoot(value));

  wrapper.append(meta, tree);
  return wrapper;
}

function renderJsonRoot(value) {
  const root = document.createElement("div");
  root.className = "json-root";

  if (!isExpandableJsonValue(value)) {
    root.append(renderJsonLeaf("", value));
    return root;
  }

  root.append(jsonBracket(Array.isArray(value) ? "[" : "{"));
  const children = document.createElement("div");
  children.className = "json-children";
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [childKey, childValue] of entries) {
    children.append(renderJsonNode(String(childKey), childValue, 1));
  }
  root.append(children, jsonBracket(Array.isArray(value) ? "]" : "}"));
  return root;
}

function renderRawBody(text, body) {
  const wrapper = document.createElement("div");
  wrapper.className = "body-viewer raw-body-viewer";

  const meta = document.createElement("div");
  meta.className = "body-viewer__meta";
  meta.textContent = bodyMetaText(body, body.kind || "text");

  const content = pre(text);
  content.className = "raw-body";

  wrapper.append(meta, content);
  return wrapper;
}

function renderJsonNode(key, value, depth) {
  if (!isExpandableJsonValue(value)) {
    return renderJsonLeaf(key, value);
  }

  const details = document.createElement("details");
  details.className = "json-node";
  details.open = depth === 0;

  const summary = document.createElement("summary");
  summary.append(jsonKey(key), jsonSummary(value));

  const children = document.createElement("div");
  children.className = "json-children";

  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [childKey, childValue] of entries) {
    children.append(renderJsonNode(String(childKey), childValue, depth + 1));
  }

  details.append(summary, children);
  return details;
}

function renderJsonLeaf(key, value) {
  const row = document.createElement("div");
  row.className = "json-leaf";

  const renderedValue = document.createElement("span");
  renderedValue.className = `json-value json-value--${jsonPrimitiveClass(value)}`;
  renderedValue.textContent = summarizeJsonValue(value);

  if (key) {
    row.append(jsonKey(key), renderedValue);
  } else {
    row.append(renderedValue);
  }
  return row;
}

function jsonKey(key) {
  const element = document.createElement("span");
  element.className = "json-key";
  element.textContent = key;
  return element;
}

function jsonBracket(value) {
  const element = document.createElement("div");
  element.className = "json-bracket";
  element.textContent = value;
  return element;
}

function jsonSummary(value) {
  const element = document.createElement("span");
  element.className = "json-summary";
  element.textContent = summarizeJsonValue(value);
  return element;
}

function isExpandableJsonValue(value) {
  return Boolean(value && typeof value === "object");
}

function jsonPrimitiveClass(value) {
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function bodyMetaText(body, format) {
  const meta = [
    body.contentType,
    format,
    `${body.sizeBytes} bytes`,
    body.truncated ? "truncated" : ""
  ].filter(Boolean);
  return meta.join(" | ");
}

function pre(text) {
  const element = document.createElement("pre");
  element.textContent = text;
  return element;
}

function appendMeta(list, label, value) {
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value || "-";
  list.append(term, description);
}

function connectEvents() {
  const events = new EventSource("/api/events");

  events.onopen = () => {
    const shouldResync = state.eventsDisconnected;
    state.eventsDisconnected = false;
    state.eventsError = null;
    renderBanner();
    if (shouldResync) {
      loadFlows();
    }
  };

  events.onerror = () => {
    state.eventsDisconnected = true;
    state.eventsError = "Live updates disconnected; retrying in the background.";
    renderBanner();
  };

  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "clear") {
        state.flows = [];
        state.selectedId = null;
        renderRows();
        renderTableState();
        renderEmptyDetails();
        return;
      }

      if (payload.type === "flow" && payload.flow) {
        upsertFlow(payload.flow);
      }
    } catch (error) {
      state.eventsError = `Live update parse error: ${error.message}`;
      renderBanner();
    }
  };
}

function upsertFlow(flow) {
  const index = state.flows.findIndex((item) => item.id === flow.id);
  const matches = flowMatchesFilters(flow, currentFilters());

  if (index >= 0 && matches) {
    state.flows[index] = flow;
  } else if (index >= 0) {
    state.flows.splice(index, 1);
    if (state.selectedId === flow.id) {
      state.selectedId = null;
      renderEmptyDetails();
    }
  } else if (matches) {
    state.flows.unshift(flow);
  }

  renderRows();
  renderTableState();
}

function flowMatchesFilters(flow, filters) {
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
    return String(flow.statusCode).startsWith(filters.statusClass[0]);
  }

  return true;
}

async function togglePause() {
  const url = state.paused ? "/api/capture/resume" : "/api/capture/pause";
  await runAction(async () => {
    await fetchJson(url, { method: "POST" });
    await loadStatus();
  });
}

async function clearFlows() {
  await runAction(async () => {
    await fetchJson("/api/flows/clear", { method: "POST" });
    state.flows = [];
    state.selectedId = null;
    renderRows();
    renderTableState();
    renderEmptyDetails();
  });
}

async function runAction(action) {
  state.actionInFlight = true;
  renderControls();
  state.flowsError = null;

  try {
    await action();
  } catch (error) {
    state.flowsError = error.message;
    renderBanner();
  } finally {
    state.actionInFlight = false;
    renderControls();
    renderBanner();
  }
}

function renderControls() {
  els.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  els.pauseButton.disabled = state.actionInFlight;
  els.clearButton.disabled = state.actionInFlight || state.flowsLoading;
}

function renderBanner() {
  const messages = [state.statusError, state.flowsError, state.eventsError].filter(Boolean);
  els.apiBanner.hidden = messages.length === 0;
  els.apiBanner.textContent = messages.join(" ");
}

function updateExportUrl() {
  const params = filtersToParams();
  const query = params.toString();
  els.exportButton.href = query ? `/api/export?${query}` : "/api/export";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

function filtersAreActive() {
  const filters = currentFilters();
  return Boolean(
    filters.deviceIp ||
      filters.host ||
      filters.protocol !== "all" ||
      filters.statusClass !== "all"
  );
}

function statusClass(statusCode, error) {
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

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatDuration(value) {
  if (value === undefined || value === null) {
    return "...";
  }
  return `${value} ms`;
}

function hostWithPort(flow) {
  if (!flow.port) {
    return flow.host || "";
  }
  const defaultPort =
    (flow.scheme === "https" && flow.port === 443) || (flow.scheme === "http" && flow.port === 80);
  return defaultPort ? flow.host : `${flow.host}:${flow.port}`;
}

function safeToken(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "unknown";
}

function debounce(fn, waitMs) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), waitMs);
  };
}

const reloadFlows = debounce(loadFlows, 150);

for (const input of TEXT_FILTER_INPUTS) {
  input.addEventListener("input", () => {
    updateExportUrl();
    reloadFlows();
  });
}

for (const input of SELECT_FILTER_INPUTS) {
  input.addEventListener("change", () => {
    updateExportUrl();
    loadFlows();
  });
}

els.pauseButton.addEventListener("click", togglePause);
els.clearButton.addEventListener("click", clearFlows);

updateExportUrl();
renderControls();
renderTableState();
loadStatus();
loadFlows();
connectEvents();
window.setInterval(loadStatus, 3000);
