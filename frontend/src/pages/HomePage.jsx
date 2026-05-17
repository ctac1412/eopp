import React, { useState, useEffect } from "react";
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
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "captchas"
  );

  const showWizard = !apiKey;

  useSSE(!showWizard && activeTab === "captchas");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  if (showWizard) {
    return <AuthWizard />;
  }

  return (
    <div className="container py-3">
      <StatusBar />
      <ul className="nav nav-tabs mt-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "captchas" ? "active" : ""}`}
            onClick={() => { setActiveTab("captchas"); setSearchParams({ tab: "captchas" }); }}
          >
            Капчи
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "history" ? "active" : ""}`}
            onClick={() => { setActiveTab("history"); setSearchParams({ tab: "history" }); }}
          >
            История
          </button>
        </li>
      </ul>
      <div className="mt-3">
        {activeTab === "captchas" ? (
          <CaptchaTab />
        ) : (
          <HistoryTab
            apiKey={apiKey}
            adminToken={localStorage.getItem("admin_token")}
          />
        )}
      </div>
    </div>
  );
}
