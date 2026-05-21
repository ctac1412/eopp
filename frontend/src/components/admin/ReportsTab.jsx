import React, { useState, useEffect, useCallback } from "react";
import { formatMoney } from "../../utils/format";
import { UsageLogEditModal } from "./UsageLogEditModal";
import { InvoiceModal } from "./InvoiceModal";

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

const COMPANY_ALIASES = {
  'ООО "АРТ-ТРАНС"': "Хип-Хоп Транс Дэнс",
};

function getOpType(record) {
  if (record.op_type === "create") return "Создание";
  if (record.op_type === "reschedule") return "Перенос";
  return "—";
}

function getFio(record) {
  const fio = record.fio;
  if (!fio || typeof fio !== "string") return "—";
  return fio.trim().split(/\s+/).map((p) => p[0] + ".").join(" ");
}

function getFioFull(record) {
  return record.fio || "—";
}

function getCompany(record) {
  const name = record.company;
  if (!name) return "—";
  return COMPANY_ALIASES[name] || name;
}

function getCompanyFull(record) {
  return record.company || "—";
}

function getVehicleNumber(record, short = true) {
  const num = record.vehicle_number;
  if (!num) return "—";
  if (short && num.length > 4) {
    return num.slice(0, 4) + "....";
  }
  return num;
}

function getVehicleNumberFull(record) {
  return record.vehicle_number || "—";
}

function isTestRecord(record) {
  return record.is_test === true || record.is_test === 1;
}

function isSuccessStage5(record) {
  if (record.status !== "confirmed") return false;
  const logs = record.logs;
  if (!Array.isArray(logs)) return false;
  const joined = logs.join(" ");
  return joined.includes("Скрипт завершён успешно");
}

function groupByCompany(records) {
  const groups = {};
  records.forEach((r) => {
    const company = getCompany(r);
    if (!groups[company]) {
      groups[company] = { reschedule: 0, create: 0, records: [] };
    }
    groups[company].records.push(r);
    const opType = r.op_type;
    if (opType === "reschedule") {
      groups[company].reschedule++;
    } else if (opType === "create") {
      groups[company].create++;
    }
  });
  return Object.entries(groups).map(([name, counts]) => ({
    name,
    reschedule: counts.reschedule,
    create: counts.create,
    records: counts.records,
  }));
}

function getReadyForInvoiceCount(companyRecords) {
  return companyRecords.filter((r) => {
    if (isTestRecord(r)) return false;
    const hasPrice = r.price != null && r.price > 0;
    const isPaid = r.paid === true;
    const noInvoice = !r.invoice_id;
    return hasPrice && !isPaid && noInvoice;
  }).length;
}

