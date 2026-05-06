import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import useSSE from "../hooks/useSSE";
import useCaptchaStore from "../store/useCaptchaStore";
import StatusBar from "../components/StatusBar";
import AuthWizard from "../components/AuthWizard";
import { CaptchaTab } from "./CaptchaTab";
import { HistoryTab } from "./HistoryTab";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const [showWizard, setShowWizard] = useState(!apiKey);
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "captchas"
  );

  const handleAuthenticated = useCallback(() => {
    setShowWizard(false);
  }, []);

  useEffect(() => {
    if (!apiKey) {
      setShowWizard(true);
    }
  }, [apiKey]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  if (showWizard) {
    return <AuthWizard onAuthenticated={handleAuthenticated} />;
  }

  useSSE(activeTab === "captchas");

  return (
    <div className="container">
      <StatusBar />
      <div className="tabs">
        <button
          className={`tab ${activeTab === "captchas" ? "tab--active" : ""}`}
          onClick={() => { setActiveTab("captchas"); setSearchParams({ tab: "captchas" }); }}
        >
          Капчи
        </button>
        <button
          className={`tab ${activeTab === "history" ? "tab--active" : ""}`}
          onClick={() => { setActiveTab("history"); setSearchParams({ tab: "history" }); }}
        >
          История
        </button>
      </div>
      {activeTab === "captchas" ? (
        <CaptchaTab />
      ) : (
        <HistoryTab
          apiKey={apiKey}
          adminToken={localStorage.getItem("admin_token")}
        />
      )}
    </div>
  );
}