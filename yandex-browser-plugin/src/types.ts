/**
 * EOPP Browser Extension - TypeScript Types
 *
 * Основные типы:
 * - RetryConfig: конфигурация повторов при ошибках
 * - EndpointName: названия эндпоинтов EOPP API
 * - InjectorConfig: конфигурация инжектора (АПП, vehicleId, mode, retry и т.д.)
 * - PipelineStage: стадия pipeline
 * - SlotsResponse, CaptchaResponse, SolvedAnswer: ответы API
 *
 * Используется: во всех модулях расширения для типизации
 */
export interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
  delayMs: number;
  retry400Enabled: boolean;
  retry400MaxRetries: number;
  retry400DelayMs: number;
}

export type EndpointName =
  | "getAvailableSlots"
  | "generateCaptcha"
  | "validateCaptcha"
  | "submitReschedule"
  | "submitCreate";

export interface ReservationData {
  raw: Record<string, unknown>;
}

export interface InjectorConfig {
  runUpTo: number;
  facilityId: string;
  vehicleId: string;
  reservationId: string;
  transportType: 1 | 2;
  slotDate: string;
  mode: "reschedule" | "create";
  preferredTimes: string[];
  preferredMode: "strict" | "soft";
  autoSolve: boolean;
  apiKey: string;
  retryOnAllSlotsOccupied: boolean;
  maxSlotRetries: number;
  slotRetryDelayMs: number;
  retryPerEndpoint: {
    getAvailableSlots: RetryConfig;
    generateCaptcha: RetryConfig;
    validateCaptcha: RetryConfig;
    submitReschedule: RetryConfig;
    submitCreate: RetryConfig;
  };
  maxRetries?: number;
  retryDelayMs?: number;
  reservationData: ReservationData | null;
}

export type PipelineStage =
  | "slots"
  | "captcha"
  | "solving"
  | "validating"
  | "submitting";

export interface Slot {
  id: string;
  time: string;
  count: number;
  slotCaption: string;
  intervalIndex: number;
}

export interface SlotsResponse {
  slots: Slot[];
}

export interface CaptchaResponse {
  token: string;
  image: string;
  variants: Array<{ tiles: string[] }>;
}

export interface SolvedAnswer {
  variantIndex: number;
  variantTiles: string[];
  usage_log_id?: number;
  captcha_id?: string;
}

export interface ApiKeyStatusResponse {
  valid: boolean;
  remaining: number | null;
  label: string;
}

export interface CaptchaValidationResponse {
  successToken: string;
}

export interface Facility {
  id: string;
  name: string;
}

export interface PageInfo {
  reservationId: string;
  isLocalhost?: boolean;
  pageType?: "edit" | "reschedule";
}

export interface SlotDict {
  id: string;
  time: string;
  count: number;
  slotCaption: string;
  intervalIndex: number;
}
