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
  onEditUsageLog,
  onToggleUsageLogSelection,
  onTogglePluginLogs,
  onToggleConfig,
  onCloseNewKey,
  onShowInvoiceModal,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  if (loading && keys.length === 0) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }
  if (keys.length === 0) {
    return <div className="text-center text-muted py-3">Нет ключей</div>;
  }

  return (
    <>
      {newKey && (
        <div className="alert alert-success mb-3">
          <h6 className="alert-heading">Ключ создан!</h6>
          <p className="mb-2 small">
            Этот ключ отображается только один раз. Скопируйте и сохраните.
          </p>
          <div className="d-flex align-items-center gap-2 mb-2">
            <input
              type="text"
              readOnly
              value={newKey.key}
              className="form-control form-control-sm font-monospace"
              style={{ maxWidth: "400px" }}
            />
            <button className="btn btn-sm btn-outline-secondary" onClick={() => copyToClipboard(newKey.key)}>
              Копировать
            </button>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={onCloseNewKey}>
            Закрыть
          </button>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: "50px" }}>ID</th>
              <th>Label</th>
              <th style={{ width: "120px" }}>Ключ</th>
              <th style={{ width: "130px" }}>Создан</th>
              <th>Комментарий</th>
              <th style={{ width: "80px" }}>Бронь</th>
              <th style={{ width: "80px" }}>Перенос</th>
              <th style={{ width: "90px" }}>Использование</th>
              <th style={{ width: "80px" }}>Долг</th>
              <th style={{ width: "40px" }}>Актив</th>
              <th style={{ width: "160px" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const isExpanded = expandedHistory[k.id] !== undefined;
              const historyData = expandedHistory[k.id];
              const tariff = k.tariff;
              const debt = k.debt || { unpaid_count: 0, no_price_count: 0, unpaid_total: 0 };
              const hasDebt = debt.unpaid_count > 0 || debt.no_price_count > 0;

              return (
                <React.Fragment key={k.id}>
                  <tr>
                    <td>{String(k.id)}</td>
                    <td>{k.label || "—"}</td>
                    <td>
                      <span
                        className="text-muted font-monospace"
                        style={{ cursor: "pointer" }}
                        onClick={() => copyToClipboard(k.key)}
                        title="Нажмите, чтобы скопировать"
                      >
                        ...{k.key.slice(-4)}
                      </span>
                    </td>
                    <td className="text-nowrap small">{formatDate(k.created_at)}</td>
                    <td className="small">{k.comment || "—"}</td>
                    <td className="text-center">
                      {tariff ? `${tariff.price_create} ₽` : "—"}
                    </td>
                    <td className="text-center">
                      {tariff ? `${tariff.price_reschedule} ₽` : "—"}
                    </td>
                    <td className="text-center">
                      {k.usage_count ?? 0}{k.max_uses != null ? ` / ${k.max_uses}` : ""}
                    </td>
                    <td className="text-center">
                      {hasDebt ? (
                        <span
                          className="badge bg-warning text-dark"
                          title={`${debt.unpaid_count} не оплачено, ${debt.no_price_count} без цены`}
                        >
                          {debt.unpaid_total} ₽
                        </span>
                      ) : (
                        <span className="badge bg-success">0 ₽</span>
                      )}
                    </td>
                    <td className="text-center">
                      <button
                        className={`btn btn-sm ${k.active ? "btn-success" : "btn-outline-secondary"}`}
                        onClick={() => onToggleActive(k)}
                        title={k.active ? "Деактивировать" : "Активировать"}
                        style={{ width: "24px", height: "24px", padding: "0", lineHeight: "1" }}
                      >
                        {k.active ? "✓" : ""}
                      </button>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => onEditKey(k)}>
                          Изменить
                        </button>
                        <button
                          className={`btn btn-sm ${isExpanded ? "btn-outline-secondary" : "btn-outline-info"}`}
                          onClick={() => onToggleHistory(k.id)}
                        >
                          {isExpanded ? "Свернуть" : "Журнал"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={11} className="p-0">
                        <div className="p-3" style={{ background: "var(--bs-dark)", borderRadius: "0.5rem" }}>
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
                            onEdit={(entry) => onEditUsageLog(entry)}
                            selectedLogs={selectedUsageLogs}
                            onToggleSelect={(id) => onToggleUsageLogSelection(id)}
                            expandedLogs={expandedLogs}
                            expandedConfig={expandedConfig}
                            onToggleLogs={(id) => onTogglePluginLogs(id)}
                            onToggleConfig={(id) => onToggleConfig(id)}
                            onGenerateInvoice={() => onShowInvoiceModal(k.id)}
                            editingPriceId={editingPriceId}
                            setEditingPriceId={setEditingPriceId}
                            onPriceChange={onPriceChange}
                            onTogglePaid={onTogglePaid}
                          />
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
    </>
  );
}
