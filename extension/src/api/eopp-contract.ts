import type {
  EoppFacilityRaw,
  EoppReservationRaw,
  InjectorConfig,
  Slot,
} from "@/types";

export enum EoppVehicleSubType {
  Truck = 1,
  Trailer = 2,
}

export enum EoppTransportType {
  Cargo = 1,
  Tso = 2,
  Special = 3,
  TsoSpecial = 4,
}

export enum EoppFacilityMode {
  Unspecified = 0,
  Timeslot = 1,
  Special = 2,
  Queue = 3,
  Stopped = 4,
}

type CaptchaContext = {
  facilityId: string;
  timeSlotData: string;
  reservationId: string;
  encryptedTso: string | null;
};

export function getReservationRaw(config: InjectorConfig): EoppReservationRaw | null {
  return config.reservationData?.raw ?? null;
}

export function getFacilityRaw(config: InjectorConfig): EoppFacilityRaw | null {
  return config.reservationData?.facilityRaw ?? null;
}

export function getPrimaryVehicleId(
  reservation: EoppReservationRaw | null,
  fallbackVehicleId: string,
): string {
  const vehicles = reservation?.vehicleData ?? [];
  return (
    vehicles.find((vehicle) => vehicle.subTypeId === EoppVehicleSubType.Truck)
      ?.vehicleId ||
    vehicles[0]?.vehicleId ||
    fallbackVehicleId
  );
}

export function getEncryptedTso(): string | null {
  return localStorage.getItem("encryptedSettings");
}

export function isTsoMode(): boolean {
  return Boolean(getEncryptedTso());
}

export function isSpecialCargo(config: InjectorConfig): boolean {
  return Boolean(getReservationRaw(config)?.isSpecialCargo);
}

export function getEoppTransportType(config: InjectorConfig): EoppTransportType {
  const specialCargo = isSpecialCargo(config);
  if (isTsoMode() && specialCargo) return EoppTransportType.TsoSpecial;
  if (isTsoMode()) return EoppTransportType.Tso;
  if (specialCargo) return EoppTransportType.Special;
  return EoppTransportType.Cargo;
}

export function getFacilityMode(config: InjectorConfig): EoppFacilityMode {
  const facility = getFacilityRaw(config);
  if (typeof facility?.mode?.modeType === "number") {
    return facility.mode.modeType;
  }
  return EoppFacilityMode.Timeslot;
}

export function buildCaptchaContext(
  config: InjectorConfig,
  slot: { time: string },
): CaptchaContext {
  return {
    facilityId: config.facilityId,
    timeSlotData: `${config.slotDate}T${slot.time}.000Z`,
    reservationId: config.reservationId,
    encryptedTso: isTsoMode() ? getEncryptedTso() : null,
  };
}

export function buildSubmitDraftPayload(
  config: InjectorConfig,
  slot: { intervalIndex: number },
  captchaToken: string,
): Record<string, unknown> {
  const modeType = getFacilityMode(config);
  return {
    reservationId: config.reservationId,
    facilityId: config.facilityId,
    arrivalDatePlan: modeType === EoppFacilityMode.Queue ? null : config.slotDate,
    intervalIndex: slot.intervalIndex,
    transportType: getEoppTransportType(config),
    modeType,
    isTso: isTsoMode(),
    encryptedTso: isTsoMode() ? getEncryptedTso() : null,
    captchaToken,
  };
}

export function buildReschedulePayload(
  config: InjectorConfig,
  slot: Slot,
  captchaToken: string,
): Record<string, unknown> {
  return {
    reservationRequestId: config.reservationId,
    timeslotIds: slot.reservedSlots,
    timeslot: `${config.slotDate.split("-").slice(1).reverse().join(".")}, ${slot.slotCaption}`,
    date: config.slotDate,
    transportType: getEoppTransportType(config),
    intervalIndex: slot.intervalIndex,
    facilityId: config.facilityId,
    captchaToken,
    encryptedTso: isTsoMode() ? getEncryptedTso() : null,
  };
}
