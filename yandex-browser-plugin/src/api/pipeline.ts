/**
 * EOPP Browser Extension - Pipeline Runner
 *
 * Основной модуль автоматизации бронирований. Выполняет 5-стадийный pipeline:
 * 1. getAvailableSlots - получение доступных слотов
 * 2. generateCaptcha - генерация капчи
 * 3. solveCaptcha - решение капчи (через background -> server)
 * 4. validateCaptcha - валидация решения
 * 5. submitReschedule / submitCreate - создание/перенос брони
 *
 * Особенности:
 * - Retry логика (429, 400 ошибки)
 * - Логирование каждой стадии
 * - Поддержка mode: create/reschedule
 *
 * Зависимости: stages.ts, client.ts, background.ts
 */
import type {
  InjectorConfig,
  Slot,
  SlotsResponse,
  CaptchaResponse,
  SolvedAnswer,
  EndpointName,
  RetryConfig,
} from "@/types";
import { httpRequest, retryOn429, retryWith429And400 } from "./client";
import {
  getAvailableSlots,
  generateCaptcha,
  solveCaptcha,
  validateCaptcha,
  submitReschedule,
  submitCreate,
} from "./stages";
import {
  confirmUsage,
  failUsage,
  registerUsage,
  openServerUrl,
} from "./background";
import { log, setUsageIdPrefix } from "@/logger";
import { useInjectorStore } from "@/store";
import { getEndpointRetry } from "@/constants";

const usedSlotIds = new Set<string>();

export function resetUsedSlots(): void {
  usedSlotIds.clear();
}

function pickByMaxCount(slots: Slot[]): Slot {
  const maxCount = Math.max(...slots.map((s) => s.count));
  const best = slots.filter((s) => s.count === maxCount);
  return best[Math.floor(Math.random() * best.length)];
}

export function selectBestSlot(slots: Slot[]): Slot {
  log("Выбор лучшего слота");

  const config = useInjectorStore.getState().config;
  const timeOrder = config.timeOrder || [[]];
  const allPreferred = timeOrder.flat();
  const hasPartialPrefs = allPreferred.length > 0 && allPreferred.length < 24;

  if (hasPartialPrefs) {
    for (const group of timeOrder) {
      if (group.length === 0) continue;
      const available = slots.filter(
        (s) => group.includes(s.time) && !usedSlotIds.has(s.id),
      );
      if (available.length > 0) {
        const selected = pickByMaxCount(available);
        usedSlotIds.add(selected.id);
        log(`Выбран слот (приоритет): ${selected.slotCaption} (count: ${selected.count})`);
        return selected;
      }
    }

    if (config.preferredMode === "strict") {
      throw new Error(
        `Предпочтительные слоты недоступны: ${allPreferred.join(", ")}`,
      );
    }
    log("Предпочтительные слоты недоступны, пробуем остальные");
  }

  const available = slots.filter((s) => !usedSlotIds.has(s.id));
  if (available.length === 0) {
    throw new Error("Нет доступных слотов");
  }

  const selected = pickByMaxCount(available);
  usedSlotIds.add(selected.id);
  log(`Выбран слот: ${selected.slotCaption} (count: ${selected.count})`);
  return selected;
}

