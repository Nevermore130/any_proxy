import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import type { CaptureProject, StatusResponse } from "../types.js";

type BindDeviceModalProps = {
  project: CaptureProject | null;
  status: StatusResponse | null;
  onClose: () => void;
};

export function BindDeviceModal({ project, status, onClose }: BindDeviceModalProps) {
  const [copiedRelay, setCopiedRelay] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);

  const captureSessionId = status?.session?.id || "";
  const relayBaseUrl = project?.relayBaseUrl || status?.relay?.rela?.baseUrl || "";
  const projectType = project?.type || status?.session?.qrPayload?.type || "";
  const sessionQrUrl = captureSessionId && project
    ? `/api/session/qr.svg?projectId=${encodeURIComponent(project.id)}`
    : "";

  async function copyToClipboard(text: string, type: "relay" | "session") {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "relay") {
        setCopiedRelay(true);
        setTimeout(() => setCopiedRelay(false), 2000);
      } else {
        setCopiedSession(true);
        setTimeout(() => setCopiedSession(false), 2000);
      }
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  return (
    <div className="bind-device-overlay" onClick={onClose}>
      <div className="bind-device-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bind-device-header">
          <h2>绑定设备</h2>
          <button
            className="bind-device-close"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            <XIcon size={20} weight="bold" />
          </button>
        </div>

        <div className="bind-device-body">
          {sessionQrUrl ? (
            <>
              <div className="bind-device-qr">
                <img alt="设备绑定二维码" src={sessionQrUrl} />
              </div>

              <div className="bind-device-steps">
                <h3>{project?.name || "当前项目"} 绑定</h3>
                <ol>
                  <li>打开 Rela App 调试设置</li>
                  <li>扫描上方二维码，App 会读取项目 type 与 Relay URL</li>
                  <li>App 发送的请求将出现在左侧「Captured Traffic」列表中</li>
                </ol>
              </div>

              <div className="bind-device-info">
                <div className="bind-device-field">
                  <label>Relay Base URL</label>
                  <div className="bind-device-input-group">
                    <input
                      type="text"
                      value={relayBaseUrl}
                      readOnly
                      className="bind-device-input"
                    />
                    <button
                      className="bind-device-copy-btn"
                      type="button"
                      onClick={() => copyToClipboard(relayBaseUrl, "relay")}
                    >
                      {copiedRelay ? (
                        <>
                          <CheckIcon size={14} weight="bold" />
                          已复制
                        </>
                      ) : (
                        <>
                          <CopySimpleIcon size={14} weight="bold" />
                          复制
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bind-device-field">
                  <label>Project Type</label>
                  <div className="bind-device-input-group">
                    <input
                      type="text"
                      value={projectType}
                      readOnly
                      className="bind-device-input"
                    />
                  </div>
                </div>

                <div className="bind-device-field">
                  <label>Session ID</label>
                  <div className="bind-device-input-group">
                    <input
                      type="text"
                      value={captureSessionId}
                      readOnly
                      className="bind-device-input"
                    />
                    <button
                      className="bind-device-copy-btn"
                      type="button"
                      onClick={() => copyToClipboard(captureSessionId, "session")}
                    >
                      {copiedSession ? (
                        <>
                          <CheckIcon size={14} weight="bold" />
                          已复制
                        </>
                      ) : (
                        <>
                          <CopySimpleIcon size={14} weight="bold" />
                          复制
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bind-device-loading">
              <p>正在加载会话信息...</p>
            </div>
          )}
        </div>

        <div className="bind-device-footer">
          <button className="button button--primary" type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
