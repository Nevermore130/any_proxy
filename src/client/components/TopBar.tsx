import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import type { StatusResponse } from "../types.js";

type TopBarProps = {
  status: StatusResponse | null;
  paused: boolean;
  actionInFlight: boolean;
  rulesCount: number;
  exportUrl: string;
  onTogglePause: () => void;
  onClearFlows: () => void;
  onShowRules: () => void;
};

export function TopBar({
  status,
  paused,
  actionInFlight,
  rulesCount,
  exportUrl,
  onTogglePause,
  onClearFlows,
  onShowRules
}: TopBarProps) {
  const captureSessionId = status?.session?.id || "";

  return (
    <div className="postman-topbar">
      <div className="postman-topbar__left">
        <div className="postman-logo">
          <div className="postman-logo__icon">RC</div>
          <span className="postman-logo__text">Rela Capture</span>
        </div>
        <div className="postman-topbar__divider" />
        <div className="postman-topbar__environment">
          <select className="postman-select">
            <option>No Environment</option>
            {captureSessionId && (
              <option value={captureSessionId}>
                Session: {captureSessionId.slice(0, 8)}...
              </option>
            )}
          </select>
        </div>
      </div>

      <div className="postman-topbar__right">
        <button
          className="postman-btn postman-btn--secondary"
          type="button"
          data-tour="rules-button"
          onClick={onShowRules}
        >
          <GearIcon size={16} weight="bold" />
          Rules {rulesCount > 0 && `(${rulesCount})`}
        </button>
        <button
          className="postman-btn postman-btn--secondary"
          type="button"
          disabled={actionInFlight}
          onClick={onTogglePause}
        >
          {paused ? <PlayIcon size={16} weight="bold" /> : <PauseIcon size={16} weight="bold" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          className="postman-btn postman-btn--secondary"
          type="button"
          disabled={actionInFlight}
          onClick={onClearFlows}
        >
          <TrashIcon size={16} weight="bold" />
          Clear
        </button>
        <a className="postman-btn postman-btn--primary" href={exportUrl}>
          <DownloadSimpleIcon size={16} weight="bold" />
          Export
        </a>
      </div>
    </div>
  );
}
