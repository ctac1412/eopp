import React, { useState, useCallback, useEffect } from "react";
import { useInjectorStore } from "@/store";
import { parseTime, mskToUtcSeconds } from "@/hooks/useClock";
import { useInjector } from "@/hooks/useInjector";
import { useScheduler } from "@/hooks/useScheduler";
import { openServerUrl, getDefaultScheduleTime, sendScheduledEvent } from "@/api/background";
import { pingSlotsLimit } from "@/api/slots-ping";
import { getDefaultSlotDate } from "@/constants";
import type { InjectorConfig } from "@/types";

const FACILITY_ALIASES: Record<string, string> = {
  "1dae5b1c-e2b3-44a4-848f-df8ce2ddde42": "ЗАБ",
  "93c9939a-2182-4e78-98b4-0cf314b09cfa": "ТАГ",
  "cbde069a-7e18-4ca6-9b38-f790348d6c24": "БУГ",
  "1fffb312-4ebe-4ad2-a356-0b8f04587c11": "ЛАРС",
  "ab6edb80-5f8f-4bf9-bf9a-a925271d9df8": "ЧЕРН",
};

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function facilityAlias(config: InjectorConfig): string {
  const known = FACILITY_ALIASES[config.facilityId];
  if (known) return known;
  const rawName = config.reservationData?.facilityRaw?.name || "";
  const cleaned = rawName
    .replace(/^АПП\s+/i, "")
    .trim()
    .replace(/[^a-zа-яё0-9]/gi, "");
  return (cleaned || "АПП").slice(0, 4).toUpperCase();
}

function buildScheduleLabel(config: InjectorConfig): string {
  const vehicles = config.reservationData?.raw?.vehicleData || [];
  const truck = vehicles.find((vehicle) => vehicle.subTypeId === 1);
  const vehicleNumber =
    truck?.regNumber ||
    vehicles.find((vehicle) => vehicle.regNumber)?.regNumber ||
    shortId(config.vehicleId || config.reservationId || "unknown");
  const requestType = config.mode === "reschedule" ? "Перенос" : "Бронь";
  return `${requestType} ${facilityAlias(config)} ${vehicleNumber} ${config.slotDate}`;
}

function backendErrorMessage(error: unknown, fallback: string): string {
  const payload = error as { body?: string; message?: string };
  if (payload?.body) {
    try {
      const parsed = JSON.parse(payload.body) as { message?: string; error?: string };
      return parsed.message || parsed.error || fallback;
    } catch {
      return payload.body || fallback;
    }
  }
  return payload?.message || fallback;
}

function backendErrorStatus(error: unknown): number | undefined {
  return (error as { status?: number })?.status;
}

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
    const autoSlotDate = getDefaultSlotDate(config.mode);
    if (
      config.slotDate !== autoSlotDate &&
      !window.confirm(
        `Автоматически выбранная дата: ${autoSlotDate}\nУстановленная дата: ${config.slotDate}\n\nПродолжить планирование с установленной датой?`,
      )
    ) {
      return;
    }
    const pingResult = await pingSlotsLimit(config);
    if (pingResult === "limit-missing") {
      setStatusMessage("Планирование остановлено: лимита слотов нет");
      setStatusClass("qn-modal-status-error");
      return;
    }
    const targetUtcSeconds = mskToUtcSeconds(mskSeconds);
    try {
      const mskH = Math.floor(mskSeconds / 3600);
      const mskM = Math.floor((mskSeconds % 3600) / 60);
      const mskS = Math.floor(mskSeconds % 60);
      const timeStr = `${String(mskH).padStart(2,"0")}:${String(mskM).padStart(2,"0")}:${String(mskS).padStart(2,"0")}`;
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      const scheduledAt = `${dateStr}T${timeStr}`;
      await sendScheduledEvent(
        buildScheduleLabel(config),
        scheduledAt,
        config.mode === "reschedule" ? "Перенос" : "Создание",
        config,
      );
    } catch (error) {
      const status = backendErrorStatus(error);
      setStatusMessage(
        backendErrorMessage(
          error,
          status === 412
            ? "Откройте страницу с капчами и авторизуйтесь"
            : "Планирование запрещено сервером",
        ),
      );
      setStatusClass("qn-modal-status-error");
      if (status === 412) {
        openServerUrl();
      }
      return;
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
