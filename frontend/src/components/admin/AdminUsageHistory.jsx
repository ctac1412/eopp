import React from "react";

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

export function UsageHistory({
  keyId,
  historyData,
  isLoading,
  isEmpty,
  isError,
  hideTest,
  onToggleHideTest,
  onRefresh,
  onDelete,
  selectedLogs,
  onToggleSelect,
  expandedLogs,
  expandedConfig,
  onToggleLogs,
  onToggleConfig,
  onGenerateInvoice,
  adminToken,
}) {
  if (isLoading) return <div className="table__loading">Загрузка…</div>;
  if (isError) return <div className="table__empty">Ошибка загрузки</div>;
  if (isEmpty) return <div className="table__empty">Нет записей</div>;

  const allChecked = historyData.length > 0 && historyData.every((e) => selectedLogs[e.id]);

  return (
    <>
      <div className="admin-history-toolbar">
        <button
          className={`btn btn--sm ${hideTest ? "btn--active" : "btn--ghost"}`}
          onClick={onToggleHideTest}
        >
          {hideTest ? "Показать тестовые" : "Убрать тестовые"}
        </button>
        {historyData.length > 0 && (
          <button className="btn btn--sm btn--primary" onClick={onGenerateInvoice}>
            Счёт
          </button>
        )}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                onChange={(e) => {
                  const checked = e.target.checked;
                  const logIds = historyData.map((entry) => entry.id);
                  const newSelection = { ...selectedLogs };
                  logIds.forEach((id) => {
                    newSelection[id] = checked;
                  });
                }}
                checked={allChecked}
              />
            </th>
            <th>ID</th>
            <th>Время</th>
            <th>Тип</th>
            <th>Reservation ID</th>
            <th>Captcha ID</th>
            <th>Статус</th>
            <th>Слот</th>
            <th>Ошибка</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {historyData.map((entry) => {
            const isPluginExpanded = expandedLogs[entry.id];
            const isConfigExpanded = expandedConfig[entry.id];
            const pluginData = entry.logs;
            const configData = entry.config_json;
            const opType = configData && configData.mode === "create" ? "Создание" : "Перенос";

            return (
              <React.Fragment key={entry.id}>
                <tr>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selectedLogs[entry.id]}
                      onChange={() => onToggleSelect(entry.id)}
                    />
                  </td>
                  <td className="table__cell--id">{entry.id}</td>
                  <td className="table__cell--date">{formatDate(entry.created_at)}</td>
                  <td>
                    {opType ? (
                      <span className={`badge ${opType === "Создание" ? "badge--success" : "badge--info"}`}>
                        {opType}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="table__cell--id">{entry.reservation_id || "—"}</td>
                  <td className="table__cell--id">{entry.captcha_id_short || entry.captcha_id || "—"}</td>
                  <td>
                    <span className={`badge badge--${
                      entry.status === "confirmed" ? "success" :
                      entry.status === "pending" ? "warning" : "error"
                    }`}>
                      {entry.status === "confirmed" ? "Подтверждено" : entry.status === "pending" ? "Ожидание" : "Ошибка"}
                    </span>
                  </td>
                  <td className="table__cell--date">{entry.slot_date || "—"}</td>
                  <td className="admin-history-error-msg">
                    {entry.status === "failed" && entry.error_message
                      ? entry.error_message.length > 100 ? entry.error_message.slice(0, 100) + "…" : entry.error_message
                      : "—"}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <button className="btn btn--sm btn--danger" onClick={() => onDelete(entry.id)}>
                        Удалить
                      </button>
                      {configData && (
                        <button className={`btn btn--sm ${isConfigExpanded ? "btn--active" : "btn--ghost"}`} onClick={() => onToggleConfig(entry.id)}>
                          {isConfigExpanded ? "Свернуть" : "Конфиг"}
                        </button>
                      )}
                      {pluginData && pluginData.length > 0 && (
                        <button className={`btn btn--sm ${isPluginExpanded ? "btn--active" : "btn--ghost"}`} onClick={() => onToggleLogs(entry.id)}>
                          {isPluginExpanded ? "Свернуть" : "Логи"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isConfigExpanded && configData && (
                  <tr>
                    <td colSpan={10} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-body">
                        <pre style={{ margin: 0, fontSize: "11px", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {JSON.stringify(configData, null, 2)}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
                {isPluginExpanded && pluginData && pluginData.length > 0 && (
                  <tr>
                    <td colSpan={10} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-body">
                        {pluginData.map((line, idx) => (
                          <div key={idx} className="admin-plugin-log-line">{line}</div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
