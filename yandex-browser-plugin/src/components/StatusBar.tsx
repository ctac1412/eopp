import React from "react";
import { useInjectorStore } from "@/store";
import { useScheduler } from "@/hooks/useScheduler";

const StatusBar = React.memo(function StatusBar() {
  const status = useInjectorStore((s) => s.status);
  const error = useInjectorStore((s) => s.error);
  const { countdown } = useScheduler();

  const displayStatus =
    status === "running"
      ? "Запущено..."
      : status === "scheduling"
        ? `Запуск через ${countdown || "..."}`
        : status === "done"
          ? "Завершено!"
          : status === "error"
            ? `Ошибка: ${error || ""}`
            : "";

  const displayClass =
    status === "running"
      ? "qn-modal-status-waiting"
      : status === "scheduling"
        ? "qn-modal-status-waiting"
        : status === "done"
          ? "qn-modal-status-done"
          : status === "error"
            ? "qn-modal-status-error"
            : "";

  if (!displayStatus) return null;
  return (
    <span className={`qn-modal-status ${displayClass}`}>
      {displayStatus}
    </span>
  );
});

export default StatusBar;
