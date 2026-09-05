import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import { TopBar } from "./components/TopBar.js";
import { Sidebar, type SidebarView } from "./components/Sidebar.js";
import { RequestPane } from "./components/RequestPane.js";
import { ResponsePane } from "./components/ResponsePane.js";
import { InsightsPanel } from "./components/InsightsPanel.js";
import { FeatureTour } from "./components/FeatureTour.js";
import { UpdateModal } from "./components/UpdateModal.js";
import { RulesPanel } from "./components/RulesPanel.js";
import { BindDeviceModal } from "./components/BindDeviceModal.js";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal.js";
import {
  findUnreadEntry,
  isTourCompleted,
  markTourCompleted,
  setLastSeenVersion
} from "./lib/whatsNewHelpers.js";
import type {
  CaptureProject,
  CapturedFlow,
  FlowFilters,
  RequestRule,
  StatusResponse,
  WhatsNewEntry,
  WhatsNewResponse
} from "./types.js";

type FlowsResponse = {
  flows?: CapturedFlow[];
};

type FlowResponse = {
  flow?: CapturedFlow;
};

type ProjectsResponse = {
  defaultProjectId?: string;
  projects?: CaptureProject[];
};

type BannerState = {
  statusError: string | null;
  flowsError: string | null;
  eventsError: string | null;
};