function getErrorStage(): string {
  const stage = useInjectorStore.getState().currentStage;
  if (stage === "solving") return "stage3";
  if (stage === "validating") return "stage4";
  if (stage === "submitting") return "stage5";
  return "other";
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

async function retryWithConfig<T>(
  fn: () => Promise<T>,
  endpoint: EndpointName,
): Promise<T> {
  const config = useInjectorStore.getState().config;
  const rc = getEndpointRetry(config, endpoint);
  if (!rc.enabled) {
    return fn();
  }
  return retryOn429(fn, rc.maxRetries, rc.delayMs);
}

async function retrySlotsWithConfig<T>(
  fn: () => Promise<T>,
  config: InjectorConfig,
): Promise<T> {
  const rc = config.retryPerEndpoint.getAvailableSlots;
  const retry429 = {
    enabled: rc.enabled,
    maxRetries: rc.maxRetries,
    delayMs: rc.delayMs,
  };
  const retry400 = {
    enabled: rc.retry400Enabled,
    maxRetries: rc.retry400MaxRetries,
    delayMs: rc.retry400DelayMs,
  };
  return retryWith429And400(fn, retry429, retry400);
}

async function runPipeline(
  slotsResponse: SlotsResponse,
): Promise<unknown | null> {
  const config = useInjectorStore.getState().config;

  const slotData = selectBestSlot(slotsResponse.slots);
  log("Выбранный слот", slotData);
  log("Этап 1 (слоты) завершён успешно");

  if (config.runUpTo < 2) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const captchaResponse = await retryWithConfig(
    () => generateCaptcha(config, slotData),
    "generateCaptcha",
  );
  log("Этап 2 (капча) завершён успешно");

  if (config.runUpTo < 3) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const solvedAnswer = await solveCaptcha(
    captchaResponse,
    config.autoSolve,
    config.apiKey,
    config.reservationId,
  );
  log("Ответ от нашего сервера", solvedAnswer);
  log("Этап 3 (решение капчи) завершён успешно");

  if (config.runUpTo < 4) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const validationResponse = await retryWithConfig(
    () => validateCaptcha(config, captchaResponse, slotData, solvedAnswer),
    "validateCaptcha",
  );
  log("Этап 4 (валидация) завершён успешно");

  if (config.runUpTo < 5) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const isCreateReservation = config.mode === "create";
  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const endpointName: EndpointName = isCreateReservation
    ? "submitCreate"
    : "submitReschedule";
  const submitResponse = await retryWithConfig(
    () => submitFn(config, slotData, validationResponse),
    endpointName,
  );

  return submitResponse;
}

export async function main(config: InjectorConfig): Promise<void> {
  useInjectorStore.getState().setConfig(config);
  useInjectorStore.getState().setCaptchaId(null);
  useInjectorStore.getState().setSolvedVariantIndex(null);
  useInjectorStore.getState().setCaptchaValidated(null);
  setUsageIdPrefix(null);
  resetUsedSlots();
  log("=== Старт скрипта (runUpTo: " + config.runUpTo + ") ===");

  try {
    if (!config.apiKey) {
      throw new Error("apiKey обязателен");
    }
    const usageLogId = await registerUsage(
      config.apiKey,
      config.reservationId,
      config,
    );
    useInjectorStore.getState().setUsageLogId(usageLogId);
    setUsageIdPrefix(usageLogId);
    log("Usage log зарегистрирован");

    const slotsResponse = await retrySlotsWithConfig(
      () => getAvailableSlots(config),
      config,
    );
    log(`Этап 1 (слоты) завершён успешно, ${slotsResponse.slots.length} слотов`);

    let slotRetryCount = 0;
    while (slotRetryCount <= config.maxSlotRetries) {
      try {
        const result = await runPipeline(slotsResponse);
        if (result !== null) {
          log("=== Скрипт завершён успешно ===", result);
        } else {
          log(
            "=== Скрипт завершён (runUpTo остановка на этапе " +
              config.runUpTo +
              ") ===",
          );
        }

        const usageLogId = useInjectorStore.getState().usageLogId;
        if (usageLogId != null && config.apiKey) {
          const logs = useInjectorStore
            .getState()
            .logs.map((l) => `${l.ts} ${l.msg}`);
          const captchaId = useInjectorStore.getState().captchaId;
          const validated = useInjectorStore.getState().captchaValidated;
          const variantIndex = useInjectorStore.getState().solvedVariantIndex;
          try {
            await confirmUsage(
              usageLogId,
              config.apiKey,
              config.slotDate,
              logs,
              captchaId ?? undefined,
              validated && variantIndex != null ? variantIndex : undefined,
            );
          } catch {
            // fire-and-forget, silently swallow
          }
        }

        return;
      } catch (err) {
        const error = err as { body?: string };
        const isAllSlotsOccupied =
          error.body && error.body.includes("AllSlotsOccupiedOnInterval");
        if (
          isAllSlotsOccupied &&
          config.retryOnAllSlotsOccupied &&
          slotRetryCount < config.maxSlotRetries
        ) {
          slotRetryCount++;
          log(
            `AllSlotsOccupiedOnInterval — пробуем другой слот (попытка ${slotRetryCount}/${config.maxSlotRetries})`,
          );
          await new Promise((r) => setTimeout(r, config.slotRetryDelayMs));
          continue;
        }
        log("=== ОШИБКА ===", err);
        throw err;
      }
    }
    log(
      "=== Скрипт завершён (превышено количество попыток выбора слота) ===",
    );
    throw new Error("Превышено количество попыток выбора слотов");
  } catch (err) {
    const usageLogId = useInjectorStore.getState().usageLogId;
    if (usageLogId != null && config.apiKey) {
      const logs = useInjectorStore
        .getState()
        .logs.map((l) => `${l.ts} ${l.msg}`);
      const captchaId = useInjectorStore.getState().captchaId;
      const validated = useInjectorStore.getState().captchaValidated;
      const variantIndex = useInjectorStore.getState().solvedVariantIndex;
      try {
        await failUsage(
          usageLogId,
          config.apiKey,
          serializeError(err),
          getErrorStage(),
          config.slotDate,
          logs,
          captchaId ?? undefined,
          validated && variantIndex != null ? variantIndex : undefined,
        );
      } catch {
        // fire-and-forget
      }
    }
    log("=== ОШИБКА ===", err);
    const error = err as Error;
    if (error.message && error.message.includes("Откройте страницу с капчами")) {
      openServerUrl();
    }
    throw err;
  }
}
