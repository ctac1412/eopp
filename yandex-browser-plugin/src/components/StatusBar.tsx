import React from "react";
import { useInjectorStore } from "@/store";
import { useScheduler } from "@/hooks/useScheduler";

const StatusBar = React.memo(function StatusBar() {
  const status = useInjectorStore((s) => s.status);
  const error = useInjectorStore((s) => s.error);
  const role = useInjectorStore((s) => s.role);
  const consumerId = useInjectorStore((s) => s.consumerId);
  const totalConsumers = useInjectorStore((s) => s.totalConsumers);
  const { countdown } = useScheduler();

  let roleText = "";
  if (role === "master") roleText = "Master";
  else if (role === "slave")
    roleText = `Slave #${consumerId} / ${totalConsumers}`;

  const displayStatus =
    status === "running"
      ? (roleText ? `${roleText} — ` : "") + "Запущено..."
      : status === "scheduling"
        ? `Запуск через ${countdown || "..."}`
        : status === "done"
          ? "Завершено!"
          : status === "error"
            ? `Ошибка: ${error || ""}`
            : "";

  const displayClass =
    status === "running"
      ? "injector-modal-status-waiting"
      : status === "scheduling"
        ? "injector-modal-status-waiting"
        : status === "done"
          ? "injector-modal-status-done"
          : status === "error"
            ? "injector-modal-status-error"
            : "";

  if (!displayStatus) return null;
  return (
    <span className={`injector-modal-status ${displayClass}`}>
      {displayStatus}
    </span>
  );
});

export default StatusBar;