export function App() {
  const [flows, setFlows] = useState<CapturedFlow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<CapturedFlow | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [projects, setProjects] = useState<CaptureProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => localStorage.getItem("relaCaptureProjectId") || "rela"
  );
  const [rules, setRules] = useState<RequestRule[]>([]);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [editingRule, setEditingRule] = useState<RequestRule | null>(null);
  const [showBindDeviceModal, setShowBindDeviceModal] = useState(false);
  const [banner, setBanner] = useState<BannerState>({
    eventsError: null,
    flowsError: null,
    statusError: null
  });
  const [unreadEntry, setUnreadEntry] = useState<WhatsNewEntry | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>("traffic");

  const selectedIdRef = useRef(selectedId);
  const selectedProjectIdRef = useRef(selectedProjectId);
  const latestFlowsRequestId = useRef(0);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
    localStorage.setItem("relaCaptureProjectId", selectedProjectId);
  }, [selectedProjectId]);

  const exportUrl = selectedProjectId
    ? `/api/export?projectId=${encodeURIComponent(selectedProjectId)}`
    : "/api/export";

  const apiBanner = [banner.statusError, banner.flowsError, banner.eventsError]
    .filter(Boolean)
    .join(" ");

  async function loadStatus() {
    try {
      const nextStatus = await fetchJson<StatusResponse>("/api/status");
      setStatus(nextStatus);
      syncProjects(nextStatus.projects?.items, nextStatus.projects?.defaultProjectId);
      setPaused(Boolean(nextStatus.capture?.paused));
      setBanner((current) => ({ ...current, statusError: null }));
    } catch (error) {
      setBanner((current) => ({
        ...current,
        statusError: `Status unavailable: ${errorMessage(error)}`
      }));
    }
  }

  async function checkForUpdates() {
    try {
      const [statusData, whatsNewData] = await Promise.all([
        fetchJson<StatusResponse>("/api/status"),
        fetchJson<WhatsNewResponse>("/api/whats-new")
      ]);

      const currentVersion = statusData.version || "0.0.0";
      const unread = findUnreadEntry(whatsNewData.entries, currentVersion);

      if (unread) {
        const tourId = `tour-${unread.version}`;
        const tourAlreadyCompleted = isTourCompleted(tourId);

        if (!tourAlreadyCompleted) {
          setUnreadEntry(unread);
          setShowUpdateModal(true);
        }
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  }

  async function loadRules() {
    try {
      const data = await fetchJson<{ rules: RequestRule[] }>("/api/rules");
      setRules(data.rules || []);
    } catch (error) {
      console.error("Failed to load rules:", error);
    }
  }

  async function loadProjects() {
    try {
      const data = await fetchJson<ProjectsResponse>("/api/projects");
      syncProjects(data.projects, data.defaultProjectId);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  }

  async function loadFlows(projectId = selectedProjectIdRef.current) {
    const requestId = ++latestFlowsRequestId.current;
    setFlowsLoading(true);
    setBanner((current) => ({ ...current, flowsError: null }));

    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const data = await fetchJson<FlowsResponse>(`/api/flows${query}`);
      if (requestId !== latestFlowsRequestId.current) {
        return;
      }

      const nextFlows = Array.isArray(data.flows) ? data.flows : [];
      setFlows(nextFlows);
      setSelectedId((currentSelectedId) => {
        if (!currentSelectedId || nextFlows.some((flow) => flow.id === currentSelectedId)) {
          return currentSelectedId;
        }
        setSelectedFlow(null);
        return null;
      });
    } catch (error) {
      if (requestId !== latestFlowsRequestId.current) {
        return;
      }

      setFlows([]);
      setBanner((current) => ({
        ...current,
        flowsError: `Could not load requests: ${errorMessage(error)}`
      }));
    } finally {
      if (requestId === latestFlowsRequestId.current) {
        setFlowsLoading(false);
      }
    }
  }

  async function showDetails(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetailLoadingId(id);
    setSelectedFlow(null);

    try {
      const data = await fetchJson<FlowResponse>(`/api/flows/${encodeURIComponent(id)}`);
      if (selectedIdRef.current !== id) {
        return;
      }
      setSelectedFlow(data.flow ?? null);
    } catch (error) {
      if (selectedIdRef.current !== id) {
        return;
      }
      setSelectedFlow({
        id,
        error: `Could not load flow ${id}: ${errorMessage(error)}`
      });
    } finally {
      if (selectedIdRef.current === id) {
        setDetailLoadingId(null);
      }
    }
  }

  async function runAction(action: () => Promise<void>) {
    setActionInFlight(true);
    setBanner((current) => ({ ...current, flowsError: null }));
    try {
      await action();
    } catch (error) {
      setBanner((current) => ({ ...current, flowsError: errorMessage(error) }));
    } finally {
      setActionInFlight(false);
    }
  }

  async function togglePause() {
    await runAction(async () => {
      await fetchJson(paused ? "/api/capture/resume" : "/api/capture/pause", { method: "POST" });
      await loadStatus();
    });
  }

  async function clearFlows() {
    await runAction(async () => {
      await fetchJson(
        selectedProjectIdRef.current
          ? `/api/flows/clear?projectId=${encodeURIComponent(selectedProjectIdRef.current)}`
          : "/api/flows/clear",
        { method: "POST" }
      );
      setFlows([]);
      setSelectedId(null);
      setSelectedFlow(null);
    });
  }

  useEffect(() => {
    void loadStatus();
    void loadProjects();
    void loadRules();
    void loadFlows();
    void checkForUpdates();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = null;
    setSelectedId(null);
    setSelectedFlow(null);
    void loadFlows(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    const events = new EventSource("/api/events");

    events.onopen = () => {
      setBanner((current) => ({ ...current, eventsError: null }));
    };

    events.onerror = () => {
      setBanner((current) => ({
        ...current,
        eventsError: "Live updates disconnected; retrying in the background."
      }));
    };

    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "clear" }
          | { type: "flow"; flow?: CapturedFlow };

        if (payload.type === "clear") {
          setFlows([]);
          setSelectedId(null);
          setSelectedFlow(null);
          return;
        }

        if (payload.type === "flow" && payload.flow) {
          const incomingFlow = payload.flow;
          if (
            selectedProjectIdRef.current &&
            incomingFlow.projectId &&
            incomingFlow.projectId !== selectedProjectIdRef.current
          ) {
            return;
          }
          setFlows((current) => upsertFlowList(current, incomingFlow));
          setSelectedFlow((current) =>
            selectedIdRef.current === incomingFlow.id ? incomingFlow : current
          );
        }
      } catch (error) {
        setBanner((current) => ({
          ...current,
          eventsError: `Live update parse error: ${errorMessage(error)}`
        }));
      }
    };

    return () => {
      events.close();
    };
  }, []);

  const handleDismissUpdate = () => {
    if (unreadEntry) {
      setLastSeenVersion(unreadEntry.version);
    }
    setShowUpdateModal(false);
    setUnreadEntry(null);
  };

  const handleStartTour = () => {
    setShowUpdateModal(false);
    setShowTour(true);
  };

  const handleCompleteTour = () => {
    if (unreadEntry) {
      setLastSeenVersion(unreadEntry.version);
      markTourCompleted(`tour-${unreadEntry.version}`);
    }
    setShowTour(false);
    setUnreadEntry(null);
  };

  const handleSkipTour = () => {
    if (unreadEntry) {
      setLastSeenVersion(unreadEntry.version);
      markTourCompleted(`tour-${unreadEntry.version}`);
    }
    setShowTour(false);
    setUnreadEntry(null);
  };

  const [searchValue, setSearchValue] = useState("");
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  function syncProjects(
    nextProjects: CaptureProject[] | undefined,
    defaultProjectId = "rela"
  ) {
    if (!Array.isArray(nextProjects) || nextProjects.length === 0) {
      return;
    }
    setProjects(nextProjects);
    setSelectedProjectId((current) =>
      nextProjects.some((project) => project.id === current) ? current : defaultProjectId
    );
  }

  const filteredFlows = useMemo(() => {
    if (!searchValue) {
      return flows;
    }
    const search = searchValue.toLowerCase();
    return flows.filter(
      (flow) =>
        flow.path?.toLowerCase().includes(search) ||
        flow.method?.toLowerCase().includes(search) ||
        flow.host?.toLowerCase().includes(search)
    );
  }, [flows, searchValue]);

  function handleCreateRule(flow: CapturedFlow) {
    const newRule: Partial<RequestRule> = {
      name: `Rule for ${flow.method} ${flow.path}`,
      enabled: true,
      match: {
        method: flow.method,
        pathMatch: flow.path,
        pathMatchType: "prefix",
        originalHost: flow.host
      },
      actions: {
        delayMs: 0,
        mockMode: false
      }
    };
    setEditingRule(newRule as RequestRule);
    setShowRulesPanel(true);
  }

  return (
    <AppShell
      topBar={
        <TopBar
          status={status}
          paused={paused}
          actionInFlight={actionInFlight}
          rulesCount={rules.filter((r) => r.enabled).length}
          projects={projects}
          selectedProjectId={selectedProjectId}
          exportUrl={exportUrl}
          onTogglePause={() => void togglePause()}
          onClearFlows={() => void clearFlows()}
          onShowRules={() => setShowRulesPanel(!showRulesPanel)}
          onShowBindDevice={() => setShowBindDeviceModal(true)}
          onShowProjects={() => setShowProjectSettings(true)}
          onProjectChange={setSelectedProjectId}
        />
      }
      sidebar={
        <Sidebar
          flows={filteredFlows}
          selectedId={selectedId}
          onSelect={(id) => void showDetails(id)}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeView={sidebarView}
          onSelectView={setSidebarView}
        />
      }
      requestPane={<RequestPane flow={selectedFlow} onCreateRule={handleCreateRule} />}
      responsePane={<ResponsePane flow={selectedFlow} />}
      main={
        sidebarView === "insights" ? (
          <InsightsPanel
            projectId={selectedProjectId}
            projectName={selectedProject?.name}
            refreshNonce={`${flows.length}:${flows[0]?.id ?? ""}:${flows[0]?.startedAt ?? ""}`}
            onOpenFlow={(flowId) => {
              setSidebarView("traffic");
              void showDetails(flowId);
            }}
          />
        ) : undefined
      }
      banner={apiBanner ? <span>{apiBanner}</span> : null}
      rulesPanel={
        showRulesPanel ? (
          <RulesPanel
            rules={rules}
            onClose={() => {
              setShowRulesPanel(false);
              setEditingRule(null);
            }}
            onRuleChange={() => void loadRules()}
            editingRule={editingRule}
            onEditRule={setEditingRule}
          />
        ) : null
      }
      projectSettingsModal={
        showProjectSettings ? (
          <ProjectSettingsModal
            projects={projects}
            onClose={() => setShowProjectSettings(false)}
            onProjectsChange={() => {
              void loadProjects();
              void loadStatus();
              void loadFlows();
            }}
          />
        ) : null
      }
      updateModal={
        showUpdateModal && unreadEntry ? (
          <UpdateModal
            entry={unreadEntry}
            onDismiss={handleDismissUpdate}
            onStartTour={handleStartTour}
          />
        ) : null
      }
      featureTour={
        showTour && unreadEntry?.tour ? (
          <FeatureTour
            steps={unreadEntry.tour}
            onComplete={handleCompleteTour}
            onSkip={handleSkipTour}
          />
        ) : null
      }
      bindDeviceModal={
        showBindDeviceModal ? (
          <BindDeviceModal
            project={selectedProject}
            status={status}
            onClose={() => setShowBindDeviceModal(false)}
          />
        ) : null
      }
    />
  );
}

function upsertFlowList(current: CapturedFlow[], incomingFlow: CapturedFlow): CapturedFlow[] {
  const index = current.findIndex((flow) => flow.id === incomingFlow.id);

  if (index >= 0) {
    return current.map((flow) => (flow.id === incomingFlow.id ? incomingFlow : flow));
  }

  return [incomingFlow, ...current];
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
