import React from "react";
import CaptchaGrid from "../components/CaptchaGrid";
import LogViewer from "../components/LogViewer";

export function CaptchaTab() {
  return (
    <div className="captcha-content-area">
      <CaptchaGrid />
      <LogViewer />
    </div>
  );
}