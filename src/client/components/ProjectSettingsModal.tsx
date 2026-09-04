import { useState } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CopySimpleIcon } from "@phosphor-icons/react/dist/csr/CopySimple";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import type { CaptureProject } from "../types.js";

type ProjectSettingsModalProps = {
  projects: CaptureProject[];
  onClose: () => void;
  onProjectsChange: () => void;
};

type ProjectDraft = {
  id?: string;
  name: string;
  type: string;
  enabled: boolean;
  targetOrigin: string;
  allowedHosts: string;
  sessionHeaderName: string;
  originalHostHeaderName: string;
  builtIn?: boolean;
};

export function ProjectSettingsModal({
  projects,
  onClose,
  onProjectsChange
}: ProjectSettingsModalProps) {
  const [editing, setEditing] = useState<ProjectDraft | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);

  async function copyRelayUrl(project: CaptureProject) {
    try {
      await navigator.clipboard.writeText(project.relayBaseUrl);
      setCopiedProjectId(project.id);
      window.setTimeout(() => setCopiedProjectId(null), 1600);
    } catch (error) {
      console.error("Failed to copy relay URL:", error);
    }
  }

  async function deleteProject(project: CaptureProject) {
    if (project.builtIn || !confirm(`Delete project "${project.name}"?`)) {
      return;
    }

    try {
      await fetchJson(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE"
      });
      onProjectsChange();
    } catch (error) {
      alert(`Failed to delete project: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="project-modal-overlay" onClick={onClose}>
      <div className="project-modal" onClick={(event) => event.stopPropagation()}>
        <div className="project-modal__header">
          <div>
            <h2>Projects</h2>
            <p>Manage capture projects by QR payload type.</p>
          </div>
          <div className="project-modal__header-actions">
            <button
              className="tool-button"
              type="button"
              onClick={() => setEditing(createEmptyDraft())}
            >
              <PlusIcon size={15} weight="bold" />
              New Project
            </button>
            <button className="tool-button" type="button" onClick={onClose}>
              <XIcon size={15} weight="bold" />
              Close
            </button>
          </div>
        </div>

        {editing ? (
          <ProjectEditor
            draft={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onProjectsChange();
            }}
          />
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <div
                className={`project-card ${project.enabled ? "" : "project-card--disabled"}`}
                key={project.id}
              >
                <div className="project-card__main">
                  <div className="project-card__title-row">
                    <strong>{project.name}</strong>
                    {project.builtIn && <span className="project-chip">Default</span>}
                    {!project.enabled && <span className="project-chip project-chip--muted">Off</span>}
                  </div>
                  <div className="project-card__meta">
                    <span>{project.type}</span>
                    <span>{project.targetOrigin}</span>
                  </div>
                  <code className="project-card__relay">{project.relayBaseUrl}</code>
                  <div className="project-card__hosts">
                    {project.allowedHosts.length === 0
                      ? "No host allowlist"
                      : project.allowedHosts.join(", ")}
                  </div>
                </div>
                <div className="project-card__actions">
                  <button
                    className="icon-button"
                    title="Copy relay URL"
                    type="button"
                    onClick={() => void copyRelayUrl(project)}
                  >
                    {copiedProjectId === project.id ? (
                      <CheckIcon size={15} weight="bold" />
                    ) : (
                      <CopySimpleIcon size={15} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    title="Edit project"
                    type="button"
                    onClick={() => setEditing(projectToDraft(project))}
                  >
                    <PencilSimpleIcon size={15} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={project.builtIn}
                    title={project.builtIn ? "Default project cannot be deleted" : "Delete project"}
                    type="button"
                    onClick={() => void deleteProject(project)}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectEditor({
  draft,
  onCancel,
  onSaved
}: {
  draft: ProjectDraft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [type, setType] = useState(draft.type);
  const [enabled, setEnabled] = useState(draft.enabled);
  const [targetOrigin, setTargetOrigin] = useState(draft.targetOrigin);
  const [allowedHosts, setAllowedHosts] = useState(draft.allowedHosts);
  const [sessionHeaderName, setSessionHeaderName] = useState(draft.sessionHeaderName);
  const [originalHostHeaderName, setOriginalHostHeaderName] = useState(
    draft.originalHostHeaderName
  );
  const [saving, setSaving] = useState(false);

  async function saveProject() {
    setSaving(true);
    try {
      const body = {
        name,
        type,
        enabled,
        targetOrigin,
        allowedHosts: allowedHosts
          .split(/[\n,]/g)
          .map((host) => host.trim())
          .filter(Boolean),
        sessionHeaderName,
        originalHostHeaderName
      };

      if (draft.id) {
        await fetchJson(`/api/projects/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        await fetchJson("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }

      onSaved();
    } catch (error) {
      alert(`Failed to save project: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="project-editor">
      <div className="project-editor__grid">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Type</span>
          <input
            value={type}
            disabled={draft.builtIn}
            onChange={(event) => setType(event.target.value)}
            placeholder="my_app_capture_session"
          />
        </label>
        <label>
          <span>Target Origin</span>
          <input
            value={targetOrigin}
            onChange={(event) => setTargetOrigin(event.target.value)}
            placeholder="https://api.example.com"
          />
        </label>
        <label>
          <span>Session Header</span>
          <input
            value={sessionHeaderName}
            onChange={(event) => setSessionHeaderName(event.target.value)}
          />
        </label>
        <label>
          <span>Original Host Header</span>
          <input
            value={originalHostHeaderName}
            onChange={(event) => setOriginalHostHeaderName(event.target.value)}
          />
        </label>
        <label className="project-editor__switch">
          <input
            checked={enabled}
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>Enabled</span>
        </label>
      </div>
      <label className="project-editor__full">
        <span>Allowed Hosts</span>
        <textarea
          value={allowedHosts}
          rows={4}
          onChange={(event) => setAllowedHosts(event.target.value)}
          placeholder="api.example.com, test-api.example.com"
        />
      </label>
      <div className="project-editor__actions">
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button button--primary"
          disabled={saving}
          type="button"
          onClick={() => void saveProject()}
        >
          Save Project
        </button>
      </div>
    </div>
  );
}

function createEmptyDraft(): ProjectDraft {
  return {
    name: "New Project",
    type: "new_capture_session",
    enabled: true,
    targetOrigin: "https://api.rela.me",
    allowedHosts: "",
    sessionHeaderName: "X-Rela-Capture-Session",
    originalHostHeaderName: "X-Rela-Original-Host"
  };
}

function projectToDraft(project: CaptureProject): ProjectDraft {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    enabled: project.enabled,
    targetOrigin: project.targetOrigin,
    allowedHosts: project.allowedHosts.join("\n"),
    sessionHeaderName: project.sessionHeaderName,
    originalHostHeaderName: project.originalHostHeaderName,
    builtIn: project.builtIn
  };
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
