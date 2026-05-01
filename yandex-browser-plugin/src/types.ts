export interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
  delayMs: number;
  retry400Enabled: boolean;
  retry400MaxRetries: number;
  retry400DelayMs: number;
}

export type EndpointName = 'getAvailableSlots' | 'generateCaptcha' | 'validateCaptcha' | 'submitReschedule' | 'submitCreate';

export interface QueueItemState {
  slotId: string;
  slotTime: string;
  status: 'pending' | 'solving' | 'validating' | 'submitting' | 'done' | 'failed';
  error?: string;
}

export interface InjectorConfig {
  runUpTo: number;
  facilityId: string;
  vehicleId: string;
  reservationId: string;
  transportType: 1 | 2;
  slotDate: string;
  mode: 'reschedule' | 'create';
  preferredTime: string | null;
  autoSolve: boolean;
  apiKey: string;
  retryOnAllSlotsOccupied: boolean;
  maxSlotRetries: number;
  slotRetryDelayMs: number;
  retryPerEndpoint: {
    getAvailableSlots: RetryConfig;
    generateCaptcha:   RetryConfig;
    validateCaptcha:   RetryConfig;
    submitReschedule:  RetryConfig;
    submitCreate:      RetryConfig;
  };
  retryMode: 'sequential' | 'queue';
  queueSize: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export type PipelineStage = 'slots' | 'captcha' | 'solving' | 'validating' | 'submitting';

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
}
