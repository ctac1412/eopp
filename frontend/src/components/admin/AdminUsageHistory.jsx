import React from "react";
import { HistoryTable as SharedHistoryTable } from "../history/HistoryRow";

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
  onEdit,
  expandedLogs,
  expandedConfig,
  onToggleLogs,
  onToggleConfig,
  adminToken,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  if (isLoading) return <div className="table__loading">Загрузка…</div>;
  if (isError) return <div className="table__empty">Ошибка загрузки</div>;
  if (isEmpty) return <div className="table__empty">Нет записей</div>;

  return (
    <>
      <div className="d-flex gap-2 mb-3">
        <button
          className={`btn btn-sm ${hideTest ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={onToggleHideTest}
        >
          {hideTest ? "Скрыть тестовые" : "Показать тестовые"}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
          Обновить
        </button>
      </div>
      <SharedHistoryTable
        records={historyData}
        preset="admin"
        expandedLogs={expandedLogs}
        expandedConfig={expandedConfig}
        onToggleLogs={onToggleLogs}
        onToggleConfig={onToggleConfig}
        onEdit={onEdit}
        onDelete={onDelete}
        editingPriceId={editingPriceId}
        setEditingPriceId={setEditingPriceId}
        onPriceChange={onPriceChange}
        onTogglePaid={onTogglePaid}
        columns={["id", "type", "time", "status", "slot", "fio", "test", "price", "paid", "error", "actions"]}
      />
    </>
  );
}
