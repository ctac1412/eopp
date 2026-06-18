import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { useInjectorStore } from "@/store";
import { eoppFetch } from "@/api/client";
import type {
  EoppFacilityRaw,
  EoppReservationRaw,
  InjectorConfig,
  PageInfo,
} from "@/types";
import { EoppTransportType, getPrimaryVehicleId } from "@/api/eopp-contract";
import {
  shouldInject,
  createDefaultConfig,
  loadSavedConfig,
  FACILITIES,
  NULL_UUID,
  DEFAULT_FACILITY_ID,
} from "@/constants";
import cssContent from "@/content.css?inline";

const USE_PAGE_REQUEST_CACHE = true;
const INTERCEPTOR_SOURCE = "eopp-helper-page-interceptor";

const cachedReservationRawById = new Map<string, EoppReservationRaw>();
const cachedFacilityRawById = new Map<string, EoppFacilityRaw>();

type InterceptorMessage = {
  source?: string;
  kind?: "reservationRaw" | "facilityRaw";
  id?: string;
  payload?: unknown;
};

function randomTestVehicleNumber(): string {
  const letters = ["А", "В", "Е", "К", "М", "Н", "О", "Р", "С", "Т", "У", "Х"];
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const region = String(10 + Math.floor(Math.random() * 90));
  return `${pick()}${digits}${pick()}${pick()}${region}`;
}

function testFacilityName(facilityId: string): string {
  const names: Record<string, string> = {
    "1dae5b1c-e2b3-44a4-848f-df8ce2ddde42": "АПП Забайкальск",
    "93c9939a-2182-4e78-98b4-0cf314b09cfa": "АПП Тагиркент-Казмаляр",
    "cbde069a-7e18-4ca6-9b38-f790348d6c24": "АПП Бугристое",
    "1fffb312-4ebe-4ad2-a356-0b8f04587c11": "АПП Верхний Ларс",
    "ab6edb80-5f8f-4bf9-bf9a-a925271d9df8": "АПП Чернышевское",
  };
  return names[facilityId] || "АПП Забайкальск";
}

function testCompanyName(): string {
  return 'ООО "АРТ-ТРАНС"';
}

function installPageRequestCache(): void {
  if (!USE_PAGE_REQUEST_CACHE || window.location.hostname !== "eopp.epd-portal.ru") {
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    const data = event.data as InterceptorMessage;
    if (data?.source !== INTERCEPTOR_SOURCE || !data.id || !data.payload) {
      return;
    }

    if (data.kind === "reservationRaw") {
      cachedReservationRawById.set(data.id, data.payload as EoppReservationRaw);
    }
    if (data.kind === "facilityRaw") {
      cachedFacilityRawById.set(data.id, data.payload as EoppFacilityRaw);
    }
  });

  const injectScript = () => {
    const target = document.documentElement || document.head || document.body;
    if (!target) {
      console.warn("[EOPP Helper] cannot inject interceptor yet: no document target");
      return false;
    }

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-interceptor.js");
    script.onload = () => {
      script.remove();
    };
    script.onerror = (error) => {
      console.warn("[EOPP Helper] page interceptor script failed", error);
    };
    target.appendChild(script);
    return true;
  };

  if (!injectScript()) {
    window.addEventListener("DOMContentLoaded", injectScript, { once: true });
  }
}

