import React, { useState, useEffect, useCallback } from "react";
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

function getOpType(configData) {
  if (!configData) return "—";
  return configData.mode === "create" ? "Создание" : configData.mode === "reschedule" ? "Перенос" : "—";
}

function getFio(configData) {
  const fio = configData?.reservationData?.raw?.userData?.fio;
  if (!fio || typeof fio !== "string") return "—";
  return fio.trim().split(/\s+/).map((p) => p[0] + ".").join(" ");
}

function getFioFull(configData) {
  return configData?.reservationData?.raw?.userData?.fio || "—";
}

function getCompany(configData) {
  const name = configData?.reservationData?.raw?.userData?.organizationName;
  if (!name) return "—";
  return COMPANY_ALIASES[name] || name;
}

function getCompanyFull(configData) {
  return configData?.reservationData?.raw?.userData?.organizationName || "—";
}

function getVehicleNumber(configData, short = true) {
  const vehicles = configData?.reservationData?.raw?.vehicleData;
  if (Array.isArray(vehicles)) {
    const trucks = vehicles.filter((v) => v.subTypeId === 1);
    if (trucks.length > 0) {
      return trucks.map((v) => {
        const num = v.regNumber || "";
        if (short && num.length > 4) {
          return num.slice(0, 4) + "....";
        }
        return num;
      }).filter(Boolean).join(", ") || "—";
    }
  }
  return "—";
}

function getVehicleNumberFull(configData) {
  return getVehicleNumber(configData, false);
}

function isTestRecord(record) {
  const rid = record.reservation_id || "";
  if (rid === "unknown" || rid === "" || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(rid)) {
    return true;
  }
  const cfg = record.config_json;
  if (cfg && typeof cfg.runUpTo === "number" && cfg.runUpTo < 5) {
    return true;
  }
  return false;
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
    const company = getCompany(r.config_json);
    if (!groups[company]) {
      groups[company] = { reschedule: 0, create: 0, records: [] };
    }
    groups[company].records.push(r);
    const mode = r.config_json?.mode;
    if (mode === "reschedule") {
      groups[company].reschedule++;
    } else if (mode === "create") {
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

export function ReportsTab({ adminToken }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hideTest, setHideTest] = useState(true);
  const [showOnlySuccess5, setShowOnlySuccess5] = useState(true);
  const [expandedConfig, setExpandedConfig] = useState({});
  const [showEditModal, setShowEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ price: "", paid: "" });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceSelectedLogs, setInvoiceSelectedLogs] = useState([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, hideTest, showOnlySuccess5]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const toggleConfig = (id) => {
    setExpandedConfig((prev) => ({ ...prev, [id]: !prev[id] }));
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
      setError(err.message);
    }
  };

  const handleOpenInvoiceForCompany = (companyName, companyRecords) => {
    const unpaidLogs = companyRecords.filter((r) => {
      if (isTestRecord(r)) return false;
      const hasPrice = r.price != null && r.price > 0;
      const isPaid = r.paid === true;
      return hasPrice && !isPaid;
    });
    if (unpaidLogs.length === 0) {
      setError(`Нет неоплаченных записей для "${companyName}"`);
      return;
    }
    setInvoiceSelectedLogs(unpaidLogs);
    setShowInvoiceModal(true);
  };

  const handleGenerateInvoice = async (invoiceData) => {
    try {
      if (!invoiceData.logs || invoiceData.logs.length === 0) {
        setError("Нет записей для счёта");
        return;
      }

      const apiKeyId = invoiceData.logs[0]?.api_key_id;
      if (!apiKeyId) {
        setError("Не удалось определить API ключ");
        return;
      }

      const body = {
        api_key_id: apiKeyId,
        usage_log_ids: invoiceData.logs.map((l) => l.id),
        withdrawal_id: null,
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
      alert(`Счёт ${data.invoice_number} создан! Итого: ${data.total_amount} ₽`);
      setShowInvoiceModal(false);
      setInvoiceSelectedLogs([]);
      fetchRecords();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="text-center py-4">Загрузка…</div>;
  if (error) return <div className="alert alert-danger">Ошибка: {error}</div>;

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
                          Сделать расчёт
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
                    const cfg = record.config_json;
                    const isExpanded = expandedConfig[record.id];
                    const opType = getOpType(cfg);
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
                          <td className="small" title={getFioFull(cfg)}>{getFio(cfg)}</td>
                          <td className="small" title={getCompanyFull(cfg)}>{getCompany(cfg)}</td>
                          <td className="small" title={getVehicleNumberFull(cfg)}>{getVehicleNumber(cfg)}</td>
                          <td className="small">{record.invoice_number || "—"}</td>
                          <td className="text-center">{renderPaidStatus(record)}</td>
                          <td className="text-center text-nowrap">
                            <button
                              className="btn btn-sm btn-outline-secondary me-1"
                              onClick={() => openEditModal(record)}
                              title="Редактировать"
                            >
                              ✏️
                            </button>
                            {cfg && (
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
                        {isExpanded && cfg && (
                          <tr>
                            <td colSpan={12}>
                              <pre className="p-2 small m-0" style={{ maxHeight: "300px", overflow: "auto", background: "var(--bs-dark)", borderRadius: "0.5rem" }}>
                                {JSON.stringify(cfg, null, 2)}
                              </pre>
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
