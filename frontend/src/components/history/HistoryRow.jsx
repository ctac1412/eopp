import React from "react";
import { formatMoney } from "../../utils/format";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateShort(iso) {
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

function opTypeLabel(opType) {
  if (opType === "create") return "Создание";
  if (opType === "reschedule") return "Перенос";
  return null;
}

function maskFio(fio) {
  if (!fio || typeof fio !== "string") return "—";
  const parts = fio.trim().split(/\s+/);
  if (parts.length === 0) return "—";
  const first = parts[0];
  const masked = first.length >= 3 ? first.slice(0, 3) : first;
  if (parts.length >= 2) {
    const second = parts[1];
    if (parts.length >= 3) {
      const third = parts[2];
      return `${masked} ${second[0]}. ${third[0]}.`;
    }
    return `${masked} ${second[0]}.`;
  }
  return masked;
}

function isTestRecord(record) {
  return record.is_test === true || record.is_test === 1;
}

const COLUMN_CONFIGS = {
  checkbox: { header: "", key: "checkbox" },
  id: { header: "ID", key: "id" },
  type: { header: "Тип", key: "type" },
  time: { header: "Время", key: "time" },
  status: { header: "Статус", key: "status" },
  slot: { header: "Дата слота", key: "slot" },
  fio: { header: "ФИО", key: "fio" },
  test: { header: "Тестовая", key: "test" },
  custom_slots: { header: "Свои слоты", key: "custom_slots" },
  price: { header: "Цена", key: "price" },
  paid: { header: "Оплата", key: "paid" },
  error: { header: "Ошибка", key: "error" },
  actions: { header: "Действия", key: "actions" },
  resid: { header: "ID брони", key: "resid" },
  captcha: { header: "Капча", key: "captcha" },
};

const PRESETS = {
  user: {
    columns: ["id", "type", "time", "status", "custom_slots", "slot", "resid", "captcha", "paid", "error", "actions"],
    actions: { showLogs: true, showConfig: true, showEdit: false, showDelete: false, showCheckbox: false },
  },
  admin: {
    columns: ["checkbox", "id", "type", "time", "status", "slot", "fio", "custom_slots", "test", "price", "paid", "error", "actions"],
    actions: { showLogs: true, showConfig: true, showEdit: true, showDelete: true, showCheckbox: true },
  },
};

export function HistoryRow({
  record,
  columns,
  actions,
  expandedLogs,
  expandedConfig,
  expandedErrors,
  selected,
  onToggleLogs,
  onToggleConfig,
  onToggleError,
  onToggleSelect,
  onEdit,
  onDelete,
  onClick,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  const isLogsExpanded = expandedLogs?.[record.id];
  const isConfigExpanded = expandedConfig?.[record.id];
  const isErrorExpanded = expandedErrors?.[record.id];
  const hasLogs = record.logs && record.logs.length > 0;
  const hasConfig = record.config_json != null;
  const hasError = record.error_message != null && record.error_message !== "";
  const opType = opTypeLabel(record.op_type);
  const errorTruncated =
    hasError && !isErrorExpanded
      ? record.error_message.length > 100
        ? record.error_message.slice(0, 100) + "…"
        : record.error_message
      : null;

  const renderCell = (columnKey) => {
    switch (columnKey) {
      case "checkbox":
        return (
          <td className="align-middle" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="form-check-input"
              checked={!!selected}
              onChange={() => onToggleSelect?.(record.id)}
            />
          </td>
        );
      case "id":
        return <td className="align-middle font-monospace small">{record.id}</td>;
      case "type":
        return (
          <td className="align-middle">
            {opType ? (
              <span className={`badge ${opType === "Создание" ? "bg-success" : "bg-info text-dark"}`} style={{ borderRadius: "0.375rem", fontSize: "0.625rem" }}>
                {opType}
              </span>
            ) : (
              <span>—</span>
            )}
          </td>
        );
      case "time":
        return <td className="align-middle small">{formatDate(record.created_at)}</td>;
      case "status":
        return (
          <td className="align-middle text-center">
            <span
              className={`badge ${
                record.status === "confirmed" ? "bg-success" :
                record.status === "pending" ? "bg-warning text-dark" : "bg-danger"
              }`}
              style={{ borderRadius: "0.375rem", fontSize: "0.625rem" }}
              title={record.status === "confirmed" ? "Подтверждено" : record.status === "pending" ? "Ожидание" : "Ошибка"}
            >
              {record.status === "confirmed" ? "Подтв." : record.status === "pending" ? "Ожид." : "Ошибка"}
            </span>
          </td>
        );
      case "slot":
        return <td className="align-middle small">{record.slot_date || "—"}</td>;
      case "fio":
        return <td className="align-middle small">{maskFio(record.fio)}</td>;
      case "test":
        return <td className="align-middle small">{isTestRecord(record) ? "Да" : "Нет"}</td>;
      case "custom_slots":
        return <td className="align-middle small">{record.has_custom_slots ? "✅" : "—"}</td>;
      case "resid": {
        const rid = record.reservation_id || "";
        return (
          <td className="align-middle small font-monospace" style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={rid}>
            {rid || "—"}
          </td>
        );
      }
      case "captcha":
        return <td className="align-middle small font-monospace">{record.captcha_id || "—"}</td>;
      case "price":
        let priceColorClass = "text-muted";
        if (record.price != null && record.price > 0) {
          if (record.paid === true) {
            priceColorClass = "text-success fw-semibold";
          } else if (record.paid === false) {
            priceColorClass = "text-danger fw-semibold";
          }
        }
        if (editingPriceId === record.id && actions.showEdit) {
          return (
            <td className="align-middle small">
              <input
                type="number"
                className="form-control form-control-sm"
                style={{ width: "80px" }}
                defaultValue={record.price ?? 0}
                autoFocus
                onBlur={(e) => {
                  const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                  onPriceChange?.(record.id, val);
                  setEditingPriceId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                    onPriceChange?.(record.id, val);
                    setEditingPriceId(null);
                  }
                  if (e.key === "Escape") {
                    setEditingPriceId(null);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </td>
          );
        }
        return (
          <td
            className={`align-middle small ${priceColorClass}`}
            onDoubleClick={actions.showEdit ? (e) => {
              e.stopPropagation();
              setEditingPriceId(record.id);
            } : undefined}
            style={actions.showEdit ? { cursor: "pointer" } : undefined}
            title={actions.showEdit ? "Двойной клик для редактирования" : undefined}
          >
            {record.price != null ? formatMoney(record.price) : "—"}
          </td>
        );
      case "paid":
        const isPaid = record.paid === true;
        const hasInvoice = !!record.invoice_id;
        const paidDisplay = isPaid ? "✅" : (!hasInvoice ? "—" : "—");
        const paidTitle = isPaid ? "Оплачено" : (!hasInvoice ? "Нет счёта" : "Не оплачено");
        return (
          <td
            className="align-middle small text-center"
            onDoubleClick={actions.showEdit ? (e) => {
              e.stopPropagation();
              onTogglePaid?.(record.id);
            } : undefined}
            title={`${paidTitle}${actions.showEdit ? " (двойной клик для смены)" : ""}`}
            style={actions.showEdit ? { cursor: "pointer" } : undefined}
          >
            {paidDisplay}
          </td>
        );
      case "error":
        return (
          <td className="align-middle small">
            {hasError ? (
              isErrorExpanded ? (
                <span
                  className="text-danger"
                  onClick={() => onToggleError?.(record.id)}
                  style={{ cursor: "pointer" }}
                >
                  {record.error_message}
                </span>
              ) : (
                <span
                  className="text-danger"
                  onClick={() => onToggleError?.(record.id)}
                  title="Нажмите, чтобы развернуть"
                  style={{ cursor: "pointer" }}
                >
                  {errorTruncated}
                </span>
              )
            ) : (
              "—"
            )}
          </td>
        );
      case "actions":
        return (
          <td className="align-middle" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex gap-1">
              {actions.showEdit && (
                <button className="btn btn-sm btn-outline-primary" onClick={() => onEdit?.(record)} title="Редактировать">
                  ✏️
                </button>
              )}
              {actions.showDelete && (
                <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete?.(record.id)} title="Удалить">
                  🗑
                </button>
              )}
              {actions.showLogs && (
                <button
                  className={`btn btn-sm ${isLogsExpanded ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => onToggleLogs?.(record.id)}
                  title={isLogsExpanded ? "Свернуть логи" : "Показать логи"}
                >
                  📋
                </button>
              )}
              {actions.showConfig && hasConfig && (
                <button
                  className={`btn btn-sm ${isConfigExpanded ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => onToggleConfig?.(record.id)}
                  title={isConfigExpanded ? "Свернуть конфиг" : "Показать конфиг"}
                >
                  ⚙
                </button>
              )}
            </div>
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <React.Fragment>
      <tr
        className={onClick ? "history-row" : ""}
        onClick={onClick ? () => onClick(record) : undefined}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        {columns.map((col) => (
          <React.Fragment key={col}>{renderCell(col)}</React.Fragment>
        ))}
      </tr>
      {isConfigExpanded && hasConfig && (
        <tr>
          <td colSpan={columns.length} className="p-0">
            <div className="p-2" style={{ background: "var(--bs-dark)" }}>
              <pre className="mb-0 small" style={{ fontSize: "0.6875rem", fontFamily: "var(--bs-font-monospace)", color: "#8b949e" }}>
                {JSON.stringify(record.config_json, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
      {isLogsExpanded && (
        <tr>
          <td colSpan={columns.length} className="p-0">
            <div className="p-2" style={{ background: "var(--bs-dark)" }}>
              {hasLogs ? (
                record.logs.map((line, i) => (
                  <div key={i} className="small font-monospace" style={{ fontSize: "0.6875rem", color: "#8b949e" }}>
                    {line}
                  </div>
                ))
              ) : (
                <div className="small" style={{ fontSize: "0.6875rem", color: "#6e7681" }}>
                  Нет логов
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

export function HistoryTable({
  records,
  preset = "user",
  columns,
  actions,
  expandedLogs = {},
  expandedConfig = {},
  expandedErrors = {},
  selectedLogs = {},
  onToggleLogs,
  onToggleConfig,
  onToggleError,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  onEdit,
  onDelete,
  onRowClick,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
  onGenerateInvoice,
}) {
  const resolvedColumns = columns || PRESETS[preset].columns;
  const resolvedActions = { ...PRESETS[preset].actions, ...actions };

  if (records.length === 0) {
    return <div style={{ fontSize: "0.8125rem", color: "#6e7681", padding: "1rem 0" }}>Нет записей</div>;
  }

  const selectedCount = Object.values(selectedLogs).filter(Boolean).length;

  return (
    <div>
      {onGenerateInvoice && selectedCount > 0 && (
        <div className="d-flex justify-content-between align-items-center mb-2 p-2" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
          <span className="small" style={{ fontSize: "0.8125rem", color: "#6e7681" }}>Выбрано: {selectedCount}</span>
          <button className="btn btn-sm btn-primary" onClick={onGenerateInvoice}>
            Сформировать счёт
          </button>
        </div>
      )}
      <div className="table-responsive">
        <table className="table table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              {resolvedColumns.map((col) => {
                if (col === "checkbox" && onToggleSelectAll != null) {
                  return (
                    <th key={col} className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        onChange={(e) => onToggleSelectAll(e.target.checked)}
                        checked={!!allSelected}
                      />
                    </th>
                  );
                }
                return (
                  <th key={col} className="small fw-semibold">
                    {COLUMN_CONFIGS[col]?.header || ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <HistoryRow
                key={record.id}
                record={record}
                columns={resolvedColumns}
                actions={resolvedActions}
                expandedLogs={expandedLogs}
                expandedConfig={expandedConfig}
                expandedErrors={expandedErrors}
                selected={selectedLogs[record.id]}
                onToggleLogs={onToggleLogs}
                onToggleConfig={onToggleConfig}
                onToggleError={onToggleError}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onClick={onRowClick}
                editingPriceId={editingPriceId}
                setEditingPriceId={setEditingPriceId}
                onPriceChange={onPriceChange}
                onTogglePaid={onTogglePaid}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
