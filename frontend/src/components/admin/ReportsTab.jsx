import React, { useState, useEffect, useCallback } from "react";
import { UsageLogEditModal } from "./UsageLogEditModal";

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
      groups[company] = { reschedule: 0, create: 0 };
    }
    const mode = r.config_json?.mode;
    if (mode === "reschedule") {
      groups[company].reschedule++;
    } else if (mode === "create") {
      groups[company].create++;
    }
  });
  return Object.entries(groups).map(([name, counts]) => ({
    name,
    ...counts,
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

  if (loading) return <div className="reports-loading">Загрузка…</div>;
  if (error) return <div className="reports-error">Ошибка: {error}</div>;

  const summary = groupByCompany(records);

  const renderPaidStatus = (record) => {
    const isPaid = record.paid === true;
    const hasPrice = record.price != null && record.price > 0;
    if (!hasPrice) return <span className="paid-status paid-status--no-price">—</span>;
    if (isPaid) return <span className="paid-status paid-status--paid">Оплачено</span>;
    return <span className="paid-status paid-status--unpaid">Не оплачено</span>;
  };

  return (
    <div className="reports-page">
      <div className="reports-toolbar">
        <button
          className={`btn btn--sm ${showOnlySuccess5 ? "btn--active" : "btn--ghost"}`}
          onClick={() => setShowOnlySuccess5(!showOnlySuccess5)}
        >
          Только этап 5
        </button>
        <button
          className={`btn btn--sm ${hideTest ? "btn--active" : "btn--ghost"}`}
          onClick={() => setHideTest(!hideTest)}
        >
          {hideTest ? "Скрыть тестовые" : "Показать тестовые"}
        </button>
        <button className="btn btn--sm btn--ghost" onClick={fetchRecords}>
          Обновить
        </button>
        <span className="reports-count">Всего: {records.length}</span>
      </div>

      {summary.length > 0 && (
        <div className="summary-table">
          <div className="summary-header">
            <div className="summary-col summary-col--company">Компания</div>
            <div className="summary-col summary-col--reschedule">Переносы</div>
            <div className="summary-col summary-col--create">Брони</div>
          </div>
          <div className="summary-body">
            {summary.map((row) => (
              <div key={row.name} className="summary-row">
                <div className="summary-col summary-col--company">{row.name}</div>
                <div className="summary-col summary-col--reschedule">{row.reschedule}</div>
                <div className="summary-col summary-col--create">{row.create}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="reports-table">
        <div className="reports-header">
          <div className="reports-col reports-col--num">#</div>
          <div className="reports-col reports-col--id">ID</div>
          <div className="reports-col reports-col--label">Токен</div>
          <div className="reports-col reports-col--type">Тип</div>
          <div className="reports-col reports-col--time">Дата</div>
          <div className="reports-col reports-col--slot">Дата слота</div>
          <div className="reports-col reports-col--fio">ФИО</div>
          <div className="reports-col reports-col--company">Компания</div>
          <div className="reports-col reports-col--vehicle">Номер машины</div>
          <div className="reports-col reports-col--paid">Оплата</div>
          <div className="reports-col reports-col--actions">Действия</div>
        </div>

        <div className="reports-body">
          {records.length === 0 ? (
            <div className="reports-empty">Нет записей</div>
          ) : (
            records.map((record, idx) => {
              const cfg = record.config_json;
              const isExpanded = expandedConfig[record.id];
              return (
                <React.Fragment key={record.id}>
                  <div className="reports-row">
                    <div className="reports-col reports-col--num">{idx + 1}</div>
                    <div className="reports-col reports-col--id">{record.id}</div>
                    <div className="reports-col reports-col--label" title={record.label || "—"}>{record.label || "—"}</div>
                    <div className="reports-col reports-col--type">
                      <span className={`badge ${getOpType(cfg) === "Создание" ? "badge--success" : getOpType(cfg) === "Перенос" ? "badge--info" : ""}`}>
                        {getOpType(cfg)}
                      </span>
                    </div>
                    <div className="reports-col reports-col--time">{formatSlotDate(record.created_at)}</div>
                    <div className="reports-col reports-col--slot">{formatSlotDate(record.slot_date)}</div>
                    <div className="reports-col reports-col--fio" title={getFioFull(cfg)}>{getFio(cfg)}</div>
                    <div className="reports-col reports-col--company" title={getCompanyFull(cfg)}>{getCompany(cfg)}</div>
                    <div className="reports-col reports-col--vehicle" title={getVehicleNumberFull(cfg)}>{getVehicleNumber(cfg)}</div>
                    <div className="reports-col reports-col--paid">{renderPaidStatus(record)}</div>
                    <div className="reports-col reports-col--actions">
                      <button
                        className="btn btn--sm btn--ghost"
                        onClick={() => openEditModal(record)}
                        title="Редактировать"
                      >
                        ✏️
                      </button>
                      {cfg && (
                        <button
                          className={`btn btn--sm ${isExpanded ? "btn--active" : "btn--ghost"}`}
                          onClick={() => toggleConfig(record.id)}
                          title={isExpanded ? "Свернуть конфиг" : "Показать конфиг"}
                        >
                          ⚙
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && cfg && (
                    <div className="reports-expandable">
                      <pre>{JSON.stringify(cfg, null, 2)}</pre>
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
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
    </div>
  );
}
