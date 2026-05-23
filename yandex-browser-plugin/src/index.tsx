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
  if (cached) {
    return cached;
  }

  const apiResponse = await eoppFetch(
    `https://eopp.epd-portal.ru/reservations-api/v1/${reservationId}`,
    {
      method: "GET",
    },
  );
  return (await apiResponse.json()) as EoppReservationRaw;
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
    } else {
      const json = await fetchReservationRaw(actualInfo.reservationId);
      reservationRaw = json;
      params = {
        facilityId: json.facilityId || "",
        vehicleId: getPrimaryVehicleId(json, ""),
        transportType: EoppTransportType.Cargo,
      };
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
