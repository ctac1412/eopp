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
  EndpointName,
} from "@/types";
import { retryOn429, retryWith429And400 } from "./client";
import {
  getAvailableSlots,
  getAvailableSlotsUrl,
  logSlotsResponse,
  generateCaptcha,
  solveCaptcha,
  validateCaptcha,
  submitReschedule,
  submitCreate,
} from "./stages";
import {
  claimSharedSlots,
  confirmUsage,
  failSharedSlots,
  failUsage,
  heartbeatSharedSlots,
  publishSharedSlots,
  registerUsage,
  waitSharedSlots,
  openServerUrl,
} from "./background";
import { log, setUsageIdPrefix } from "@/logger";
import { useInjectorStore } from "@/store";
import { getEndpointRetry } from "@/constants";

const usedSlotIds = new Set<string>();

/** Очищает набор использованных ID слотов для нового запуска */
export function resetUsedSlots(): void {
  usedSlotIds.clear();
}

/** Выбирает случайный слот с максимальным количеством мест */
function pickByMaxCount(slots: Slot[]): Slot {
  const maxCount = Math.max(...slots.map((s) => s.count));
  const best = slots.filter((s) => s.count === maxCount);
  return best[Math.floor(Math.random() * best.length)];
}

/**
 * Выбирает лучший слот из доступных с учётом приоритетов.
 * Сначала пытается найти слот из предпочтительных групп (timeOrder),
 * затем fallback на любой свободный. В strict mode бросает ошибку,
 * если предпочтительные слоты недоступны.
 */
export function selectBestSlot(slots: Slot[]): Slot {
  const config = useInjectorStore.getState().config;
  const timeOrder = config.timeOrder || [[]];
  const allPreferred = timeOrder.flat();
  const hasPartialPrefs = allPreferred.length > 0 && allPreferred.length < 24;

  if (hasPartialPrefs) {
    for (const group of timeOrder) {
      if (group.length === 0) continue;
      const available = slots.filter(
        (s) => group.includes(s.time) && !usedSlotIds.has(s.id) && s.count > 0,
      );
      if (available.length > 0) {
        const selected = pickByMaxCount(available);
        usedSlotIds.add(selected.id);
        return selected;
      }
    }

    if (config.preferredMode === "strict") {
      throw new Error(
        `Предпочтительные слоты недоступны: ${allPreferred.join(", ")}`,
      );
    }
  }

  const available = slots.filter((s) => !usedSlotIds.has(s.id) && s.count > 0);
  if (available.length === 0) {
    throw new Error("Нет доступных слотов");
  }

  const selected = pickByMaxCount(available);
  usedSlotIds.add(selected.id);
  return selected;
}

/**
 * Определяет стадию pipeline, на которой произошла ошибка,
 * для корректной классификации в логах использования.
 */
function getErrorStage(): string {
  const stage = useInjectorStore.getState().currentStage;
  if (stage === "solving") return "stage3";
  if (stage === "validating") return "stage4";
  if (stage === "submitting") return "stage5";
  return "other";
}

/**
 * Сериализует ошибку в строку для логирования.
 * Обрабатывает Error, объекты и примитивы.
 */
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

/**
 * Выполняет функцию с retry-логикой на основе конфига эндпоинта.
 * Ретраит только на 429 ошибки. Если retry отключён — вызывает fn один раз.
 */
async function retryWithConfig<T>(
  fn: () => Promise<T>,
  endpoint: EndpointName,
  signal?: AbortSignal,
): Promise<T> {
  const config = useInjectorStore.getState().config;
  const rc = getEndpointRetry(config, endpoint);
  if (!rc.enabled) {
    return fn();
  }
  return retryOn429(fn, rc.maxRetries, rc.delayMs, endpoint, signal);
}

/**
 * Выполняет функцию получения слотов с retry на 429 и 400 ошибки.
 * Использует отдельную конфигурацию retryPerEndpoint.getAvailableSlots.
 */
async function retrySlotsWithConfig<T>(
  fn: () => Promise<T>,
  config: InjectorConfig,
  signal?: AbortSignal,
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
  return retryWith429And400(fn, retry429, retry400, "getAvailableSlots", signal);
}