export function ReportsTab({ adminToken, onError }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hideTest, setHideTest] = useState(true);
  const [showOnlySuccess5, setShowOnlySuccess5] = useState(true);
  const [expandedConfig, setExpandedConfig] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
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
      let records = Array.isArray(data) ? data : [];
      if (showOnlySuccess5) {
        records = records.filter(isSuccessStage5);
      }
      setRecords(records);
    } catch (err) {
      onError?.(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, hideTest, showOnlySuccess5, onError]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const toggleConfig = (id) => {
    setExpandedConfig((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLogs = (id) => {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
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
      if (isTestRecord(r)) return false;
      const hasPrice = r.price != null && r.price > 0;
      const isPaid = r.paid === true;
      const noInvoice = !r.invoice_number;
      return hasPrice && !isPaid && noInvoice;
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

  if (loading) return <div className="text-center py-4">Загрузка…</div>;

  const summary = groupByCompany(records);

  const renderPaidStatus = (record) => {
    const isPaid = record.paid === true;
    const hasPrice = record.price != null && record.price > 0;
    if (!hasPrice) return <span className="text-muted">—</span>;
    if (isPaid) return <span className="text-success fw-semibold">Оплачено</span>;
    return <span className="text-danger fw-semibold">Не оплачено</span>;
  };

  return (
    <div className="reports-page">
      {/* Toolbar */}
      <div className="d-flex gap-2 align-items-center mb-3">
        <button
          className={`btn btn-sm ${showOnlySuccess5 ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setShowOnlySuccess5(!showOnlySuccess5)}
        >
          Только этап 5
        </button>
        <button
          className={`btn btn-sm ${hideTest ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setHideTest(!hideTest)}
        >
          {hideTest ? "Скрыть тестовые" : "Показать тестовые"}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchRecords}>
          Обновить
        </button>
        <span className="text-muted small ms-2">Всего: {records.length}</span>
      </div>

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
                    <th className="text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="text-center">{row.reschedule}</td>
                      <td className="text-center">{row.create}</td>
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
            <table className="table table-sm table-hover table-bordered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="text-center" style={{ width: "40px" }}>#</th>
                  <th>ID</th>
                  <th>Токен</th>
                  <th className="text-center">Тип</th>
                  <th>Дата</th>
                  <th>Дата слота</th>
                  <th>ФИО</th>
                  <th>Компания</th>
                  <th>Номер машины</th>
                  <th>Счёт</th>
                  <th className="text-center">Оплата</th>
                  <th className="text-center" style={{ width: "80px" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center text-muted py-3">Нет записей</td>
                  </tr>
                ) : (
                  records.map((record, idx) => {
                    const isExpanded = expandedConfig[record.id];
                    const isLogsExpanded = expandedLogs[record.id];
                    const hasLogs = record.logs && record.logs.length > 0;
                    const opType = getOpType(record);
                    return (
                      <React.Fragment key={record.id}>
                        <tr>
                          <td className="text-center">{idx + 1}</td>
                          <td className="small text-muted">{record.id}</td>
                          <td className="small" title={record.label || "—"}>{record.label || "—"}</td>
                          <td className="text-center">
                            <span className={`badge ${opType === "Создание" ? "bg-success" : opType === "Перенос" ? "bg-info text-dark" : "bg-secondary"}`}>
                              {opType}
                            </span>
                          </td>
                          <td className="small">{formatSlotDate(record.created_at)}</td>
                          <td className="small">{formatSlotDate(record.slot_date)}</td>
                          <td className="small" title={getFioFull(record)}>{getFio(record)}</td>
                          <td className="small" title={getCompanyFull(record)}>{getCompany(record)}</td>
                          <td className="small" title={getVehicleNumberFull(record)}>{getVehicleNumber(record)}</td>
                          <td className="small">{record.invoice_id ? `#${record.invoice_id}` : "—"}</td>
                          <td className="text-center">{renderPaidStatus(record)}</td>
                           <td className="text-center text-nowrap">
                            <button
                              className={`btn btn-sm ${isLogsExpanded ? "btn-primary" : "btn-outline-secondary"} me-1`}
                              onClick={() => toggleLogs(record.id)}
                              title={isLogsExpanded ? "Свернуть логи" : "Показать логи"}
                            >
                              📋
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary me-1"
                              onClick={() => openEditModal(record)}
                              title="Редактировать"
                            >
                              ✏️
                            </button>
                            {record.config_json && (
                              <button
                                className={`btn btn-sm ${isExpanded ? "btn-secondary" : "btn-outline-secondary"}`}
                                onClick={() => toggleConfig(record.id)}
                                title={isExpanded ? "Свернуть конфиг" : "Показать конфиг"}
                              >
                                ⚙
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && record.config_json && (
                          <tr>
                            <td colSpan={12}>
                              <pre className="p-2 small m-0" style={{ maxHeight: "300px", overflow: "auto", background: "var(--bs-dark)", borderRadius: "0.5rem" }}>
                                {JSON.stringify(record.config_json, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                        {isLogsExpanded && (
                          <tr>
                            <td colSpan={12}>
                              <div className="p-2 small" style={{ maxHeight: "400px", overflow: "auto", background: "var(--bs-dark)", borderRadius: "0.5rem", fontFamily: "var(--bs-font-monospace)", color: "#8b949e" }}>
                                {hasLogs ? (
                                  record.logs.map((line, i) => (
                                    <div key={i} className="mb-1">{line}</div>
                                  ))
                                ) : (
                                  <div className="text-muted">Нет логов</div>
                                )}
                              </div>
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
