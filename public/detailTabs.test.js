import { describe, expect, it } from "vitest";
import { detailTabButtonState, normalizeDetailTab } from "./detailTabs.js";

describe("detail tab helpers", () => {
  it("defaults unknown tabs to request", () => {
    expect(normalizeDetailTab()).toBe("request");
    expect(normalizeDetailTab("headers")).toBe("request");
  });

  it("marks the selected tab and links each tab to its panel", () => {
    expect(detailTabButtonState("response")).toEqual([
      {
        id: "request",
        label: "Request",
        panelId: "detail-panel-request",
        selected: false,
        tabId: "detail-tab-request"
      },
      {
        id: "response",
        label: "Response",
        panelId: "detail-panel-response",
        selected: true,
        tabId: "detail-tab-response"
      }
    ]);
  });
});
