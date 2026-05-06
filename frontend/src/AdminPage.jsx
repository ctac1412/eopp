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
  StreamsTab,
  TestBenchmarkTab,
  WithdrawalsTab,
  WithdrawalModal,
  KeyFormModal,
  DeleteConfirmModal,
  InvoiceModal,
  UsageLogEditModal,
} from "./components/admin";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
}

function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem("admin_token") || null,
  );
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "keys"
  );
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
  });
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalForm, setWithdrawalForm] = useState({ id: null, name: "", percent: "", tax_percent: "0", percent_type: "included", requisites: "" });
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [selectedUsageLogs, setSelectedUsageLogs] = useState({});
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ apiKeyId: null, withdrawalId: "" });
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

  const fetchWithdrawals = useCallback(
    async (token) => {
      const t = token || adminToken;
      if (!t) return;
      try {
        const res = await fetch("/admin/withdrawals", {
          headers: adminHeadersJson(t),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setWithdrawals(Array.isArray(data) ? data : []);
      } catch (err) {
        setWithdrawals([]);
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
    if (adminToken && activeTab === "withdrawals") {
      fetchWithdrawals(adminToken);
    }
  }, [adminToken, activeTab, fetchWithdrawals]);

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

      if (editForm.priceCreate !== "" || editForm.priceReschedule !== "") {
        const tariffBody = {};
        if (editForm.priceCreate !== "") {
          tariffBody.price_create = parseInt(editForm.priceCreate, 10);
        }
        if (editForm.priceReschedule !== "") {
          tariffBody.price_reschedule = parseInt(editForm.priceReschedule, 10);
        }
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
    });
    setShowEdit(keyObj.id);
  };

  const fetchUsageHistory = async (keyId, hideTest = false) => {
    if (expandedHistory[keyId] && !hideTest) return;
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
      fetchUsageHistory(keyId, false);
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

  const handleCreateWithdrawal = async (e) => {
    e.preventDefault();
    try {
      const body = {
        name: withdrawalForm.name,
        percent: parseInt(withdrawalForm.percent, 10),
        tax_percent: parseInt(withdrawalForm.tax_percent, 10),
        percent_type: withdrawalForm.percent_type,
        requisites: withdrawalForm.requisites,
      };
      const res = await fetch("/admin/withdrawals", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWithdrawalForm({ id: null, name: "", percent: "", tax_percent: "0", percent_type: "included", requisites: "" });
      setShowWithdrawalModal(false);
      fetchWithdrawals(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateWithdrawal = async (e) => {
    e.preventDefault();
    if (!withdrawalForm.id) return;
    try {
      const body = {
        name: withdrawalForm.name,
        percent: parseInt(withdrawalForm.percent, 10),
        tax_percent: parseInt(withdrawalForm.tax_percent, 10),
        percent_type: withdrawalForm.percent_type,
        requisites: withdrawalForm.requisites,
      };
      const res = await fetch(`/admin/withdrawals/${withdrawalForm.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWithdrawalForm({ id: null, name: "", percent: "", tax_percent: "0", percent_type: "included", requisites: "" });
      setShowWithdrawalModal(false);
      fetchWithdrawals(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteWithdrawal = async (id) => {
    try {
      const res = await fetch(`/admin/withdrawals/${id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchWithdrawals(adminToken);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGenerateInvoice = async () => {
    try {
      const selectedIds = Object.entries(selectedUsageLogs)
        .filter(([_, v]) => v)
        .map(([k, _]) => parseInt(k, 10));
      if (selectedIds.length === 0) {
        setError("Выберите хотя бы одну запись");
        return;
      }
      if (!invoiceForm.withdrawalId) {
        setError("Выберите получателя");
        return;
      }
      const body = {
        api_key_id: invoiceForm.apiKeyId,
        usage_log_ids: selectedIds,
        withdrawal_id: parseInt(invoiceForm.withdrawalId, 10),
      };
      const res = await fetch("/admin/generate-invoice", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      alert(`Счёт ${data.invoice_number} создан! Сумма: ${data.total_with_commission} ₽`);
      setShowInvoiceModal(false);
      setSelectedUsageLogs({});
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleUsageLogSelection = (logId) => {
    setSelectedUsageLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
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

  const tabs = [
    { id: "keys", label: "API Keys" },
    { id: "streams", label: "Стримы" },
    { id: "testbench", label: "Тесты и бенчмарк" },
    { id: "withdrawals", label: "Способы вывода" },
  ];

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
    <div className="admin-page">
      <div className="admin-header">
        <h1>Админ-панель</h1>
        <div className="admin-header__right">
          {activeTab === "keys" && (
            <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
              + Новый ключ
            </button>
          )}
          {activeTab === "withdrawals" && (
            <button className="btn btn--primary" onClick={() => { setWithdrawalForm({ id: null, name: "", percent: "", tax_percent: "0", percent_type: "included", requisites: "" }); setShowWithdrawalModal(true); }}>
              + Новый способ вывода
            </button>
          )}
          <button className="btn btn--secondary" onClick={handleLogout} style={{ fontSize: "11px", padding: "5px 10px" }}>
            Выйти
          </button>
          <Link to="/" className="back-link">← Назад к капчам</Link>
        </div>
      </div>

      <div className="admin-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "tab--active" : ""}`}
            onClick={() => { setActiveTab(tab.id); setSearchParams({ tab: tab.id }); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="admin-error">{error}</div>}

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
          selectedUsageLogs={selectedUsageLogs}
          onEditKey={openEdit}
          onToggleActive={handleToggleActive}
          onToggleHistory={toggleHistory}
          onFetchUsageHistory={fetchUsageHistory}
          onDeleteUsage={handleDeleteUsage}
          onEditUsageLog={openUsageLogEdit}
          onToggleUsageLogSelection={toggleUsageLogSelection}
          onTogglePluginLogs={togglePluginLogs}
          onToggleConfig={toggleConfig}
          onCloseNewKey={() => setNewKey(null)}
          onShowInvoiceModal={(keyId) => {
            setInvoiceForm({ apiKeyId: keyId, withdrawalId: "" });
            setShowInvoiceModal(true);
            fetchWithdrawals(adminToken);
          }}
          editingPriceId={editingPriceId}
          setEditingPriceId={setEditingPriceId}
          onPriceChange={handleInlinePriceChange}
          onTogglePaid={handleInlineTogglePaid}
        />
      )}

      {activeTab === "streams" && (
        <StreamsTab streams={streams} streamsLoading={streamsLoading} />
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

      {activeTab === "withdrawals" && (
        <WithdrawalsTab
          withdrawals={withdrawals}
          onEdit={(w) => { setWithdrawalForm({ id: w.id, name: w.name, percent: String(w.percent), tax_percent: String(w.tax_percent || 0), percent_type: w.percent_type || "included", requisites: w.requisites }); setShowWithdrawalModal(true); }}
          onDelete={handleDeleteWithdrawal}
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

      <InvoiceModal
        show={showInvoiceModal}
        withdrawals={withdrawals}
        selectedCount={Object.values(selectedUsageLogs).filter(Boolean).length}
        form={invoiceForm}
        setForm={setInvoiceForm}
        onGenerate={handleGenerateInvoice}
        onClose={() => setShowInvoiceModal(false)}
      />

      <UsageLogEditModal
        show={!!showUsageLogEdit}
        entry={showUsageLogEdit}
        form={usageLogEditForm}
        setForm={setUsageLogEditForm}
        onSubmit={handleSaveUsageLog}
        onClose={() => setShowUsageLogEdit(null)}
      />

      <WithdrawalModal
        show={showWithdrawalModal}
        form={withdrawalForm}
        setForm={setWithdrawalForm}
        onSubmit={withdrawalForm.id ? handleUpdateWithdrawal : handleCreateWithdrawal}
        onClose={() => setShowWithdrawalModal(false)}
      />
    </div>
  );
}

export default AdminPage;