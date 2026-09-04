import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useState } from "react";
import type { WhatsNewTourStep } from "../types.js";

type FeatureTourProps = {
  steps: WhatsNewTourStep[];
  onComplete: () => void;
  onSkip: () => void;
};

export function FeatureTour({ steps, onComplete, onSkip }: FeatureTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  useEffect(() => {
    if (!currentStep) {
      return;
    }

    const updateTargetRect = () => {
      const target = document.querySelector(currentStep.targetSelector);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updateTargetRect();

    const observer = new ResizeObserver(updateTargetRect);
    const target = document.querySelector(currentStep.targetSelector);
    if (target) {
      observer.observe(target);
    }

    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect);
    };
  }, [currentStep]);

  if (!currentStep || !targetRect) {
    return null;
  }

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const tooltipStyle = {
    position: "fixed" as const,
    top: targetRect.bottom + 12,
    left: targetRect.left,
    maxWidth: "320px"
  };

  return (
    <>
      <div className="feature-tour-overlay" onClick={onSkip}>
        <div
          className="feature-tour-spotlight"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="feature-tour-tooltip" style={tooltipStyle} onClick={(e) => e.stopPropagation()}>
        <div className="feature-tour-tooltip__header">
          <h3>{currentStep.title}</h3>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭"
            onClick={onSkip}
          >
            <XIcon size={16} weight="bold" />
          </button>
        </div>

        <p className="feature-tour-tooltip__body">{currentStep.body}</p>

        <div className="feature-tour-tooltip__footer">
          <div className="feature-tour-progress">
            {currentStepIndex + 1} / {steps.length}
          </div>
          <div className="feature-tour-actions">
            <button
              className="button"
              type="button"
              onClick={onSkip}
            >
              跳过
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={handleNext}
            >
              {isLastStep ? "完成" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
