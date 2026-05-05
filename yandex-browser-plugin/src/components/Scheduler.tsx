import React, { useState, useCallback } from "react";
import { useInjectorStore } from "@/store";
import { parseTime, mskToUtcSeconds } from "@/hooks/useClock";
import { useInjector } from "@/hooks/useInjector";
import { useScheduler } from "@/hooks/useScheduler";

const Scheduler = React.memo(function Scheduler() {
  const status = useInjectorStore((s) => s.status);
  const startSchedule = useInjectorStore((s) => s.startSchedule);
  const cancelSchedule = useInjectorStore((s) => s.cancelSchedule);
  const config = useInjectorStore((s) => s.config);
  const authKey = useInjectorStore((s) => s.authKey);
  const { run } = useInjector();
  useScheduler();

  const [timeInput, setTimeInput] = useState("12:00:01.0");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusClass, setStatusClass] = useState("");

  const handleSchedule = useCallback(() => {
    if (!authKey) {
      setStatusMessage("Введите API ключ");
      setStatusClass("injector-modal-status-error");
      return;
    }
    const mskSeconds = parseTime(timeInput);
    if (mskSeconds === null) {
      setStatusMessage("Неверный формат. Используйте HH:MM:SS.d");
      setStatusClass("injector-modal-status-error");
      return;
    }
    const targetUtcSeconds = mskToUtcSeconds(mskSeconds);
    startSchedule(targetUtcSeconds, config);
    setStatusMessage("");
    setStatusClass("");
  }, [timeInput, config, startSchedule]);

  const handleCancel = useCallback(() => {
    cancelSchedule();
    setStatusMessage("");
    setStatusClass("");
    setTimeInput("12:00:01.0");
  }, [cancelSchedule]);

  const handleRun = useCallback(() => {
    if (!authKey) {
      setStatusMessage("Введите API ключ");
      setStatusClass("injector-modal-status-error");
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

  return (
    <div className="injector-schedule-sticky">
      {statusMessage && (
        <div className={`injector-modal-status ${statusClass}`}>
          {statusMessage}
        </div>
      )}
      <div className="injector-time-tags">
        <span
          className="injector-time-tag"
          onClick={() => setTimeInput("10:00:00.5")}
        >
          10:00:00.5
        </span>
        <span
          className="injector-time-tag"
          onClick={() => setTimeInput("12:00:00.5")}
        >
          12:00:00.5
        </span>
        <span
          className="injector-time-tag injector-time-tag-now"
          onClick={handleNowPlus10}
        >
          Сейчас+10с
        </span>
      </div>
      <div className="injector-schedule-row">
        <div className="injector-schedule-time-wrapper">
          <input
            id="schedule-time-input"
            type="text"
            className="injector-schedule-input"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            maxLength={12}
            placeholder="ЧЧ:ММ:СС.d"
          />
          <button
            className="injector-schedule-cancel-icon"
            onClick={handleCancel}
            title="Отменить расписание"
          >
            ×
          </button>
        </div>
        <button
          className="injector-modal-btn injector-modal-btn-schedule"
          onClick={handleSchedule}
        >
          Запланировать
        </button>
        <button
          className="injector-modal-btn injector-modal-btn-run"
          onClick={handleRun}
        >
          Запустить сейчас
        </button>
      </div>
    </div>
  );
});

export default Scheduler;
