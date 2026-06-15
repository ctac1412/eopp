/**
 * EOPP Captcha Solver - Admin Page shell.
 *
 * Route: /admin/:tabId
 * The shell owns auth, RBAC-derived navigation, layout, and common errors.
 * Individual tab containers own tab data loading, mutations, modal state, and
 * local query parameters.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Alert, Tag } from "antd";

import { Button, SegmentedControl } from "../../ui";
import { adminRequest } from "./shared/adminClient";
import {
  ADMIN_TABS,
  adminTabPath,
  buildLegacyAdminTabRedirect,
  resolveAdminTabRoute,
} from "./shared/tabs";

const ROLE_LABELS = {
  super_admin: "Супер админ",
  administrator: "Администратор",
  manager: "Менеджер",
  operator: "Оператор",
};

const DEFAULT_ROLE_SECTIONS = {
  super_admin: ADMIN_TABS.map((tab) => tab.id),
  administrator: ADMIN_TABS.filter((tab) => tab.id !== "users").map((tab) => tab.id),
  manager: ["reports", "companies", "channels", "captchas", "invoices", "prepaid", "expenses", "finance", "payouts"],
  operator: ["operations", "operators", "streams"],
};

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function AdminPage({ themeMode = "dark", onThemeModeChange }) {
  const { tabId } = useParams();
  const location = useLocation();
  const [adminToken, setAdminToken] = useState(() => "session");
  const [authChecked, setAuthChecked] = useState(false);
  const [adminRole, setAdminRole] = useState(() => localStorage.getItem("admin_role") || null);
  const [adminSystemRole, setAdminSystemRole] = useState(() => localStorage.getItem("admin_system_role") || "");
  const [adminSections, setAdminSections] = useState(() => readJsonStorage("admin_sections", []));
  const [adminPermissions, setAdminPermissions] = useState(() => readJsonStorage("admin_permissions", []));
  const [error, setError] = useState(null);
  const handleError = useCallback((msg) => setError(msg), []);

  const visibleTabs = useMemo(() => {
    const sections =
      adminSections.length > 0
        ? adminSections
        : DEFAULT_ROLE_SECTIONS[adminRole] || ADMIN_TABS.map((tab) => tab.id);
    const allowed = new Set(sections);
    return ADMIN_TABS.filter((tab) => allowed.has(tab.id));
  }, [adminRole, adminSections]);

  useEffect(() => {
    let cancelled = false;
    adminRequest("/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const role = data.role || "manager";
        const systemRole = data.user?.system_role || "";
        const sections = Array.isArray(data.sections) ? data.sections : DEFAULT_ROLE_SECTIONS[role] || [];
        const permissions = Array.isArray(data.permissions) ? data.permissions : [];
        localStorage.setItem("admin_session_active", "1");
        localStorage.setItem("admin_role", role);
        localStorage.setItem("admin_system_role", systemRole);
        localStorage.setItem("admin_sections", JSON.stringify(sections));
        localStorage.setItem("admin_permissions", JSON.stringify(permissions));
        setAdminToken("session");
        setAdminRole(role);
        setAdminSystemRole(systemRole);
        setAdminSections(sections);
        setAdminPermissions(permissions);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("admin_session_active");
        localStorage.removeItem("admin_role");
        localStorage.removeItem("admin_system_role");
        localStorage.removeItem("admin_sections");
        localStorage.removeItem("admin_permissions");
        setAdminToken(null);
        setAdminRole(null);
        setAdminSystemRole("");
        setAdminSections([]);
        setAdminPermissions([]);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    adminRequest("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("admin_session_active");
    localStorage.removeItem("admin_role");
    localStorage.removeItem("admin_system_role");
    localStorage.removeItem("admin_sections");
    localStorage.removeItem("admin_permissions");
    setAdminToken(null);
    setAdminRole(null);
    setAdminSystemRole("");
    setAdminSections([]);
    setAdminPermissions([]);
  };

  if (!authChecked) {
    return null;
  }

  if (!adminToken) {
    return <Navigate to="/" replace />;
  }

  if (location.search.includes("tab=")) {
    return <Navigate to={buildLegacyAdminTabRedirect(location.search)} replace />;
  }

  const fallbackPath = adminTabPath(visibleTabs[0] || ADMIN_TABS[0], location.search);
  if (!tabId) {
    return <Navigate to={fallbackPath} replace />;
  }

  const { tab: activeTab, redirectPath } = resolveAdminTabRoute({
    tabId,
    visibleTabs,
    search: location.search,
  });
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  const ActiveTabComponent = activeTab.component;

  return (
    <div data-eopp-component="AdminPageShell" className="admin-page">
      <div data-eopp-component="AdminPageHeader" className="admin-page__header">
        <h1>Админ-панель</h1>
        <div className="admin-page__actions">
          <Tag color={adminRole === "super_admin" ? "red" : adminRole === "administrator" ? "blue" : "default"}>
            {ROLE_LABELS[adminRole] || adminRole || "Роль"}
          </Tag>
          <SegmentedControl
            aria-label="Theme"
            className="admin-page__theme-switch"
            options={[
              { label: "Темная", value: "dark" },
              { label: "Светлая", value: "light" },
            ]}
            size="small"
            value={themeMode}
            onChange={(value) => onThemeModeChange?.(value)}
          />
          <Button size="small" onClick={handleLogout}>
            Выйти
          </Button>
          <Link data-eopp-component="AdminPageBackLink" to="/" className="admin-page__back-link">Назад</Link>
        </div>
      </div>

      {error && (
        <Alert
          data-eopp-component="AdminPageError"
          className="mb-3"
          type="error"
          showIcon
          closable
          message={error}
          onClose={() => setError(null)}
        />
      )}

      <div data-eopp-component="AdminTabsNav" className="admin-tabs-nav mb-3" role="tablist">
        {visibleTabs.map((tab) => (
          <div data-eopp-component="AdminTabsNavItem" data-eopp-tab={tab.id} className="admin-tabs-nav__item" key={tab.id}>
            <Link to={adminTabPath(tab)} className="admin-tabs-nav__link">
              <Button
                data-eopp-component="AdminTabsNavButton"
                data-eopp-tab={tab.id}
                className={`admin-tabs-nav__button ${activeTab.id === tab.id ? "is-active" : ""}`}
                title={tab.label}
                htmlType="button"
                role="tab"
                aria-selected={activeTab.id === tab.id}
              >
                {tab.shortLabel || tab.label}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <ActiveTabComponent
        adminToken={adminToken}
        adminRole={adminRole}
        adminSystemRole={adminSystemRole}
        adminPermissions={adminPermissions}
        onError={handleError}
      />
    </div>
  );
}

export default AdminPage;
