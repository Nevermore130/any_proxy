import { describe, expect, it } from "vitest";
import { bodyCopyButtonState, bodyCopyText } from "./bodyActions.js";

describe("body action helpers", () => {
  it("uses the original body preview as copy text", () => {
    expect(
      bodyCopyText({
        kind: "text",
        contentType: "application/json",
        preview: "{\"ok\":true,\"items\":[1,2]}",
        sizeBytes: 27,
        truncated: false
      })
    ).toBe("{\"ok\":true,\"items\":[1,2]}");
  });

  it("prefers the complete raw body when the preview is truncated", () => {
    expect(
      bodyCopyText({
        kind: "text",
        contentType: "application/json",
        preview: "{\"ok\":",
        raw: "{\"ok\":true,\"items\":[1,2,3]}",
        sizeBytes: 27,
        truncated: true
      })
    ).toBe("{\"ok\":true,\"items\":[1,2,3]}");
  });

  it("builds copy button labels for a response body", () => {
    expect(
      bodyCopyButtonState(
        {
          kind: "text",
          contentType: "application/json",
          preview: "{\"ok\":true}",
          sizeBytes: 11,
          truncated: false
        },
        "Response Body"
      )
    ).toEqual({
      ariaLabel: "Copy Response Body raw body",
      enabled: true,
      failedLabel: "Failed",
      idleLabel: "Copy",
      successLabel: "Copied",
      text: "{\"ok\":true}"
    });
  });

  it("does not enable copy for empty bodies", () => {
    expect(bodyCopyButtonState({ kind: "empty" }, "Request Body")).toEqual({
      ariaLabel: "Copy Request Body raw body",
      enabled: false,
      failedLabel: "Failed",
      idleLabel: "Copy",
      successLabel: "Copied",
      text: ""
    });
  });
});
