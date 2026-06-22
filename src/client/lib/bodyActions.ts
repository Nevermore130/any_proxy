import type { BodyPreview } from "../types.js";

export function bodyCopyText(body: BodyPreview | undefined): string {
  if (!body || body.kind === "empty" || typeof body.preview !== "string") {
    return "";
  }

  return body.preview;
}

export function bodyCopyButtonState(body: BodyPreview | undefined, label = "Body") {
  const text = bodyCopyText(body);
  return {
    ariaLabel: `Copy ${label} raw body`,
    enabled: text.length > 0,
    failedLabel: "Failed",
    idleLabel: "Copy",
    successLabel: "Copied",
    text
  };
}
