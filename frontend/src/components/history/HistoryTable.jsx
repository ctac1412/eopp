import React from "react";
import { StatusBadge } from "./StatusBadge";

export function HistoryTable({
  records,
  selectedLogs,
  expandedLogs,
  expandedConfig,
  expandedErrors,
  onToggleSelection,
  onToggleLogs,
  onToggleConfig,
  onToggleError,
  onOpenEdit,
}) {
  if (records.length === 0) {
    return <div className="table__empty">История пуста</div>;
  }

  const allSelected = Object.keys(selectedLogs).length === records.length;

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                onChange={(e) => {
                  const checked = e.target.checked;
                  onToggleSelection(checked ? "selectall" : "deselectall");
                }}
                checked={allSelected}
              />
            </th>
            <th>ID</th>
            <th>Время</th>
            <th>Статус</th>
            <th>Дата слота</th>
            <th>Reservation ID</th>
            <th>Капча</th>
            <th>Цена</th>
            <th>Оплачен</th>
            <th>Ошибка</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const isLogsExpanded = expandedLogs[r.id];
            const isConfigExpanded = expandedConfig[r.id];
            const isErrorExpanded = expandedErrors[r.id];
            const hasLogs = r.logs && r.logs.length > 0;
            const hasConfig = r.config_json != null;
            const hasError = r.error_message != null && r.error_message !== "";
            const errorTruncated =
              hasError && !isErrorExpanded
                ? r.error_message.length > 100
                  ? r.error_message.slice(0, 100) + "…"
                  : r.error_message
                : null;

            return (
              <React.Fragment key={r.id}>
                <tr onClick={() => onOpenEdit(r)} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selectedLogs[r.id]}
                      onChange={() => onToggleSelection(r.id)}
                    />
                  </td>
                  <td className="table__cell--id">{r.id}</td>
                  <td className="table__cell--date">
                    {new Date(r.created_at).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="admin-history-slot-date">
                    {r.slot_date || "—"}
                  </td>
                  <td className="admin-history-resid">{r.reservation_id}</td>
                  <td className="admin-history-cid">
                    {r.captcha_id_short || r.captcha_id || "—"}
                  </td>
                  <td className="admin-history-price">
                    {r.price != null ? `${r.price} ₽` : "—"}
                  </td>
                  <td className="admin-history-paid">
                    {r.paid != null ? (r.paid ? "✓" : "—") : "—"}
                  </td>
                  <td className="admin-history-error-msg">
                    {hasError ? (
                      isErrorExpanded ? (
                        <span
                          style={{
                            cursor: "pointer",
                            color: "#f87171",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            overflow: "visible",
                            maxWidth: "none",
                          }}
                          onClick={() => onToggleError(r.id)}
                        >
                          {r.error_message}
                        </span>
                      ) : (
                        <span
                          style={{ cursor: "pointer", color: "#f87171" }}
                          onClick={() => onToggleError(r.id)}
                          title="Нажмите, чтобы развернуть"
                        >
                          {errorTruncated}
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {hasConfig && (
                        <button
                          className={`btn btn--sm ${isConfigExpanded ? "btn--active" : "btn--ghost"}`}
                          onClick={() => onToggleConfig(r.id)}
                        >
                          {isConfigExpanded ? "Свернуть конфиг" : "Конфиг"}
                        </button>
                      )}
                      {hasLogs && (
                        <button
                          className={`btn btn--sm ${isLogsExpanded ? "btn--active" : "btn--ghost"}`}
                          onClick={() => onToggleLogs(r.id)}
                        >
                          {isLogsExpanded ? "Свернуть логи" : "Логи"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isConfigExpanded && hasConfig && (
                  <tr>
                    <td colSpan={10} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-wrapper">
                        <div className="admin-plugin-logs-body">
                          <pre
                            style={{
                              margin: 0,
                              fontSize: "11px",
                              lineHeight: "1.6",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {JSON.stringify(r.config_json, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {isLogsExpanded && hasLogs && (
                  <tr>
                    <td colSpan={10} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-wrapper">
                        <div className="admin-plugin-logs-body">
                          {r.logs.map((line, i) => (
                            <div key={i} className="admin-plugin-log-line">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}