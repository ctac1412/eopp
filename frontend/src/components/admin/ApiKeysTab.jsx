import React from "react";
import { UsageHistory } from "./AdminUsageHistory";

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

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  });
}

export function ApiKeysTab({
  keys,
  loading,
  error,
  newKey,
  tariffs,
  expandedHistory,
  historyLoading,
  historyHideTest,
  expandedLogs,
  expandedConfig,
  selectedUsageLogs,
  onEditKey,
  onToggleActive,
  onToggleHistory,
  onFetchUsageHistory,
  onDeleteUsage,
  onToggleUsageLogSelection,
  onTogglePluginLogs,
  onToggleConfig,
  onCloseNewKey,
  onShowInvoiceModal,
}) {
  if (loading && keys.length === 0) {
    return <div className="table__loading">Загрузка…</div>;
  }
  if (keys.length === 0) {
    return <div className="table__empty">Нет ключей</div>;
  }

  return (
    <>
      {newKey && (
        <div className="admin-new-key">
          <div className="admin-new-key__title">Ключ создан!</div>
          <p className="admin-new-key__hint">
            Этот ключ отображается только один раз. Скопируйте и сохраните.
          </p>
          <div className="admin-new-key__value">
            <input type="text" readOnly value={newKey.key} className="input input--mono" />
            <button className="btn btn--ghost" onClick={() => copyToClipboard(newKey.key)}>
              Копировать
            </button>
          </div>
          <button className="btn btn--secondary" onClick={onCloseNewKey}>
            Закрыть
          </button>
        </div>
      )}

      <div className="table-wrapper admin-keys-table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>ID</th>
              <th>Ключ</th>
              <th>Создан</th>
              <th>Комментарий</th>
              <th>
                <span style={{ display: "block", textAlign: "center" }}>Тариф</span>
              </th>
              <th>Использование</th>
              <th>Активен</th>
              <th>Действия</th>
            </tr>
            <tr>
              <th colSpan={5} />
              <th>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "11px", color: "#888" }}>
                  <span>Запись</span>
                  <span>Бронь</span>
                </div>
              </th>
              <th colSpan={3} />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const isExpanded = expandedHistory[k.id] !== undefined;
              const historyData = expandedHistory[k.id];

              return (
                <React.Fragment key={k.id}>
                  <tr
                    className="admin-key-row"
                    onClick={() => {
                      if (isExpanded) {
                        onEditKey(k);
                      } else {
                        onToggleHistory(k.id);
                      }
                    }}
                  >
                    <td className="table__cell--label">{k.label || "—"}</td>
                    <td className="table__cell--id">{String(k.id)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="admin-key-masked" onClick={() => copyToClipboard(k.key)} title="Нажмите, чтобы скопировать">
                        {k.masked_key || "—"}
                      </span>
                    </td>
                    <td className="table__cell--date">{formatDate(k.created_at)}</td>
                    <td className="admin-comment">{k.comment || "—"}</td>
                    <td>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", textAlign: "center" }}>
                        <span>{tariffs[k.id] ? `${tariffs[k.id].price_create} ₽` : "—"}</span>
                        <span>{tariffs[k.id] ? `${tariffs[k.id].price_reschedule} ₽` : "—"}</span>
                      </div>
                    </td>
                    <td className="table__cell--numeric">
                      {k.usage_count ?? 0}{k.max_uses != null ? ` / ${k.max_uses}` : ""}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`toggle ${k.active ? "toggle--on" : ""}`}
                        onClick={() => onToggleActive(k)}
                        title={k.active ? "Деактивировать" : "Активировать"}
                      >
                        <span className="toggle__dot" />
                      </button>
                    </td>
                    <td className="table__cell--actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn--sm btn--ghost" onClick={() => onEditKey(k)}>Изменить</button>
                      <button
                        className={`btn btn--sm ${isExpanded ? "btn--active" : "btn--ghost"}`}
                        onClick={() => onToggleHistory(k.id)}
                      >
                        {isExpanded ? "Свернуть" : "История"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="admin-history-cell">
                        <UsageHistory
                          keyId={k.id}
                          historyData={historyData}
                          isLoading={historyLoading[k.id]}
                          isEmpty={historyData === null}
                          isError={historyData === null}
                          hideTest={historyHideTest[k.id]}
                          onToggleHideTest={() => {
                            const next = !historyHideTest[k.id];
                            onFetchUsageHistory(k.id, next);
                          }}
                          onRefresh={() => onFetchUsageHistory(k.id, historyHideTest[k.id])}
                          onDelete={(usageId) => onDeleteUsage(k.id, usageId)}
                          selectedLogs={selectedUsageLogs}
                          onToggleSelect={(id) => onToggleUsageLogSelection(id)}
                          expandedLogs={expandedLogs}
                          expandedConfig={expandedConfig}
                          onToggleLogs={(id) => onTogglePluginLogs(id)}
                          onToggleConfig={(id) => onToggleConfig(id)}
                          onGenerateInvoice={() => onShowInvoiceModal(k.id)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
