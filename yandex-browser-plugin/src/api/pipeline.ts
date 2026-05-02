import type { InjectorConfig, Slot, SlotsResponse, CaptchaResponse, SolvedAnswer, EndpointName, QueueItemState, RetryConfig } from '@/types';
import { httpRequest, retryOn429, retryWith429And400 } from './client';
import {
  getAvailableSlots,
  generateCaptcha,
  solveCaptcha,
  validateCaptcha,
  submitReschedule,
  submitCreate,
} from './stages';
import { confirmUsage, failUsage } from './background';
import { log } from '@/logger';
import { useInjectorStore } from '@/store';
import { getEndpointRetry } from '@/constants';

const usedSlotIds = new Set<string>();

export function resetUsedSlots(): void {
  usedSlotIds.clear();
}

export function selectBestSlot(slots: Slot[]): Slot {
  log('Выбор лучшего слота');

  const availableSlots = slots.filter((slot) => !usedSlotIds.has(slot.id));
  const config = useInjectorStore.getState().config;

  if (config.preferredTime) {
    const preferredSlot = availableSlots.find((slot) => slot.time === config.preferredTime);
    if (preferredSlot) {
      log(`Найден предпочтительный слот: ${preferredSlot.slotCaption}`);
      usedSlotIds.add(preferredSlot.id);
      return preferredSlot;
    }
    log(`Предпочтительный слот ${config.preferredTime} недоступен, выбираем по другому критерию`);
  }

  if (availableSlots.length === 0) {
    throw new Error('Нет доступных слотов');
  }

  const maxCount = Math.max(...availableSlots.map((s) => s.count));
  const bestSlots = availableSlots.filter((s) => s.count === maxCount);
  const selected = bestSlots[Math.floor(Math.random() * bestSlots.length)];

  usedSlotIds.add(selected.id);
  log(`Выбран слот: ${selected.slotCaption} (count: ${selected.count})`);
  return selected;
}

function selectNSlots(slots: Slot[], n: number): Slot[] {
  const availableSlots = slots.filter((slot) => !usedSlotIds.has(slot.id));
  const config = useInjectorStore.getState().config;

  const picked: Slot[] = [];

  if (config.preferredTime && picked.length < n) {
    const preferredSlot = availableSlots.find((slot) => slot.time === config.preferredTime);
    if (preferredSlot) {
      picked.push(preferredSlot);
      usedSlotIds.add(preferredSlot.id);
      log(`Найден предпочтительный слот: ${preferredSlot.slotCaption}`);
    }
  }

  const remaining = availableSlots.filter((s) => !picked.includes(s));
  const maxCount = Math.max(...remaining.map((s) => s.count));
  const bestSlots = remaining.filter((s) => s.count === maxCount);

  while (picked.length < n && bestSlots.length > 0) {
    const idx = Math.floor(Math.random() * bestSlots.length);
    const chosen = bestSlots.splice(idx, 1)[0];
    picked.push(chosen);
    usedSlotIds.add(chosen.id);
  }

  if (picked.length < n && remaining.length > 0) {
    const stillAvailable = remaining.filter((s) => !picked.includes(s));
    while (picked.length < n && stillAvailable.length > 0) {
      const idx = Math.floor(Math.random() * stillAvailable.length);
      const chosen = stillAvailable.splice(idx, 1)[0];
      picked.push(chosen);
      usedSlotIds.add(chosen.id);
    }
  }

  log(`Выбрано ${picked.length} слотов для очереди: ${picked.map(s => s.slotCaption).join(', ')}`);
  return picked;
}

