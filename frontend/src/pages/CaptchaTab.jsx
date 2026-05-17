import React from "react";
import CaptchaGrid from "../components/CaptchaGrid";
import LogViewer from "../components/LogViewer";

export function CaptchaTab() {
  return (
    <div className="d-flex flex-column gap-3" style={{ height: "calc(100vh - 180px)", minHeight: "500px", overflow: "hidden" }}>
      <div className="flex-grow-1" style={{ minHeight: 0 }}>
        <CaptchaGrid />
      </div>
      <div style={{ maxHeight: "200px", flexShrink: 0 }}>
        <LogViewer />
      </div>
    </div>
  );
}
