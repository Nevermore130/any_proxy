import { GlobeSimpleIcon } from "@phosphor-icons/react/dist/csr/GlobeSimple";
import { FolderIcon } from "@phosphor-icons/react/dist/csr/Folder";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { ChartLineIcon } from "@phosphor-icons/react/dist/csr/ChartLine";
import type { CapturedFlow } from "../types.js";

export type SidebarView = "traffic" | "insights";

type SidebarProps = {
  flows: CapturedFlow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeView: SidebarView;
  onSelectView: (view: SidebarView) => void;
};

export function Sidebar({
  flows,
  selectedId,
  onSelect,
  searchValue,
  onSearchChange,
  activeView,
  onSelectView
}: SidebarProps) {
  return (
    <div className="postman-sidebar">
      <div className="postman-sidebar__header">
        <input
          type="text"
          className="postman-search"
          placeholder="Search requests..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="postman-sidebar__nav">
        <div className="postman-sidebar__section">
          <button
            type="button"
            className={`postman-sidebar__section-header ${
              activeView === "insights" ? "postman-sidebar__section-header--active" : ""
            }`}
            onClick={() => onSelectView("insights")}
            data-testid="insights-nav"
          >
            <ChartLineIcon size={16} weight="bold" />
            <span>Insights</span>
          </button>
        </div>

        <div className="postman-sidebar__section">
          <button
            type="button"
            className={`postman-sidebar__section-header ${
              activeView === "traffic" ? "postman-sidebar__section-header--active" : ""
            }`}
            onClick={() => onSelectView("traffic")}
          >
            <GlobeSimpleIcon size={16} weight="bold" />
            <span>Captured Traffic</span>
            <span className="postman-badge">{flows.length}</span>
          </button>
          <div className="postman-sidebar__list">
            {flows.length === 0 ? (
              <div className="postman-sidebar__empty">
                <p>No requests captured yet</p>
              </div>
            ) : (
              flows.map((flow) => (
                <button
                  key={flow.id}
                  type="button"
                  className={`postman-sidebar__item ${selectedId === flow.id ? "postman-sidebar__item--active" : ""}`}
                  onClick={() => {
                    onSelectView("traffic");
                    onSelect(flow.id);
                  }}
                >
                  <div className="postman-sidebar__item-method">
                    <span className={`postman-method-badge postman-method-badge--${(flow.method || "GET").toLowerCase()}`}>
                      {flow.method || "GET"}
                    </span>
                  </div>
                  <div className="postman-sidebar__item-content">
                    <div className="postman-sidebar__item-path">{flow.path || "/"}</div>
                    <div className="postman-sidebar__item-meta">
                      <span
                        className={`postman-status-badge postman-status-badge--${getStatusClass(flow.statusCode, flow.error)}`}
                      >
                        {flow.statusCode === undefined
                          ? flow.error
                            ? "ERR"
                            : "..."
                          : String(flow.statusCode)}
                      </span>
                      <span className="postman-sidebar__item-time">
                        {formatTime(flow.startedAt)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="postman-sidebar__section">
          <div className="postman-sidebar__section-header">
            <FolderIcon size={16} weight="bold" />
            <span>Collections</span>
            <span className="postman-badge postman-badge--subtle">Soon</span>
          </div>
        </div>

        <div className="postman-sidebar__section">
          <div className="postman-sidebar__section-header">
            <ClockIcon size={16} weight="bold" />
            <span>History</span>
            <span className="postman-badge postman-badge--subtle">Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusClass(
  statusCode: number | undefined,
  error: string | undefined
): string {
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
