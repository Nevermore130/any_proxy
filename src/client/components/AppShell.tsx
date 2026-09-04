import type { ReactNode } from "react";

type AppShellProps = {
  topBar: ReactNode;
  sidebar: ReactNode;
  requestPane: ReactNode;
  responsePane: ReactNode;
  rulesPanel?: ReactNode;
  updateModal?: ReactNode;
  featureTour?: ReactNode;
  banner?: ReactNode;
  bindDeviceModal?: ReactNode;
};

export function AppShell({
  topBar,
  sidebar,
  requestPane,
  responsePane,
  rulesPanel,
  updateModal,
  featureTour,
  banner,
  bindDeviceModal
}: AppShellProps) {
  return (
    <div className="postman-app">
      {topBar}
      {banner && <div className="postman-banner">{banner}</div>}
      <div className="postman-layout">
        {sidebar}
        <div className="postman-main">
          <div className="postman-request-section">{requestPane}</div>
          <div className="postman-response-section">{responsePane}</div>
        </div>
      </div>
      {rulesPanel}
      {updateModal}
      {featureTour}
      {bindDeviceModal}
    </div>
  );
}
