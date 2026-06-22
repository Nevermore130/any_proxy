export function bodyCopyText(body) {
  if (!body || body.kind === "empty" || typeof body.preview !== "string") {
    return "";
  }

  return body.preview;
}

export function bodyCopyButtonState(body, label = "Body") {
  return {
    ariaLabel: `Copy ${label} raw body`,
    enabled: bodyCopyText(body).length > 0,
    failedLabel: "Failed",
    idleLabel: "Copy",
    successLabel: "Copied",
    text: bodyCopyText(body)
  };
}
