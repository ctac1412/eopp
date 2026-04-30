import type { InjectorConfig, Slot, SlotsResponse } from '@/types';
import { httpRequest, retryOn429 } from './client';
import {
  getAvailableSlots,
  generateCaptcha,
  solveCaptcha,
  validateCaptcha,
  submitReschedule,
  submitCreate,
} from './stages';
import { log } from '@/logger';
import { useInjectorStore } from '@/store';

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

export async function runFromStage2(slotsResponse: SlotsResponse): Promise<unknown | null> {
  const config = useInjectorStore.getState().config;
  const slotData = selectBestSlot(slotsResponse.slots);
  log('Выбранный слот', slotData);

  if (config.runUpTo < 2) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const captchaResponse = await retryOn429(
    () => generateCaptcha(config, slotData),
    config.maxRetries,
    config.retryDelayMs
  );

  if (config.runUpTo < 3) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const solvedAnswer = await solveCaptcha(captchaResponse, config.autoSolve, config.apiKey);
  log('Ответ от нашего сервера', solvedAnswer);

  if (config.runUpTo < 4) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const validationResponse = await retryOn429(
    () => validateCaptcha(config, captchaResponse, slotData, solvedAnswer),
    config.maxRetries,
    config.retryDelayMs
  );

  if (config.runUpTo < 5) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const isCreateReservation = config.mode === 'create';
  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const submitResponse = await retryOn429(
    () => submitFn(config, slotData, validationResponse),
    config.maxRetries,
    config.retryDelayMs
  );

  return submitResponse;
}

export async function main(config: InjectorConfig): Promise<void> {
  useInjectorStore.getState().setConfig(config);
  resetUsedSlots();
  log('=== Старт скрипта (runUpTo: ' + config.runUpTo + ') ===');

  try {
    const slotsResponse = await getAvailableSlots(config);
    let slotRetryCount = 0;

    while (slotRetryCount <= config.maxSlotRetries) {
      try {
        const result = await runFromStage2(slotsResponse);
        if (result !== null) {
          log('=== Скрипт завершён успешно ===', result);
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

    log('=== Превышено количество попыток выбора слота ===');
  } catch (err) {
    log('=== ОШИБКА ===', err);
    throw err;
  }
}
