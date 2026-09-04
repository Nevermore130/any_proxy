import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import type { WhatsNewEntry } from "../types.js";

type UpdateModalProps = {
  entry: WhatsNewEntry;
  onDismiss: () => void;
  onStartTour: () => void;
};

export function UpdateModal({ entry, onDismiss, onStartTour }: UpdateModalProps) {
  const hasTour = entry.tour && entry.tour.length > 0;

  return (
    <div className="update-modal-overlay" onClick={onDismiss}>
      <div className="update-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="update-modal__close"
          type="button"
          aria-label="关闭"
          onClick={onDismiss}
        >
          <XIcon size={20} weight="bold" />
        </button>

        <div className="update-modal__header">
          <div className="update-modal__badge">v{entry.version}</div>
          <h2 className="update-modal__title">{entry.title}</h2>
        </div>

        <div className="update-modal__body">
          <ul className="update-modal__list">
            {entry.body.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="update-modal__footer">
          {hasTour ? (
            <>
              <button
                className="button"
                type="button"
                onClick={onDismiss}
              >
                知道了
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={onStartTour}
              >
                开始引导
              </button>
            </>
          ) : (
            <button
              className="button button--primary"
              type="button"
              onClick={onDismiss}
            >
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
