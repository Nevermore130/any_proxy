import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { DeviceMobileIcon } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { FolderIcon } from "@phosphor-icons/react/dist/csr/Folder";
import type { CaptureProject, StatusResponse } from "../types.js";

type TopBarProps = {
  status: StatusResponse | null;
  paused: boolean;
  actionInFlight: boolean;
  rulesCount: number;
  projects: CaptureProject[];
  selectedProjectId: string;
  exportUrl: string;
  onTogglePause: () => void;
  onClearFlows: () => void;
  onShowRules: () => void;
  onShowBindDevice: () => void;
  onShowProjects: () => void;
  onProjectChange: (projectId: string) => void;
};

export function TopBar({
  status,
  paused,
  actionInFlight,
  rulesCount,
  projects,
  selectedProjectId,
  exportUrl,
  onTogglePause,
  onClearFlows,
  onShowRules,
  onShowBindDevice,
  onShowProjects,
  onProjectChange
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
          <select
            className="postman-select postman-select--project"
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            title={captureSessionId ? `Session: ${captureSessionId}` : "Capture project"}
          >
            {projects.length === 0 ? (
              <option value={selectedProjectId}>热拉</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="postman-topbar__right">
        <button
          className="postman-btn postman-btn--secondary"
          type="button"
          onClick={onShowProjects}
          title="管理抓包项目"
        >
          <FolderIcon size={16} weight="bold" />
          Projects
        </button>
        <button
          className="postman-btn postman-btn--secondary postman-btn--bind"
          type="button"
          onClick={onShowBindDevice}
          title="绑定设备 - 扫描二维码连接 Rela App"
        >
          <DeviceMobileIcon size={16} weight="bold" />
          绑定设备
        </button>
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
