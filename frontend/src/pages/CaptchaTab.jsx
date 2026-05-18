import React from "react";
import CaptchaGrid from "../components/CaptchaGrid";
import LogViewer from "../components/LogViewer";

export function CaptchaTab() {
  return (
    <div className="d-flex flex-column" style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}>
      <div className="flex-grow-1" style={{ minHeight: 0, overflow: "auto" }}>
        <CaptchaGrid />
      </div>
      <div style={{ flexShrink: 0, maxHeight: "120px", borderTop: "1px solid var(--border)" }}>
        <LogViewer />
      </div>
    </div>
  );
}