async function retrySlotsWithHeartbeat<T>(
  fn: () => Promise<T>,
  config: InjectorConfig,
  groupKey: string,
  clientId: string,
  signal?: AbortSignal,
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

  const fnWithHeartbeat = async () => {
    try {
      return await fn();
    } catch (err) {
      heartbeatSharedSlots(groupKey, clientId).catch(() => {});
      throw err;
    }
  };

  return retryWith429And400(fnWithHeartbeat, retry429, retry400, "getAvailableSlots", signal);
}

function getSharedSlotsClientId(reservationId?: string): string {
  const key = reservationId ? `_ss_client_id_${reservationId}` : "_ss_client_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}

function getSharedSlotsGroupKey(config: InjectorConfig): string {
  return `available-slots:${config.facilityId}:${config.slotDate}`;
}

async function fetchSlotsDirect(
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<SlotsResponse> {
  return retrySlotsWithConfig(
    () => getAvailableSlots(config, signal),
    config,
    signal,
  );
}

async function fetchSlotsWithSharedGroup(
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<SlotsResponse> {
  if (!config.sharedSlotsEnabled) {
    return fetchSlotsDirect(config, signal);
  }

  const groupKey = getSharedSlotsGroupKey(config);
  const clientId = getSharedSlotsClientId(config.reservationId);
  const waitMs = Math.max(0, config.sharedSlotsWaitMs || 1600);
  let isMaster = false;

  try {
    const claim = await withAbort(
      claimSharedSlots(groupKey, clientId, {
        facilityId: config.facilityId,
        vehicleId: config.vehicleId,
        slotDate: config.slotDate,
        mode: config.mode,
        reservationId: config.reservationId,
      }),
      signal,
    );

    if (claim.status === "ready" && claim.slots_response) {
      if (config.sharedSlotsMode === "probe") {
        log("Общие слоты: слоты есть (probe), запрашиваю EOPP самостоятельно");
        return fetchSlotsDirect(config, signal);
      }
      log(`Общие слоты: использую опубликованный ответ группы (${claim.waiters || 0} ожидали)`);
      logSlotsResponse(claim.slots_response);
      return claim.slots_response;
    }

    if (claim.role === "master") {
      log("Общие слоты: этот клиент мастер, запрашиваю EOPP и публикую результат");

      const masterConfig = {
        ...config,
        retryPerEndpoint: {
          ...config.retryPerEndpoint,
          getAvailableSlots: { ...config.retryPerEndpoint.getAvailableSlots, delayMs: 1500 },
        },
      };

      const masterFn = () => getAvailableSlots(masterConfig, signal);

      try {
        const slotsResponse = await retrySlotsWithHeartbeat(masterFn, masterConfig, groupKey, clientId, signal);
        try {
          await withAbort(publishSharedSlots(groupKey, clientId, slotsResponse), signal);
          log("Общие слоты: результат опубликован для соседних клиентов");
        } catch (publishErr) {
          log(`Общие слоты: не удалось опубликовать результат (${serializeError(publishErr)})`);
        }
        return slotsResponse;
      } catch (err) {
        await failSharedSlots(groupKey, clientId, serializeError(err)).catch(() => {});
        throw err;
      }
    }

    log(`Общие слоты: жду ответ мастера до ${waitMs} мс`);
    const waited = await withAbort(waitSharedSlots(groupKey, clientId, waitMs), signal);
    if (waited.status === "ready" && waited.slots_response) {
      if (config.sharedSlotsMode === "probe") {
        log("Общие слоты: мастер получил слоты (probe), запрашиваю EOPP самостоятельно");
        return fetchSlotsDirect(config, signal);
      }
      log("Общие слоты: получил ответ мастера, EOPP не запрашиваю");
      logSlotsResponse(waited.slots_response);
      return waited.slots_response;
    }

    if (waited.status === "failed") {
      log(`Общие слоты: мастер не получил слоты (${waited.error || "unknown"}), fallback на прямой запрос`);
    } else {
      log("Общие слоты: мастер не успел ответить, fallback на прямой запрос");
    }
    return fetchSlotsDirect(config, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    if (isMaster) {
      log(`Общие слоты: мастер не получил слоты (${serializeError(err)})`);
      throw err;
    }
    log(`Общие слоты: координация недоступна, fallback на прямой запрос (${serializeError(err)})`);
    return fetchSlotsDirect(config, signal);
  }
}

/**
 * Выполняет этапы 2-5: генерация капчи → решение → валидация → отправка.
 * При ретрае капчи вызывается повторно с тем же слотом.
 */
async function runCaptchaPipeline(
  slotData: Slot,
  attemptLabel = "",
  signal?: AbortSignal,
): Promise<unknown | null> {
  const config = useInjectorStore.getState().config;

  if (config.runUpTo < 2) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const captchaResponse = await withAbort(
    retryWithConfig(() => generateCaptcha(config, slotData, signal), "generateCaptcha", signal),
    signal,
  );

  if (config.runUpTo < 3) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const solvedAnswer = await withAbort(
    solveCaptcha(
      captchaResponse,
      config.autoSolve,
      config.apiKey,
      config.reservationId,
    ),
    signal,
  );
  const solverInfo = solvedAnswer.solver_label || "local";
  const tilesStr = solvedAnswer.variantTiles.join(",");
  log(`Ответ сервера: captcha=${solvedAnswer.captcha_id || "?"} variant=${solvedAnswer.variantIndex} solver=${solverInfo} tiles=[${tilesStr}]${attemptLabel}`);

  if (config.runUpTo < 4) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const validationResponse = await withAbort(
    retryWithConfig(
      () => validateCaptcha(config, captchaResponse, slotData, solvedAnswer),
      "validateCaptcha",
      signal,
    ),
    signal,
  );

  if (config.runUpTo < 5) {
    log("Остановка по конфигу runUpTo");
    return null;
  }

  const isCreateReservation = config.mode === "create";
  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const endpointName: EndpointName = isCreateReservation
    ? "submitCreate"
    : "submitReschedule";
  const submitResponse = await withAbort(
    retryWithConfig(() => submitFn(config, slotData, validationResponse, signal), endpointName, signal),
    signal,
  );

  return submitResponse;
}

/**
 * Выполняет полный 5-стадийный pipeline: слоты → капча → решение → валидация → отправка.
 * Учитывает runUpTo для остановки на выбранном этапе (для отладки).
 * Возвращает результат submit или null при ранней остановке.
 */
async function runPipeline(
  slotsResponse: SlotsResponse,
): Promise<unknown | null> {
  const slotData = selectBestSlot(slotsResponse.slots);
  log(`Выбран слот: ${slotData.slotCaption} (count: ${slotData.count}, idx: ${slotData.intervalIndex})`);
  return runCaptchaPipeline(slotData);
}

/**
 * Проверяет, является ли ошибка связанной с капчей.
 * Возвращает true для 400 (неверное решение) и "Сервер вернул null" (таймаут).
 */
function isCaptchaRelatedError(err: unknown): boolean {
  if (err instanceof Error && err.message.includes("Сервер вернул null")) {
    return true;
  }
  if (typeof err === "object" && err !== null && "status" in err) {
    return (err as { status: number }).status === 400;
  }
  return false;
}

/**
 * Отправляет подтверждение успешного использования на сервер.
 * Fire-and-forget: ошибки подавляются, чтобы не блокировать основной поток.
 */
async function confirmUsageInBackground(config: InjectorConfig): Promise<void> {
  const usageLogId = useInjectorStore.getState().usageLogId;
  if (usageLogId == null || !config.apiKey) return;
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

/**
 * Отправляет отчёт об ошибке использования на сервер.
 * Fire-and-forget: ошибки подавляются, чтобы не маскировать основную ошибку.
 */
async function failUsageInBackground(config: InjectorConfig, err: unknown): Promise<void> {
  const usageLogId = useInjectorStore.getState().usageLogId;
  if (usageLogId == null || !config.apiKey) return;
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

type RetryDecision =
  | { action: "retry-slot" }
  | { action: "retry-captcha" }
  | { action: "continue" };

/**
 * Решает, нужно ли ретраить слот при ошибке.
 * Возвращает { action: "retry-slot" } только для AllSlotsOccupiedOnInterval
 * при включённом retryOnAllSlotsOccupied и неиспользованном лимите попыток.
 */
function decideSlotRetry(
  err: unknown,
  slotRetryCount: number,
  config: InjectorConfig,
): RetryDecision {
  const error = err as { body?: string };
  const isAllSlotsOccupied =
    error.body && error.body.includes("AllSlotsOccupiedOnInterval");
  if (
    isAllSlotsOccupied &&
    config.retryOnAllSlotsOccupied &&
    slotRetryCount < config.maxSlotRetries
  ) {
    return { action: "retry-slot" };
  }
  return { action: "continue" } as RetryDecision;
}

/**
 * Решает, нужно ли ретраить капчу при ошибке.
 * Возвращает { action: "retry-captcha" } для ошибок капчи (400/timeout)
 * при включённом retry400Enabled и неиспользованном лимите попыток.
 */
function decideCaptchaRetry(
  err: unknown,
  captchaAttempt: number,
  validateRc: InjectorConfig["retryPerEndpoint"]["validateCaptcha"],
): RetryDecision {
  const isCaptchaError = isCaptchaRelatedError(err);
  if (
    isCaptchaError &&
    validateRc.retry400Enabled &&
    captchaAttempt < validateRc.retry400MaxRetries
  ) {
    return { action: "retry-captcha" };
  }
  return { action: "continue" } as RetryDecision;
}

/**
 * Сбрасывает состояние pipeline перед новым запуском.
 * Очищает конфиг, ID капчи, решённый вариант, валидацию, usage log prefix и использованные слоты.
 */
function resetPipelineState(config: InjectorConfig): void {
  useInjectorStore.getState().setConfig(config);
  useInjectorStore.getState().setCaptchaId(null);
  useInjectorStore.getState().setSolvedVariantIndex(null);
  useInjectorStore.getState().setCaptchaValidated(null);
  setUsageIdPrefix(null);
  resetUsedSlots();
}

/**
 * Регистрирует использование на сервере и получает доступные слоты.
 * Валидирует наличие apiKey, создаёт usage log entry, fetch-ит слоты с retry.
 */
async function registerUsageAndFetchSlots(
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<SlotsResponse> {
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

  return fetchSlotsWithSharedGroup(config, signal);
}

/**
 * Запускает один полный проход pipeline и логирует результат.
 * При runUpTo остановке логирует номер этапа, при успехе — результат submit.
 */
async function runFullPipeline(slotsResponse: SlotsResponse): Promise<void> {
  const result = await runPipeline(slotsResponse);
  logPipelineResult(result);
}

/**
 * Запускает этапы 2-5 (капча → решение → валидация → отправка) для конкретного слота.
 * Используется при ретрае капчи, чтобы не выбирать слот заново.
 */
async function runCaptchaPhase(slotData: Slot, attemptLabel = "", signal?: AbortSignal): Promise<void> {
  const result = await withAbort(runCaptchaPipeline(slotData, attemptLabel), signal);
  logPipelineResult(result);
}

function logPipelineResult(result: unknown | null): void {
  if (result !== null) {
    const resp = result as { title?: string; eoppStatus?: number; isSuccess?: boolean };
    const title = resp.title || (resp.isSuccess ? "Success" : "Unknown");
    const status = resp.eoppStatus ? ` (${resp.eoppStatus})` : "";
    log(`=== Успех: ${title}${status} ===`);
  } else {
    const config = useInjectorStore.getState().config;
    log(
      "=== Скрипт завершён (runUpTo остановка на этапе " +
        config.runUpTo +
        ") ===",
    );
  }
}

/**
 * Пытается ретраить слот при ошибке AllSlotsOccupiedOnInterval.
 * Возвращает true, если ретрай выполнен (нужен continue slotRetry).
 */
async function tryRetrySlot(
  err: unknown,
  slotRetryCount: number,
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<boolean> {
  const decision = decideSlotRetry(err, slotRetryCount, config);
  if (decision.action === "retry-slot") {
    log(
      `AllSlotsOccupiedOnInterval — пробуем другой слот (попытка ${slotRetryCount + 1}/${config.maxSlotRetries})`,
    );
    await withAbort(new Promise((r) => setTimeout(r, config.slotRetryDelayMs)), signal);
    return true;
  }
  return false;
}

/**
 * Пытается ретраить капчу при ошибке (400 или timeout).
 * Возвращает true, если ретрай выполнен (нужен continue внутреннего цикла).
 */
async function tryRetryCaptcha(
  err: unknown,
  captchaAttempt: number,
  validateRc: InjectorConfig["retryPerEndpoint"]["validateCaptcha"],
  signal?: AbortSignal,
): Promise<boolean> {
  const decision = decideCaptchaRetry(err, captchaAttempt, validateRc);
  if (decision.action === "retry-captcha") {
    log(
      `Капча не решена — перегенерация и ретрай ${captchaAttempt + 1}/${validateRc.retry400MaxRetries}`,
    );
    await withAbort(new Promise((r) => setTimeout(r, validateRc.retry400DelayMs)), signal);
    return true;
  }
  return false;
}

/**
 * Основной цикл выполнения pipeline с двумя уровнями retry.
 * Внешний цикл — ретрай слота при AllSlotsOccupiedOnInterval (выбирает новый слот).
 * Внутренний цикл — ретрай капчи при 400/timeout (перегенерирует капчу для того же слота).
 * Первый проход всегда выполняется, ретраи только при включённых настройках.
 */
async function runWithRetryLoop(
  config: InjectorConfig,
  slotsResponse: SlotsResponse,
  signal?: AbortSignal,
): Promise<void> {
  let slotRetryCount = 0;
  const validateRc = config.retryPerEndpoint.validateCaptcha;

  slotRetry: while (true) {
    checkAbort(signal);
    const slotData = selectBestSlot(slotsResponse.slots);
    log(`Выбран слот: ${slotData.slotCaption} (count: ${slotData.count}, idx: ${slotData.intervalIndex})`);

    let captchaAttempt = 0;
    const maxCaptchaRetries = validateRc.retry400Enabled ? validateRc.retry400MaxRetries + 1 : 1;

    while (true) {
      checkAbort(signal);
      try {
        const attemptLabel = maxCaptchaRetries > 1 ? ` (попытка ${captchaAttempt + 1}/${maxCaptchaRetries})` : "";
        await runCaptchaPhase(slotData, attemptLabel, signal);
        await confirmUsageInBackground(config);
        return;
      } catch (err) {
        checkAbort(signal);
        const storeState = useInjectorStore.getState();
        const captchaId = storeState.captchaId || "?";
        const variantTiles = storeState.solvedVariantTiles;

        if (isCaptchaRelatedError(err)) {
          if (captchaId !== "?") {
            const reason =
              err instanceof Error && err.message.includes("Сервер вернул null")
                ? "таймаут сервера"
                : "неверное решение (400)";
            log(`Капча не валидирована [${captchaId}] причина: ${reason}`);
          } else {
            log(`Ошибка генерации капчи: ${serializeError(err)}`);
          }
        }

        if (await tryRetrySlot(err, slotRetryCount, config, signal)) {
          slotRetryCount++;
          continue slotRetry;
        }

        if (await tryRetryCaptcha(err, captchaAttempt, validateRc, signal)) {
          captchaAttempt++;
          continue;
        }

        log("=== ОШИБКА ===", err);
        throw err;
      }
    }
  }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Pipeline stopped by user", "AbortError");
  }
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Pipeline stopped by user", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () => {
      reject(new DOMException("Pipeline stopped by user", "AbortError"));
    });
  });
}

async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return Promise.race([promise, abortPromise(signal)]);
}

/**
 * Точка входа инжектора. Выполняет полный цикл бронирования:
 * 1. Сброс состояния pipeline
 * 2. Регистрация usage log + получение слотов
 * 3. Запуск pipeline с retry-логикой
 * 4. При ошибке — отчёт на сервер, открытие страницы с капчами (если нужно)
 */
export async function main(config: InjectorConfig, signal?: AbortSignal): Promise<void> {
  resetPipelineState(config);
  log("=== Старт скрипта (runUpTo: " + config.runUpTo + ") ===");
  log("<log-version>v2</log-version>");

  try {
    checkAbort(signal);
    const slotsResponse = await withAbort(registerUsageAndFetchSlots(config, signal), signal);
    checkAbort(signal);
    await withAbort(runWithRetryLoop(config, slotsResponse, signal), signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    await failUsageInBackground(config, err);
    log("=== ОШИБКА ===", err);
    const error = err as Error;
    if (error.message && error.message.includes("Откройте страницу с капчами")) {
      openServerUrl();
    }
    throw err;
  }
}
