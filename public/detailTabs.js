export const DETAIL_TABS = [
  { id: "request", label: "Request" },
  { id: "response", label: "Response" }
];

export function normalizeDetailTab(tab) {
  return tab === "response" ? "response" : "request";
}

export function detailTabButtonState(activeTab) {
  const selectedTab = normalizeDetailTab(activeTab);
  return DETAIL_TABS.map((tab) => ({
    ...tab,
    panelId: `detail-panel-${tab.id}`,
    selected: tab.id === selectedTab,
    tabId: `detail-tab-${tab.id}`
  }));
}
