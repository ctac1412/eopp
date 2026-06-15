import { adminRequest } from "../shared/adminClient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Modal, Space } from "antd";
import { formatMoney } from "../../../utils/format";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { InvoiceEditModal } from "./InvoiceEditModal";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

function adminHeadersJson() {
  return {};
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function allocationStatus(invoice) {
  return invoice.allocation?.status || "not_allocated";
}

function allocationTag(allocation) {
  const status = allocation?.status || "not_allocated";
  if (status === "fully_allocated") return <StatusTag status="confirmed" label="Распределен" />;
  if (status === "partially_allocated") return <StatusTag status="pending" label={`Частично ${allocation.allocated_pct}%`} />;
  return <StatusTag status="neutral" label="Не распределен" />;
}

function findUserName(users, id) {
  if (!id) return "—";
  return users?.find((user) => user.id === id)?.name || `#${id}`;
}

function invoiceSearchText(invoice, users) {
  return [
    invoice.id,
    invoice.invoice_number,
    invoice.comment,
    invoice.company,
    invoice.total_amount,
    invoice.debt_amount,
    findUserName(users, invoice.commission_user_id),
    findUserName(users, invoice.tax_user_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function MoneyCell({ value, tone = "" }) {
  return <span className={`font-monospace text-nowrap ${tone}`}>{formatMoney(value || 0)}</span>;
}

export function InvoicesTab({ adminToken, onError, users, focusInvoiceId }) {
  const [invoices, setInvoices] = useState([]);
  const [companySettings, setCompanySettings] = useState([]);
  const [companyAliases, setCompanyAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [autoCompany, setAutoCompany] = useState("");
  const [autoIssueComment, setAutoIssueComment] = useState("");
  const [aliasForm, setAliasForm] = useState({ alias: "", company: "" });
  const [paidFilter, setPaidFilter] = useState("all");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminRequest("/admin/invoices", { headers: adminHeadersJson(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  const fetchCompanySettings = useCallback(async () => {
    try {
      const [settingsRes, aliasesRes] = await Promise.all([
        adminRequest("/admin/company-billing-settings", { headers: adminHeadersJson(adminToken) }),
        adminRequest("/admin/company-aliases", { headers: adminHeadersJson(adminToken) }),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setCompanySettings(Array.isArray(data) ? data : []);
      }
      if (aliasesRes.ok) {
        const data = await aliasesRes.json();
        setCompanyAliases(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      onError?.(err.message);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchInvoices();
    fetchCompanySettings();
  }, [fetchInvoices, fetchCompanySettings]);

  useEffect(() => {
    if (focusInvoiceId) setSearch(String(focusInvoiceId));
  }, [focusInvoiceId]);

  const refreshBilling = async () => {
    await Promise.all([fetchInvoices(), fetchCompanySettings()]);
  };

  const togglePaid = async (invoice) => {
    const newPaid = !invoice.paid;
    try {
      const res = await adminRequest(`/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ paid: newPaid }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setInvoices((prev) => prev.map((inv) => (inv.id === invoice.id ? { ...inv, ...updated } : inv)));
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const deleteInvoice = (invoice) => {
    Modal.confirm({
      title: "Удалить счет?",
      content: `Счет #${invoice.id} будет удален.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await adminRequest(`/admin/invoices/${invoice.id}`, {
            method: "DELETE",
            headers: adminHeaders(adminToken),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
        } catch (err) {
          setError(err.message);
          onError?.(err.message);
        }
      },
    });
  };

  const handleSaveEdit = async (updated) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? { ...inv, ...updated } : inv)));
  };

  const handleCreated = (newInvoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  };

  const openAutoInvoice = async () => {
    if (!autoCompany.trim()) return;
    try {
      const res = await adminRequest("/admin/auto-invoices/open", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ company: autoCompany.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refreshBilling();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const issueAutoInvoice = async () => {
    if (!autoCompany.trim()) return;
    try {
      const res = await adminRequest("/admin/open-invoices/issue", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ company: autoCompany.trim(), comment: autoIssueComment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAutoIssueComment("");
      await refreshBilling();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const setAutoReopen = async (company, enabled) => {
    try {
      const res = await adminRequest(`/admin/company-billing-settings/${encodeURIComponent(company)}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ auto_invoice_reopen: enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchCompanySettings();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const saveAlias = async (event) => {
    event.preventDefault();
    try {
      const res = await adminRequest("/admin/company-aliases", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(aliasForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAliasForm({ alias: "", company: "" });
      await fetchCompanySettings();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const deleteAlias = async (alias) => {
    try {
      const res = await adminRequest(`/admin/company-aliases/${encodeURIComponent(alias)}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchCompanySettings();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  };

  const userOptions = useMemo(() => {
    const options = new Map();
    users?.forEach((user) => options.set(String(user.id), user.name));
    invoices.forEach((invoice) => {
      if (invoice.commission_user_id) options.set(String(invoice.commission_user_id), findUserName(users, invoice.commission_user_id));
      if (invoice.tax_user_id) options.set(String(invoice.tax_user_id), findUserName(users, invoice.tax_user_id));
    });
    return [...options.entries()].map(([id, name]) => ({ id, name }));
  }, [invoices, users]);

  const companyRows = useMemo(() => {
    const rows = new Map();
    invoices.forEach((invoice) => {
      if (!invoice.company) return;
      const current = rows.get(invoice.company) || { company: invoice.company, activeInvoice: null, closedCount: 0 };
      if (invoice.is_open) current.activeInvoice = invoice;
      else current.closedCount += 1;
      rows.set(invoice.company, current);
    });
    companySettings.forEach((setting) => {
      const current = rows.get(setting.company) || { company: setting.company, activeInvoice: null, closedCount: 0 };
      current.auto_invoice_reopen = !!setting.auto_invoice_reopen;
      rows.set(setting.company, current);
    });
    companyAliases.forEach((alias) => {
      if (!rows.has(alias.company)) {
        rows.set(alias.company, { company: alias.company, activeInvoice: null, closedCount: 0, auto_invoice_reopen: false });
      }
    });
    return [...rows.values()].sort((a, b) => a.company.localeCompare(b.company, "ru"));
  }, [invoices, companySettings, companyAliases]);

  useEffect(() => {
    if (!autoCompany && companyRows.length > 0) setAutoCompany(companyRows[0].company);
  }, [autoCompany, companyRows]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return invoices.filter((invoice) => {
      const createdAt = invoice.created_at ? new Date(invoice.created_at) : null;
      if (q && !invoiceSearchText(invoice, users).includes(q)) return false;
      if (paidFilter === "paid" && !invoice.paid) return false;
      if (paidFilter === "unpaid" && invoice.paid) return false;
      if (allocationFilter !== "all" && allocationStatus(invoice) !== allocationFilter) return false;
      if (
        userFilter !== "all" &&
        String(invoice.commission_user_id || "") !== userFilter &&
        String(invoice.tax_user_id || "") !== userFilter
      ) {
        return false;
      }
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [invoices, search, users, paidFilter, allocationFilter, userFilter, dateFrom, dateTo]);

  const metrics = useMemo(() => {
    const sum = (field) => filteredInvoices.reduce((acc, invoice) => acc + (invoice[field] || 0), 0);
    const paid = filteredInvoices.filter((invoice) => invoice.paid);
    const unpaid = filteredInvoices.filter((invoice) => !invoice.paid);
    return [
      { key: "count", label: "Счета", value: `${filteredInvoices.length} / ${invoices.length}`, tone: filteredInvoices.length === invoices.length ? "neutral" : "warning" },
      { key: "total", label: "Итого", value: formatMoney(sum("total_amount")), tone: "info" },
      { key: "debt", label: "Долг", value: formatMoney(sum("debt_amount")), tone: "success" },
      { key: "commission", label: "Комиссия", value: formatMoney(sum("percent_amount")), tone: "neutral" },
      { key: "tax", label: "Налог", value: formatMoney(sum("tax_amount")), tone: "warning" },
      { key: "side", label: "Опер./исп.", value: formatMoney(sum("side_payout_amount")), tone: "info" },
      { key: "profit", label: "Прибыль", value: formatMoney(sum("profit_amount")), tone: "success" },
      { key: "unpaid", label: "Не оплачено", value: `${unpaid.length} / ${formatMoney(unpaid.reduce((acc, invoice) => acc + (invoice.total_amount || 0), 0))}`, tone: unpaid.length ? "danger" : "success" },
      { key: "paid", label: "Оплачено", value: paid.length, tone: paid.length ? "success" : "neutral" },
    ];
  }, [filteredInvoices, invoices.length]);

  const companyColumns = [
    { title: "Компания", dataIndex: "company", ellipsis: true, render: (value) => <span title={value}>{value}</span> },
    { title: "Открытый", dataIndex: "activeInvoice", width: 92, align: "center", render: (invoice) => (invoice ? `#${invoice.id}` : "—") },
    { title: "Долг", dataIndex: "activeInvoice", width: 110, align: "right", render: (invoice) => <MoneyCell value={invoice?.debt_amount || 0} /> },
    {
      title: "Авто",
      dataIndex: "auto_invoice_reopen",
      width: 84,
      align: "center",
      render: (enabled, row) => (
        <Button size="small" variant={enabled ? "primary" : "secondary"} onClick={() => setAutoReopen(row.company, !enabled)}>
          {enabled ? "Вкл" : "Выкл"}
        </Button>
      ),
    },
    { title: "Ист.", dataIndex: "closedCount", width: 64, align: "center" },
  ];

  const invoiceColumns = [
    {
      title: "Счет",
      width: 170,
      ellipsis: true,
      render: (_, invoice) => (
        <div className="invoice-title-cell" title={invoice.invoice_number || `#${invoice.id}`}>
          <span className="font-monospace">{invoice.invoice_number || `#${invoice.id}`}</span>
          <span className="text-muted">#{invoice.id} · {formatDate(invoice.created_at)}</span>
        </div>
      ),
    },
    { title: "Компания", dataIndex: "company", width: 130, ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    {
      title: "Суммы",
      width: 160,
      align: "right",
      render: (_, invoice) => (
        <div className="invoice-stack-cell">
          <span><span className="text-muted">Долг</span> <MoneyCell value={invoice.debt_amount} /></span>
          <span><span className="text-muted">Итого</span> <MoneyCell value={invoice.total_amount} tone="text-primary fw-semibold" /></span>
        </div>
      ),
    },
    {
      title: "Начисл.",
      width: 145,
      align: "right",
      render: (_, invoice) => (
        <div className="invoice-stack-cell">
          <span><span className="text-muted">Ком.</span> <MoneyCell value={invoice.percent_amount} /></span>
          <span><span className="text-muted">Нал.</span> <MoneyCell value={invoice.tax_amount} /></span>
        </div>
      ),
    },
    {
      title: "Прибыль",
      width: 150,
      align: "right",
      render: (_, invoice) => (
        <div className="invoice-stack-cell">
          <span><span className="text-muted">О/И</span> <MoneyCell value={invoice.side_payout_amount} /></span>
          <span><span className="text-muted">Проф.</span> <MoneyCell value={invoice.profit_amount} tone="text-success fw-semibold" /></span>
        </div>
      ),
    },
    { title: "Распр.", dataIndex: "allocation", width: 112, align: "center", render: allocationTag },
    {
      title: "Ответств.",
      width: 120,
      align: "center",
      render: (_, invoice) => (
        <div className="invoice-stack-cell invoice-stack-cell--center">
          <span title={findUserName(users, invoice.commission_user_id)}>К: {findUserName(users, invoice.commission_user_id)}</span>
          <span title={findUserName(users, invoice.tax_user_id)}>Н: {findUserName(users, invoice.tax_user_id)}</span>
        </div>
      ),
    },
    {
      title: "Оплата",
      dataIndex: "paid",
      width: 70,
      align: "center",
      render: (paid, invoice) => (
        <Button size="small" variant={paid ? "primary" : "secondary"} onClick={() => togglePaid(invoice)}>
          {paid ? "Опл." : "Нет"}
        </Button>
      ),
    },
    {
      title: "",
      width: 92,
      align: "right",
      render: (_, invoice) => (
        <Space size={4}>
          <Button size="small" onClick={() => setEditingInvoice(invoice)}>Изм.</Button>
          <Button size="small" variant="danger" onClick={() => deleteInvoice(invoice)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div data-eopp-component="InvoicesTabLoading" className="text-center text-muted py-5">Загрузка…</div>;
  }

  return (
    <div data-eopp-component="InvoicesTab" className="invoices-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Счета</h2>
            <div className="small text-muted">Авто-счета, ручные счета, распределение комиссии и налогов</div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={refreshBilling}>Обновить</Button>
            <Button size="small" variant="primary" onClick={() => setShowCreate(true)}>Новый счет</Button>
          </Space>
        }
      />

      {error ? (
        <Alert
          data-eopp-component="InvoicesError"
          className="mb-3"
          type="error"
          showIcon
          message="Ошибка"
          description={error}
        />
      ) : null}

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="InvoicesAutomationCard" className="mt-3" size="small" title="Авто-счета по компаниям">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 invoices-search">
            Компания
            <TextInput
              data-eopp-component="InvoicesAutoCompanyInput"
              size="small"
              list="auto-invoice-companies"
              value={autoCompany}
              onChange={(event) => setAutoCompany(event.target.value)}
              placeholder="Название компании"
            />
            <datalist id="auto-invoice-companies">
              {companyRows.map((row) => <option key={row.company} value={row.company} />)}
            </datalist>
          </label>
          <label className="form-label small mb-0 invoices-search">
            Комментарий фиксации
            <TextInput size="small" value={autoIssueComment} onChange={(event) => setAutoIssueComment(event.target.value)} placeholder="Например: май 2026" />
          </label>
          <Button size="small" onClick={openAutoInvoice}>Создать авто-счет</Button>
          <Button size="small" variant="primary" onClick={issueAutoInvoice}>Зафиксировать</Button>
        </FilterBar>
        <DataTable
          className="invoices-company-table"
          rowKey="company"
          data={companyRows}
          columns={companyColumns}
          emptyText="Компаний пока нет"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={false}
        />
        <form data-eopp-component="InvoiceAliasForm" className="invoice-alias-form" onSubmit={saveAlias}>
          <label className="form-label small mb-0">
            Алиас
            <TextInput size="small" value={aliasForm.alias} onChange={(event) => setAliasForm((prev) => ({ ...prev, alias: event.target.value }))} placeholder="Как приходит из логов" />
          </label>
          <label className="form-label small mb-0">
            Компания
            <TextInput size="small" value={aliasForm.company} onChange={(event) => setAliasForm((prev) => ({ ...prev, company: event.target.value }))} placeholder="Как вести биллинг" />
          </label>
          <Button size="small" variant="primary" type="submit">Сохранить</Button>
          <SelectInput
            size="small"
            value=""
            onChange={(value) => value && deleteAlias(value)}
            options={[{ value: "", label: "Удалить алиас" }, ...companyAliases.map((alias) => ({ value: alias.alias, label: `${alias.alias} -> ${alias.company}` }))]}
            style={{ minWidth: 220 }}
          />
        </form>
      </Card>

      <Card data-eopp-component="InvoicesListCard" className="mt-3" size="small" title="Список счетов">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 invoices-search">
            Поиск
            <TextInput size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Номер, ID, компания, комментарий, участник" />
          </label>
          <label className="form-label small mb-0">
            Оплата
            <SelectInput
              size="small"
              value={paidFilter}
              onChange={(value) => setPaidFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "paid", label: "Оплаченные" },
                { value: "unpaid", label: "Не оплаченные" },
              ]}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Распределение
            <SelectInput
              size="small"
              value={allocationFilter}
              onChange={(value) => setAllocationFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "fully_allocated", label: "Распределены" },
                { value: "partially_allocated", label: "Частично" },
                { value: "not_allocated", label: "Не распределены" },
              ]}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Участник
            <SelectInput
              size="small"
              value={userFilter}
              onChange={(value) => setUserFilter(value || "all")}
              options={[{ value: "all", label: "Все" }, ...userOptions.map((user) => ({ value: user.id, label: user.name }))]}
              allowClear={false}
              style={{ minWidth: 150 }}
            />
          </label>
          <label className="form-label small mb-0">
            С даты
            <TextInput
              data-eopp-component="InvoicesDateFrom"
              size="small"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="form-label small mb-0">
            По дату
            <TextInput
              data-eopp-component="InvoicesDateTo"
              size="small"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </FilterBar>
        <DataTable
          className="invoices-table"
          rowKey="id"
          data={filteredInvoices}
          columns={invoiceColumns}
          emptyText="Нет счетов по выбранным фильтрам"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
          scroll={false}
        />
      </Card>

      <InvoiceEditModal
        show={!!editingInvoice}
        invoice={editingInvoice}
        onClose={() => setEditingInvoice(null)}
        onSave={handleSaveEdit}
        adminToken={adminToken}
        users={users || []}
      />

      <InvoiceCreateModal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        adminToken={adminToken}
        users={users || []}
      />
    </div>
  );
}
