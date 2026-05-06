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
      columns={["checkbox", "id", "type", "time", "resid", "captcha", "status", "slot", "price", "paid", "error", "actions"]}
    />
  );
}
