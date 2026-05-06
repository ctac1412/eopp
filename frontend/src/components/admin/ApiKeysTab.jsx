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

      <div className="admin-keys-container">
        <div className="admin-keys-header">
          <div className="admin-keys-header__id">ID</div>
          <div className="admin-keys-header__label">Label</div>
          <div className="admin-keys-header__key">Ключ</div>
          <div className="admin-keys-header__date">Создан</div>
          <div className="admin-keys-header__comment">Комментарий</div>
          <div className="admin-keys-header__tariff-create">Бронь</div>
          <div className="admin-keys-header__tariff-reschedule">Перенос</div>
          <div className="admin-keys-header__usage">Использование</div>
          <div className="admin-keys-header__debt">Долг</div>
          <div className="admin-keys-header__active">A</div>
          <div className="admin-keys-header__actions">Действия</div>
        </div>

        <div className="admin-keys-list">
          {keys.map((k) => {
            const isExpanded = expandedHistory[k.id] !== undefined;
            const historyData = expandedHistory[k.id];
            const tariff = k.tariff;
            const debt = k.debt || { unpaid_count: 0, no_price_count: 0, unpaid_total: 0 };
            const hasDebt = debt.unpaid_count > 0 || debt.no_price_count > 0;

            return (
              <React.Fragment key={k.id}>
                <div className="admin-key-row">
                  <div className="admin-key-cell admin-key-cell--id">{String(k.id)}</div>
                  <div className="admin-key-cell admin-key-cell--label">{k.label || "—"}</div>
                  <div className="admin-key-cell admin-key-cell--key">
                    <span className="admin-key-masked" onClick={() => copyToClipboard(k.key)} title="Нажмите, чтобы скопировать">
                      ...{k.key.slice(-4)}
                    </span>
                  </div>
                  <div className="admin-key-cell admin-key-cell--date">{formatDate(k.created_at)}</div>
                  <div className="admin-key-cell admin-key-cell--comment">{k.comment || "—"}</div>
                  <div className="admin-key-cell admin-key-cell--tariff-create">
                    {tariff ? `${tariff.price_create} ₽` : "—"}
                  </div>
                  <div className="admin-key-cell admin-key-cell--tariff-reschedule">
                    {tariff ? `${tariff.price_reschedule} ₽` : "—"}
                  </div>
                  <div className="admin-key-cell admin-key-cell--usage">
                    {k.usage_count ?? 0}{k.max_uses != null ? ` / ${k.max_uses}` : ""}
                  </div>
                  <div className="admin-key-cell admin-key-cell--debt">
                    {hasDebt ? (
                      <span className="admin-key-debt" title={`${debt.unpaid_count} не оплачено, ${debt.no_price_count} без цены`}>
                        {debt.unpaid_total} ₽
                      </span>
                    ) : (
                      <span className="admin-key-debt admin-key-debt--clear">0 ₽</span>
                    )}
                  </div>
                  <div className="admin-key-cell admin-key-cell--active">
                    <button
                      className={`toggle ${k.active ? "toggle--on" : ""}`}
                      onClick={() => onToggleActive(k)}
                      title={k.active ? "Деактивировать" : "Активировать"}
                    >
                      <span className="toggle__dot" />
                    </button>
                  </div>
                  <div className="admin-key-cell admin-key-cell--actions">
                    <button className="btn btn--sm btn--ghost" onClick={() => onEditKey(k)}>Изменить</button>
                    <button
                      className={`btn btn--sm ${isExpanded ? "btn--active" : "btn--ghost"}`}
                      onClick={() => onToggleHistory(k.id)}
                    >
                      {isExpanded ? "Свернуть" : "Журнал"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="admin-journal-panel">
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
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
