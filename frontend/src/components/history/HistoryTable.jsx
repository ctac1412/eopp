import React from "react";
import { HistoryTable as SharedHistoryTable } from "./HistoryRow";

export function HistoryTable({
  records,
  expandedLogs,
  expandedConfig,
  expandedErrors,
  onToggleLogs,
  onToggleConfig,
  onToggleError,
  onOpenEdit,
}) {
  return (
    <SharedHistoryTable
      records={records}
      preset="user"
      expandedLogs={expandedLogs}
      expandedConfig={expandedConfig}
      expandedErrors={expandedErrors}
      onToggleLogs={onToggleLogs}
      onToggleConfig={onToggleConfig}
      onToggleError={onToggleError}
      onRowClick={onOpenEdit}
    />
  );
}
