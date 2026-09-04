import { ArrowsOutIcon } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import { BracketsAngleIcon } from "@phosphor-icons/react/dist/csr/BracketsAngle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useState } from "react";

type JsonBodyEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
};

export function JsonBodyEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  label
}: JsonBodyEditorProps) {
  const [formatError, setFormatError] = useState<string | null>(null);
  const [showExpandModal, setShowExpandModal] = useState(false);

  function handleFormat() {
    setFormatError(null);
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange(formatted);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : "无效的 JSON");
    }
  }

  return (
    <>
      <div className="json-editor">
        <div className="json-editor-toolbar">
          <button
            className="json-editor-button"
            title="格式化 JSON"
            type="button"
            onClick={handleFormat}
          >
            <BracketsAngleIcon size={14} weight="bold" />
            格式化
          </button>
          <button
            className="json-editor-button"
            title="放大编辑"
            type="button"
            onClick={() => setShowExpandModal(true)}
          >
            <ArrowsOutIcon size={14} weight="bold" />
            放大编辑
          </button>
        </div>
        <textarea
          className="json-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
        {formatError && <div className="json-editor-error">{formatError}</div>}
      </div>

      {showExpandModal && (
        <JsonExpandModal
          value={value}
          label={label}
          onApply={(newValue) => {
            onChange(newValue);
            setShowExpandModal(false);
          }}
          onCancel={() => setShowExpandModal(false)}
        />
      )}
    </>
  );
}

type JsonExpandModalProps = {
  value: string;
  label?: string;
  onApply: (value: string) => void;
  onCancel: () => void;
};

function JsonExpandModal({ value, label, onApply, onCancel }: JsonExpandModalProps) {
  const [editValue, setEditValue] = useState(value);
  const [formatError, setFormatError] = useState<string | null>(null);

  function handleFormat() {
    setFormatError(null);
    try {
      const parsed = JSON.parse(editValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setEditValue(formatted);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : "无效的 JSON");
    }
  }

  function handleApply() {
    onApply(editValue);
  }

  return (
    <div className="json-expand-overlay" onClick={onCancel}>
      <div className="json-expand-modal" onClick={(e) => e.stopPropagation()}>
        <div className="json-expand-header">
          <h3>{label || "编辑 JSON"}</h3>
          <button className="icon-button" title="关闭" type="button" onClick={onCancel}>
            <XIcon size={18} />
          </button>
        </div>

        <div className="json-expand-toolbar">
          <button
            className="json-editor-button"
            title="格式化 JSON"
            type="button"
            onClick={handleFormat}
          >
            <BracketsAngleIcon size={14} weight="bold" />
            格式化
          </button>
          {formatError && <span className="json-expand-error">{formatError}</span>}
        </div>

        <textarea
          className="json-expand-textarea"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder='{"field": "value"}'
        />

        <div className="json-expand-actions">
          <button className="button button--primary" type="button" onClick={handleApply}>
            <CheckIcon size={15} weight="bold" />
            应用
          </button>
          <button className="button" type="button" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
