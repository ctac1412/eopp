import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import useSSE from "../hooks/useSSE";
import useCaptchaStore from "../store/useCaptchaStore";
import StatusBar from "../components/StatusBar";
import AuthWizard from "../components/AuthWizard";
import SuperKioskPanel from "../components/SuperKioskPanel";
import { CaptchaTab } from "./CaptchaTab";
import { HistoryTab } from "./HistoryTab";
import { PublicCaptchasTab } from "./PublicCaptchasTab";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "captchas",
  );
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const adminToken = localStorage.getItem("admin_token");
    const isAdm = !!(adminToken && apiKey && apiKey === adminToken);
    setIsAdmin(isAdm);
    if (!isAdm && superKioskMode) {
      useCaptchaStore.getState().clearSuperKioskMode();
    }
  }, [apiKey, superKioskMode]);

  const showWizard = !apiKey;

  useSSE(!showWizard && (activeTab === "captchas" || activeTab === "public-captchas"));

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  if (showWizard) {
    return <AuthWizard />;
  }

  const openTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="container py-3">
      <StatusBar />
      {superKioskMode && isAdmin && <SuperKioskPanel />}
      <ul className="nav nav-tabs mt-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "captchas" ? "active" : ""}`}
            onClick={() => openTab("captchas")}
          >
            Очередь
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "public-captchas" ? "active" : ""}`}
            onClick={() => openTab("public-captchas")}
          >
            Капчи
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "history" ? "active" : ""}`}
            onClick={() => openTab("history")}
          >
            История
          </button>
        </li>
      </ul>

      <div className="mt-3">
        {activeTab === "captchas" ? (
          <CaptchaTab />
        ) : activeTab === "public-captchas" ? (
          <PublicCaptchasTab onReplaySent={() => openTab("captchas")} />
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
