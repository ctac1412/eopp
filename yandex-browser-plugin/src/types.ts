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
  retryDelayMs: number;
  maxRetries: number;
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
