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

export interface EoppVehicleData {
  vehicleId?: string;
  vehicleTypeId?: number;
  vehicleType?: string;
  subTypeId?: number;
  subType?: string;
  regNumber?: string;
  status?: number;
  isArchive?: boolean;
}

export interface EoppReservationRaw {
  id?: string;
  reservationRequestCode?: string;
  status?: number;
  facilityId?: string;
  vehicleData?: EoppVehicleData[];
  isSpecialCargo?: boolean;
  typeOfTransportation?: number;
  reservedSlots?: string[] | null;
}

export interface EoppFacilityRaw {
  id?: string;
  name?: string;
  tz?: number;
  isWorks?: boolean;
  isReadonly?: boolean;
  settings?: {
    approveReservation?: {
      cargo?: boolean;
      specialCargo?: boolean;
    };
    nonArrival?: {
      tsoBooking?: boolean;
    };
  };
  mode?: {
    facilityId?: string;
    modeType?: number;
    reservationLock?: {
      eopp?: boolean;
      epgu?: boolean;
      tso?: boolean;
    };
    isFacilityStopped?: boolean;
  };
}

export interface ReservationData {
  raw: EoppReservationRaw;
  facilityRaw?: EoppFacilityRaw;
}

export interface InjectorConfig {
  runUpTo: number;
  facilityId: string;
  vehicleId: string;
  reservationId: string;
  transportType: 1 | 2 | 3 | 4;
  slotDate: string;
  mode: "reschedule" | "create";
  timeOrder: string[][];
  preferredMode: "strict" | "soft";
  autoSolve: boolean;
  apiKey: string;
  retryOnAllSlotsOccupied: boolean;
  maxSlotRetries: number;
  slotRetryDelayMs: number;
  sharedSlotsEnabled: boolean;
  sharedSlotsWaitMs: number;
  sharedSlotsMode: "reuse" | "probe";
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

export interface SharedSlotsClaimResponse {
  group_key: string;
  role: "master" | "slave";
  status: "claimed" | "pending" | "ready" | "failed" | "expired";
  master_id?: string;
  expires_at?: number;
  slots_response?: SlotsResponse | null;
  error?: string | null;
  waiters?: number;
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
  reservedSlots?: string[];
}

export interface SlotsResponse {
  slots: Slot[];
}

export type AvailableDatesResponse = string[];

export interface CaptchaTile {
  tileId: string;
  imageData: string;
}

export interface CaptchaResponse {
  token: string;
  puzzle: {
    tiles: CaptchaTile[];
    variantsCapture: string[][];
  };
  type?: number;
}

export interface SolvedAnswer {
  variantIndex: number;
  variantTiles: string[];
  usage_log_id?: number;
  captcha_id?: string;
  solved_by_super?: boolean;
  solver_label?: string;
}

export interface ApiKeyStatusResponse {
  valid: boolean;
  remaining: number | null;
  label: string;
}

export interface CaptchaValidationResponse {
  isValid?: boolean;
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
  variant?: number;
}

export interface SlotDict {
  id: string;
  time: string;
  count: number;
  slotCaption: string;
  intervalIndex: number;
  reservedSlots?: string[];
}

export interface TimeOrderPreset {
  id: string;
  name: string;
  timeOrder: string[][];
  preferredMode: "strict" | "soft";
}
