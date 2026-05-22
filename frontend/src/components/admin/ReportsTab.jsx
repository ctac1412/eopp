import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatMoney } from "../../utils/format";
import { UsageLogEditModal } from "./UsageLogEditModal";
import { InvoiceModal } from "./InvoiceModal";
import {
  REPORT_PRESETS,
  getCompany,
  getCompanyFull,
  getErrorInfo,
  getErrorToneClass,
  getFio,
  getFioFull,
  getOpType,
  getReadyForInvoiceCount,
  getSearchText,
  getStatusClass,
  getStatusLabel,
  getVehicleNumber,
  getVehicleNumberFull,
  groupByCompany,
  groupFailuresByCategory,
  hasMissingPrice,
  isBillableRecord,
  isTestRecord,
  matchesPreset,
} from "../../features/admin/reports/reportUtils";
import { OperationDetails } from "../../features/admin/reports/OperationDetails";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
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

export function ReportsTab({ adminToken, onError }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hideTest, setHideTest] = useState(true);
  const [preset, setPreset] = useState("all");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [keyFilter, setKeyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [opTypeFilter, setOpTypeFilter] = useState("all");
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [captchaRecords, setCaptchaRecords] = useState({});
  const [captchaLoading, setCaptchaLoading] = useState({});
  const [captchaErrors, setCaptchaErrors] = useState({});
  const [showEditModal, setShowEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ price: "", paid: "" });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceSelectedLogs, setInvoiceSelectedLogs] = useState([]);

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

  const toggleDetails = async (record) => {
    if (expandedRecordId === record.id) {
      setExpandedRecordId(null);
      return;
    }

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

  const handleOpenInvoiceForCompany = (companyName, companyRecords) => {
    const unpaidLogs = companyRecords.filter((r) => {
      return isBillableRecord(r);
    });
    if (unpaidLogs.length === 0) {
      const allUnpaid = companyRecords.filter((r) => {
        if (isTestRecord(r)) return false;
        const hasPrice = r.price != null && r.price > 0;
        const isPaid = r.paid === true;
        return hasPrice && !isPaid;
      });
      if (allUnpaid.length > 0) {
        onError?.(`Все неоплаченные записи для "${companyName}" уже привязаны к счетам`);
      } else {
        onError?.(`Нет неоплаченных записей для "${companyName}"`);
      }
      return;
    }
    setInvoiceSelectedLogs(unpaidLogs);
    setShowInvoiceModal(true);
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
      fetchRecords();
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
    return records.filter((record) => {
      if (!matchesPreset(record, preset)) return false;
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (opTypeFilter !== "all" && record.op_type !== opTypeFilter) return false;
      if (companyFilter !== "all" && getCompany(record) !== companyFilter) return false;
      if (keyFilter !== "all" && String(record.api_key_id) !== keyFilter) return false;
      return !normalizedSearch || getSearchText(record).includes(normalizedSearch);
    });
  }, [records, preset, statusFilter, opTypeFilter, companyFilter, keyFilter, search]);

  const metrics = useMemo(() => ({
    total: filteredRecords.length,
    success: filteredRecords.filter((record) => record.status === "confirmed").length,
    errors: filteredRecords.filter((record) => record.status === "failed").length,
    pending: filteredRecords.filter((record) => record.status === "pending").length,
    readyForInvoice: filteredRecords.filter(isBillableRecord).length,
    missingPrice: filteredRecords.filter(hasMissingPrice).length,
  }), [filteredRecords]);

  const failureSummary = useMemo(
    () => groupFailuresByCategory(filteredRecords),
    [filteredRecords],
  );

  if (loading) return <div className="text-center py-4">Загрузка…</div>;

  const summary = groupByCompany(filteredRecords);

  const renderPaidStatus = (record) => {
    const isPaid = record.paid === true;
    const hasPrice = record.price != null && record.price > 0;
    if (!hasPrice) return <span className="text-muted">—</span>;
    if (isPaid) return <span className="badge bg-success">Оплачено</span>;
    return <span className="badge bg-danger">Не оплачено</span>;
  };

  const renderClip = (value, className = "") => (
    <span className={`reports-cell-clip ${className}`} title={value || "—"}>
      {value || "—"}
    </span>
  );

  return (
    <div className="reports-page">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <div className="btn-group btn-group-sm" role="group" aria-label="Фильтр журнала">
          {REPORT_PRESETS.map((item) => (
            <button
              key={item.id}
              className={`btn ${preset === item.id ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className={`btn btn-sm ${hideTest ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setHideTest(!hideTest)}
        >
          {hideTest ? "Тестовые скрыты" : "Тестовые видны"}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchRecords}>
          Обновить
        </button>
        <span className="text-muted small ms-auto">
          Показано: {filteredRecords.length} из {records.length}
        </span>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input
            className="form-control form-control-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Компания, бронь, капча, ФИО, машина, ошибка"
          />
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Компания</label>
          <select className="form-select form-select-sm" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все</option>
            {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Ключ</label>
          <select className="form-select form-select-sm" value={keyFilter} onChange={(event) => setKeyFilter(event.target.value)}>
            <option value="all">Все</option>
            {keyOptions.map((key) => <option key={key.id} value={key.id}>{key.label}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Статус</label>
          <select className="form-select form-select-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Все</option>
            <option value="confirmed">Успех</option>
            <option value="failed">Ошибка</option>
            <option value="pending">В работе</option>
          </select>
        </div>
        <div className="col-6 col-md-3 col-xl-2">
          <label className="form-label small mb-1">Тип</label>
          <select className="form-select form-select-sm" value={opTypeFilter} onChange={(event) => setOpTypeFilter(event.target.value)}>
            <option value="all">Все</option>
            <option value="create">Создание</option>
            <option value="reschedule">Перенос</option>
          </select>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <span className="badge text-bg-secondary">Всего: {metrics.total}</span>
        <span className="badge text-bg-success">Успешно: {metrics.success}</span>
        <span className="badge text-bg-danger">Ошибок: {metrics.errors}</span>
        <span className="badge text-bg-warning">В работе: {metrics.pending}</span>
        <span className="badge text-bg-primary">К счету: {metrics.readyForInvoice}</span>
        <span className="badge text-bg-dark">Без цены: {metrics.missingPrice}</span>
      </div>

      {failureSummary.length > 0 && (
        <div className="card mb-3">
          <div className="card-header fw-semibold">Где ломается pipeline</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Категория</th>
                    <th className="text-center">Pipeline step</th>
                    <th className="text-center">Ошибок</th>
                    <th>Пример</th>
                  </tr>
                </thead>
                <tbody>
                  {failureSummary.map((row) => (
                    <tr key={row.category}>
                      <td>
                        <span className={`badge ${getErrorToneClass(row)}`}>{row.label}</span>
                      </td>
                      <td className="text-center">{row.step ? `#${row.step}` : "—"}</td>
                      <td className="text-center fw-semibold">{row.count}</td>
                      <td className="small text-muted" title={row.lastMessage || ""}>
                        {row.lastMessage
                          ? row.lastMessage.length > 120
                            ? `${row.lastMessage.slice(0, 120)}…`
                            : row.lastMessage
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Company summary */}
      {summary.length > 0 && (
        <div className="card mb-3">
          <div className="card-header fw-semibold">Сводка по компаниям</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Компания</th>
                    <th className="text-center">Переносы</th>
                    <th className="text-center">Брони</th>
                    <th className="text-center">Ошибки</th>
                    <th className="text-center">К счету</th>
                    <th className="text-end">Сумма</th>
                    <th className="text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="text-center">{row.reschedule}</td>
                      <td className="text-center">{row.create}</td>
                      <td className="text-center">{row.errors}</td>
                      <td className="text-center">{row.readyForInvoice}</td>
                      <td className="text-end">{formatMoney(row.invoiceAmount)}</td>
                      <td className="text-center">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleOpenInvoiceForCompany(row.name, row.records)}
                          title="Сделать расчёт"
                        >
                          Сделать расчёт {getReadyForInvoiceCount(row.records) > 0 && `(${getReadyForInvoiceCount(row.records)})`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main records table */}
      <div className="card">
        <div className="card-header fw-semibold">Журнал использования</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-sm table-hover table-bordered align-middle mb-0 reports-log-table">
              <thead className="table-light">
                <tr>
                  <th className="text-center" style={{ width: "40px" }}>#</th>
                  <th>ID</th>
                  <th>Токен</th>
                  <th className="text-center">Тип</th>
                  <th className="text-center">Статус</th>
                  <th>Дата</th>
                  <th>Дата слота</th>
                  <th>ФИО</th>
                  <th>Компания</th>
                  <th>Номер машины</th>
                  <th className="text-end">Цена</th>
                  <th>Счёт</th>
                  <th className="text-center">Оплата</th>
                  <th>Ошибка</th>
                  <th className="text-center" style={{ width: "80px" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="text-center text-muted py-3">Нет записей</td>
                  </tr>
                ) : (
                  filteredRecords.map((record, idx) => {
                    const isExpanded = expandedRecordId === record.id;
                    const opType = getOpType(record);
                    const errorInfo = getErrorInfo(record);
                    return (
                      <React.Fragment key={record.id}>
                        <tr>
                          <td className="text-center">{idx + 1}</td>
                          <td className="small text-muted">{record.id}</td>
                          <td className="small">{renderClip(record.label)}</td>
                          <td className="text-center">
                            <span className={`badge ${opType === "Создание" ? "bg-success" : opType === "Перенос" ? "bg-info text-dark" : "bg-secondary"}`}>
                              {opType}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`badge ${getStatusClass(record.status)}`}>
                              {getStatusLabel(record.status)}
                            </span>
                          </td>
                          <td className="small text-nowrap">{formatDate(record.created_at)}</td>
                          <td className="small text-nowrap">{formatSlotDate(record.slot_date)}</td>
                          <td className="small">{renderClip(getFio(record), "")}</td>
                          <td className="small">{renderClip(getCompany(record))}</td>
                          <td className="small">{renderClip(getVehicleNumber(record), "font-monospace")}</td>
                          <td className="small text-end text-nowrap">
                            {record.price != null ? formatMoney(record.price) : "—"}
                          </td>
                          <td className="small">{record.invoice_id ? `#${record.invoice_id}` : "—"}</td>
                          <td className="text-center">{renderPaidStatus(record)}</td>
                          <td className="small" title={record.error_message || ""}>
                            <div className="reports-error-cell">
                              {record.status === "failed" && (
                                <span className={`badge ${getErrorToneClass(errorInfo)} reports-error-badge`}>
                                  {errorInfo.label}
                                </span>
                              )}
                              {record.error_message ? (
                                <span className="text-danger reports-cell-clip">
                                  {record.error_message}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </div>
                          </td>
                          <td className="text-center text-nowrap">
                            <button
                              className={`btn btn-sm ${isExpanded ? "btn-primary" : "btn-outline-secondary"} me-1`}
                              onClick={() => toggleDetails(record)}
                              title={isExpanded ? "Свернуть детали" : "Показать детали"}
                            >
                              {isExpanded ? "Скрыть" : "Детали"}
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary me-1"
                              onClick={() => openEditModal(record)}
                              title="Редактировать"
                            >
                              ✏️
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={15} className="p-0">
                              <OperationDetails
                                record={record}
                                captchaRecords={captchaRecords[record.id] || []}
                                captchaLoading={!!captchaLoading[record.id]}
                                captchaError={captchaErrors[record.id]}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
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
