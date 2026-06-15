/**
 * EOPP Captcha Solver - Admin Page (Панель администрирования)
 *
 * Основные функции:
 * - Авторизация пользователя через логин/пароль и cookie-сессию
 * - Управление API ключами (CRUD)
 * - Просмотр активных SSE соединений (/admin/streams)
 * - Статистика по тестовым кейсам (/admin/test-stats)
 * - Запуск бенчмарка (/admin/benchmark)
 *
 * Роут: /admin
 * Защита: требует сессию eopp_admin_session
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Alert, Tag } from "antd";
import {
  BackendLogsTab,
  StreamsTab,
  TestBenchmarkTab,
  InvoicesTab,
  ReportsTab,
  ExpensesTab,
  ExpenseModal,
  PayoutsTab,
  PayoutModal,
  UsersTab,
  UserModal,
  UserStatsModal,
  CaptchasTab,
  AITab,
  OperationsDashboardTab,
  OperatorsTab,
  PluginChannelTab,
  PrepaidPackagesTab,
  TrainingAdminTab,
  CompaniesTab,
  FinanceTab,
} from "./adminComponents";
import { accessPayloadFromForm, emptyAccess, normalizeAccess } from "./users/userCompanyAccess";
import { adminHeaders, adminHeadersJson, adminRequest } from "./shared/adminClient";
import { ADMIN_TABS } from "./shared/tabs";
import { Button } from "../../ui";

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

function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminToken, setAdminToken] = useState(
    () => "session",
  );
  const [authChecked, setAuthChecked] = useState(false);
  const [adminRole, setAdminRole] = useState(
    () => localStorage.getItem("admin_role") || null,
  );
  const [adminSystemRole, setAdminSystemRole] = useState(
    () => localStorage.getItem("admin_system_role") || "",
  );
  const [adminSections, setAdminSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("admin_sections") || "[]");
    } catch {
      return [];
    }
  });
  const [adminPermissions, setAdminPermissions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("admin_permissions") || "[]");
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "operations"
  );
  const visibleTabs = useMemo(() => {
    const sections =
      adminSections.length > 0
        ? adminSections
        : DEFAULT_ROLE_SECTIONS[adminRole] || ADMIN_TABS.map((tab) => tab.id);
    const allowed = new Set(sections);
    return ADMIN_TABS.filter((tab) => allowed.has(tab.id));
  }, [adminRole, adminSections]);
  const canUseGlobalUserCompanyAccess =
    !!adminSystemRole || adminRole === "super_admin" || adminRole === "system_admin";
  const [captchaSubtab, setCaptchaSubtab] = useState("operations");
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") || "operations";
    const fallbackTab = visibleTabs[0]?.id || "operations";
    const nextTab = visibleTabs.some((tab) => tab.id === tabFromUrl) ? tabFromUrl : fallbackTab;
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams, visibleTabs]);

  // Expenses
  const [expenses, setExpenses] = useState([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseForm, setExpenseForm] = useState({ id: null, amount: "", reason: "", user_id: null, comment: "", created_at: "" });
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Payouts
  const [payouts, setPayouts] = useState([]);
  const [payoutForm, setPayoutForm] = useState({ id: null, name: "", invoice_ids: [], expense_ids: [], splits: [] });
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutPreview, setPayoutPreview] = useState(null);
  const [payoutPreviewLoading, setPayoutPreviewLoading] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState([]);
  const [availableExpenses, setAvailableExpenses] = useState([]);
  const [prepaidPackages, setPrepaidPackages] = useState([]);
  const [prepaidDeductions, setPrepaidDeductions] = useState([]);

  // Users
  const [users, setUsers] = useState([]);
  const [userForm, setUserForm] = useState({
    id: null,
    name: "",
    login: "",
    password: "",
    role: "manager",
    systemRole: "",
    active: true,
    isDirector: false,
    companyId: "",
    financeAccess: emptyAccess(),
    operatorAccess: emptyAccess(),
    executorAccess: emptyAccess(),
  });
  const [showUserModal, setShowUserModal] = useState(false);
  const [showUserStats, setShowUserStats] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [userStatsLoading, setUserStatsLoading] = useState(false);

  // Companies
  const [companies, setCompanies] = useState([]);
  const [financeParticipants, setFinanceParticipants] = useState([]);

  // Streams
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(false);

  // Test stats
  const [testStats, setTestStats] = useState(null);
  const [testStatsLoading, setTestStatsLoading] = useState(false);

  // Benchmark
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const fetchKeys = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/api-keys", { headers: adminHeadersJson(t) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : data.keys || []);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [adminToken],
  );

  const fetchExpenses = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/expenses", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExpenses(Array.isArray(data) ? data : data.expenses || []);
        setExpenseTotal(data.total || 0);
      } catch (err) {
        setExpenses([]);
        setExpenseTotal(0);
      }
    },
    [adminToken],
  );

  const fetchUsers = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/users", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        setUsers([]);
      }
    },
    [adminToken],
  );

  const fetchFinanceParticipants = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/finance-participants", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setFinanceParticipants(Array.isArray(data) ? data : []);
      } catch (err) {
        setFinanceParticipants([]);
      }
    },
    [adminToken],
  );

  const fetchCompanies = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/companies", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch (err) {
        setCompanies([]);
      }
    },
    [adminToken],
  );

  const fetchPayouts = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/payouts", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPayouts(Array.isArray(data) ? data : []);
      } catch (err) {
        setPayouts([]);
      }
    },
    [adminToken],
  );

  const fetchPrepaidPackages = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/prepaid-packages", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPrepaidPackages(Array.isArray(data) ? data : []);
      } catch (err) {
        setPrepaidPackages([]);
      }
    },
    [adminToken],
  );

  const fetchPrepaidDeductions = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/prepaid-deductions", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPrepaidDeductions(Array.isArray(data) ? data : []);
      } catch (err) {
        setPrepaidDeductions([]);
      }
    },
    [adminToken],
  );

  const fetchPayoutPreview = useCallback(
    async (invoiceIds, expenseIds, splits) => {
      const t = adminToken;
      if (!t) return;
      setPayoutPreviewLoading(true);
      try {
        const res = await adminRequest("/admin/payouts/preview", {
          method: "POST",
          headers: adminHeaders(t),
          body: JSON.stringify({ invoice_ids: invoiceIds || [], expense_ids: expenseIds || [], user_splits: splits || [] }),
        });
        if (!res.ok) { setPayoutPreview(null); return; }
        const data = await res.json();
        setPayoutPreview(data);
      } catch (err) {
        setPayoutPreview(null);
      } finally {
        setPayoutPreviewLoading(false);
      }
    },
    [adminToken],
  );

  const fetchAvailableResources = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await adminRequest("/admin/payouts/available", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) return;
        const data = await res.json();
        setAvailableInvoices(data.invoices || []);
        setAvailableExpenses(data.expenses || []);
      } catch (err) {
        setAvailableInvoices([]);
        setAvailableExpenses([]);
      }
    },
    [adminToken],
  );

  const fetchAllResources = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const [invRes, expRes] = await Promise.all([
          adminRequest("/admin/invoices", { headers: adminHeadersJson(t) }),
          adminRequest("/admin/expenses", { headers: adminHeadersJson(t) }),
        ]);
        if (invRes.ok) {
          const invData = await invRes.json();
          setAvailableInvoices(Array.isArray(invData) ? invData : []);
        }
        if (expRes.ok) {
          const expData = await expRes.json();
          setAvailableExpenses(Array.isArray(expData.expenses) ? expData.expenses : []);
        }
      } catch (err) {
        setAvailableInvoices([]);
        setAvailableExpenses([]);
      }
    },
    [adminToken],
  );

  const fetchStreams = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      setStreamsLoading(true);
      try {
        const res = await adminRequest("/admin/streams", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStreams(Array.isArray(data) ? data : []);
      } catch (err) {
        setStreams([]);
      } finally {
        setStreamsLoading(false);
      }
    },
    [adminToken],
  );

  const fetchTestStats = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      setTestStatsLoading(true);
      try {
        const res = await adminRequest("/admin/test-stats", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTestStats(data);
      } catch (err) {
        setTestStats(null);
      } finally {
        setTestStatsLoading(false);
      }
    },
    [adminToken],
  );

  const runBenchmark = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      setBenchmarkRunning(true);
      setBenchmarkLoading(true);
      try {
        const res = await adminRequest("/admin/benchmark", {
          method: "POST",
          headers: adminHeaders(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBenchmark(data);
      } catch (err) {
        setBenchmark({ error: err.message });
      } finally {
        setBenchmarkLoading(false);
        setBenchmarkRunning(false);
      }
    },
    [adminToken],
  );

  useEffect(() => {
    adminRequest("/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
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
        fetchKeys("session");
      })
      .catch(() => {
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
        setLoading(false);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (adminToken && activeTab === "streams") {
      fetchStreams(adminToken);
    }
  }, [adminToken, activeTab, fetchStreams]);

  useEffect(() => {
    if (adminToken && activeTab === "testbench") {
      fetchTestStats(adminToken);
    }
  }, [adminToken, activeTab, fetchTestStats]);

  useEffect(() => {
    if (adminToken && activeTab === "expenses") {
      fetchExpenses(adminToken);
    }
  }, [adminToken, activeTab, fetchExpenses]);

  useEffect(() => {
    if (adminToken && activeTab === "payouts") {
      fetchPayouts(adminToken);
    }
  }, [adminToken, activeTab, fetchPayouts]);

  useEffect(() => {
    if (adminToken && activeTab === "prepaid") {
      fetchPrepaidPackages(adminToken);
      fetchPrepaidDeductions(adminToken);
      fetchKeys(adminToken);
    }
  }, [adminToken, activeTab, fetchPrepaidPackages, fetchPrepaidDeductions, fetchKeys]);

  useEffect(() => {
    if (adminToken && activeTab === "users") {
      fetchUsers(adminToken);
      fetchKeys(adminToken);
    }
  }, [adminToken, activeTab, fetchKeys, fetchUsers]);

  useEffect(() => {
    if (adminToken && (activeTab === "expenses" || activeTab === "payouts" || activeTab === "invoices" || activeTab === "reports")) {
      fetchUsers(adminToken);
      fetchFinanceParticipants(adminToken);
    }
  }, [adminToken, activeTab, fetchFinanceParticipants, fetchUsers]);

  useEffect(() => {
    if (adminToken && activeTab === "payouts") {
      fetchAvailableResources(adminToken);
    }
  }, [adminToken, activeTab, fetchAvailableResources]);

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
    setKeys([]);
  };

  const handleDelete = async (id) => {
    try {
      const res = await adminRequest(`/api-keys/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetUsage = async (id) => {
    try {
      const res = await adminRequest(`/api-keys/${id}/reset-usage`, {
        method: "POST",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (keyObj) => {
    try {
      const res = await adminRequest(`/api-keys/${keyObj.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ active: !keyObj.active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreatePersonalApiKey = async (userId) => {
    try {
      const body = {
        label: userForm.login || userForm.name || `user-${userId}`,
        user_id: Number(userId),
      };
      if (userForm.companyId) {
        body.company_id = Number(userForm.companyId);
      }
      const res = await adminRequest("/api-keys", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setNewKey(data);
      await fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePersonalApiKey = async (keyId) => {
    if (!window.confirm("Удалить персональный ключ пользователя?")) return;
    await handleDelete(keyId);
    await fetchKeys(adminToken);
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const body = {
        amount: parseInt(expenseForm.amount, 10),
        reason: expenseForm.reason,
        user_id: expenseForm.user_id,
        comment: expenseForm.comment,
      };
      if (expenseForm.created_at) {
        body.created_at = expenseForm.created_at;
      }
      const res = await adminRequest("/admin/expenses", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExpenseForm({ id: null, amount: "", reason: "", user_id: null, comment: "", created_at: "" });
      setShowExpenseModal(false);
      fetchExpenses(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.id) return;
    try {
      const body = {
        amount: parseInt(expenseForm.amount, 10),
        reason: expenseForm.reason,
        user_id: expenseForm.user_id,
        comment: expenseForm.comment,
      };
      if (expenseForm.created_at) {
        body.created_at = expenseForm.created_at;
      }
      const res = await adminRequest(`/admin/expenses/${expenseForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExpenseForm({ id: null, amount: "", reason: "", user_id: null, comment: "", created_at: "" });
      setShowExpenseModal(false);
      fetchExpenses(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreatePayout = async (e) => {
    e.preventDefault();
    try {
      const splits = (payoutForm.splits || [])
        .filter((s) => s.user_id != null)
        .map((s) => ({ user_id: s.user_id, split_pct: Number(s.split_pct) || 0 }));
      const body = {
        name: payoutForm.name,
        invoice_ids: payoutForm.invoice_ids || [],
        expense_ids: payoutForm.expense_ids || [],
        user_splits: splits,
      };
      const res = await adminRequest("/admin/payouts", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayoutForm({ id: null, name: "", invoice_ids: [], expense_ids: [], splits: [] });
      setShowPayoutModal(false);
      setPayoutPreview(null);
      fetchPayouts(adminToken);
      fetchAvailableResources(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePayout = async (e) => {
    e.preventDefault();
    if (!payoutForm.id) return;
    try {
      // Обновляем имя
      const nameRes = await adminRequest(`/admin/payouts/${payoutForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ name: payoutForm.name }),
      });
      if (!nameRes.ok) throw new Error(`HTTP ${nameRes.status} (name)`);

      // Пересчитываем с новыми данными
      const splits = (payoutForm.splits || [])
        .filter((s) => s.user_id != null)
        .map((s) => ({ user_id: s.user_id, split_pct: Number(s.split_pct) || 0 }));
      const recalcRes = await adminRequest(`/admin/payouts/${payoutForm.id}/recalculate`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          name: payoutForm.name,
          invoice_ids: payoutForm.invoice_ids || [],
          expense_ids: payoutForm.expense_ids || [],
          user_splits: splits,
        }),
      });
      if (!recalcRes.ok) throw new Error(`HTTP ${recalcRes.status} (recalculate)`);

      setPayoutForm({ id: null, name: "", invoice_ids: [], expense_ids: [], splits: [] });
      setShowPayoutModal(false);
      setPayoutPreview(null);
      fetchPayouts(adminToken);
      fetchAvailableResources(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePayout = async (id) => {
    try {
      const res = await adminRequest(`/admin/payouts/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreatePrepaidPackage = async (payload) => {
    try {
      const res = await adminRequest("/admin/prepaid-packages", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPrepaidPackages(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePrepaidPackage = async (id, payload) => {
    try {
      const res = await adminRequest(`/admin/prepaid-packages/${id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPrepaidPackages(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePrepaidPackage = async (id) => {
    try {
      const res = await adminRequest(`/admin/prepaid-packages/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPrepaidPackages(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTopUpPrepaidPackage = async (id, amount) => {
    try {
      const res = await adminRequest(`/admin/prepaid-packages/${id}/top-up`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPrepaidPackages(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleManualInvoiceCreated = (invoiceId) => {
    if (!invoiceId) return;
    setActiveTab("invoices");
    setSearchParams({ tab: "invoices", invoice_id: String(invoiceId) });
  };

  const handleSetPayoutStatus = async (id, status) => {
    try {
      const res = await adminRequest(`/admin/payouts/${id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRecalculatePayout = async (id) => {
    try {
      // Берём текущие данные выплаты из состояния
      const payout = payouts.find((p) => p.id === id);
      if (!payout) return;

      const invoiceIds = (payout.invoices || []).map((i) => i.invoice_id || i.id);
      const expenseIds = (payout.expenses || []).map((e) => e.expense_id || e.id);
      const splits = (payout.shares || []).map((sh) => ({
        user_id: sh.user_id,
        split_pct: Number(sh.split_pct) || 0,
      }));

      const res = await adminRequest(`/admin/payouts/${id}/recalculate`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          name: payout.name,
          invoice_ids: invoiceIds,
          expense_ids: expenseIds,
          user_splits: splits,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts(adminToken);
      fetchAvailableResources(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const companyId = userForm.companyId ? Number(userForm.companyId) : null;
      const body = {
        name: userForm.name,
        login: userForm.login || null,
        password: userForm.password || null,
        role: userForm.role || "manager",
        system_role: userForm.systemRole || null,
        active: userForm.active !== false,
        is_director: userForm.isDirector === true,
        company_id: companyId,
        finance_access: accessPayloadFromForm(userForm.financeAccess),
        operator_access: accessPayloadFromForm(userForm.operatorAccess),
        executor_access: accessPayloadFromForm(userForm.executorAccess),
      };
      if (companyId) {
        body.company_memberships = [{ company_id: companyId, role: userForm.role || "manager", active: true }];
      }
      const res = await adminRequest("/admin/users", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserForm({ id: null, name: "", login: "", password: "", role: "manager", systemRole: "", active: true, isDirector: false, companyId: "", financeAccess: emptyAccess(), operatorAccess: emptyAccess(), executorAccess: emptyAccess() });
      setShowUserModal(false);
      fetchUsers(adminToken);
      fetchFinanceParticipants(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!userForm.id) return;
    try {
      const companyId = userForm.companyId ? Number(userForm.companyId) : null;
      const body = {
        name: userForm.name,
        login: userForm.login || null,
        role: userForm.role || "manager",
        system_role: userForm.systemRole || null,
        active: userForm.active !== false,
        is_director: userForm.isDirector === true,
        company_id: companyId,
        finance_access: accessPayloadFromForm(userForm.financeAccess),
        operator_access: accessPayloadFromForm(userForm.operatorAccess),
        executor_access: accessPayloadFromForm(userForm.executorAccess),
      };
      if (companyId) {
        body.company_memberships = [{ company_id: companyId, role: userForm.role || "manager", active: true }];
      }
      if (userForm.password) {
        body.password = userForm.password;
      }
      const res = await adminRequest(`/admin/users/${userForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserForm({ id: null, name: "", login: "", password: "", role: "manager", systemRole: "", active: true, isDirector: false, companyId: "", financeAccess: emptyAccess(), operatorAccess: emptyAccess(), executorAccess: emptyAccess() });
      setShowUserModal(false);
      fetchUsers(adminToken);
      fetchFinanceParticipants(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      const res = await adminRequest(`/admin/users/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchUsers(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenUserStats = async (user) => {
    setShowUserStats(true);
    setUserStats(null);
    setUserStatsLoading(true);
    try {
      const res = await adminRequest(`/admin/users/${user.id}/stats`, {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserStats(await res.json());
    } catch (err) {
      setError(err.message);
      setShowUserStats(false);
    } finally {
      setUserStatsLoading(false);
    }
  };

  const openEditUser = useCallback((u) => {
    setUserForm({
      id: u.id,
      name: u.name || "",
      login: u.login || "",
      password: "",
      role: u.role || "manager",
      systemRole: u.system_role || "",
      active: u.active !== false,
      isDirector: u.is_director === true,
      companyId: u.company_id ? String(u.company_id) : "",
      financeAccess: normalizeAccess(u.finance_access),
      operatorAccess: normalizeAccess(u.operator_access),
      executorAccess: normalizeAccess(u.executor_access),
    });
    fetchCompanies(adminToken);
    fetchKeys(adminToken);
    setShowUserModal(true);
  }, [adminToken, fetchCompanies, fetchKeys]);

  const handleDeleteExpense = async (id) => {
    try {
      const res = await adminRequest(`/admin/expenses/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchExpenses(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const currentUserApiKey = useMemo(
    () => (userForm.id ? keys.find((key) => Number(key.user_id) === Number(userForm.id)) || null : null),
    [keys, userForm.id],
  );

  if (!authChecked) {
    return null;
  }

  if (!adminToken) {
    return <Navigate to="/" replace />;
  }

  return (
    <div data-eopp-component="AdminPageShell" className="admin-page">
      <div data-eopp-component="AdminPageHeader" className="admin-page__header">
        <h1>Админ-панель</h1>
        <div className="admin-page__actions">
          <Tag color={adminRole === "super_admin" ? "red" : adminRole === "administrator" ? "blue" : "default"}>
            {ROLE_LABELS[adminRole] || adminRole || "Роль"}
          </Tag>
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

      <div
        data-eopp-component="AdminTabsNav"
        className="admin-tabs-nav mb-3"
        role="tablist"
      >
        {visibleTabs.map((tab) => (
          <div
            data-eopp-component="AdminTabsNavItem"
            data-eopp-tab={tab.id}
            className="admin-tabs-nav__item"
            key={tab.id}
          >
            <Button
              data-eopp-component="AdminTabsNavButton"
              data-eopp-tab={tab.id}
              className={`admin-tabs-nav__button ${activeTab === tab.id ? "is-active" : ""}`}
              title={tab.label}
              htmlType="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchParams((currentParams) => {
                  const nextParams = new URLSearchParams(currentParams);
                  nextParams.set("tab", tab.id);
                  return nextParams;
                });
              }}
            >
              {tab.shortLabel || tab.label}
            </Button>
          </div>
        ))}
      </div>

      {activeTab === "reports" && (
        <ReportsTab
          adminToken={adminToken}
          onError={(msg) => setError(msg)}
          onInvoiceGenerated={handleManualInvoiceCreated}
          users={financeParticipants}
        />
      )}

      {activeTab === "captchas" && (
        <CaptchasTab
          adminToken={adminToken}
          keys={keys}
          onError={(msg) => setError(msg)}
          activeSubtab={captchaSubtab}
          onSubtabChange={setCaptchaSubtab}
        />
      )}

      {activeTab === "ai" && (
        <AITab adminToken={adminToken} />
      )}

      {activeTab === "companies" && (
        <CompaniesTab adminToken={adminToken} onError={setError} />
      )}

      {activeTab === "operations" && (
        <OperationsDashboardTab adminToken={adminToken} onError={setError} />
      )}

      {activeTab === "operators" && (
        <OperatorsTab adminToken={adminToken} onError={setError} />
      )}

      {activeTab === "channels" && (
        <PluginChannelTab adminToken={adminToken} onError={setError} />
      )}

      {activeTab === "invoices" && (
        <InvoicesTab
          adminToken={adminToken}
          onError={(msg) => setError(msg)}
          users={financeParticipants}
          focusInvoiceId={searchParams.get("invoice_id")}
        />
      )}

      {activeTab === "prepaid" && (
        <PrepaidPackagesTab
          packages={prepaidPackages}
          deductions={prepaidDeductions}
          keys={keys}
          onRefresh={() => {
            fetchPrepaidPackages(adminToken);
            fetchPrepaidDeductions(adminToken);
          }}
          onCreate={handleCreatePrepaidPackage}
          onUpdate={handleUpdatePrepaidPackage}
          onDelete={handleDeletePrepaidPackage}
          onTopUp={handleTopUpPrepaidPackage}
        />
      )}

      {activeTab === "expenses" && (
        <ExpensesTab
          expenses={expenses}
          total={expenseTotal}
          users={users}
          onRefresh={() => fetchExpenses(adminToken)}
          onCreate={() => { setExpenseForm({ id: null, amount: "", reason: "", user_id: null, comment: "", created_at: "" }); setShowExpenseModal(true); }}
          onEdit={(e) => { setExpenseForm({ id: e.id, amount: String(e.amount), reason: e.reason, user_id: e.user_id, comment: e.comment || "", created_at: e.created_at }); setShowExpenseModal(true); }}
          onDelete={handleDeleteExpense}
        />
      )}

      {activeTab === "finance" && (
        <FinanceTab adminToken={adminToken} onError={(msg) => setError(msg)} />
      )}

      {activeTab === "payouts" && (
        <PayoutsTab
          payouts={payouts}
          onRefresh={() => fetchPayouts(adminToken)}
          onCreate={() => {
            const payoutUsers = financeParticipants;
            const n = payoutUsers.length || 1;
            const base = Math.floor(100 / n);
            const remainder = 100 - base * n;
            const autoSplits = payoutUsers.map((u, i) => ({
              user_id: u.id,
              split_pct: base + (i < remainder ? 1 : 0),
            }));
            setPayoutForm({ id: null, name: "", invoice_ids: [], expense_ids: [], splits: autoSplits });
            setPayoutPreview(null);
            setShowPayoutModal(true);
          }}
          onEdit={(p) => {
            const splits = (p.shares || []).map((sh) => ({
              user_id: sh.user_id,
              split_pct: sh.split_pct || 0,
            }));
            const invoiceIds = (p.invoices || []).map((i) => i.invoice_id || i.id);
            const expenseIds = (p.expenses || []).map((e) => e.expense_id || e.id);
            setPayoutForm({ id: p.id, name: p.name, invoice_ids: invoiceIds, expense_ids: expenseIds, splits });
            fetchAllResources(adminToken);
            setShowPayoutModal(true);
          }}
          onDelete={handleDeletePayout}
          onRecalculate={handleRecalculatePayout}
          onStatusChange={handleSetPayoutStatus}
        />
      )}

      {activeTab === "users" && (
        <UsersTab
          users={users}
          onCreate={() => {
            setUserForm({ id: null, name: "", login: "", password: "", role: "manager", systemRole: "", active: true, isDirector: false, companyId: "", financeAccess: emptyAccess(), operatorAccess: emptyAccess(), executorAccess: emptyAccess() });
            fetchCompanies(adminToken);
            setShowUserModal(true);
          }}
          onEdit={openEditUser}
          onDelete={handleDeleteUser}
          onStats={handleOpenUserStats}
        />
      )}

      {activeTab === "testbench" && (
        <TestBenchmarkTab
          testStats={testStats}
          testStatsLoading={testStatsLoading}
          benchmark={benchmark}
          benchmarkLoading={benchmarkLoading}
          benchmarkRunning={benchmarkRunning}
          onRunBenchmark={runBenchmark}
          adminToken={adminToken}
        />
      )}

      {activeTab === "streams" && (
        <StreamsTab streams={streams} streamsLoading={streamsLoading} adminToken={adminToken} />
      )}

      {activeTab === "backend-logs" && (
        <BackendLogsTab
          adminToken={adminToken}
          onError={(msg) => setError(msg)}
        />
      )}

      {activeTab === "training" && (
        <TrainingAdminTab adminToken={adminToken} onError={(msg) => setError(msg)} />
      )}

      <ExpenseModal
        show={showExpenseModal}
        form={expenseForm}
        setForm={setExpenseForm}
        onSubmit={expenseForm.id ? handleUpdateExpense : handleCreateExpense}
        onClose={() => setShowExpenseModal(false)}
        users={financeParticipants}
      />

      <PayoutModal
        show={showPayoutModal}
        form={payoutForm}
        setForm={setPayoutForm}
        onSubmit={payoutForm.id ? handleUpdatePayout : handleCreatePayout}
        onClose={() => setShowPayoutModal(false)}
        preview={payoutPreview}
        users={financeParticipants}
        availableInvoices={availableInvoices}
        availableExpenses={availableExpenses}
        onPreview={fetchPayoutPreview}
        previewLoading={payoutPreviewLoading}
      />

      <UserModal
        show={showUserModal}
        form={userForm}
        setForm={setUserForm}
        onSubmit={userForm.id ? handleUpdateUser : handleCreateUser}
        onClose={() => setShowUserModal(false)}
        companies={companies}
        canUseGlobalAccess={canUseGlobalUserCompanyAccess}
        apiKey={currentUserApiKey}
        newApiKey={newKey}
        onCreateApiKey={handleCreatePersonalApiKey}
        onToggleApiKey={handleToggleActive}
        onResetApiKey={handleResetUsage}
        onDeleteApiKey={handleDeletePersonalApiKey}
      />

      <UserStatsModal
        show={showUserStats}
        stats={userStats}
        loading={userStatsLoading}
        onClose={() => setShowUserStats(false)}
      />
    </div>
  );
}

export default AdminPage;
