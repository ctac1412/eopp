import { Facility, PageInfo, InjectorConfig, RetryConfig, EndpointName } from '@/types';

export const FACILITIES: Facility[] = [
  { id: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42', name: 'АПП Забайкальск' },
  { id: '93c9939a-2182-4e78-98b4-0cf314b09cfa', name: 'АПП Тагиркент-Казмаляр' },
  { id: 'cbde069a-7e18-4ca6-9b38-f790348d6c24', name: 'АПП Бугристое' },
  { id: '1fffb312-4ebe-4ad2-a356-0b8f04587c11', name: 'АПП Верхний Ларс' },
  { id: 'ab6edb80-5f8f-4bf9-bf9a-a925271d9df8', name: 'АПП Чернышевское' },
];

export const TZ_OFFSET = 3;
export const CAPTCHA_SERVER = 'https://china.alabai.netcraze.pro';
export const EOPP_API_BASE = 'https://eopp.epd-portal.ru/reservations-api/v1';

export function shouldInject(pageUrl: string): PageInfo | null {
  const match = pageUrl.match(/\/reservations\/reservation\/([a-f0-9-]{36})\/(edit|reschedule)/);
  if (match) {
    return { reservationId: match[1] };
  }
  if (
    pageUrl.startsWith('http://localhost:8765') ||
    pageUrl.startsWith('http://127.0.0.1:8765') ||
    pageUrl.startsWith('https://localhost:8765') ||
    pageUrl.startsWith('https://127.0.0.1:8765') ||
    pageUrl.startsWith('https://china.alabai.netcraze.pro/')
  ) {
    return { reservationId: '00000000-0000-0000-0000-000000000000', isLocalhost: true };
  }
  return null;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function defaultRetryConfig(): RetryConfig {
  return { enabled: true, maxRetries: 3, delayMs: 5000, retry400Enabled: false, retry400MaxRetries: 0, retry400DelayMs: 0 };
}

function defaultSlotsRetryConfig(): RetryConfig {
  return { enabled: true, maxRetries: 3, delayMs: 2000, retry400Enabled: true, retry400MaxRetries: 3, retry400DelayMs: 500 };
}

export function createDefaultConfig(reservationId: string, facilityId: string, vehicleId: string, transportType: 1 | 2): InjectorConfig {
  return {
    runUpTo: 4,
    facilityId,
    vehicleId,
    reservationId,
    transportType,
    slotDate: getDefaultSlotDate('reschedule'),
    mode: 'reschedule',
    preferredTime: null,
    autoSolve: false,
    retryOnAllSlotsOccupied: true,
    maxSlotRetries: 3,
    slotRetryDelayMs: 500,
    retryPerEndpoint: {
      getAvailableSlots: defaultSlotsRetryConfig(),
      generateCaptcha:   defaultRetryConfig(),
      validateCaptcha:   defaultRetryConfig(),
      submitReschedule:  defaultRetryConfig(),
      submitCreate:      defaultRetryConfig(),
    },
    retryMode: 'sequential',
    queueSize: 3,
    apiKey: '',
    maxRetries: 3,
    retryDelayMs: 5000,
  };
}

export function getDefaultSlotDate(mode: 'reschedule' | 'create'): string {
  return mode === 'reschedule' ? addDays(1) : addDays(13);
}

export function getEndpointRetry(config: InjectorConfig, endpoint: EndpointName): RetryConfig {
  if (config.retryPerEndpoint && config.retryPerEndpoint[endpoint]) {
    return config.retryPerEndpoint[endpoint];
  }
  return {
    enabled: true,
    maxRetries: config.maxRetries ?? 3,
    delayMs: config.retryDelayMs ?? 5000,
    retry400Enabled: false,
    retry400MaxRetries: 0,
    retry400DelayMs: 0,
  };
}
