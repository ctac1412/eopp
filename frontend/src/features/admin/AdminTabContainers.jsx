import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  AITab,
  BackendLogsTab,
  CaptchasTab,
  CompaniesTab,
  DefaultPayoutSplitsModal,
  ExpenseModal,
  ExpensesTab,
  FinanceTab,
  InvoicesTab,
  OperationsDashboardTab,
  OperatorsTab,
  PayoutModal,
  PayoutsTab,
  PluginChannelTab,
  PrepaidPackagesTab,
  ReportsTab,
  StreamsTab,
  TestBenchmarkTab,
  TrainingAdminTab,
  UserModal,
  UsersTab,
  UserStatsModal,
} from "./adminComponents";
import { adminHeaders, adminHeadersJson, adminRequest } from "./shared/adminClient";
import { expenseRepaymentsFromForm } from "./payouts/payoutExpenseRepayments";
import { accessPayloadFromForm, emptyAccess, normalizeAccess } from "./users/userCompanyAccess";

const EMPTY_EXPENSE_FORM = { id: null, amount: "", reason: "", user_id: null, comment: "", created_at: "" };
const EMPTY_PAYOUT_FORM = { id: null, name: "", invoice_ids: [], expense_ids: [], expense_repayments: {}, splits: [] };
const EMPTY_USER_FORM = {
  id: null,
  name: "",
  login: "",
  password: "",
  role: "manager",
  systemRole: "",
  active: true,
  isDirector: false,
  isTest: false,
  companyId: "",
  financeAccess: emptyAccess(),
  operatorAccess: emptyAccess(),
  executorAccess: emptyAccess(),
};

async function getJson(path, adminToken, fallback = []) {
  const res = await adminRequest(path, { headers: adminHeadersJson(adminToken) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data ?? fallback;
}

export function OperationsTabContainer({ adminToken, onError }) {
  return <OperationsDashboardTab adminToken={adminToken} onError={onError} />;
}

export function OperatorsTabContainer({ adminToken, onError }) {
  return <OperatorsTab adminToken={adminToken} onError={onError} />;
}

export function CompaniesTabContainer({ adminToken, onError }) {
  return <CompaniesTab adminToken={adminToken} onError={onError} />;
}

export function PluginChannelTabContainer({ adminToken, onError }) {
  return <PluginChannelTab adminToken={adminToken} onError={onError} />;
}

export function FinanceTabContainer({ adminToken, onError }) {
  return <FinanceTab adminToken={adminToken} onError={onError} />;
}

export function AITabContainer({ adminToken }) {
  return <AITab adminToken={adminToken} />;
}

export function BackendLogsTabContainer({ adminToken, onError }) {
  return <BackendLogsTab adminToken={adminToken} onError={onError} />;
}

export function TrainingAdminTabContainer({ adminToken, onError }) {
  return <TrainingAdminTab adminToken={adminToken} onError={onError} />;
}

export function ReportsTabContainer({ adminToken, onError }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!adminToken) return;
    getJson("/admin/finance-participants", adminToken)
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [adminToken]);

  const handleInvoiceGenerated = useCallback((invoiceId) => {
    if (!invoiceId) return;
    navigate(`/admin/invoices?invoice_id=${encodeURIComponent(String(invoiceId))}`);
  }, [navigate]);

  return (
    <ReportsTab
      adminToken={adminToken}
      onError={onError}
      onInvoiceGenerated={handleInvoiceGenerated}
      users={users}
    />
  );
}

export function InvoicesTabContainer({ adminToken, onError }) {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!adminToken) return;
    getJson("/admin/finance-participants", adminToken)
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [adminToken]);

  return (
    <InvoicesTab
      adminToken={adminToken}
      onError={onError}
      users={users}
      focusInvoiceId={searchParams.get("invoice_id")}
    />
  );
}

