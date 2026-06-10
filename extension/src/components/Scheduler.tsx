import React, { useState, useCallback, useEffect } from "react";
import { useInjectorStore } from "@/store";
import { parseTime, mskToUtcSeconds } from "@/hooks/useClock";
import { useInjector } from "@/hooks/useInjector";
import { useScheduler } from "@/hooks/useScheduler";
import { checkStream, openServerUrl, getDefaultScheduleTime, sendScheduledEvent } from "@/api/background";

const Scheduler = React.memo(function Scheduler() {
  const status = useInjectorStore((s) => s.status);
  const startSchedule = useInjectorStore((s) => s.startSchedule);
  const cancelSchedule = useInjectorStore((s) => s.cancelSchedule);
  const stopPipeline = useInjectorStore((s) => s.stopPipeline);
  const config = useInjectorStore((s) => s.config);
  const authKey = useInjectorStore((s) => s.authKey);
  const { run } = useInjector();
  useScheduler();

  const getDefaultTime = useCallback(() => {
    const mode = config.mode === "reschedule" ? "reschedule" : "create";
    return getDefaultScheduleTime(mode);
  }, [config.mode]);

  const [timeInput, setTimeInput] = useState(getDefaultTime());
  const [statusMessage, setStatusMessage] = useState("");
  const [statusClass, setStatusClass] = useState("");

  useEffect(() => {
    setTimeInput(getDefaultTime());
  }, [getDefaultTime]);

  const handleSchedule = useCallback(async () => {
    if (!authKey) {
      setStatusMessage("Введите API ключ");
      setStatusClass("qn-modal-status-error");
      return;
    }
    const mskSeconds = parseTime(timeInput);
    if (mskSeconds === null) {
      setStatusMessage("Неверный формат. Используйте HH:MM:SS.d");
      setStatusClass("qn-modal-status-error");
      return;
    }
    try {
      const streamCheck = await checkStream(authKey);
      if (!streamCheck.has_active_stream) {
        setStatusMessage("Откройте страницу с капчами и авторизуйтесь. Требуется активное SSE-подключение");
        setStatusClass("qn-modal-status-error");
        openServerUrl();
        return;
      }
    } catch {
      setStatusMessage("Не удалось проверить подключение к серверу");
      setStatusClass("qn-modal-status-error");
      return;
    }
    const targetUtcSeconds = mskToUtcSeconds(mskSeconds);
    // Notify operators of planned start
    {
      const mskH = Math.floor(mskSeconds / 3600);
      const mskM = Math.floor((mskSeconds % 3600) / 60);
      const mskS = Math.floor(mskSeconds % 60);
      const timeStr = `${String(mskH).padStart(2,"0")}:${String(mskM).padStart(2,"0")}:${String(mskS).padStart(2,"0")}`;
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      const scheduledAt = `${dateStr}T${timeStr}`;
      sendScheduledEvent(
        authKey,
        `Бронь ${(config.reservationId || "").slice(0, 8)}`,
        scheduledAt,
        config.mode === "reschedule" ? "Перенос" : "Создание",
      ).catch(() => {});
    }
    startSchedule(targetUtcSeconds, config);
    setStatusMessage("");
    setStatusClass("");
  }, [timeInput, config, startSchedule, authKey]);

  const handleCancel = useCallback(() => {
    cancelSchedule();
    setStatusMessage("");
    setStatusClass("");
    setTimeInput(getDefaultTime());
  }, [cancelSchedule, getDefaultTime]);

  const handleRun = useCallback(() => {
    if (!authKey) {
      setStatusMessage("Введите API ключ");
      setStatusClass("qn-modal-status-error");
      return;
    }
    cancelSchedule();
    setStatusMessage("");
    setStatusClass("");
    run();
  }, [cancelSchedule, run, authKey]);

  const handleNowPlus10 = useCallback(() => {
    const now = new Date();
    const utcSec =
      now.getUTCHours() * 3600 +
      now.getUTCMinutes() * 60 +
      now.getUTCSeconds() +
      10;
    const mskSec = (utcSec + 3 * 3600) % 86400;
    const h = Math.floor(mskSec / 3600);
    const m = Math.floor((mskSec % 3600) / 60);
    const s = mskSec % 60;
    const d = Math.floor(now.getUTCMilliseconds() / 100);
    setTimeInput(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`,
    );
  }, []);

  const isRunning = status === "running";

  return (
    <div className="qn-schedule-sticky">
      {statusMessage && (
        <div className={`qn-modal-status ${statusClass}`}>
          {statusMessage}
        </div>
      )}
      <div className="qn-time-tags">
        <span
          className={`qn-time-tag ${isRunning ? "qn-time-tag-disabled" : ""}`}
          onClick={isRunning ? undefined : () => setTimeInput("10:00:00.5")}
        >
          10:00:00.5
        </span>
        <span
          className={`qn-time-tag ${isRunning ? "qn-time-tag-disabled" : ""}`}
          onClick={isRunning ? undefined : () => setTimeInput("12:00:00.5")}
        >
          12:00:00.5
        </span>
        <span
          className={`qn-time-tag qn-time-tag-now ${isRunning ? "qn-time-tag-disabled" : ""}`}
          onClick={isRunning ? undefined : handleNowPlus10}
        >
          Сейчас+10с
        </span>
      </div>
      <div className="qn-schedule-row">
        <div className="qn-schedule-time-wrapper">
          <input
            id="schedule-time-input"
            type="text"
            className="qn-schedule-input"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            maxLength={12}
            placeholder="ЧЧ:ММ:СС.d"
            disabled={isRunning}
          />
          <button
            className="qn-schedule-cancel-icon"
            onClick={isRunning ? undefined : handleCancel}
            title="Отменить расписание"
            disabled={isRunning}
          >
            ×
          </button>
        </div>
        <button
          className="qn-modal-btn qn-modal-btn-schedule"
          onClick={handleSchedule}
          disabled={isRunning}
        >
          Запланировать
        </button>
        {isRunning ? (
          <button
            className="qn-modal-btn qn-modal-btn-stop"
            onClick={stopPipeline}
          >
            Остановить
          </button>
        ) : (
          <button
            className="qn-modal-btn qn-modal-btn-run"
            onClick={handleRun}
          >
            Запустить сейчас
          </button>
        )}
      </div>
    </div>
  );
});

export default Scheduler;
