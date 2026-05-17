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
  selectedLogs,
  onToggleSelect,
  expandedLogs,
  expandedConfig,
  onToggleLogs,
  onToggleConfig,
  onGenerateInvoice,
  adminToken,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  if (isLoading) return <div className="table__loading">Загрузка…</div>;
  if (isError) return <div className="table__empty">Ошибка загрузки</div>;
  if (isEmpty) return <div className="table__empty">Нет записей</div>;

  const allSelected = historyData.length > 0 && historyData.every((r) => selectedLogs[r.id]);
  const onToggleSelectAll = (checked) => {
    historyData.forEach((r) => {
      if (checked && !selectedLogs[r.id]) {
        onToggleSelect?.(r.id);
      } else if (!checked && selectedLogs[r.id]) {
        onToggleSelect?.(r.id);
      }
    });
  };

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
        onGenerateInvoice={onGenerateInvoice}
        selectedLogs={selectedLogs}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={onToggleSelectAll}
        allSelected={allSelected}
        columns={["checkbox", "id", "type", "time", "status", "slot", "fio", "test", "price", "paid", "error", "actions"]}
      />
    </>
  );
}