function getErrorStage(): string {
  const stage = useInjectorStore.getState().currentStage;
  if (stage === 'solving') return 'stage3';
  if (stage === 'validating') return 'stage4';
  if (stage === 'submitting') return 'stage5';
  return 'other';
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

async function retryWithConfig<T>(fn: () => Promise<T>, endpoint: EndpointName): Promise<T> {
  const config = useInjectorStore.getState().config;
  const rc = getEndpointRetry(config, endpoint);
  if (!rc.enabled) {
    return fn();
  }
  return retryOn429(fn, rc.maxRetries, rc.delayMs);
}

async function retrySlotsWithConfig<T>(fn: () => Promise<T>, config: InjectorConfig): Promise<T> {
  const rc = config.retryPerEndpoint.getAvailableSlots;
  const retry429 = { enabled: rc.enabled, maxRetries: rc.maxRetries, delayMs: rc.delayMs };
  const retry400 = { enabled: rc.retry400Enabled, maxRetries: rc.retry400MaxRetries, delayMs: rc.retry400DelayMs };
  return retryWith429And400(fn, retry429, retry400);
}

export async function runFromStage2(slotsResponse: SlotsResponse): Promise<unknown | null> {
  const config = useInjectorStore.getState().config;

  const slotData = selectBestSlot(slotsResponse.slots);
  log('Выбранный слот', slotData);
  log('Этап 1 (слоты) завершён успешно');

  if (config.runUpTo < 2) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const captchaResponse = await retryWithConfig(
    () => generateCaptcha(config, slotData),
    'generateCaptcha'
  );
  log('Этап 2 (капча) завершён успешно');

  if (config.runUpTo < 3) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const solvedAnswer = await solveCaptcha(captchaResponse, config.autoSolve, config.apiKey, config.reservationId);
  log('Ответ от нашего сервера', solvedAnswer);
  log('Этап 3 (решение капчи) завершён успешно');

  if (config.runUpTo < 4) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const validationResponse = await retryWithConfig(
    () => validateCaptcha(config, captchaResponse, slotData, solvedAnswer),
    'validateCaptcha'
  );
  log('Этап 4 (валидация) завершён успешно');

  if (config.runUpTo < 5) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const isCreateReservation = config.mode === 'create';
  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const endpointName: EndpointName = isCreateReservation ? 'submitCreate' : 'submitReschedule';
  const submitResponse = await retryWithConfig(
    () => submitFn(config, slotData, validationResponse),
    endpointName
  );

  const usageLogId = useInjectorStore.getState().usageLogId;
  if (usageLogId != null && config.apiKey) {
    const logs = useInjectorStore.getState().logs.map((l) => `${l.ts} ${l.msg}`);
    try {
      await confirmUsage(usageLogId, config.apiKey, config.slotDate, logs);
    } catch {
      // fire-and-forget, silently swallow
    }
  }

  return submitResponse;
}

interface QueueEntry {
  slot: Slot;
  captchaResponse: CaptchaResponse;
  solvedAnswer: SolvedAnswer;
}

async function runQueueMode(slotsResponse: SlotsResponse): Promise<unknown | null> {
  const config = useInjectorStore.getState().config;
  const queueSize = config.queueSize;
  const selectedSlots = selectNSlots(slotsResponse.slots, queueSize);

  if (selectedSlots.length === 0) {
    throw new Error('Нет доступных слотов для очереди');
  }

  const queueItems: QueueItemState[] = selectedSlots.map((s) => ({
    slotId: s.id,
    slotTime: s.time,
    status: 'pending',
  }));
  useInjectorStore.getState().setQueueItems(queueItems);
  useInjectorStore.getState().setQueueIndex(0);

  const queue: QueueEntry[] = [];
  log('Этап 1 (слоты) завершён успешно');

  for (let i = 0; i < selectedSlots.length; i++) {
    const slot = selectedSlots[i];
    useInjectorStore.getState().updateQueueItemStatus(i, 'solving');
    log(`Генерация капчи ${i + 1}/${selectedSlots.length} для слота ${slot.time}`);

    if (config.runUpTo < 2) {
      log('Остановка по конфигу runUpTo');
      break;
    }

    let captchaResponse: CaptchaResponse;
    try {
      captchaResponse = await retryWithConfig(
        () => generateCaptcha(config, slot),
        'generateCaptcha'
      );
      log(`Этап 2 (капча) завершён успешно для слота ${slot.time}`);
    } catch (err) {
      log(`Ошибка генерации капчи ${i + 1}/${selectedSlots.length}: ${serializeError(err)}`);
      useInjectorStore.getState().updateQueueItemStatus(i, 'failed', serializeError(err));
      continue;
    }

    if (config.runUpTo < 3) {
      log('Остановка по конфигу runUpTo');
      break;
    }

    let solvedAnswer: SolvedAnswer;
    try {
      solvedAnswer = await solveCaptcha(captchaResponse, config.autoSolve, config.apiKey, config.reservationId);
      log(`Капча ${i + 1}/${selectedSlots.length} решена`);
      log(`Этап 3 (решение капчи) завершён успешно для слота ${slot.time}`);
    } catch (err) {
      log(`Ошибка решения капчи ${i + 1}/${selectedSlots.length}: ${serializeError(err)}`);
      useInjectorStore.getState().updateQueueItemStatus(i, 'failed', serializeError(err));
      continue;
    }

    queue.push({ slot, captchaResponse, solvedAnswer });
  }

  if (queue.length === 0) {
    throw new Error('Все капчи в очереди не были сгенерированы');
  }

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    const globalIdx = selectedSlots.indexOf(entry.slot);

    if (config.runUpTo < 4) {
      log('Остановка по конфигу runUpTo');
      useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'done');
      continue;
    }

    useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'validating');
    log(`Капча ${i + 1}/${queue.length} — валидация`);

    let validationResponse;
    try {
      validationResponse = await retryWithConfig(
        () => validateCaptcha(config, entry.captchaResponse, entry.slot, entry.solvedAnswer),
        'validateCaptcha'
      );
      log(`Капча ${i + 1}/${queue.length} валидирована`);
      log(`Этап 4 (валидация) завершён успешно для слота ${entry.slot.time}`);
    } catch (err) {
      const errMsg = serializeError(err);
      log(`Капча ${i + 1}/${queue.length} провалена (валидация): ${errMsg}`);
      useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'failed', errMsg);
      continue;
    }

    if (config.runUpTo < 5) {
      log('Остановка по конфигу runUpTo');
      useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'done');
      continue;
    }

    useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'submitting');
    const isCreateReservation = config.mode === 'create';
    const submitFn = isCreateReservation ? submitCreate : submitReschedule;
    const endpointName: EndpointName = isCreateReservation ? 'submitCreate' : 'submitReschedule';
    log(`Капча ${i + 1}/${queue.length} — отправка`);

    try {
      const submitResponse = await retryWithConfig(
        () => submitFn(config, entry.slot, validationResponse),
        endpointName
      );

      useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'done');

      const usageLogId = useInjectorStore.getState().usageLogId;
      if (usageLogId != null && config.apiKey) {
        const logs = useInjectorStore.getState().logs.map((l) => `${l.ts} ${l.msg}`);
        try {
          await confirmUsage(usageLogId, config.apiKey, config.slotDate, logs);
        } catch {
          // fire-and-forget
        }
      }

      log(`Этап 5 (отправка) завершён успешно для слота ${entry.slot.time}`);
      log(`Капча ${i + 1}/${queue.length} успешно отправлена`);
      return submitResponse;
    } catch (err) {
      const errMsg = serializeError(err);
      const errorObj = err as { status?: number };

      if (errorObj.status === 400) {
        log(`Капча ${i + 1}/${queue.length} провалена (400), пробую следующую`);
      } else {
        log(`Капча ${i + 1}/${queue.length} провалена (${errorObj.status ?? 'unknown'}): ${errMsg}`);
      }
      useInjectorStore.getState().updateQueueItemStatus(globalIdx, 'failed', errMsg);
    }
  }

  throw new Error('Все капчи в очереди провалились');
}