async function fetchFacilityRaw(
  facilityId: string,
): Promise<EoppFacilityRaw | null> {
  if (!facilityId) return null;

  try {
    const response = await eoppFetch(
      `https://eopp.epd-portal.ru/facility/Facility/get-facility/${facilityId}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      console.warn("[EOPP Helper] Failed to fetch facility raw", {
        facilityId,
        status: response.status,
      });
      return null;
    }

    return (await response.json()) as EoppFacilityRaw;
  } catch (error) {
    console.warn("[EOPP Helper] Failed to fetch facility raw", error);
    return null;
  }
}

async function fetchReservationRaw(
  reservationId: string,
): Promise<EoppReservationRaw> {
  const cached = USE_PAGE_REQUEST_CACHE
    ? cachedReservationRawById.get(reservationId)
    : null;
  if (cached && cached.facilityId && cached.facilityId !== NULL_UUID) {
    return cached;
  }
  if (cached) {
    console.warn("[EOPP Helper] cached reservation has null facilityId, re-fetching", {
      reservationId,
      cachedFacilityId: cached.facilityId,
    });
  }

  const apiResponse = await eoppFetch(
    `https://eopp.epd-portal.ru/reservations-api/v1/${reservationId}`,
    {
      method: "GET",
    },
  );
  const fresh = (await apiResponse.json()) as EoppReservationRaw;
  cachedReservationRawById.set(reservationId, fresh);
  return fresh;
}

async function getFacilityRaw(
  facilityId: string,
): Promise<EoppFacilityRaw | null> {
  const cached = USE_PAGE_REQUEST_CACHE
    ? cachedFacilityRawById.get(facilityId)
    : null;
  if (cached) {
    return cached;
  }
  return fetchFacilityRaw(facilityId);
}

function injectButton(info: PageInfo): void {
  const btn = document.createElement("button");
  btn.textContent = "Помощник";
  btn.className = "cp-btn";

  btn.addEventListener("click", async () => {
    const actualInfo = shouldInject(window.location.href);
    if (!actualInfo) {
      alert("Не та страница");
      return;
    }

    let params: {
      facilityId: string;
      vehicleId: string;
      transportType: EoppTransportType;
    };
    let reservationRaw: EoppReservationRaw | null = null;
    let facilityRaw: EoppFacilityRaw | null = null;

    if (actualInfo.isLocalhost) {
      const testVariants: Record<number, { facilityId: string; vehicleId: string; transportType: EoppTransportType }> = {
        1: { facilityId: FACILITIES[0].id, vehicleId: "test-vehicle-1", transportType: EoppTransportType.Cargo },
        2: { facilityId: FACILITIES[0].id, vehicleId: "test-vehicle-2", transportType: EoppTransportType.Cargo },
        3: { facilityId: FACILITIES[0].id, vehicleId: "test-vehicle-3", transportType: EoppTransportType.Special },
        4: { facilityId: FACILITIES[0].id, vehicleId: "test-vehicle-4", transportType: EoppTransportType.Cargo },
      };
      params = actualInfo.variant
        ? testVariants[actualInfo.variant] || testVariants[1]
        : { facilityId: FACILITIES[0].id, vehicleId: "test-vehicle-id", transportType: EoppTransportType.Cargo };
      reservationRaw = {
        id: actualInfo.reservationId,
        reservationRequestCode: "TEST-001",
        facilityId: params.facilityId,
        userData: {
          userId: "test-user-id",
          fio: "Иванов Иван Иванович",
          organizationName: testCompanyName(),
          inn: "123456789012",
          orgInn: "1234567890",
          orgOgrn: "1234567890123",
          requesterType: "LEGAL",
        },
        vehicleData: [
          {
            vehicleId: params.vehicleId,
            vehicleTypeId: 1,
            vehicleType: "Truck",
            subTypeId: 1,
            subType: "Truck",
            regNumber: randomTestVehicleNumber(),
            status: 1,
            isArchive: false,
          },
        ],
        isSpecialCargo: params.transportType === EoppTransportType.Special,
        typeOfTransportation: params.transportType,
      };
      facilityRaw = {
        id: params.facilityId,
        name: testFacilityName(params.facilityId),
        mode: {
          facilityId: params.facilityId,
          modeType: 1,
        },
      };
    } else {
      const json = await fetchReservationRaw(actualInfo.reservationId);
      reservationRaw = json;
      const rawFacilityId = json.facilityId || "";
      const isNullFacility = !rawFacilityId || rawFacilityId === NULL_UUID;
      params = {
        facilityId: isNullFacility ? DEFAULT_FACILITY_ID : rawFacilityId,
        vehicleId: getPrimaryVehicleId(json, ""),
        transportType: EoppTransportType.Cargo,
      };
      if (isNullFacility) {
        console.warn("[EOPP Helper] facilityId is null/empty, using default", {
          reservationId: actualInfo.reservationId,
          rawFacilityId,
          fallback: DEFAULT_FACILITY_ID,
        });
      }
      facilityRaw = await getFacilityRaw(params.facilityId);
    }

    const savedApiKey = localStorage.getItem("_k") || "";

    const mode: "reschedule" | "create" =
      actualInfo.pageType === "edit" ? "create" : "reschedule";

    const defaultConfig: InjectorConfig = createDefaultConfig(
      actualInfo.reservationId,
      params.facilityId,
      params.vehicleId,
      params.transportType,
      mode,
    );
    const savedConfig = loadSavedConfig(actualInfo.reservationId);
    if (savedConfig) {
      Object.assign(defaultConfig, savedConfig);
    }
    if (actualInfo.isLocalhost && reservationRaw) {
      defaultConfig.vehicleId = params.vehicleId;
      defaultConfig.transportType = params.transportType;
    }
    defaultConfig.mode = mode;
    defaultConfig.apiKey = savedApiKey;
    defaultConfig.reservationData = reservationRaw
      ? { raw: reservationRaw, facilityRaw: facilityRaw || undefined }
      : null;

    useInjectorStore.setState({ config: defaultConfig });

    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);

    const style = document.createElement("style");
    style.textContent = cssContent;
    shadow.appendChild(style);

    const container = document.createElement("div");
    shadow.appendChild(container);

    const root = createRoot(container);
    root.render(
      <App
        onClose={() => {
          const state = useInjectorStore.getState();
          if (state.status === "running") {
            state.stopPipeline();
            return;
          }
          root.unmount();
          host.remove();
        }}
      />,
    );
  });

  if (info.isLocalhost) {
    document.body.appendChild(btn);
  } else {
    const selector =
      "body > app-root > div > div.page-wrapper.zit-scrollbar > app-reservations-list-page > div > form > div.page-controls";

    const waitForContainer = (): boolean => {
      const container = document.querySelector(selector);
      if (container) {
        container.appendChild(btn);
        return true;
      }
      return false;
    };

    if (!waitForContainer()) {
      const observer = new MutationObserver(() => {
        if (waitForContainer()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}

const info = shouldInject(window.location.href);
if (info) {
  installPageRequestCache();
  if (document.body) {
    injectButton(info);
  } else {
    window.addEventListener("DOMContentLoaded", () => injectButton(info), {
      once: true,
    });
  }
}
