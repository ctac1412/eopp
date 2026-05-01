import type { InjectorConfig, Slot, SlotsResponse, CaptchaResponse, CaptchaValidationResponse, SolvedAnswer } from '@/types';
import { httpRequest, retryOn429 } from './client';
import { sendMessageToBackground } from './background';
import { log } from '@/logger';
import { useInjectorStore } from '@/store';

export async function getAvailableSlots(config: InjectorConfig): Promise<SlotsResponse> {
  log('Этап 1: получение свободных слотов');
  useInjectorStore.getState().setStage('slots');

  const isCreateReservation = config.mode === 'create';
  let url = `/reservations-api/v1/timeslot/AvailableSlots?facilityId=${config.facilityId}&vehicleId=${config.vehicleId}&date=${config.slotDate}&transportType=${config.transportType}&isCreateReservation=${isCreateReservation}`;
  if (config.mode !== 'create') {
    url += `&reservationId=${config.reservationId}`;
  }

  const response = await httpRequest('GET', url);
  const slotsResponse = response as SlotsResponse;
  log(`Получено ${slotsResponse.slots?.length || 0} доступных слотов`);
  return slotsResponse;
}

export async function generateCaptcha(config: InjectorConfig, slot: { time: string }): Promise<CaptchaResponse> {
  log('Этап 2: генерация капчи');
  useInjectorStore.getState().setStage('captcha');

  const payload = {
    facilityId: config.facilityId,
    timeSlotData: `${config.slotDate}T${slot.time}.000Z`,
    reservationId: config.reservationId,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/captcha', payload);
  log('Капча сгенерирована');
  return response as CaptchaResponse;
}

export async function solveCaptcha(captchaData: CaptchaResponse, autoSolve: boolean, apiKey: string, reservationId:string ): Promise<SolvedAnswer> {
  log('Этап 3: запрос к нашему серверу /solve-captcha');
  useInjectorStore.getState().setStage('solving');

  const payload: Record<string, unknown> = {
    ...captchaData,
    auto_solve: autoSolve,
  };
  if (apiKey) {
    payload.api_key = apiKey;
  }
  if (reservationId) {
    payload.reservationId = reservationId;
  }

  const response = await sendMessageToBackground('solveCaptcha', payload);
  const solved = response as SolvedAnswer;
  if (solved.usage_log_id != null) {
    useInjectorStore.getState().setUsageLogId(solved.usage_log_id);
  }
  log('Капча решена');
  return solved;
}

export async function validateCaptcha(
  config: InjectorConfig,
  captchaData: CaptchaResponse,
  slot: { time: string },
  solvedAnswer: SolvedAnswer
): Promise<CaptchaValidationResponse> {
  log('Этап 4: валидация капчи');
  useInjectorStore.getState().setStage('validating');

  const payload = {
    captchaToken: captchaData.token,
    answer: solvedAnswer.variantTiles,
    facilityId: config.facilityId,
    timeSlotData: `${config.slotDate}T${slot.time}.000Z`,
    reservationId: config.reservationId,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/captcha-validate', payload);
  log('Капча валидирована');
  return response as CaptchaValidationResponse;
}

export async function submitReschedule(
  config: InjectorConfig,
  slot: { slotCaption: string; intervalIndex: number },
  captchaValidation: CaptchaValidationResponse
): Promise<unknown> {
  log('Этап 5: перенос брони (Reschedule)');
  useInjectorStore.getState().setStage('submitting');

  const payload = {
    reservationRequestId: config.reservationId,
    timeslot: `${config.slotDate.split('-').slice(1).reverse().join('.')}, ${slot.slotCaption}`,
    date: config.slotDate,
    transportType: config.transportType,
    intervalIndex: slot.intervalIndex,
    facilityId: config.facilityId,
    captchaToken: captchaValidation.successToken,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/Reschedule', payload);
  log('Бронь перенесена');
  return response;
}

export async function submitCreate(
  config: InjectorConfig,
  slot: { intervalIndex: number },
  captchaValidation: CaptchaValidationResponse
): Promise<unknown> {
  log('Этап 5: создание брони (SubmitDraft)');
  useInjectorStore.getState().setStage('submitting');

  const payload = {
    arrivalDatePlan: config.slotDate,
    captchaToken: captchaValidation.successToken,
    encryptedTso: null,
    facilityId: config.facilityId,
    intervalIndex: slot.intervalIndex,
    isTso: false,
    modeType: 1,
    reservationId: config.reservationId,
    transportType: config.transportType,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/SubmitDraft', payload, {
    'FacilityMode': 'false',
  });
  log('Бронь создана');
  return response;
}
