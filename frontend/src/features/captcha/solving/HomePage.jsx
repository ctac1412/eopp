import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import useSSE from "../../../hooks/useSSE";
import useCaptchaStore from "../../../store/useCaptchaStore";
import StatusBar from "./StatusBar";
import AuthWizard from "../../auth/AuthWizard";
import SuperKioskPanel from "./SuperKioskPanel";
import ChatBox, { getOpColor } from "../../operator/workbench/ChatBox";
import LogViewer from "./LogViewer";
import { CaptchaTab } from "./CaptchaTab";
import { HistoryTab } from "../history/HistoryTab";
import { HomeOperatorStrip } from "./HomeOperatorStrip";
import { HomeScheduledEventsStrip } from "./HomeScheduledEventsStrip";
import { PublicCaptchasTab } from "../publicCaptchas/PublicCaptchasTab";
import { getCurrentOperatorPageUrl } from "./homeOperatorAccess";
import { normalizeHomeSideTab } from "./homeTabs";
import { SegmentedControl } from "../../../ui";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const connectedOperators = useCaptchaStore((s) => s.connectedOperators);
  const scheduledEvents = useCaptchaStore((s) => s.scheduledEvents);
  const apiKeyId = useCaptchaStore((s) => s.apiKeyId);
  const apiKeyLabel = useCaptchaStore((s) => s.apiKeyLabel);
  const [activeTab, setActiveTab] = useState(
    () => normalizeHomeSideTab(searchParams.get("tab")),
  );
  const [operatorProfile, setOperatorProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      setAuthChecking(true);
      try {
        const meResp = await fetch("/auth/me");
        if (!meResp.ok) throw new Error("Unauthorized");
        const me = await meResp.json();
        localStorage.setItem("admin_session_active", "1");
        localStorage.setItem("admin_role", me.role || "");
        localStorage.setItem("admin_sections", JSON.stringify(me.sections || []));
        localStorage.setItem("admin_permissions", JSON.stringify(me.permissions || []));
        if (!cancelled) {
          setOperatorProfile(me.user?.operator_profile || null);
        }

        const keysResp = await fetch("/auth/plugin-keys");
        if (!keysResp.ok) throw new Error("No keys");
        const keysData = await keysResp.json();
        const keys = Array.isArray(keysData.keys) ? keysData.keys : [];
        const allowedKey = keys.find((item) => item.key === apiKey);
        const selectedKey = allowedKey || keys[0];
        if (!cancelled && selectedKey?.key) {
          if (selectedKey.key !== apiKey) {
            useCaptchaStore.getState().setApiKey(selectedKey.key);
          }
          useCaptchaStore.getState().setApiKeyInfo(selectedKey.id, selectedKey.label || "");
        } else if (!cancelled) {
          useCaptchaStore.getState().clearApiKey();
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem("admin_session_active");
          setOperatorProfile(null);
          useCaptchaStore.getState().clearApiKey();
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const isAdm = localStorage.getItem("admin_session_active") === "1";
    setIsAdmin(isAdm);
    if (!isAdm && superKioskMode) {
      useCaptchaStore.getState().clearSuperKioskMode();
    }
  }, [superKioskMode]);

  const showWizard = !apiKey && !authChecking;

  useSSE(!showWizard);

  useEffect(() => {
    const tab = normalizeHomeSideTab(searchParams.get("tab"));
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  const operatorColors = useMemo(() => {
    const map = {};
    (connectedOperators || []).forEach((operator, idx) => {
      map[operator.nickname] = getOpColor(idx);
    });
    return map;
  }, [connectedOperators]);

  if (authChecking) {
    return null;
  }

  if (showWizard) {
    return <AuthWizard />;
  }

  const openTab = (tab) => {
    const normalized = normalizeHomeSideTab(tab);
    setActiveTab(normalized);
    setSearchParams({ tab: normalized });
  };
  const operatorPageUrl = getCurrentOperatorPageUrl(operatorProfile);

  return (
    <div className="container py-3 home-page">
      <StatusBar />
      {superKioskMode && isAdmin && <SuperKioskPanel />}
      <div className="home-workspace">
        <section data-eopp-component="HomeQueuePane" className="home-workspace__queue">
          <CaptchaTab />
        </section>

        <aside data-eopp-component="HomeSidePanel" className="home-workspace__side">
          <HomeOperatorStrip operators={connectedOperators} />
          <HomeScheduledEventsStrip events={scheduledEvents} />

          <div data-eopp-component="HomeTabsNav" className="home-tabs-nav">
            <SegmentedControl
              data-eopp-component="HomeTabsSegmented"
              className="home-tabs-nav__segmented"
              value={activeTab}
              onChange={openTab}
              options={[
                { label: "Чат", value: "chat" },
                { label: "История", value: "history" },
                { label: "Капчи", value: "public-captchas" },
              ]}
            />
            <div className="home-tabs-nav__links">
            <a
              data-eopp-component="HomeTabsTrainingLink"
              className="home-tabs-nav__training"
              href="/training"
            >
              Обучение
            </a>
              {operatorPageUrl && (
                <a
                  data-eopp-component="HomeTabsOperatorLink"
                  className="home-tabs-nav__operator"
                  href={operatorPageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Зайти как оператор
                </a>
              )}
            </div>
          </div>

          <div className="home-side-panel__body">
            {activeTab === "history" ? (
              <HistoryTab
                apiKey={apiKey}
                adminToken={localStorage.getItem("admin_session_active") === "1" ? "session" : null}
              />
            ) : activeTab === "public-captchas" ? (
              <PublicCaptchasTab onReplaySent={() => openTab("chat")} />
            ) : (
              <ChatBox
                ownRole="master"
                senderLabel={apiKeyLabel}
                masterKeyId={apiKeyId}
                operatorColors={operatorColors}
              />
            )}
          </div>
        </aside>

        <section data-eopp-component="HomeLogsPane" className="home-workspace__logs">
          <LogViewer />
        </section>
      </div>
    </div>
  );
}