export function CaptchasTabContainer({ adminToken, onError }) {
  const [activeSubtab, setActiveSubtab] = useState("operations");
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    if (!adminToken) return;
    getJson("/api-keys", adminToken)
      .then((data) => setKeys(Array.isArray(data) ? data : data.keys || []))
      .catch((err) => onError?.(err.message));
  }, [adminToken, onError]);

  return (
    <CaptchasTab
      adminToken={adminToken}
      keys={keys}
      onError={onError}
      activeSubtab={activeSubtab}
      onSubtabChange={setActiveSubtab}
    />
  );
}

export function ExpensesTabContainer({ adminToken, onError }) {
  const [expenses, setExpenses] = useState([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [financeParticipants, setFinanceParticipants] = useState([]);

  const fetchExpenses = useCallback(async () => {
    try {
      const data = await getJson("/admin/expenses", adminToken, {});
      setExpenses(Array.isArray(data) ? data : data.expenses || []);
      setExpenseTotal(data.total || 0);
    } catch {
      setExpenses([]);
      setExpenseTotal(0);
    }
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    fetchExpenses();
    getJson("/admin/users", adminToken).then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
    getJson("/admin/finance-participants", adminToken).then((data) => setFinanceParticipants(Array.isArray(data) ? data : [])).catch(() => setFinanceParticipants([]));
  }, [adminToken, fetchExpenses]);

  const submitExpense = async (event) => {
    event.preventDefault();
    try {
      const body = {
        amount: parseInt(expenseForm.amount, 10),
        reason: expenseForm.reason,
        user_id: expenseForm.user_id,
        comment: expenseForm.comment,
      };
      if (expenseForm.created_at) body.created_at = expenseForm.created_at;
      const path = expenseForm.id ? `/admin/expenses/${expenseForm.id}` : "/admin/expenses";
      const res = await adminRequest(path, {
        method: expenseForm.id ? "PUT" : "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExpenseForm(EMPTY_EXPENSE_FORM);
      setShowExpenseModal(false);
      fetchExpenses();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const deleteExpense = async (id) => {
    try {
      const res = await adminRequest(`/admin/expenses/${id}`, { method: "DELETE", headers: adminHeadersJson(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchExpenses();
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <>
      <ExpensesTab
        expenses={expenses}
        total={expenseTotal}
        users={users}
        onRefresh={fetchExpenses}
        onCreate={() => { setExpenseForm(EMPTY_EXPENSE_FORM); setShowExpenseModal(true); }}
        onEdit={(expense) => {
          setExpenseForm({ id: expense.id, amount: String(expense.amount), reason: expense.reason, user_id: expense.user_id, comment: expense.comment || "", created_at: expense.created_at });
          setShowExpenseModal(true);
        }}
        onDelete={deleteExpense}
      />
      <ExpenseModal
        show={showExpenseModal}
        form={expenseForm}
        setForm={setExpenseForm}
        onSubmit={submitExpense}
        onClose={() => setShowExpenseModal(false)}
        users={financeParticipants}
      />
    </>
  );
}

export function PrepaidPackagesTabContainer({ adminToken, onError }) {
  const [packages, setPackages] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [keys, setKeys] = useState([]);

  const refreshPackages = useCallback(() => {
    if (!adminToken) return;
    getJson("/admin/prepaid-packages", adminToken).then((data) => setPackages(Array.isArray(data) ? data : [])).catch(() => setPackages([]));
    getJson("/admin/prepaid-deductions", adminToken).then((data) => setDeductions(Array.isArray(data) ? data : [])).catch(() => setDeductions([]));
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    refreshPackages();
    getJson("/api-keys", adminToken).then((data) => setKeys(Array.isArray(data) ? data : data.keys || [])).catch((err) => onError?.(err.message));
  }, [adminToken, onError, refreshPackages]);

  const mutate = async (path, method, payload) => {
    try {
      const res = await adminRequest(path, {
        method,
        headers: payload == null ? adminHeadersJson(adminToken) : adminHeaders(adminToken),
        body: payload == null ? undefined : JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refreshPackages();
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <PrepaidPackagesTab
      packages={packages}
      deductions={deductions}
      keys={keys}
      onRefresh={refreshPackages}
      onCreate={(payload) => mutate("/admin/prepaid-packages", "POST", payload)}
      onUpdate={(id, payload) => mutate(`/admin/prepaid-packages/${id}`, "PATCH", payload)}
      onDelete={(id) => mutate(`/admin/prepaid-packages/${id}`, "DELETE")}
      onTopUp={(id, amount) => mutate(`/admin/prepaid-packages/${id}/top-up`, "POST", { amount })}
    />
  );
}

export function StreamsTabContainer({ adminToken }) {
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(false);

  useEffect(() => {
    if (!adminToken) return;
    setStreamsLoading(true);
    getJson("/admin/streams", adminToken)
      .then((data) => setStreams(Array.isArray(data) ? data : []))
      .catch(() => setStreams([]))
      .finally(() => setStreamsLoading(false));
  }, [adminToken]);

  return <StreamsTab streams={streams} streamsLoading={streamsLoading} adminToken={adminToken} />;
}

export function TestBenchmarkTabContainer({ adminToken, onError }) {
  const [testStats, setTestStats] = useState(null);
  const [testStatsLoading, setTestStatsLoading] = useState(false);
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  useEffect(() => {
    if (!adminToken) return;
    setTestStatsLoading(true);
    getJson("/admin/test-stats", adminToken, null)
      .then(setTestStats)
      .catch(() => setTestStats(null))
      .finally(() => setTestStatsLoading(false));
  }, [adminToken]);

  const runBenchmark = async () => {
    setBenchmarkRunning(true);
    setBenchmarkLoading(true);
    try {
      const res = await adminRequest("/admin/benchmark", { method: "POST", headers: adminHeaders(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBenchmark(await res.json());
    } catch (err) {
      onError?.(err.message);
      setBenchmark({ error: err.message });
    } finally {
      setBenchmarkLoading(false);
      setBenchmarkRunning(false);
    }
  };

  return (
    <TestBenchmarkTab
      testStats={testStats}
      testStatsLoading={testStatsLoading}
      benchmark={benchmark}
      benchmarkLoading={benchmarkLoading}
      benchmarkRunning={benchmarkRunning}
      onRunBenchmark={runBenchmark}
      adminToken={adminToken}
    />
  );
}

export function PayoutsTabContainer({ adminToken, onError }) {
  const [payouts, setPayouts] = useState([]);
  const [users, setUsers] = useState([]);
  const [payoutForm, setPayoutForm] = useState(EMPTY_PAYOUT_FORM);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutPreview, setPayoutPreview] = useState(null);
  const [payoutPreviewLoading, setPayoutPreviewLoading] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState([]);
  const [availableExpenses, setAvailableExpenses] = useState([]);
  const [showDefaultPayoutSplitsModal, setShowDefaultPayoutSplitsModal] = useState(false);
  const [defaultPayoutSplitsForm, setDefaultPayoutSplitsForm] = useState([]);
  const [defaultPayoutSplitsSaving, setDefaultPayoutSplitsSaving] = useState(false);

  const fetchPayouts = useCallback(() => {
    if (!adminToken) return;
    getJson("/admin/payouts", adminToken).then((data) => setPayouts(Array.isArray(data) ? data : [])).catch(() => setPayouts([]));
  }, [adminToken]);

  const fetchAvailableResources = useCallback(() => {
    if (!adminToken) return;
    getJson("/admin/payouts/available", adminToken, {})
      .then((data) => {
        setAvailableInvoices(data.invoices || []);
        setAvailableExpenses(data.expenses || []);
      })
      .catch(() => {
        setAvailableInvoices([]);
        setAvailableExpenses([]);
      });
  }, [adminToken]);

  const fetchDefaultPayoutSplits = useCallback(async () => {
    const data = await getJson("/admin/default-payout-splits", adminToken, {});
    return Array.isArray(data?.splits) ? data.splits : [];
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    fetchPayouts();
    fetchAvailableResources();
    getJson("/admin/users", adminToken).then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
  }, [adminToken, fetchAvailableResources, fetchPayouts]);

  const fetchAllResources = async () => {
    try {
      const [invRes, expRes] = await Promise.all([
        adminRequest("/admin/invoices", { headers: adminHeadersJson(adminToken) }),
        adminRequest("/admin/expenses", { headers: adminHeadersJson(adminToken) }),
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        setAvailableInvoices(Array.isArray(invData) ? invData.filter((invoice) => Number(invoice.paid) === 1 && invoice.allocation?.status !== "fully_allocated") : []);
      }
      if (expRes.ok) {
        const expData = await expRes.json();
        setAvailableExpenses(Array.isArray(expData.expenses) ? expData.expenses : []);
      }
    } catch {
      setAvailableInvoices([]);
      setAvailableExpenses([]);
    }
  };

  const preview = useCallback(async (invoiceIds, expenseIds, splits, expenseRepayments = []) => {
    setPayoutPreviewLoading(true);
    try {
      const res = await adminRequest("/admin/payouts/preview", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ invoice_ids: invoiceIds || [], expense_ids: expenseIds || [], expense_repayments: expenseRepayments || [], user_splits: splits || [] }),
      });
      setPayoutPreview(res.ok ? await res.json() : null);
    } catch {
      setPayoutPreview(null);
    } finally {
      setPayoutPreviewLoading(false);
    }
  }, [adminToken]);

  const savePayout = async (event) => {
    event.preventDefault();
    try {
      const splits = (payoutForm.splits || []).filter((s) => s.user_id != null).map((s) => ({ user_id: s.user_id, split_pct: Number(s.split_pct) || 0 }));
      const body = {
        name: payoutForm.name,
        invoice_ids: payoutForm.invoice_ids || [],
        expense_ids: payoutForm.expense_ids || [],
        expense_repayments: expenseRepaymentsFromForm(payoutForm),
        user_splits: splits,
      };
      if (payoutForm.id) {
        const nameRes = await adminRequest(`/admin/payouts/${payoutForm.id}`, { method: "PUT", headers: adminHeaders(adminToken), body: JSON.stringify({ name: payoutForm.name }) });
        if (!nameRes.ok) throw new Error(`HTTP ${nameRes.status} (name)`);
        const recalcRes = await adminRequest(`/admin/payouts/${payoutForm.id}/recalculate`, { method: "POST", headers: adminHeaders(adminToken), body: JSON.stringify(body) });
        if (!recalcRes.ok) throw new Error(`HTTP ${recalcRes.status} (recalculate)`);
      } else {
        const res = await adminRequest("/admin/payouts", { method: "POST", headers: adminHeaders(adminToken), body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setPayoutForm(EMPTY_PAYOUT_FORM);
      setShowPayoutModal(false);
      setPayoutPreview(null);
      fetchPayouts();
      fetchAvailableResources();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const openDefaultPayoutSplits = async () => {
    try {
      const splits = await fetchDefaultPayoutSplits();
      setDefaultPayoutSplitsForm(splits.map((split) => ({ user_id: split.user_id, split_pct: Number(split.split_pct) || 0 })));
      setShowDefaultPayoutSplitsModal(true);
    } catch (err) {
      onError?.(`Не удалось загрузить дефолтные доли выплаты: ${err.message}`);
    }
  };

  const saveDefaultPayoutSplits = async () => {
    setDefaultPayoutSplitsSaving(true);
    try {
      const splits = (defaultPayoutSplitsForm || []).filter((split) => split.user_id != null).map((split) => ({ user_id: split.user_id, split_pct: Number(split.split_pct) || 0 }));
      const res = await adminRequest("/admin/default-payout-splits", { method: "PUT", headers: adminHeaders(adminToken), body: JSON.stringify({ splits }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowDefaultPayoutSplitsModal(false);
    } catch (err) {
      onError?.(`Не удалось сохранить дефолтные доли выплаты: ${err.message}`);
    } finally {
      setDefaultPayoutSplitsSaving(false);
    }
  };

  const deletePayout = async (id) => {
    try {
      const res = await adminRequest(`/admin/payouts/${id}`, { method: "DELETE", headers: adminHeadersJson(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const setPayoutStatus = async (id, status) => {
    try {
      const res = await adminRequest(`/admin/payouts/${id}`, { method: "PATCH", headers: adminHeaders(adminToken), body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const recalculatePayout = async (id) => {
    try {
      const payout = payouts.find((item) => item.id === id);
      if (!payout) return;
      const res = await adminRequest(`/admin/payouts/${id}/recalculate`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          name: payout.name,
          invoice_ids: (payout.invoices || []).map((invoice) => invoice.invoice_id || invoice.id),
          expense_ids: (payout.expenses || []).map((expense) => expense.expense_id || expense.id),
          user_splits: (payout.shares || []).map((share) => ({ user_id: share.user_id, split_pct: Number(share.split_pct) || 0 })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchPayouts();
      fetchAvailableResources();
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <>
      <PayoutsTab
        payouts={payouts}
        onRefresh={fetchPayouts}
        onConfigureDefaultSplits={openDefaultPayoutSplits}
        onCreate={async () => {
          try {
            const defaultSplits = await fetchDefaultPayoutSplits();
            const splits = defaultSplits.filter((split) => split.user_id != null).map((split) => ({ user_id: split.user_id, split_pct: Number(split.split_pct) || 0 }));
            setPayoutForm({ ...EMPTY_PAYOUT_FORM, splits });
            setPayoutPreview(null);
            setShowPayoutModal(true);
          } catch (err) {
            onError?.(`Не удалось загрузить дефолтные доли выплаты: ${err.message}`);
          }
        }}
        onDelete={deletePayout}
        onRecalculate={recalculatePayout}
        onStatusChange={setPayoutStatus}
      />
      <PayoutModal
        show={showPayoutModal}
        form={payoutForm}
        setForm={setPayoutForm}
        onSubmit={savePayout}
        onClose={() => setShowPayoutModal(false)}
        preview={payoutPreview}
        users={users}
        availableInvoices={availableInvoices}
        availableExpenses={availableExpenses}
        onPreview={preview}
        previewLoading={payoutPreviewLoading}
        adminToken={adminToken}
      />
      <DefaultPayoutSplitsModal
        open={showDefaultPayoutSplitsModal}
        splits={defaultPayoutSplitsForm}
        users={users}
        saving={defaultPayoutSplitsSaving}
        onChange={setDefaultPayoutSplitsForm}
        onClose={() => setShowDefaultPayoutSplitsModal(false)}
        onSubmit={saveDefaultPayoutSplits}
      />
    </>
  );
}

export function UsersTabContainer({ adminToken, adminRole, adminSystemRole, onError }) {
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showUserStats, setShowUserStats] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const canUseGlobalAccess = !!adminSystemRole || adminRole === "super_admin" || adminRole === "system_admin";

  const fetchUsers = useCallback(() => {
    if (!adminToken) return;
    getJson("/admin/users", adminToken).then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
  }, [adminToken]);

  const fetchCompanies = useCallback(() => {
    if (!adminToken) return;
    getJson("/admin/companies", adminToken).then((data) => setCompanies(Array.isArray(data) ? data : [])).catch(() => setCompanies([]));
  }, [adminToken]);

  const fetchKeys = useCallback(() => {
    if (!adminToken) return;
    getJson("/api-keys", adminToken).then((data) => setKeys(Array.isArray(data) ? data : data.keys || [])).catch((err) => onError?.(err.message));
  }, [adminToken, onError]);

  useEffect(() => {
    fetchUsers();
    fetchKeys();
  }, [fetchKeys, fetchUsers]);

  const saveUser = async (event) => {
    event.preventDefault();
    try {
      const companyId = userForm.companyId ? Number(userForm.companyId) : null;
      const body = {
        name: userForm.name,
        login: userForm.login || null,
        role: userForm.role || "manager",
        system_role: userForm.systemRole || null,
        active: userForm.active !== false,
        is_director: userForm.isDirector === true,
        is_test: userForm.isTest === true,
        company_id: companyId,
        finance_access: accessPayloadFromForm(userForm.financeAccess),
        operator_access: accessPayloadFromForm(userForm.operatorAccess),
        executor_access: accessPayloadFromForm(userForm.executorAccess),
      };
      if (companyId) body.company_memberships = [{ company_id: companyId, role: userForm.role || "manager", active: true }];
      if (!userForm.id || userForm.password) body.password = userForm.password || null;
      const res = await adminRequest(userForm.id ? `/admin/users/${userForm.id}` : "/admin/users", {
        method: userForm.id ? "PUT" : "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserForm(EMPTY_USER_FORM);
      setShowUserModal(false);
      fetchUsers();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const deleteUser = async (id) => {
    try {
      const res = await adminRequest(`/admin/users/${id}`, { method: "DELETE", headers: adminHeadersJson(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchUsers();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const openEditUser = useCallback((user) => {
    setUserForm({
      id: user.id,
      name: user.name || "",
      login: user.login || "",
      password: "",
      role: user.role || "manager",
      systemRole: user.system_role || "",
      active: user.active !== false,
      isDirector: user.is_director === true,
      isTest: user.is_test === true,
      companyId: user.company_id ? String(user.company_id) : "",
      financeAccess: normalizeAccess(user.finance_access),
      operatorAccess: normalizeAccess(user.operator_access),
      executorAccess: normalizeAccess(user.executor_access),
    });
    fetchCompanies();
    fetchKeys();
    setShowUserModal(true);
  }, [fetchCompanies, fetchKeys]);

  const currentUserApiKey = useMemo(
    () => (userForm.id ? keys.find((key) => Number(key.user_id) === Number(userForm.id)) || null : null),
    [keys, userForm.id],
  );

  const handleApiKey = async (path, method, body) => {
    try {
      const res = await adminRequest(path, {
        method,
        headers: body ? adminHeaders(adminToken) : adminHeadersJson(adminToken),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (method === "POST") setNewKey(await res.json());
      fetchKeys();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const openUserStats = async (user) => {
    setShowUserStats(true);
    setUserStats(null);
    setUserStatsLoading(true);
    try {
      const data = await getJson(`/admin/users/${user.id}/stats`, adminToken, null);
      setUserStats(data);
    } catch (err) {
      onError?.(err.message);
      setShowUserStats(false);
    } finally {
      setUserStatsLoading(false);
    }
  };

  return (
    <>
      <UsersTab
        users={users}
        onCreate={() => {
          setUserForm(EMPTY_USER_FORM);
          fetchCompanies();
          setShowUserModal(true);
        }}
        onEdit={openEditUser}
        onDelete={deleteUser}
      />
      <UserModal
        show={showUserModal}
        form={userForm}
        setForm={setUserForm}
        onSubmit={saveUser}
        onClose={() => setShowUserModal(false)}
        companies={companies}
        canUseGlobalAccess={canUseGlobalAccess}
        apiKey={currentUserApiKey}
        newApiKey={newKey}
        onCreateApiKey={(userId) => handleApiKey("/api-keys", "POST", { label: userForm.login || userForm.name || `user-${userId}`, user_id: Number(userId), ...(userForm.companyId ? { company_id: Number(userForm.companyId) } : {}) })}
        onToggleApiKey={(keyObj) => handleApiKey(`/api-keys/${keyObj.id}`, "PUT", { active: !keyObj.active })}
        onResetApiKey={(id) => handleApiKey(`/api-keys/${id}/reset-usage`, "POST")}
        onDeleteApiKey={(id) => {
          if (!window.confirm("Удалить персональный ключ пользователя?")) return;
          handleApiKey(`/api-keys/${id}`, "DELETE");
        }}
        onStats={(user) => openUserStats({ id: user.id, name: user.name })}
      />
      <UserStatsModal
        show={showUserStats}
        stats={userStats}
        loading={userStatsLoading}
        onClose={() => setShowUserStats(false)}
      />
    </>
  );
}
