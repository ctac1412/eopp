/**
 * EOPP Captcha Solver - Admin Page (Панель администрирования)
 *
 * Основные функции:
 * - Авторизация админа через ADMIN_TOKEN
 * - Управление API ключами (CRUD)
 * - Просмотр активных SSE соединений (/admin/streams)
 * - Статистика по тестовым кейсам (/admin/test-stats)
 * - Запуск бенчмарка (/admin/benchmark)
 *
 * Роут: /admin
 * Защита: требует X-Admin-Token в заголовках
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AdminAuth,
  ApiKeysTab,
  BackendLogsTab,
  StreamsTab,
  TestBenchmarkTab,
  InvoicesTab,
  KeyFormModal,
  DeleteConfirmModal,
  UsageLogEditModal,
  ReportsTab,
  ExpensesTab,
  ExpenseModal,
  PayoutsTab,
  PayoutModal,
  UsersTab,
  UserModal,
  CaptchasTab,
  AITab,
  OperatorsTab,
  PrepaidPackagesTab,
} from "./components/admin";
import { adminHeaders, adminHeadersJson } from "./features/admin/shared/adminClient";
import { ADMIN_TABS } from "./features/admin/shared/tabs";

function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem("admin_token") || null,
  );
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "reports"
  );
  const [captchaSubtab, setCaptchaSubtab] = useState("operations");
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [createForm, setCreateForm] = useState({ label: "", maxUses: "" });
  const [editForm, setEditForm] = useState({
    label: "",
    maxUses: "",
    active: true,
    comment: "",
    priceCreate: "",
    priceReschedule: "",
    priceCreatePeak: "",
    priceCustomSlots: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedHistory, setExpandedHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const [historyHideTest, setHistoryHideTest] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedConfig, setExpandedConfig] = useState({});
  const [showUsageLogEdit, setShowUsageLogEdit] = useState(null);
  const [usageLogEditForm, setUsageLogEditForm] = useState({ price: "", paid: "" });
  const [editingPriceId, setEditingPriceId] = useState(null);
  const intervalRef = useRef(null);

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
  const [userForm, setUserForm] = useState({ id: null, name: "" });
  const [showUserModal, setShowUserModal] = useState(false);

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
        const res = await fetch("/api-keys", { headers: adminHeadersJson(t) });
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
        const res = await fetch("/admin/expenses", {
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
        const res = await fetch("/admin/users", {
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

  const fetchPayouts = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await fetch("/admin/payouts", {
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
        const res = await fetch("/admin/prepaid-packages", {
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
        const res = await fetch("/admin/prepaid-deductions", {
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
        const res = await fetch("/admin/payouts/preview", {
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
        const res = await fetch("/admin/payouts/available", {
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
          fetch("/admin/invoices", { headers: adminHeadersJson(t) }),
          fetch("/admin/expenses", { headers: adminHeadersJson(t) }),
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
        const res = await fetch("/admin/streams", {
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
        const res = await fetch("/admin/test-stats", {
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
        const res = await fetch("/admin/benchmark", {
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
    if (adminToken) {
      fetchKeys(adminToken);
    }
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

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
    }
  }, [adminToken, activeTab, fetchUsers]);

  useEffect(() => {
    if (adminToken && (activeTab === "expenses" || activeTab === "payouts" || activeTab === "invoices")) {
      fetchUsers(adminToken);
    }
  }, [adminToken, activeTab]);

  useEffect(() => {
    if (adminToken && activeTab === "payouts") {
      fetchAvailableResources(adminToken);
    }
  }, [adminToken, activeTab, fetchAvailableResources]);

  const doAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch("/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authInput }),
      });
      if (!res.ok) throw new Error("Неверный токен");
      const token = authInput;
      localStorage.setItem("admin_token", token);
      setAdminToken(token);
      setAuthError(null);
      fetchKeys(token);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setAdminToken(null);
    setKeys([]);
    setExpandedHistory({});
    setExpandedLogs({});
    setExpandedConfig({});
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const body = { label: createForm.label };
      if (createForm.maxUses) {
        body.max_uses = parseInt(createForm.maxUses, 10);
      }
      const res = await fetch("/api-keys", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNewKey(data);
      setCreateForm({ label: "", maxUses: "" });
      setShowCreate(false);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!showEdit) return;
    try {
      const body = { label: editForm.label, active: editForm.active };
      if (editForm.maxUses !== "") {
        body.max_uses = parseInt(editForm.maxUses, 10);
      } else {
        body.max_uses = null;
      }
      if (editForm.comment !== "") {
        body.comment = editForm.comment;
      }
      const res = await fetch(`/api-keys/${showEdit}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (
        editForm.priceCreate !== "" ||
        editForm.priceReschedule !== "" ||
        editForm.priceCreatePeak !== "" ||
        editForm.priceCustomSlots !== ""
      ) {
        const tariffBody = {};
        if (editForm.priceCreate !== "") {
          tariffBody.price_create = parseInt(editForm.priceCreate, 10);
        }
        if (editForm.priceReschedule !== "") {
          tariffBody.price_reschedule = parseInt(editForm.priceReschedule, 10);
        }
        tariffBody.price_create_peak =
          editForm.priceCreatePeak !== "" ? parseInt(editForm.priceCreatePeak, 10) : null;
        tariffBody.price_custom_slots =
          editForm.priceCustomSlots !== "" ? parseInt(editForm.priceCustomSlots, 10) : null;
        await fetch(`/admin/tariffs/${showEdit}`, {
          method: "PUT",
          headers: adminHeaders(adminToken),
          body: JSON.stringify(tariffBody),
        });
      }

      setShowEdit(null);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api-keys/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmDelete(null);
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetUsage = async (id) => {
    try {
      const res = await fetch(`/api-keys/${id}/reset-usage`, {
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
      const res = await fetch(`/api-keys/${keyObj.id}`, {
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

  const openEdit = (keyObj) => {
    const tariff = keyObj.tariff;
    setEditForm({
      label: keyObj.label || "",
      maxUses: keyObj.max_uses ?? "",
      active: keyObj.active,
      comment: keyObj.comment || "",
      priceCreate: tariff ? String(tariff.price_create) : "1000",
      priceReschedule: tariff ? String(tariff.price_reschedule) : "7000",
      priceCreatePeak:
        tariff && tariff.price_create_peak != null ? String(tariff.price_create_peak) : "",
      priceCustomSlots:
        tariff && tariff.price_custom_slots != null ? String(tariff.price_custom_slots) : "",
    });
    setShowEdit(keyObj.id);
  };

  const fetchUsageHistory = async (keyId, hideTest = true) => {
    if (expandedHistory[keyId] !== undefined && expandedHistory[keyId] !== null) {
      const currentHideTest = historyHideTest[keyId] ?? true;
      if (hideTest === currentHideTest) return;
    }
    setHistoryLoading((p) => ({ ...p, [keyId]: true }));
    try {
      const res = await fetch(
        `/usage-log?api_key_id=${keyId}&hide_test=${hideTest}`,
        {
          headers: adminHeadersJson(adminToken),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExpandedHistory((p) => ({
        ...p,
        [keyId]: Array.isArray(data) ? data : data.logs || data.records || [],
      }));
      setHistoryHideTest((p) => ({ ...p, [keyId]: hideTest }));
    } catch (err) {
      setExpandedHistory((p) => ({ ...p, [keyId]: null }));
    } finally {
      setHistoryLoading((p) => ({ ...p, [keyId]: false }));
    }
  };

  const toggleHistory = (keyId) => {
    if (expandedHistory[keyId] !== undefined) {
      setExpandedHistory((p) => {
        const n = { ...p };
        delete n[keyId];
        return n;
      });
    } else {
      fetchUsageHistory(keyId, true);
    }
  };

  const handleDeleteUsage = async (keyId, usageId) => {
    try {
      const res = await fetch(`/usage-log/${usageId}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExpandedHistory((prev) => {
        const updated = { ...prev };
        const entries = updated[keyId];
        if (entries) {
          updated[keyId] = entries.filter((l) => l.id !== usageId);
        }
        return updated;
      });
    } catch (err) {
      setError(err.message);
    }
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
      const res = await fetch("/admin/expenses", {
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
      const res = await fetch(`/admin/expenses/${expenseForm.id}`, {
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
      const res = await fetch("/admin/payouts", {
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
      const nameRes = await fetch(`/admin/payouts/${payoutForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ name: payoutForm.name }),
      });
      if (!nameRes.ok) throw new Error(`HTTP ${nameRes.status} (name)`);

      // Пересчитываем с новыми данными
      const splits = (payoutForm.splits || [])
        .filter((s) => s.user_id != null)
        .map((s) => ({ user_id: s.user_id, split_pct: Number(s.split_pct) || 0 }));
      const recalcRes = await fetch(`/admin/payouts/${payoutForm.id}/recalculate`, {
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
      const res = await fetch(`/admin/payouts/${id}`, {
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
      const res = await fetch("/admin/prepaid-packages", {
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
      const res = await fetch(`/admin/prepaid-packages/${id}`, {
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
      const res = await fetch(`/admin/prepaid-packages/${id}`, {
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
      const res = await fetch(`/admin/prepaid-packages/${id}/top-up`, {
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
      const res = await fetch(`/admin/payouts/${id}`, {
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

      const res = await fetch(`/admin/payouts/${id}/recalculate`, {
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
      const body = { name: userForm.name };
      const res = await fetch("/admin/users", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserForm({ id: null, name: "" });
      setShowUserModal(false);
      fetchUsers(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!userForm.id) return;
    try {
      const body = { name: userForm.name };
      const res = await fetch(`/admin/users/${userForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserForm({ id: null, name: "" });
      setShowUserModal(false);
      fetchUsers(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      const res = await fetch(`/admin/users/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchUsers(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (id) => {
    try {
      const res = await fetch(`/admin/expenses/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchExpenses(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePluginLogs = (usageLogId) => {
    setExpandedLogs((p) => ({ ...p, [usageLogId]: !p[usageLogId] }));
  };

  const toggleConfig = (usageLogId) => {
    setExpandedConfig((p) => ({ ...p, [usageLogId]: !p[usageLogId] }));
  };

  const openUsageLogEdit = (entry) => {
    setUsageLogEditForm({
      price: entry.price ?? "",
      paid: entry.paid === null || entry.paid === undefined ? "" : String(entry.paid),
    });
    setShowUsageLogEdit(entry);
  };

  const handleSaveUsageLog = async (e) => {
    e.preventDefault();
    if (!showUsageLogEdit) return;
    try {
      const body = {};
      if (usageLogEditForm.price !== "") {
        body.price = parseInt(usageLogEditForm.price, 10);
      }
      if (usageLogEditForm.paid !== "") {
        body.paid = usageLogEditForm.paid === "true";
      }
      const res = await fetch(`/admin/usage-log/${showUsageLogEdit.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const keyId = Object.keys(expandedHistory).find((k) => expandedHistory[k]?.some((l) => l.id === showUsageLogEdit.id));
      if (keyId) {
        setExpandedHistory((prev) => {
          const updated = { ...prev };
          const entries = [...(updated[keyId] || [])];
          const idx = entries.findIndex((l) => l.id === showUsageLogEdit.id);
          if (idx !== -1) {
            entries[idx] = { ...entries[idx], ...body };
          }
          updated[keyId] = entries;
          return updated;
        });
      }
      setShowUsageLogEdit(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInlinePriceChange = async (logId, newPrice) => {
    try {
      const res = await fetch(`/admin/usage-log/${logId}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ price: newPrice }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const keyId = Object.keys(expandedHistory).find((k) => expandedHistory[k]?.some((l) => l.id === logId));
      if (keyId) {
        setExpandedHistory((prev) => {
          const updated = { ...prev };
          const entries = [...(updated[keyId] || [])];
          const idx = entries.findIndex((l) => l.id === logId);
          if (idx !== -1) {
            entries[idx] = { ...entries[idx], price: newPrice };
          }
          updated[keyId] = entries;
          return updated;
        });
      }
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInlineTogglePaid = async (logId) => {
    const entry = Object.values(expandedHistory)
      .flat()
      .find((l) => l.id === logId);
    if (!entry) return;

    const nextPaid = entry.paid === true ? false : entry.paid === false ? null : true;
    try {
      const res = await fetch(`/admin/usage-log/${logId}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ paid: nextPaid }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const keyId = Object.keys(expandedHistory).find((k) => expandedHistory[k]?.some((l) => l.id === logId));
      if (keyId) {
        setExpandedHistory((prev) => {
          const updated = { ...prev };
          const entries = [...(updated[keyId] || [])];
          const idx = entries.findIndex((l) => l.id === logId);
          if (idx !== -1) {
            entries[idx] = { ...entries[idx], paid: nextPaid };
          }
          updated[keyId] = entries;
          return updated;
        });
      }
      fetchKeys(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!adminToken) {
    return (
      <AdminAuth
        authInput={authInput}
        setAuthInput={setAuthInput}
        authError={authError}
        authLoading={authLoading}
        onAuth={doAuth}
      />
    );
  }

  return (
    <div className="container-fluid px-3 py-3" style={{ maxWidth: "1400px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0 fw-bold" style={{ fontSize: "1.125rem" }}>Админ-панель</h4>
        <div className="d-flex gap-2 align-items-center">
          {activeTab === "keys" && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
              + Новый ключ
            </button>
          )}
                    {activeTab === "users" && (
            <button className="btn btn-sm btn-primary" onClick={() => { setUserForm({ id: null, name: "" }); setShowUserModal(true); }}>
              + Новый пользователь
            </button>
          )}
          <button className="btn btn-sm btn-outline-secondary" onClick={handleLogout}>
            Выйти
          </button>
          <Link to="/" className="btn btn-sm btn-outline-secondary">← Назад</Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert" style={{ borderRadius: 0, fontSize: "0.625rem", fontFamily: "var(--bs-font-monospace)" }}>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      <ul className="nav nav-cyber mb-3">
        {ADMIN_TABS.map((tab) => (
          <li className="nav-item" key={tab.id}>
            <button
              className={`nav-link ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => { setActiveTab(tab.id); setSearchParams({ tab: tab.id }); }}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === "reports" && (
        <ReportsTab
          adminToken={adminToken}
          onError={(msg) => setError(msg)}
          onInvoiceGenerated={handleManualInvoiceCreated}
        />
      )}

      {activeTab === "keys" && (
        <ApiKeysTab
          keys={keys}
          loading={loading}
          error={error}
          newKey={newKey}
          expandedHistory={expandedHistory}
          historyLoading={historyLoading}
          historyHideTest={historyHideTest}
          expandedLogs={expandedLogs}
          expandedConfig={expandedConfig}
          onEditKey={openEdit}
          onToggleActive={handleToggleActive}
          onToggleHistory={toggleHistory}
          onFetchUsageHistory={fetchUsageHistory}
          onDeleteUsage={handleDeleteUsage}
          onEditUsageLog={openUsageLogEdit}
          onTogglePluginLogs={togglePluginLogs}
          onToggleConfig={toggleConfig}
          onCloseNewKey={() => setNewKey(null)}
          editingPriceId={editingPriceId}
          setEditingPriceId={setEditingPriceId}
          onPriceChange={handleInlinePriceChange}
          onTogglePaid={handleInlineTogglePaid}
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

      {activeTab === "operators" && (
        <OperatorsTab adminToken={adminToken} onError={setError} />
      )}

      {activeTab === "invoices" && (
        <InvoicesTab
          adminToken={adminToken}
          onError={(msg) => setError(msg)}
          users={users}
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

      {activeTab === "payouts" && (
        <PayoutsTab
          payouts={payouts}
          onRefresh={() => fetchPayouts(adminToken)}
          onCreate={() => {
            const n = users.length || 1;
            const base = Math.floor(100 / n);
            const remainder = 100 - base * n;
            const autoSplits = users.map((u, i) => ({
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
          onEdit={(u) => { setUserForm({ id: u.id, name: u.name }); setShowUserModal(true); }}
          onDelete={handleDeleteUser}
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

      <KeyFormModal
        show={showCreate}
        mode="create"
        form={createForm}
        setForm={setCreateForm}
        onSubmit={handleCreate}
        onClose={() => setShowCreate(false)}
      />

      <KeyFormModal
        show={showEdit}
        mode="edit"
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleEdit}
        onClose={() => setShowEdit(null)}
        onResetUsage={() => { if (showEdit) handleResetUsage(showEdit); }}
        onDeleteKey={() => { if (showEdit) { setShowEdit(null); setConfirmDelete(showEdit); } }}
      />

      <DeleteConfirmModal
        show={!!confirmDelete}
        onConfirm={() => handleDelete(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />

      <UsageLogEditModal
        show={!!showUsageLogEdit}
        entry={showUsageLogEdit}
        form={usageLogEditForm}
        setForm={setUsageLogEditForm}
        onSubmit={handleSaveUsageLog}
        onClose={() => setShowUsageLogEdit(null)}
      />

      <ExpenseModal
        show={showExpenseModal}
        form={expenseForm}
        setForm={setExpenseForm}
        onSubmit={expenseForm.id ? handleUpdateExpense : handleCreateExpense}
        onClose={() => setShowExpenseModal(false)}
        users={users}
      />

      <PayoutModal
        show={showPayoutModal}
        form={payoutForm}
        setForm={setPayoutForm}
        onSubmit={payoutForm.id ? handleUpdatePayout : handleCreatePayout}
        onClose={() => setShowPayoutModal(false)}
        preview={payoutPreview}
        users={users}
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
      />
    </div>
  );
}

export default AdminPage;


