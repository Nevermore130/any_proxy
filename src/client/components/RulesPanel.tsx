import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { JsonBodyEditor } from "./JsonBodyEditor.js";
import type { RequestRule } from "../types.js";

type RulesPanelProps = {
  rules: RequestRule[];
  onClose: () => void;
  onRuleChange: () => void;
  editingRule: RequestRule | null;
  onEditRule: (rule: RequestRule | null) => void;
};

export function RulesPanel({
  rules,
  onClose,
  onRuleChange,
  editingRule,
  onEditRule
}: RulesPanelProps) {
  async function toggleRule(rule: RequestRule) {
    try {
      await fetchJson(`/api/rules/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      onRuleChange();
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  }

  async function deleteRule(id: string) {
    try {
      await fetchJson(`/api/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
      onRuleChange();
    } catch (error) {
      console.error("Failed to delete rule:", error);
    }
  }

  return (
    <div className="rules-panel-overlay" onClick={onClose}>
      <div className="rules-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel-header">
          <h2>Request Rules</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="tool-button"
              type="button"
              onClick={() =>
                onEditRule({
                  id: "",
                  name: "New Rule",
                  enabled: true,
                  match: { pathMatchType: "prefix" },
                  actions: { delayMs: 0, mockMode: false },
                  createdAt: "",
                  updatedAt: ""
                })
              }
            >
              <PlusIcon size={15} weight="bold" />
              New Rule
            </button>
            <button className="tool-button" type="button" onClick={onClose}>
              <XIcon size={15} weight="bold" />
              Close
            </button>
          </div>
        </div>

        {editingRule ? (
          <RuleEditor
            rule={editingRule}
            onSave={() => {
              onRuleChange();
              onEditRule(null);
            }}
            onCancel={() => onEditRule(null)}
          />
        ) : (
          <div className="rules-list">
            {rules.length === 0 ? (
              <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                No rules configured. Create a rule to delay or modify relay responses.
              </p>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rule-card ${rule.enabled ? "is-enabled" : "is-disabled"}`}
                >
                  <div className="rule-card-header">
                    <strong>{rule.name}</strong>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="icon-button"
                        title={rule.enabled ? "Disable rule" : "Enable rule"}
                        type="button"
                        onClick={() => void toggleRule(rule)}
                      >
                        {rule.enabled ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                      </button>
                      <button
                        className="icon-button"
                        title="Edit rule"
                        type="button"
                        onClick={() => onEditRule(rule)}
                      >
                        <PencilSimpleIcon size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title="Delete rule"
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete rule "${rule.name}"?`)) {
                            void deleteRule(rule.id);
                          }
                        }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="rule-card-details">
                    <div>
                      <span className="label">Match:</span>{" "}
                      {rule.match.method || "ANY"} {rule.match.pathMatch || "*"}
                      {rule.match.originalHost && ` @ ${rule.match.originalHost}`}
                    </div>
                    <div>
                      <span className="label">Actions:</span>{" "}
                      {rule.actions.delayMs > 0 && `Delay ${rule.actions.delayMs}ms`}
                      {rule.actions.rewriteStatusCode &&
                        ` • Status ${rule.actions.rewriteStatusCode}`}
                      {rule.actions.rewriteBody && " • Rewrite body"}
                      {rule.actions.mockMode && " • Mock mode"}
                      {!rule.actions.delayMs &&
                        !rule.actions.rewriteStatusCode &&
                        !rule.actions.rewriteBody &&
                        !rule.actions.mockMode &&
                        "None"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleEditor({
  rule,
  onSave,
  onCancel
}: {
  rule: RequestRule;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule.name);
  const [method, setMethod] = useState(rule.match.method || "");
  const [pathMatch, setPathMatch] = useState(rule.match.pathMatch || "");
  const [pathMatchType, setPathMatchType] = useState(rule.match.pathMatchType);
  const [originalHost, setOriginalHost] = useState(rule.match.originalHost || "");
  const [delayMs, setDelayMs] = useState(String(rule.actions.delayMs));
  const [mockMode, setMockMode] = useState(rule.actions.mockMode);
  const [mockStatusCode, setMockStatusCode] = useState(String(rule.actions.mockStatusCode || ""));
  const [mockBody, setMockBody] = useState(rule.actions.mockBody || "");
  const [rewriteStatusCode, setRewriteStatusCode] = useState(
    String(rule.actions.rewriteStatusCode || "")
  );
  const [rewriteBodyJson, setRewriteBodyJson] = useState(
    rule.actions.rewriteBody ? JSON.stringify(rule.actions.rewriteBody, null, 2) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const ruleData: Partial<RequestRule> = {
        name,
        enabled: rule.enabled,
        match: {
          method: method || undefined,
          pathMatch: pathMatch || undefined,
          pathMatchType,
          originalHost: originalHost || undefined
        },
        actions: {
          delayMs: Number(delayMs) || 0,
          mockMode,
          mockStatusCode: mockMode && mockStatusCode ? Number(mockStatusCode) : undefined,
          mockBody: mockMode ? mockBody : undefined,
          rewriteStatusCode:
            !mockMode && rewriteStatusCode ? Number(rewriteStatusCode) : undefined,
          rewriteBody:
            !mockMode && rewriteBodyJson
              ? (JSON.parse(rewriteBodyJson) as Record<string, unknown>)
              : undefined
        }
      };

      if (rule.id) {
        await fetchJson(`/api/rules/${encodeURIComponent(rule.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ruleData)
        });
      } else {
        await fetchJson("/api/rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ruleData)
        });
      }

      onSave();
    } catch (error) {
      console.error("Failed to save rule:", error);
      alert(`Failed to save rule: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rule-editor">
      <div className="rule-editor-section">
        <h3>Rule Details</h3>
        <label>
          <span>Rule Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Rule" />
        </label>
      </div>

      <div className="rule-editor-section">
        <h3>Match Conditions</h3>
        <label>
          <span>HTTP Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">ANY</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>
        <label>
          <span>Path Match Type</span>
          <select
            value={pathMatchType}
            onChange={(e) => setPathMatchType(e.target.value as "prefix" | "glob")}
          >
            <option value="prefix">Prefix</option>
            <option value="glob">Glob</option>
          </select>
        </label>
        <label>
          <span>Path Pattern</span>
          <input
            value={pathMatch}
            onChange={(e) => setPathMatch(e.target.value)}
            placeholder="/v1/me"
          />
        </label>
        <label>
          <span>Original Host (optional)</span>
          <input
            value={originalHost}
            onChange={(e) => setOriginalHost(e.target.value)}
            placeholder="api.rela.me"
          />
        </label>
      </div>

      <div className="rule-editor-section">
        <h3>Actions</h3>
        <label>
          <span>Delay (ms)</span>
          <input
            type="number"
            value={delayMs}
            onChange={(e) => setDelayMs(e.target.value)}
            placeholder="0"
          />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={mockMode}
            onChange={(e) => setMockMode(e.target.checked)}
          />
          <span>Mock Mode (skip upstream)</span>
        </label>
        {mockMode ? (
          <>
            <label>
              <span>Mock Status Code</span>
              <input
                type="number"
                value={mockStatusCode}
                onChange={(e) => setMockStatusCode(e.target.value)}
                placeholder="200"
              />
            </label>
            <label>
              <span>Mock Body</span>
              <JsonBodyEditor
                value={mockBody}
                onChange={setMockBody}
                placeholder='{"message": "mocked"}'
                rows={4}
                label="Mock Body"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span>Rewrite Status Code (optional)</span>
              <input
                type="number"
                value={rewriteStatusCode}
                onChange={(e) => setRewriteStatusCode(e.target.value)}
                placeholder="Original status"
              />
            </label>
            <label>
              <span>Rewrite Body JSON (merge, optional)</span>
              <JsonBodyEditor
                value={rewriteBodyJson}
                onChange={setRewriteBodyJson}
                placeholder='{"field": "value"}'
                rows={4}
                label="Rewrite Body JSON"
              />
            </label>
          </>
        )}
      </div>

      <div className="rule-editor-actions">
        <button
          className="button button--primary"
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "Saving..." : rule.id ? "Update Rule" : "Create Rule"}
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
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
