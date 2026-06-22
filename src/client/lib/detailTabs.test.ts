import { describe, expect, it } from "vitest";
import { detailTabButtonState, normalizeDetailTab } from "./detailTabs.js";

describe("detail tab helpers", () => {
  it("defaults unknown tabs to request", () => {
    expect(normalizeDetailTab("response")).toBe("response");
    expect(normalizeDetailTab("unknown")).toBe("request");
    expect(normalizeDetailTab(undefined)).toBe("request");
  });

  it("marks exactly one tab as selected", () => {
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
