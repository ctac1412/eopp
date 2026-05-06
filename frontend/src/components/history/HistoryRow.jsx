import React from "react";

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

function getOpType(configData) {
  if (!configData) return null;
  return configData.mode === "create" ? "Создание" : configData.mode === "reschedule" ? "Перенос" : null;
}

const COLUMN_CONFIGS = {
  checkbox: { header: "", key: "checkbox" },
  id: { header: "ID", key: "id" },
  type: { header: "Тип", key: "type" },
  time: { header: "Время", key: "time" },
  status: { header: "Статус", key: "status" },
  slot: { header: "Дата слота", key: "slot" },
  resid: { header: "Reservation ID", key: "resid" },
  captcha: { header: "Капча", key: "captcha" },
  price: { header: "Цена", key: "price" },
  paid: { header: "Оплата", key: "paid" },
  error: { header: "Ошибка", key: "error" },
  actions: { header: "Действия", key: "actions" },
};

const PRESETS = {
  user: {
    columns: ["id", "type", "time", "status", "slot", "resid", "captcha", "price", "paid", "error", "actions"],
    actions: { showLogs: true, showConfig: true, showEdit: false, showDelete: false, showCheckbox: false },
  },
  admin: {
    columns: ["checkbox", "id", "type", "time", "resid", "captcha", "status", "slot", "price", "paid", "error", "actions"],
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
  const opType = getOpType(record.config_json);
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
          <div className="history-cell history-cell--checkbox" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect?.(record.id)}
            />
          </div>
        );
      case "id":
        return <div className="history-cell history-cell--id">{record.id}</div>;
      case "type":
        return (
          <div className="history-cell history-cell--type">
            {opType ? (
              <span className={`badge ${opType === "Создание" ? "badge--success" : "badge--info"}`}>
                {opType}
              </span>
            ) : (
              "—"
            )}
          </div>
        );
      case "time":
        return <div className="history-cell history-cell--time">{formatDate(record.created_at)}</div>;
      case "status":
        return (
          <div className="history-cell history-cell--status">
            <span
              className={`status-dot status-dot--${
                record.status === "confirmed" ? "confirmed" :
                record.status === "pending" ? "pending" : "failed"
              }`}
              title={record.status === "confirmed" ? "Подтверждено" : record.status === "pending" ? "Ожидание" : "Ошибка"}
            />
          </div>
        );
      case "slot":
        return <div className="history-cell history-cell--slot">{record.slot_date || "—"}</div>;
      case "resid":
        return <div className="history-cell history-cell--resid">{record.reservation_id || "—"}</div>;
      case "captcha":
        return <div className="history-cell history-cell--captcha">{record.captcha_id_short || record.captcha_id || "—"}</div>;
      case "price":
        let priceColorClass = "history-cell--price--none";
        if (record.price != null && record.price > 0) {
          if (record.paid === true) {
            priceColorClass = "history-cell--price--paid";
          } else if (record.paid === false) {
            priceColorClass = "history-cell--price--unpaid";
          }
        }
        if (editingPriceId === record.id && actions.showEdit) {
          return (
            <div className="history-cell history-cell--price history-cell--price-edit">
              <input
                type="number"
                className="history-price-input"
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
            </div>
          );
        }
        return (
          <div
            className={`history-cell history-cell--price ${priceColorClass}`}
            onDoubleClick={actions.showEdit ? (e) => {
              e.stopPropagation();
              setEditingPriceId(record.id);
            } : undefined}
            style={actions.showEdit ? { cursor: "pointer" } : undefined}
            title={actions.showEdit ? "Двойной клик для редактирования" : undefined}
          >
            {record.price != null ? `${record.price} ₽` : "—"}
          </div>
        );
      case "paid":
        const isPaid = record.paid === true;
        const paidIcon = isPaid ? "✅" : "⛔";
        const paidTitle = isPaid ? "Оплачено" : "Не оплачено";
        return (
          <div
            className="history-cell history-cell--paid"
            onDoubleClick={actions.showEdit ? (e) => {
              e.stopPropagation();
              onTogglePaid?.(record.id);
            } : undefined}
            title={`${paidTitle}${actions.showEdit ? " (двойной клик для смены)" : ""}`}
            style={actions.showEdit ? { cursor: "pointer" } : undefined}
          >
            <span style={{ fontSize: "16px" }}>{paidIcon}</span>
          </div>
        );
      case "error":
        return (
          <div className="history-cell history-cell--error">
            {hasError ? (
              isErrorExpanded ? (
                <span
                  className="history-error-expanded"
                  onClick={() => onToggleError?.(record.id)}
                >
                  {record.error_message}
                </span>
              ) : (
                <span
                  className="history-error-truncated"
                  onClick={() => onToggleError?.(record.id)}
                  title="Нажмите, чтобы развернуть"
                >
                  {errorTruncated}
                </span>
              )
            ) : (
              "—"
            )}
          </div>
        );
      case "actions":
        return (
          <div className="history-cell history-cell--actions" onClick={(e) => e.stopPropagation()}>
            <div className="history-actions-group">
              {actions.showEdit && (
                <button className="btn btn--sm btn--ghost" onClick={() => onEdit?.(record)} title="Редактировать">
                  ✏️
                </button>
              )}
              {actions.showDelete && (
                <button className="btn btn--sm btn--danger" onClick={() => onDelete?.(record.id)} title="Удалить">
                  🗑
                </button>
              )}
              {actions.showLogs && hasLogs && (
                <button
                  className={`btn btn--sm ${isLogsExpanded ? "btn--active" : "btn--ghost"}`}
                  onClick={() => onToggleLogs?.(record.id)}
                  title={isLogsExpanded ? "Свернуть логи" : "Показать логи"}
                >
                  📋
                </button>
              )}
              {actions.showConfig && hasConfig && (
                <button
                  className={`btn btn--sm ${isConfigExpanded ? "btn--active" : "btn--ghost"}`}
                  onClick={() => onToggleConfig?.(record.id)}
                  title={isConfigExpanded ? "Свернуть конфиг" : "Показать конфиг"}
                >
                  ⚙
                </button>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <React.Fragment>
      <div
        className="history-row"
        onClick={onClick ? () => onClick(record) : undefined}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        {columns.map((col) => (
          <React.Fragment key={col}>{renderCell(col)}</React.Fragment>
        ))}
      </div>
      {isConfigExpanded && hasConfig && (
        <div className="history-expandable">
          <div className="history-expandable-body">
            <pre className="history-expandable-pre">
              {JSON.stringify(record.config_json, null, 2)}
            </pre>
          </div>
        </div>
      )}
      {isLogsExpanded && hasLogs && (
        <div className="history-expandable">
          <div className="history-expandable-body">
            {record.logs.map((line, i) => (
              <div key={i} className="history-log-line">
                {line}
              </div>
            ))}
          </div>
        </div>
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
    return <div className="history-empty">Нет записей</div>;
  }

  const selectedCount = Object.values(selectedLogs).filter(Boolean).length;

  return (
    <div className="history-container" data-preset={preset}>
      {onGenerateInvoice && selectedCount > 0 && (
        <div className="history-toolbar">
          <span className="history-toolbar__info">Выбрано: {selectedCount}</span>
          <button className="btn btn--primary btn--sm" onClick={onGenerateInvoice}>
            Сформировать счёт
          </button>
        </div>
      )}
      <div className="history-header">
        {resolvedColumns.map((col) => {
          if (col === "checkbox" && onToggleSelectAll != null) {
            return (
              <div key={col} className="history-header__checkbox">
                <input
                  type="checkbox"
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  checked={!!allSelected}
                />
              </div>
            );
          }
          return (
            <div key={col} className={`history-header__${col}`}>
              {COLUMN_CONFIGS[col]?.header || ""}
            </div>
          );
        })}
      </div>
      <div className="history-list">
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
      </div>
    </div>
  );
}
