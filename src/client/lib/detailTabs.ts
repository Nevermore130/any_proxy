export type DetailTabId = "request" | "response";

export const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: "request", label: "Request" },
  { id: "response", label: "Response" }
];

export function normalizeDetailTab(tab: string | undefined): DetailTabId {
  return tab === "response" ? "response" : "request";
}

export function detailTabButtonState(activeTab: string | undefined) {
  const selectedTab = normalizeDetailTab(activeTab);
  return DETAIL_TABS.map((tab) => ({
    ...tab,
    panelId: `detail-panel-${tab.id}`,
    selected: tab.id === selectedTab,
    tabId: `detail-tab-${tab.id}`
  }));
}
