import type { InjectorConfig } from "@/types";
import { getEoppHttpErrorTag, parseEoppHttpError } from "@/api/client";
import { getAvailableSlots } from "@/api/stages";
import { log } from "@/logger";

export type SlotsLimitPingResult = "limit-present" | "limit-missing" | "unknown";

export async function pingSlotsLimit(config: InjectorConfig): Promise<SlotsLimitPingResult> {
  log("Пинг слотов: проверяю лимит по текущим настройкам");
  try {
    const response = await getAvailableSlots(config);
    const slotsCount = response.slots?.length || 0;
    log(`Пинг слотов: лимит есть, EOPP вернул слоты (${slotsCount})`);
    return "limit-present";
  } catch (err) {
    const parsed = parseEoppHttpError(err);
    if (parsed?.title === "SlotsNotFound" && parsed.eoppStatus === 41104) {
      log("Пинг слотов: лимит есть, слотов нет [SlotsNotFound:41104]");
      return "limit-present";
    } else if (
      parsed?.title === "MaxActiveReservationsForFacility" &&
      parsed.eoppStatus === 40118
    ) {
      log("Пинг слотов: лимита нет [MaxActiveReservationsForFacility:40118]");
      return "limit-missing";
    } else {
      const tag = getEoppHttpErrorTag(err);
      log(`Пинг слотов: не удалось определить лимит${tag || ""}`);
      return "unknown";
    }
  }
}
