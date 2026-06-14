import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Spin } from "antd";
import { useSearchParams } from "react-router-dom";
import { formatMoney } from "../../../utils/format";
import { UsageLogEditModal } from "../invoices/UsageLogEditModal";
import { InvoiceModal } from "../invoices/InvoiceModal";
import {
  REPORT_PRESETS,
  getCompany,
  getCompanyFull,
  getErrorInfo,
  getErrorTagColor,
  getFio,
  getFioFull,
  getOpType,
  getSearchText,
  getStatusLabel,
  getVehicleNumber,
  getVehicleNumberFull,
  isBillableRecord,
} from "./reportUtils";
import { OperationDetails } from "./OperationDetails";
import {
  Button,
  DataTable,
  FilterBar,
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
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSlotDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getUrlValue(searchParams, key, fallback) {
  const value = searchParams.get(key);
  return value == null || value === "" ? fallback : value;
}

function getUrlPreset(searchParams) {
  const value = getUrlValue(searchParams, "preset", "all");
  return REPORT_PRESETS.some((item) => item.id === value) ? value : "all";
}

function getUrlActionDate(searchParams) {
  const value = getUrlValue(searchParams, "action_date", "today");
  return value === "all" ? "all" : "today";
}

const USAGE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function getUrlPositiveInt(searchParams, key, fallback) {
  const value = Number.parseInt(searchParams.get(key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getUrlPageSize(searchParams) {
  const value = getUrlPositiveInt(searchParams, "page_size", 10);
  return USAGE_PAGE_SIZE_OPTIONS.includes(value) ? value : 10;
}

function toLocalDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function replaceUrlParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

export function ReportsTab({ adminToken, onError, onInvoiceGenerated }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hideTest, setHideTest] = useState(() => getUrlValue(searchParams, "hide_test", "1") !== "0");
  const [preset, setPreset] = useState(() => getUrlPreset(searchParams));
  const [search, setSearch] = useState(() => getUrlValue(searchParams, "q", ""));
  const [searchInput, setSearchInput] = useState(() => getUrlValue(searchParams, "q", ""));
  const [companyFilter, setCompanyFilter] = useState(() => getUrlValue(searchParams, "company", "all"));
  const [keyFilter, setKeyFilter] = useState(() => getUrlValue(searchParams, "key", "all"));
  const [statusFilter, setStatusFilter] = useState(() => getUrlValue(searchParams, "status", "all"));
  const [opTypeFilter, setOpTypeFilter] = useState(() => getUrlValue(searchParams, "op_type", "all"));
  const [billableFilter, setBillableFilter] = useState(() => getUrlValue(searchParams, "billable", "all"));
  const [actionDateFilter, setActionDateFilter] = useState(() => getUrlActionDate(searchParams));
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [captchaRecords, setCaptchaRecords] = useState({});
  const [captchaLoading, setCaptchaLoading] = useState({});
  const [captchaErrors, setCaptchaErrors] = useState({});
  const [showEditModal, setShowEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ price: "", paid: "" });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceSelectedLogs, setInvoiceSelectedLogs] = useState([]);
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [usagePage, setUsagePage] = useState(() => getUrlPositiveInt(searchParams, "page", 1));
  const [usagePageSize, setUsagePageSize] = useState(() => getUrlPageSize(searchParams));
  const lastUrlSearchRef = React.useRef(getUrlValue(searchParams, "q", ""));
  const searchFocusedRef = React.useRef(false);
  const didMountFiltersRef = React.useRef(false);

  useEffect(() => {
    const nextPreset = getUrlPreset(searchParams);
    const nextHideTest = getUrlValue(searchParams, "hide_test", "1") !== "0";
    const nextSearch = getUrlValue(searchParams, "q", "");
    const nextCompany = getUrlValue(searchParams, "company", "all");
    const nextKey = getUrlValue(searchParams, "key", "all");
    const nextStatus = getUrlValue(searchParams, "status", "all");
    const nextOpType = getUrlValue(searchParams, "op_type", "all");
    const nextBillable = getUrlValue(searchParams, "billable", "all");
    const nextActionDate = getUrlActionDate(searchParams);
    const nextUsagePage = getUrlPositiveInt(searchParams, "page", 1);
    const nextUsagePageSize = getUrlPageSize(searchParams);
    const urlSearchChanged = lastUrlSearchRef.current !== nextSearch;
    lastUrlSearchRef.current = nextSearch;

    setPreset((current) => (current === nextPreset ? current : nextPreset));
    setHideTest((current) => (current === nextHideTest ? current : nextHideTest));
    setSearch((current) => (current === nextSearch ? current : nextSearch));
    if (urlSearchChanged) {
      setSearchInput((current) => (current === nextSearch ? current : nextSearch));
    }
    setCompanyFilter((current) => (current === nextCompany ? current : nextCompany));
    setKeyFilter((current) => (current === nextKey ? current : nextKey));
    setStatusFilter((current) => (current === nextStatus ? current : nextStatus));
    setOpTypeFilter((current) => (current === nextOpType ? current : nextOpType));
    setBillableFilter((current) => (current === nextBillable ? current : nextBillable));
    setActionDateFilter((current) => (current === nextActionDate ? current : nextActionDate));
    setUsagePage((current) => (current === nextUsagePage ? current : nextUsagePage));
    setUsagePageSize((current) => (current === nextUsagePageSize ? current : nextUsagePageSize));
  }, [searchParams]);

  useEffect(() => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("tab", "reports");
      nextParams.set("preset", preset);
      nextParams.set("hide_test", hideTest ? "1" : "0");
      nextParams.set("q", getUrlValue(currentParams, "q", ""));
      nextParams.set("company", companyFilter);
      nextParams.set("key", keyFilter);
      nextParams.set("status", statusFilter);
      nextParams.set("op_type", opTypeFilter);
      nextParams.set("billable", billableFilter);
      nextParams.set("action_date", actionDateFilter);
      nextParams.set("page", String(usagePage));
      nextParams.set("page_size", String(usagePageSize));
      return nextParams.toString() === currentParams.toString() ? currentParams : nextParams;
    }, { replace: true });
  }, [actionDateFilter, billableFilter, companyFilter, hideTest, keyFilter, opTypeFilter, preset, setSearchParams, statusFilter, usagePage, usagePageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => (current === searchInput ? current : searchInput));
      replaceUrlParam("q", searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/usage-log?hide_test=${hideTest}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, hideTest, onError]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const selectDetails = async (record) => {
    setExpandedRecordId(record.id);
    if (captchaRecords[record.id] || captchaLoading[record.id]) return;

    setCaptchaLoading((prev) => ({ ...prev, [record.id]: true }));
    setCaptchaErrors((prev) => ({ ...prev, [record.id]: null }));
    try {
      const res = await fetch(`/captchas?usage_log_id=${record.id}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchaRecords((prev) => ({
        ...prev,
        [record.id]: Array.isArray(data) ? data : [],
      }));
    } catch (err) {
      setCaptchaErrors((prev) => ({ ...prev, [record.id]: err.message }));
    } finally {
      setCaptchaLoading((prev) => ({ ...prev, [record.id]: false }));
    }
  };

  const openEditModal = (record) => {
    setEditForm({
      price: record.price ?? "",
      paid: record.paid === null || record.paid === undefined ? "" : String(record.paid),
    });
    setShowEditModal(record);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!showEditModal) return;
    try {
      const body = {};
      if (editForm.price !== "") {
        body.price = parseInt(editForm.price, 10);
      }
      if (editForm.paid !== "") {
        body.paid = editForm.paid === "true";
      }
      const res = await fetch(`/admin/usage-log/${showEditModal.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setRecords((prev) =>
        prev.map((r) =>
          r.id === showEditModal.id ? { ...r, ...body } : r
        )
      );
      setShowEditModal(null);
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleGenerateInvoice = async (invoiceData) => {
    try {
      if (!invoiceData.logs || invoiceData.logs.length === 0) {
        onError?.("Нет записей для счёта");
        return;
      }

      const body = {
        usage_log_ids: invoiceData.logs.map((l) => l.id),
        comment: invoiceData.comment || "",
        percent_rate: invoiceData.percentRate,
        tax_rate: invoiceData.taxRate,
        debt_amount: invoiceData.logs.reduce((acc, l) => acc + (l.price || 0), 0),
        percent_amount: invoiceData.percentAmount,
        tax_amount: invoiceData.taxAmount,
        total_amount: invoiceData.totalAmount,
      };
      const res = await fetch("/admin/generate-invoice", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      alert(`Счёт ${data.invoice_number} создан! Итого: ${formatMoney(data.total_amount)}`);
      setShowInvoiceModal(false);
      setInvoiceSelectedLogs([]);
      setSelectedLogIds([]);
      fetchRecords();
      onInvoiceGenerated?.(data.invoice_id);
    } catch (err) {
      onError?.(err.message);
    }
  };

  const companyOptions = useMemo(
    () => [...new Set(records.map(getCompany).filter((name) => name !== "—"))].sort(),
    [records],
  );

  const keyOptions = useMemo(() => {
    const options = new Map();
    records.forEach((record) => {
      if (record.api_key_id == null) return;
      options.set(String(record.api_key_id), record.label || `#${record.api_key_id}`);
    });
    return [...options.entries()].map(([id, label]) => ({ id, label }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const todayKey = toLocalDateKey(new Date());
    return records.filter((record) => {
      if (actionDateFilter === "today" && toLocalDateKey(record.created_at) !== todayKey) return false;
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (opTypeFilter !== "all" && record.op_type !== opTypeFilter) return false;
      if (billableFilter === "ready" && !isBillableRecord(record)) return false;
      if (companyFilter !== "all" && getCompany(record) !== companyFilter) return false;
      if (keyFilter !== "all" && String(record.api_key_id) !== keyFilter) return false;
      return !normalizedSearch || getSearchText(record).includes(normalizedSearch);
    });
  }, [actionDateFilter, billableFilter, records, statusFilter, opTypeFilter, companyFilter, keyFilter, search]);

  useEffect(() => {
    const visibleIds = new Set(filteredRecords.map((record) => record.id));
    setSelectedLogIds((prev) => prev.filter((id) => visibleIds.has(id)));
    setExpandedRecordId((current) => (current && !visibleIds.has(current) ? null : current));
  }, [filteredRecords]);

  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    setUsagePage(1);
  }, [preset, search, companyFilter, keyFilter, statusFilter, opTypeFilter, billableFilter, actionDateFilter, hideTest]);

  useEffect(() => {
    if (loading) return;
    const lastPage = Math.max(1, Math.ceil(filteredRecords.length / usagePageSize));
    setUsagePage((current) => Math.min(current, lastPage));
  }, [filteredRecords.length, loading, usagePageSize]);

  if (loading) {
    return (
      <div data-eopp-component="ReportsTabLoading" className="reports-loading">
        <Spin size="small" />
        Загрузка…
      </div>
    );
  }

  const selectableRecords = filteredRecords.filter(isBillableRecord);
  const selectedLogs = selectableRecords.filter((record) => selectedLogIds.includes(record.id));
  const selectedRecord = filteredRecords.find((record) => record.id === expandedRecordId) || null;
  const usagePageStart = (usagePage - 1) * usagePageSize;

  const openManualInvoiceModal = () => {
    if (selectedLogs.length === 0) {
      onError?.("Выбери подтвержденные непривязанные записи");
      return;
    }
    setInvoiceSelectedLogs(selectedLogs);
    setShowInvoiceModal(true);
  };

  const applyPreset = (presetId) => {
    setPreset(presetId);
    localStorage.setItem("reports_preset", presetId);
    if (presetId === "success") {
      setStatusFilter("confirmed");
      setBillableFilter("all");
      return;
    }
    if (presetId === "errors") {
      setStatusFilter("failed");
      setBillableFilter("all");
      return;
    }
    if (presetId === "billing") {
      setStatusFilter("confirmed");
      setBillableFilter("ready");
      return;
    }
    setStatusFilter("all");
    setBillableFilter("all");
  };

  const renderPaidStatus = (record) => {
    const isPaid = record.paid === true;
    if (isPaid) {
      return (
        <StatusTag
          status="paid"
          label="Опл."
          className="reports-paid-badge"
          title="Оплачено"
        />
      );
    }
    if (!record.invoice_id) return <span className="text-muted">—</span>;
    return (
      <StatusTag
        status="unpaid"
        label="Нет"
        className="reports-paid-badge"
        title="Не оплачено"
      />
    );
  };

  const renderClip = (value, className = "") => (
    <span className={`reports-cell-clip ${className}`} title={value || "—"}>
      {value || "—"}
    </span>
  );

  const compactColumn = (width) => ({
    width,
    ellipsis: true,
  });

  const renderVehicleShort = (record) => {
    const fullNumber = getVehicleNumberFull(record);
    const shortNumber = fullNumber === "—" ? "—" : fullNumber.slice(0, 4);
    return (
      <span className="reports-cell-clip font-monospace" title={fullNumber}>
        {shortNumber}
      </span>
    );
  };

  const recordsColumns = [
    {
      title: "#",
      ...compactColumn(44),
      render: (_, __, idx) => usagePageStart + idx + 1,
    },
    {
      title: "ID",
      dataIndex: "id",
      ...compactColumn(56),
      render: (value) => <span className="small text-muted">{value}</span>,
    },
    {
      title: "Токен",
      dataIndex: "label",
      ...compactColumn(84),
      render: (value) => renderClip(value),
    },
    {
      title: "Тип",
      dataIndex: "op_type",
      ...compactColumn(76),
      align: "center",
      render: (_, record) => {
        const opType = getOpType(record);
        const status = opType === "Создание" ? "create" : opType === "Перенос" ? "reschedule" : "neutral";
        return <StatusTag status={status} label={opType} />;
      },
    },
    {
      title: "Статус",
      dataIndex: "status",
      ...compactColumn(86),
      align: "center",
      render: (value) => <StatusTag status={value} label={getStatusLabel(value)} />,
    },
    {
      title: "Дата",
      dataIndex: "created_at",
      ...compactColumn(106),
      align: "center",
      render: (value) => <span className="small text-nowrap">{formatDate(value)}</span>,
    },
    {
      title: "Слот",
      dataIndex: "slot_date",
      ...compactColumn(82),
      align: "center",
      render: (value) => <span className="small text-nowrap">{formatSlotDate(value)}</span>,
    },
    {
      title: "ФИО",
      ...compactColumn(74),
      align: "center",
      render: (_, record) => renderClip(getFio(record)),
    },
    {
      title: "Компания",
      ...compactColumn(110),
      render: (_, record) => renderClip(getCompany(record)),
    },
    {
      title: "Авто",
      ...compactColumn(56),
      align: "center",
      render: (_, record) => renderVehicleShort(record),
    },
    {
      title: "Свои",
      dataIndex: "has_custom_slots",
      ...compactColumn(52),
      align: "center",
      render: (value) => (value ? "Да" : "—"),
    },
    {
      title: "Цена",
      dataIndex: "price",
      ...compactColumn(82),
      align: "center",
      render: (value) => <span className="small text-nowrap">{value != null ? formatMoney(value) : "—"}</span>,
    },
    {
      title: "Счёт",
      dataIndex: "invoice_id",
      ...compactColumn(58),
      align: "center",
      render: (value) => (value ? `#${value}` : "—"),
    },
    {
      title: "Опл.",
      ...compactColumn(52),
      align: "center",
      render: (_, record) => renderPaidStatus(record),
    },
    {
      title: "Ошибка",
      ...compactColumn(128),
      align: "center",
      render: (_, record) => {
        const errorInfo = getErrorInfo(record);
        return record.status === "failed" ? (
          <StatusTag
            status="failed"
            label={errorInfo.label}
            color={getErrorTagColor(errorInfo)}
          />
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      title: "",
      width: 90,
      render: (_, record) => {
        const isSelected = expandedRecordId === record.id;
        return (
          <div className="eopp-table-actions">
            <Button
              data-eopp-component="ReportsDetailsButton"
              size="small"
              variant={isSelected ? "primary" : "secondary"}
              onClick={(event) => {
                event.stopPropagation();
                selectDetails(record);
              }}
              title="Показать детали"
            >
              {isSelected ? "Откр." : "Дет."}
            </Button>
            <Button
              data-eopp-component="ReportsEditButton"
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                openEditModal(record);
              }}
              title="Редактировать"
            >
              Изм.
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div data-eopp-component="ReportsTab" className="reports-page">
      <Toolbar
        className="mb-2"
        left={
          <>
            {REPORT_PRESETS.map((item) => (
              <Button
                key={item.id}
                size="small"
                variant={preset === item.id ? "primary" : "secondary"}
                onClick={() => applyPreset(item.id)}
              >
                {item.label}
              </Button>
            ))}
            <Button
              size="small"
              variant={actionDateFilter === "today" ? "primary" : "secondary"}
              onClick={() => setActionDateFilter("today")}
            >
              Сегодня
            </Button>
            <Button
              size="small"
              variant={actionDateFilter === "all" ? "primary" : "secondary"}
              onClick={() => setActionDateFilter("all")}
            >
              Все даты
            </Button>
            <Button size="small" onClick={fetchRecords}>
              Обновить
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={openManualInvoiceModal}
              disabled={selectedLogs.length === 0}
              title="Сформировать обычный счёт из выбранных непривязанных записей"
            >
              Сформировать счёт {selectedLogs.length > 0 ? `(${selectedLogs.length})` : ""}
            </Button>
          </>
        }
        right={
          <span className="text-muted small">
            Показано: {filteredRecords.length} из {records.length}
          </span>
        }
      />

      <FilterBar className="mb-3">
        <label className="form-label small mb-0">
          Компания
          <SelectInput
            size="small"
            value={companyFilter}
            onChange={(value) => setCompanyFilter(value || "all")}
            options={[
              { value: "all", label: "Все" },
              ...companyOptions.map((company) => ({ value: company, label: company })),
            ]}
          />
        </label>
        <label className="form-label small mb-0">
          Ключ
          <SelectInput
            size="small"
            value={keyFilter}
            onChange={(value) => setKeyFilter(value || "all")}
            options={[
              { value: "all", label: "Все" },
              ...keyOptions.map((key) => ({ value: key.id, label: key.label })),
            ]}
          />
        </label>
        <label className="form-label small mb-0">
          Тестовые
          <SelectInput
            size="small"
            value={hideTest ? "hidden" : "visible"}
            onChange={(value) => setHideTest(value !== "visible")}
            options={[
              { value: "hidden", label: "Скрыты" },
              { value: "visible", label: "Показаны" },
            ]}
          />
        </label>
        <label className="form-label small mb-0">
          Статус
          <SelectInput
            size="small"
            value={statusFilter}
            onChange={(value) => {
              setPreset("all");
              setStatusFilter(value || "all");
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "confirmed", label: "Успех" },
              { value: "failed", label: "Ошибка" },
              { value: "pending", label: "В работе" },
            ]}
          />
        </label>
        <label className="form-label small mb-0">
          Счёт
          <SelectInput
            size="small"
            value={billableFilter}
            onChange={(value) => {
              setPreset("all");
              setBillableFilter(value || "all");
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "ready", label: "К выставлению" },
            ]}
          />
        </label>
        <label className="form-label small mb-0">
          Тип
          <SelectInput
            size="small"
            value={opTypeFilter}
            onChange={(value) => {
              setPreset("all");
              setOpTypeFilter(value || "all");
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "create", label: "Создание" },
              { value: "reschedule", label: "Перенос" },
            ]}
          />
        </label>
      </FilterBar>

      <div data-eopp-component="ReportsWorkspace" className="reports-workspace">
        <Card
          data-eopp-component="ReportsUsageLogCard"
          className="reports-usage-log-card reports-usage-log-card--split"
          size="small"
          title={
            <div
              data-eopp-component="ReportsUsageLogHeader"
              className="reports-usage-log-header"
            >
              <span>Журнал использования</span>
              <div data-eopp-component="ReportsUsageLogSearch" className="reports-usage-log-search">
                <TextInput
                  size="small"
                  value={searchInput}
                  onFocus={() => {
                    searchFocusedRef.current = true;
                  }}
                  onBlur={() => {
                    searchFocusedRef.current = false;
                    setSearch(searchInput);
                    replaceUrlParam("q", searchInput);
                  }}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Поиск: компания, бронь, капча, ФИО, машина, ошибка"
                />
              </div>
            </div>
          }
        >
          <DataTable
            className="reports-log-table"
            rowKey="id"
            data={filteredRecords}
            columns={recordsColumns}
            emptyText="Нет записей"
            pagination={{
              current: usagePage,
              pageSize: usagePageSize,
              total: filteredRecords.length,
              showSizeChanger: true,
              pageSizeOptions: USAGE_PAGE_SIZE_OPTIONS,
              showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
              locale: { items_per_page: "" },
              position: ["topRight"],
              size: "small",
              className: "reports-usage-log-pagination",
              onChange: (page, pageSize) => {
                setUsagePage(page);
                setUsagePageSize(pageSize);
              },
            }}
            rowSelection={{
              selectedRowKeys: selectedLogIds,
              preserveSelectedRowKeys: true,
              onChange: (keys) => {
                const selectableIds = new Set(selectableRecords.map((record) => record.id));
                setSelectedLogIds(keys.filter((id) => selectableIds.has(id)));
              },
              getCheckboxProps: (record) => ({
                disabled: !isBillableRecord(record),
              }),
            }}
            rowClassName={(record) => (
              expandedRecordId === record.id ? "reports-log-row reports-log-row--selected" : "reports-log-row"
            )}
            onRow={(record) => ({
              onClick: () => selectDetails(record),
            })}
          />
        </Card>

        <Card
          data-eopp-component="ReportsDetailPane"
          className="reports-detail-pane"
          size="small"
          title={
            <div className="reports-detail-pane__header">
              <span>Детали операции</span>
              {selectedRecord && (
                <span className="text-muted small">#{selectedRecord.id}</span>
              )}
            </div>
          }
          extra={selectedRecord && (
            <div className="reports-detail-pane__actions">
              <Button size="small" onClick={() => openEditModal(selectedRecord)}>
                Изменить
              </Button>
              <Button
                size="small"
                variant="primary"
                disabled={!isBillableRecord(selectedRecord)}
                onClick={() => {
                  setInvoiceSelectedLogs([selectedRecord]);
                  setShowInvoiceModal(true);
                }}
                title="Сформировать счет из выбранной операции"
              >
                Счет
              </Button>
              <Button size="small" onClick={() => setExpandedRecordId(null)}>
                Закрыть
              </Button>
            </div>
          )}
        >
          {selectedRecord ? (
            <div className="reports-detail-pane__body">
                <OperationDetails
                  record={selectedRecord}
                  captchaRecords={captchaRecords[selectedRecord.id] || []}
                  captchaLoading={!!captchaLoading[selectedRecord.id]}
                  captchaError={captchaErrors[selectedRecord.id]}
                />
            </div>
          ) : (
            <div className="reports-detail-pane__empty">
              <strong>Выберите строку журнала</strong>
              <span>Здесь появятся полные сведения, логи, captcha records и действия по операции.</span>
            </div>
          )}
        </Card>
      </div>

      <UsageLogEditModal
        show={!!showEditModal}
        entry={showEditModal}
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleSaveEdit}
        onClose={() => setShowEditModal(null)}
      />

      <InvoiceModal
        show={showInvoiceModal}
        selectedLogs={invoiceSelectedLogs}
        onGenerate={handleGenerateInvoice}
        onClose={() => setShowInvoiceModal(false)}
      />
    </div>
  );
}