export async function main(config: InjectorConfig): Promise<void> {
  useInjectorStore.getState().setConfig(config);
  resetUsedSlots();
  log('=== Старт скрипта (runUpTo: ' + config.runUpTo + ', mode: ' + config.retryMode + ') ===');

  try {
    const slotsResponse = await retrySlotsWithConfig(
      () => getAvailableSlots(config),
      config
    );
    log('Этап 1 (слоты) завершён успешно');

    if (config.retryMode === 'queue') {
      let slotRetryCount = 0;

      while (slotRetryCount <= config.maxSlotRetries) {
        try {
          const result = await runQueueMode(slotsResponse);
          if (result !== null) {
            log('=== Скрипт завершён успешно (queue mode) ===', result);
          } else {
            log('=== Скрипт завершён (queue mode, runUpTo остановка) ===');
          }
          return;
        } catch (err) {
          const error = err as { body?: string };
          const isAllSlotsOccupied = error.body && error.body.includes('AllSlotsOccupiedOnInterval');

          if (isAllSlotsOccupied && config.retryOnAllSlotsOccupied && slotRetryCount < config.maxSlotRetries) {
            slotRetryCount++;
            log(`AllSlotsOccupiedOnInterval — пробуем другую очередь слотов (попытка ${slotRetryCount}/${config.maxSlotRetries})`);
            await new Promise((r) => setTimeout(r, config.slotRetryDelayMs));
            continue;
          }

          log('=== ОШИБКА ===', err);
          throw err;
        }
      }

      log('=== Скрипт завершён (queue mode, превышено количество попыток выбора слотов) ===');
    } else {
      let slotRetryCount = 0;

      while (slotRetryCount <= config.maxSlotRetries) {
        try {
          const result = await runFromStage2(slotsResponse);
          if (result !== null) {
            log('=== Скрипт завершён успешно (sequential mode) ===', result);
          } else {
            log('=== Скрипт завершён (sequential mode, runUpTo остановка на этапе ' + (config.runUpTo) + ') ===');
          }
          return;
        } catch (err) {
          const error = err as { body?: string };
          const isAllSlotsOccupied = error.body && error.body.includes('AllSlotsOccupiedOnInterval');

          if (isAllSlotsOccupied && config.retryOnAllSlotsOccupied && slotRetryCount < config.maxSlotRetries) {
            slotRetryCount++;
            log(`AllSlotsOccupiedOnInterval — пробуем другой слот (попытка ${slotRetryCount}/${config.maxSlotRetries})`);
            await new Promise((r) => setTimeout(r, config.slotRetryDelayMs));
            continue;
          }

          log('=== ОШИБКА ===', err);
          throw err;
        }
      }

      log('=== Скрипт завершён (sequential mode, превышено количество попыток выбора слота) ===');
    }
  } catch (err) {
    const usageLogId = useInjectorStore.getState().usageLogId;
    if (usageLogId != null && config.apiKey) {
      const logs = useInjectorStore.getState().logs.map((l) => `${l.ts} ${l.msg}`);
      try {
        await failUsage(
          usageLogId,
          config.apiKey,
          serializeError(err),
          getErrorStage(),
          config.slotDate,
          logs
        );
      } catch {
        // fire-and-forget, silently swallow
      }
    }
    log('=== ОШИБКА ===', err);
    throw err;
  }
}
