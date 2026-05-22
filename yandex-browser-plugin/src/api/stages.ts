import type {
  InjectorConfig,
  Slot,
  SlotsResponse,
  AvailableDatesResponse,
  CaptchaResponse,
  CaptchaValidationResponse,
  SolvedAnswer,
} from "@/types";
import { httpRequest } from "./client";
import { sendMessageToBackground } from "./background";
import { log } from "@/logger";
import { useInjectorStore } from "@/store";
import {
  buildCaptchaContext,
  buildReschedulePayload,
  buildSubmitDraftPayload,
  getEoppTransportType,
} from "./eopp-contract";

type LegacyCaptchaResponse = {
  token?: string;
  variants?: Array<{ tiles: string[] }>;
  puzzle?: CaptchaResponse["puzzle"];
};

type EoppCaptchaResponseV2 = {
  token?: string;
  front?: {
    tiles?: CaptchaResponse["puzzle"]["tiles"];
    variantsCapture?: string[][];
    type?: number;
  };
};

function normalizeCaptchaResponse(raw: unknown): CaptchaResponse {
  const response = raw as LegacyCaptchaResponse & EoppCaptchaResponseV2;

  if (response.front?.tiles && response.front?.variantsCapture) {
    return {
      token: response.token || "",
      puzzle: {
        tiles: response.front.tiles,
        variantsCapture: response.front.variantsCapture,
      },
      type: response.front.type,
    };
  }

  if (response.puzzle?.tiles && response.puzzle?.variantsCapture) {
    return {
      token: response.token || "",
      puzzle: response.puzzle,
    };
  }

  if (response.variants) {
    return {
      token: response.token || "",
      puzzle: {
        tiles: [],
        variantsCapture: response.variants.map((variant) => variant.tiles),
      },
    };
  }

  throw new Error("Unexpected captcha generation response format");
}

