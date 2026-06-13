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
  proxyAddress: document.querySelector("#proxyAddress"),
  certificateUrl: document.querySelector("#certificateUrl"),
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

    const proxyHost = status.proxy?.host || "unknown-host";
    const proxyPort = status.proxy?.port || "unknown-port";
    const certificateUrl = status.proxy?.certificateUrl || "http://mitm.it";
    const mitmRunning = Boolean(status.mitmproxy?.running);
    const mitmMessage = status.mitmproxy?.message;

    els.proxyAddress.textContent = `${proxyHost}:${proxyPort}`;
    els.certificateUrl.textContent = certificateUrl;
    els.statusLine.textContent = statusLineFor(mitmRunning, mitmMessage);
    els.statusLine.dataset.state = mitmRunning ? (state.paused ? "paused" : "running") : "error";
  } catch (error) {
    state.statusError = `Status unavailable: ${error.message}`;
    els.statusLine.textContent = "Dashboard API unavailable";
    els.statusLine.dataset.state = "error";
  } finally {
    renderControls();
    renderBanner();
  }
}

function statusLineFor(mitmRunning, mitmMessage) {
  if (mitmRunning && state.paused) {
    return "Capture paused";
  }
  if (mitmRunning) {
    return "Capturing traffic";
  }
  return mitmMessage ? `Proxy not running: ${mitmMessage}` : "Proxy not running";
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
    sectionTitle("Request Detail"),
    paragraph(`Loading ${id}...`, "muted")
  );
}

function renderDetails(flow) {
  const title = sectionTitle(`${flow.method || "UNKNOWN"} ${flow.host || ""}`);
  const url = paragraph(
    `${flow.scheme || "http"}://${hostWithPort(flow)}${flow.path || ""}`,
    "muted breakable"
  );
  const meta = document.createElement("dl");
  meta.className = "meta-grid";
  appendMeta(meta, "Device", flow.clientIp);
  appendMeta(meta, "Started", formatDateTime(flow.startedAt));
  appendMeta(
    meta,
    "Status",
    flow.statusCode === undefined ? "No response" : String(flow.statusCode)
  );
  appendMeta(meta, "Duration", formatDuration(flow.durationMs));
  appendMeta(meta, "Protocol", flow.protocol);
  appendMeta(meta, "TLS", flow.isTlsIntercepted ? "intercepted" : "passthrough");

  const nodes = [title, url, meta];
  if (flow.error) {
    nodes.push(paragraph(flow.error, "error"));
  }

  nodes.push(
    detailHeading("Request Headers"),
    renderHeaders(flow.requestHeaders),
    detailHeading("Request Body"),
    renderBody(flow.requestBodyPreview),
    detailHeading("Response Headers"),
    renderHeaders(flow.responseHeaders),
    detailHeading("Response Body"),
    renderBody(flow.responseBodyPreview)
  );

  els.details.replaceChildren(...nodes);
}

function renderEmptyDetails() {
  const wrapper = document.createElement("div");
  wrapper.className = "details__empty";
  wrapper.append(
    sectionTitle("Request Detail"),
    paragraph("Select a request to inspect headers, body previews, and capture errors.")
  );
  els.details.replaceChildren(wrapper);
}

function sectionTitle(text) {
  const title = document.createElement("h2");
  title.textContent = text;
  return title;
}

function detailHeading(text) {
  const heading = document.createElement("h3");
  heading.textContent = text;
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

function renderHeaders(headers) {
  if (!Array.isArray(headers) || headers.length === 0) {
    return paragraph("No headers captured.", "muted");
  }

  const headerText = headers.map(([name, value]) => `${name}: ${value}`).join("\n");
  return pre(headerText);
}

function renderBody(body) {
  if (!body || body.kind === "empty") {
    return paragraph("No body captured.", "muted");
  }

  const meta = [
    body.contentType,
    body.kind,
    `${body.sizeBytes} bytes`,
    body.truncated ? "truncated" : ""
  ].filter(Boolean);
  const text = meta.length ? `${meta.join(" | ")}\n\n${body.preview}` : body.preview;
  return pre(text);
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