export async function getAvailableSlots(
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<SlotsResponse> {
  useInjectorStore.getState().setStage("slots");

  const isCreateReservation = config.mode === "create";
  const transportType = getEoppTransportType(config);
  let url = `/reservations-api/v1/timeslot/AvailableSlots?facilityId=${config.facilityId}&vehicleId=${config.vehicleId}&date=${config.slotDate}&transportType=${transportType}&isCreateReservation=${isCreateReservation}`;
  if (config.mode !== "create") {
    url += `&reservationId=${config.reservationId}`;
  }

  const response = await httpRequest("GET", url, undefined, undefined, signal);

  const slotsResponse = response as SlotsResponse;
  const slots = slotsResponse.slots || [];
  const slotsStr = slots.map((s) => `${s.time}(${s.count})`).join(", ");
  log(`Получено ${slots.length} доступных слотов: ${slotsStr}`);
  return slotsResponse;
}

export async function getAvailableDates(
  config: InjectorConfig,
  signal?: AbortSignal,
): Promise<AvailableDatesResponse> {
  const transportType = getEoppTransportType(config);
  let url = `/reservations-api/v1/timeslot/AvailableDates?facilityId=${config.facilityId}&fromDate=${config.slotDate}&transportType=${transportType}`;
  if (config.vehicleId) {
    url += `&vehicleId=${config.vehicleId}`;
  }

  const response = await httpRequest("GET", url, undefined, undefined, signal);
  return response as AvailableDatesResponse;
}

export async function generateCaptcha(
  config: InjectorConfig,
  slot: { time: string },
  signal?: AbortSignal,
): Promise<CaptchaResponse> {
  useInjectorStore.getState().setStage("captcha");

  const payload = {
    payload: buildCaptchaContext(config, slot),
  };

  const response = await httpRequest(
    "POST",
    "/reservations-api/v1/captcha",
    payload,
    undefined,
    signal,
  );
  log("Капча сгенерирована");
  return normalizeCaptchaResponse(response);
}

export async function solveCaptcha(
  captchaData: CaptchaResponse,
  autoSolve: boolean,
  apiKey: string,
  reservationId: string,
): Promise<SolvedAnswer> {
  useInjectorStore.getState().setStage("solving");

  const storeState = useInjectorStore.getState();
  const payload: Record<string, unknown> = {
    ...captchaData,
    auto_solve: autoSolve,
  };
  if (apiKey) {
    payload.api_key = apiKey;
  }
  if (reservationId) {
    payload.reservation_id = reservationId;
  }
  if (storeState.usageLogId != null) {
    payload.usage_log_id = storeState.usageLogId;
  }

  const response = await sendMessageToBackground("solveCaptcha", payload);
  const solved = response as SolvedAnswer | null;

  if (!solved) {
    throw new Error(
      "Сервер вернул null — капча не решена (таймаут или ошибка)",
    );
  }

  if (solved.usage_log_id != null) {
    useInjectorStore.getState().setUsageLogId(solved.usage_log_id);
  }
  if (solved.captcha_id) {
    useInjectorStore.getState().setCaptchaId(solved.captcha_id);
  }
  useInjectorStore.getState().setSolvedVariantIndex(solved.variantIndex);
  useInjectorStore.getState().setSolvedVariantTiles(solved.variantTiles);
  log("Капча решена");
  return solved;
}

export async function validateCaptcha(
  config: InjectorConfig,
  captchaData: CaptchaResponse,
  slot: { time: string },
  solvedAnswer: SolvedAnswer,
  signal?: AbortSignal,
): Promise<CaptchaValidationResponse> {
  useInjectorStore.getState().setStage("validating");

  const payload = {
    captchaToken: captchaData.token,
    answer: solvedAnswer.variantTiles,
    payload: buildCaptchaContext(config, slot),
  };

  const response = await httpRequest(
    "POST",
    "/reservations-api/v1/captcha-validate",
    payload,
    undefined,
    signal,
  );
  useInjectorStore.getState().setCaptchaValidated(true);
  const storeState = useInjectorStore.getState();
  log(`Капча валидирована [${storeState.captchaId || "?"}] ответ: ${JSON.stringify(solvedAnswer.variantTiles)}`);
  return response as CaptchaValidationResponse;
}

export async function submitReschedule(
  config: InjectorConfig,
  slot: Slot,
  captchaValidation: CaptchaValidationResponse,
  signal?: AbortSignal,
): Promise<unknown> {
  useInjectorStore.getState().setStage("submitting");

  const payload = buildReschedulePayload(
    config,
    slot,
    captchaValidation.successToken,
  );

  const response = await httpRequest(
    "POST",
    "/reservations-api/v1/Reschedule",
    payload,
    undefined,
    signal,
  );
  const resp = response as {
    title?: string;
    eoppStatus?: number;
    isSuccess?: boolean;
  };

  if (resp.title === "RescheduleSuccess" && resp.eoppStatus === 20118) {
    log("Бронь успешно перенесена (RescheduleSuccess)");
  } else if (resp.isSuccess) {
    log("Бронь перенесена");
  } else {
    log("Ответ Reschedule", response);
  }
  return response;
}

export async function submitCreate(
  config: InjectorConfig,
  slot: { intervalIndex: number },
  captchaValidation: CaptchaValidationResponse,
  signal?: AbortSignal,
): Promise<unknown> {
  useInjectorStore.getState().setStage("submitting");

  const payload = buildSubmitDraftPayload(
    config,
    slot,
    captchaValidation.successToken,
  );

  const response = await httpRequest(
    "POST",
    "/reservations-api/v1/SubmitDraft",
    payload,
    undefined,
    signal,
  );
  const resp = response as {
    title?: string;
    eoppStatus?: number;
    isSuccess?: boolean;
  };

  if (resp.title === "SubmitReservationSuccess" && resp.eoppStatus === 20117) {
    log("Бронь успешно создана (SubmitReservationSuccess)");
  } else if (resp.isSuccess) {
    log("Бронь создана");
  } else {
    log("Ответ SubmitDraft", response);
  }
  return response;
}
