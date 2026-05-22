import React, { useEffect, useState } from "react";
import type { InjectorConfig } from "@/types";
import { useInjectorStore } from "@/store";
import { getServerUrl } from "@/api/background";
import {
  FACILITIES,
  getDefaultSlotDate,
  createDefaultConfig,
} from "@/constants";
import TimeOrderPanel from "./TimeOrderPanel";

const TRANSPORT_TYPE_LABELS: Record<InjectorConfig["transportType"], string> = {
  1: "Cargo",
  2: "TSO",
  3: "Special",
  4: "TSO Special",
};

const RUN_UP_TO_LABELS: Record<number, string> = {
  1: "Слоты",
  2: "Капча",
  3: "Решение",
  4: "Валидация",
  5: "Отправка",
};

function shortId(value?: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

const MOCK_ENDPOINTS: {
  path: string;
  label: string;
  extraModes: MockMode[];
}[] = [
  {
    path: "/reservations-api/v1/timeslot/AvailableSlots",
    label: "GET /AvailableSlots",
    extraModes: ["all_occupied"],
  },
  {
    path: "/reservations-api/v1/captcha",
    label: "POST /captcha",
    extraModes: [],
  },
  {
    path: "/reservations-api/v1/captcha-validate",
    label: "POST /captcha-validate",
    extraModes: [],
  },
  {
    path: "/reservations-api/v1/Reschedule",
    label: "POST /Reschedule",
    extraModes: ["all_slots_occupied"],
  },
  {
    path: "/reservations-api/v1/SubmitDraft",
    label: "POST /SubmitDraft",
    extraModes: ["all_slots_occupied"],
  },
];

const MODE_LABELS: Record<string, string> = {
  success: "Успех",
  "429": "429 Лимит",
  "400": "400 Ошибка",
  all_occupied: "Все слоты заняты",
  all_slots_occupied: "Все слоты заняты (интервал)",
};

type MockMode =
  | "success"
  | "429"
  | "400"
  | "all_occupied"
  | "all_slots_occupied";

interface MockEndpointConfig {
  mode: MockMode;
}

interface MockEndpointConfigNew {
  responses: MockMode[];
}

const ENDPOINT_LABELS: Record<
  keyof InjectorConfig["retryPerEndpoint"],
  string
> = {
  getAvailableSlots: "Получение слотов",
  generateCaptcha: "Генерация капчи",
  validateCaptcha: "Валидация капчи",
  submitReschedule: "Перезапись",
  submitCreate: "Создание",
};

const ENDPOINT_SECTIONS: Record<
  keyof InjectorConfig["retryPerEndpoint"],
  | "retryGetAvailableSlots"
  | "retryGenerateCaptcha"
  | "retryValidateCaptcha"
  | "retrySubmitReschedule"
  | "retrySubmitCreate"
> = {
  getAvailableSlots: "retryGetAvailableSlots",
  generateCaptcha: "retryGenerateCaptcha",
  validateCaptcha: "retryValidateCaptcha",
  submitReschedule: "retrySubmitReschedule",
  submitCreate: "retrySubmitCreate",
};

const RetryEndpointRow = React.memo(function RetryEndpointRow({
  endpoint,
}: {
  endpoint: keyof InjectorConfig["retryPerEndpoint"];
}) {
  const config = useInjectorStore((s) => s.config);
  const updateRetryEndpoint = useInjectorStore((s) => s.updateRetryEndpoint);
  const collapsed = useInjectorStore((s) => s.collapsedSections);
  const toggleSection = useInjectorStore((s) => s.toggleSection);
  const sectionKey = ENDPOINT_SECTIONS[endpoint];
  const rc = config.retryPerEndpoint[endpoint];
  const isSlots = endpoint === "getAvailableSlots";
  const isValidate = endpoint === "validateCaptcha";

  return (
    <div className="qn-form-section">
      <h3
        className="qn-section-title qn-collapsible"
        onClick={() => toggleSection(sectionKey)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <span className="qn-collapse-icon">
          {collapsed[sectionKey] ? "▶" : "▼"}
        </span>{" "}
        Ретрай: {ENDPOINT_LABELS[endpoint]}
      </h3>
      {!collapsed[sectionKey] && (
        <>
          <label className="qn-form-label qn-checkbox-label">
            <input
              type="checkbox"
              checked={rc.enabled}
              onChange={(e) =>
                updateRetryEndpoint(endpoint, "enabled", e.target.checked)
              }
            />
            Ретрай 429 — включён
          </label>
          <div className="qn-form-row">
            <label className="qn-form-label">
              Макс. попыток
              <input
                className="qn-form-input qn-form-number"
                type="number"
                min={0}
                value={rc.maxRetries}
                onChange={(e) =>
                  updateRetryEndpoint(
                    endpoint,
                    "maxRetries",
                    Number(e.target.value),
                  )
                }
                disabled={!rc.enabled}
              />
            </label>
            <label className="qn-form-label">
              Задержка (мс)
              <input
                className="qn-form-input qn-form-number"
                type="number"
                min={0}
                value={rc.delayMs}
                onChange={(e) =>
                  updateRetryEndpoint(
                    endpoint,
                    "delayMs",
                    Number(e.target.value),
                  )
                }
                disabled={!rc.enabled}
              />
            </label>
          </div>
          {isSlots && (
            <>
              <label className="qn-form-label qn-checkbox-label">
                <input
                  type="checkbox"
                  checked={rc.retry400Enabled}
                  onChange={(e) =>
                    updateRetryEndpoint(
                      endpoint,
                      "retry400Enabled",
                      e.target.checked,
                    )
                  }
                />
                Ретрай 400 — включён
              </label>
              <div className="qn-form-row">
                <label className="qn-form-label">
                  Макс. попыток
                  <input
                    className="qn-form-input qn-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400MaxRetries}
                    onChange={(e) =>
                      updateRetryEndpoint(
                        endpoint,
                        "retry400MaxRetries",
                        Number(e.target.value),
                      )
                    }
                    disabled={!rc.retry400Enabled}
                  />
                </label>
                <label className="qn-form-label">
                  Задержка (мс)
                  <input
                    className="qn-form-input qn-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400DelayMs}
                    onChange={(e) =>
                      updateRetryEndpoint(
                        endpoint,
                        "retry400DelayMs",
                        Number(e.target.value),
                      )
                    }
                    disabled={!rc.retry400Enabled}
                  />
                </label>
              </div>
            </>
          )}
          {isValidate && (
            <>
              <label className="qn-form-label qn-checkbox-label">
                <input
                  type="checkbox"
                  checked={rc.retry400Enabled}
                  onChange={(e) =>
                    updateRetryEndpoint(
                      endpoint,
                      "retry400Enabled",
                      e.target.checked,
                    )
                  }
                />
                Не верная капча или не получили ответ
              </label>
              <div className="qn-form-row">
                <label className="qn-form-label">
                  Макс. попыток
                  <input
                    className="qn-form-input qn-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400MaxRetries}
                    onChange={(e) =>
                      updateRetryEndpoint(
                        endpoint,
                        "retry400MaxRetries",
                        Number(e.target.value),
                      )
                    }
                    disabled={!rc.retry400Enabled}
                  />
                </label>
                <label className="qn-form-label">
                  Задержка (мс)
                  <input
                    className="qn-form-input qn-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400DelayMs}
                    onChange={(e) =>
                      updateRetryEndpoint(
                        endpoint,
                        "retry400DelayMs",
                        Number(e.target.value),
                      )
                    }
                    disabled={!rc.retry400Enabled}
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
});

const ConfigForm = React.memo(function ConfigForm() {
  const config = useInjectorStore((s) => s.config);
  const updateField = useInjectorStore((s) => s.updateField);
  const setConfig = useInjectorStore((s) => s.setConfig);
  const collapsed = useInjectorStore((s) => s.collapsedSections);
  const toggleSection = useInjectorStore((s) => s.toggleSection);
  const [mockConfig, setMockConfig] = useState<Record<string, MockMode[]>>({});
  const [mockLoading, setMockLoading] = useState(false);
  const [mockSending, setMockSending] = useState(false);

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const reservationRaw = config.reservationData?.raw;
  const facilityRaw = config.reservationData?.facilityRaw;
  const truck = reservationRaw?.vehicleData?.find((v) => v.subTypeId === 1);
  const facilityName = facilityRaw?.name || config.facilityId;
  const transportLabel = TRANSPORT_TYPE_LABELS[config.transportType];
  const modeLabel = config.mode === "create" ? "Создание" : "Перенос";
  const solveModeLabel = config.autoSolve ? "Авто-капча" : "Ручная капча";
  const sharedSlotsLabel = config.sharedSlotsEnabled
    ? "Общие слоты"
    : "Прямой запрос";
  const runUpToLabel =
    RUN_UP_TO_LABELS[config.runUpTo] || `Этап ${config.runUpTo}`;

  function handleChange<K extends keyof InjectorConfig>(
    key: K,
    value: InjectorConfig[K],
  ) {
    updateField(key, value);
  }

  useEffect(() => {
    const savedMode = localStorage.getItem("_m");
    if (savedMode && savedMode !== config.mode) {
      handleChange("slotDate", getDefaultSlotDate(config.mode));
    }
    localStorage.setItem("_m", config.mode);
  }, [config.mode]);

  // Load mock config on mount (localhost only)
  useEffect(() => {
    if (!isLocalhost) return;
    setMockLoading(true);
    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/mock-config`, { method: "GET" })
      .then((r) => r.json())
      .then((data) => {
        const parsed: Record<string, MockMode[]> = {};
        if (data.endpoints) {
          for (const [path, cfg] of Object.entries(data.endpoints)) {
            const cfgObj = cfg as MockEndpointConfigNew;
            if (cfgObj.responses && cfgObj.responses.length > 0) {
              parsed[path] = cfgObj.responses;
            } else {
              parsed[path] = ["success"];
            }
          }
        }
        setMockConfig(parsed);
      })
      .catch(() => {
        setMockConfig({});
      })
      .finally(() => {
        setMockLoading(false);
      });
  }, [isLocalhost]);

  const updateMockMode = (
    endpointPath: string,
    attemptIndex: number,
    mode: MockMode,
  ) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ["success"];
      const updated = [...current];
      updated[attemptIndex] = mode;
      return { ...prev, [endpointPath]: updated };
    });
  };

  const addMockAttempt = (endpointPath: string) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ["success"];
      return { ...prev, [endpointPath]: [...current, "success"] };
    });
  };

  const removeMockAttempt = (endpointPath: string, attemptIndex: number) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ["success"];
      if (current.length <= 1) return prev;
      const updated = current.filter((_, i) => i !== attemptIndex);
      return { ...prev, [endpointPath]: updated };
    });
  };

  const sendMockConfig = () => {
    if (!isLocalhost) return;
    setMockSending(true);
    const serverUrl = getServerUrl();
    const endpoints: Record<string, MockEndpointConfigNew> = {};
    for (const [path, responses] of Object.entries(mockConfig)) {
      if (responses.length > 0 && !responses.every((m) => m === "success")) {
        endpoints[path] = { responses };
      }
    }
    fetch(`${serverUrl}/mock-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoints }),
    })
      .then((r) => r.json())
      .then(() => {
        console.log("[ConfigForm] Mock config sent:", endpoints);
      })
      .catch((err) => {
        console.error("[ConfigForm] Failed to send mock config:", err);
      })
      .finally(() => {
        setMockSending(false);
      });
  };

  const resetToDefaults = () => {
    if (!confirm("Сбросить все настройки к значениям по умолчанию?")) return;
    localStorage.removeItem(`_c_${config.reservationId}`);
    const fresh = createDefaultConfig(
      config.reservationId,
      config.facilityId,
      config.vehicleId,
      config.transportType,
    );
    setConfig(fresh);
  };

  const resetMockConfig = () => {
    if (!isLocalhost) return;
    setMockSending(true);
    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/mock-config`, {
      method: "DELETE",
    })
      .then(() => {
        setMockConfig({});
      })
      .catch(() => {})
      .finally(() => {
        setMockSending(false);
      });
  };

  return (
    <div className="qn-config-form">
      <div
        className="qn-form-section qn-fullscreen-wide"
        style={{ gridColumn: "1 / -1" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h3 className="qn-section-title" style={{ marginBottom: 0 }}>
            Общие настройки
          </h3>
          <button
            className="qn-reset-icon-btn"
            onClick={resetToDefaults}
            title="Сбросить настройки"
          >
            ↺
          </button>
        </div>
        <div className="qn-form-row">
          <label className="qn-form-label">
            Режим
            <select
              id="mode-select"
              className="qn-form-input"
              value={config.mode}
              onChange={(e) =>
                handleChange("mode", e.target.value as InjectorConfig["mode"])
              }
            >
              <option value="reschedule">Перенос брони</option>
              <option value="create">Создание брони</option>
            </select>
          </label>
          <label className="qn-form-label">
            Дата пропуска
            <input
              id="slotDate-input"
              className="qn-form-input"
              type="date"
              value={config.slotDate}
              onChange={(e) => handleChange("slotDate", e.target.value)}
            />
          </label>
        </div>
        <div className="qn-quick-chips">
          <span className="qn-quick-chip">{modeLabel}</span>
          <span className="qn-quick-chip">{solveModeLabel}</span>
          <span
            className={`qn-quick-chip ${
              config.sharedSlotsEnabled ? "qn-quick-chip-active" : ""
            }`}
          >
            {sharedSlotsLabel}
          </span>
          <span className="qn-quick-chip">До: {runUpToLabel}</span>
        </div>
        <div className="qn-nested-section">
          <h3
            className="qn-section-title qn-collapsible"
            onClick={() => toggleSection("advancedMain")}
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            <span className="qn-collapse-icon">
              {collapsed.advancedMain ? "▶" : "▼"}
            </span>{" "}
            Расширенные настройки запуска
          </h3>
          {!collapsed.advancedMain && (
            <div className="qn-form-row">
              <label className="qn-form-label">
                Остановиться на этапе
                <select
                  id="runUpTo-select"
                  className="qn-form-input"
                  value={config.runUpTo}
                  onChange={(e) =>
                    handleChange("runUpTo", Number(e.target.value))
                  }
                >
                  <option value="1">1 — слоты</option>
                  <option value="2">2 — капча</option>
                  <option value="3">3 — решение капчи</option>
                  <option value="4">4 — валидация</option>
                  <option value="5">5 — отправка</option>
                </select>
              </label>
              <label className="qn-form-label qn-checkbox-label">
                <input
                  id="autoSolve-checkbox"
                  type="checkbox"
                  checked={config.autoSolve}
                  onChange={(e) => handleChange("autoSolve", e.target.checked)}
                />
                Авто-решение капчи
              </label>
            </div>
          )}
        </div>
      </div>

      <div
        className="qn-form-section qn-fullscreen-wide"
        style={{ gridColumn: "1 / -1" }}
      >
        <h3 className="qn-section-title">Данные запроса</h3>
        <div className="qn-request-summary">
          <div className="qn-summary-item">
            <span className="qn-summary-label">Бронь</span>
            <span className="qn-summary-value" title={config.reservationId}>
              {reservationRaw?.reservationRequestCode || shortId(config.reservationId)}
            </span>
          </div>
          <div className="qn-summary-item qn-summary-item-wide">
            <span className="qn-summary-label">АПП</span>
            <span className="qn-summary-value" title={config.facilityId}>
              {facilityName}
            </span>
          </div>
          <div className="qn-summary-item">
            <span className="qn-summary-label">Тягач</span>
            <span className="qn-summary-value" title={config.vehicleId}>
              {truck?.regNumber || shortId(config.vehicleId)}
            </span>
          </div>
          <div className="qn-summary-item">
            <span className="qn-summary-label">Тип</span>
            <span className="qn-summary-value">{transportLabel}</span>
          </div>
          <div className="qn-summary-item">
            <span className="qn-summary-label">Режим АПП</span>
            <span className="qn-summary-value">
              {facilityRaw?.mode?.modeType ?? "-"}
            </span>
          </div>
        </div>
        <div className="qn-form-row" style={{ display: "none" }}>
          <label className="qn-form-label">
            ID бронирования
            <span className="qn-form-text qn-form-readonly">
              {config.reservationId}
            </span>
          </label>
          <label className="qn-form-label">
            ID транспортного средства
            <input
              id="vehicleId-input"
              className="qn-form-input qn-form-text"
              type="text"
              value={config.vehicleId}
              onChange={(e) => handleChange("vehicleId", e.target.value)}
            />
          </label>
        </div>
        <div className="qn-form-row" style={{ display: "none" }}>
          <label className="qn-form-label">
            Вид перевозки
            <select
              id="transportType-select"
              className="qn-form-input"
              value={config.transportType}
              onChange={(e) =>
                handleChange(
                  "transportType",
                  Number(e.target.value) as InjectorConfig["transportType"],
                )
              }
            >
              <option value="1">Экспорт</option>
              <option value="2">Транзит</option>
            </select>
          </label>
          <label className="qn-form-label">
            Пропускной пункт (АПП)
            <select
              id="facilityId-select"
              className="qn-form-input"
              value={config.facilityId}
              onChange={(e) => handleChange("facilityId", e.target.value)}
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TimeOrderPanel />
      </div>

      <div className="qn-form-section">
        <h3
          className="qn-section-title qn-collapsible"
          onClick={() => toggleSection("reservationData")}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <span className="qn-collapse-icon">
            {collapsed.reservationData ? "▶" : "▼"}
          </span>{" "}
          Данные бронирования
        </h3>
        {!collapsed.reservationData && (
          <div className="qn-reservation-data">
            {config.reservationData?.raw ? (
              <pre className="qn-reservation-raw">
                {JSON.stringify(config.reservationData.raw, null, 2)}
              </pre>
            ) : (
              <div style={{ color: "#999", fontSize: "12px" }}>
                Данные не загружены
              </div>
            )}
          </div>
        )}
      </div>

      <div className="qn-form-section">
        <h3
          className="qn-section-title qn-collapsible"
          onClick={() => toggleSection("slotRetry")}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <span className="qn-collapse-icon">
            {collapsed.slotRetry ? "▶" : "▼"}
          </span>{" "}
          Повтор при занятых слотах
        </h3>
        {!collapsed.slotRetry && (
          <>
            <label className="qn-form-label qn-checkbox-label">
              <input
                id="retry-slots-enabled"
                type="checkbox"
                checked={config.retryOnAllSlotsOccupied}
                onChange={(e) =>
                  handleChange("retryOnAllSlotsOccupied", e.target.checked)
                }
              />
              Пробовать другой слот при занятости
            </label>
            <div className="qn-form-row">
              <label className="qn-form-label">
                Макс. попыток
                <input
                  id="retry-slots-maxRetries"
                  className="qn-form-input qn-form-number"
                  type="number"
                  value={config.maxSlotRetries}
                  onChange={(e) =>
                    handleChange("maxSlotRetries", Number(e.target.value))
                  }
                />
              </label>
              <label className="qn-form-label">
                Задержка (мс)
                <input
                  id="retry-slots-delayMs"
                  className="qn-form-input qn-form-number"
                  type="number"
                  value={config.slotRetryDelayMs}
                  onChange={(e) =>
                    handleChange("slotRetryDelayMs", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </>
        )}
      </div>

      <div className="qn-form-section">
        <h3
          className="qn-section-title qn-collapsible"
          onClick={() => toggleSection("sharedSlots")}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <span className="qn-collapse-icon">
            {collapsed.sharedSlots ? "▶" : "▼"}
          </span>{" "}
          Общие слоты
        </h3>
        {!collapsed.sharedSlots && (
          <>
            <label className="qn-form-label qn-checkbox-label">
              <input
                id="shared-slots-enabled"
                type="checkbox"
                checked={config.sharedSlotsEnabled || false}
                onChange={(e) =>
                  handleChange("sharedSlotsEnabled", e.target.checked)
                }
              />
              Получать слоты через группу клиентов
            </label>
            <div className="qn-form-row">
              <label className="qn-form-label">
                Ожидание мастера (мс)
                <input
                  id="shared-slots-wait-ms"
                  className="qn-form-input qn-form-number"
                  type="number"
                  min={0}
                  max={5000}
                  value={config.sharedSlotsWaitMs || 1600}
                  onChange={(e) =>
                    handleChange("sharedSlotsWaitMs", Number(e.target.value))
                  }
                  disabled={!config.sharedSlotsEnabled}
                />
              </label>
            </div>
            <div className="qn-help-text">
              Первый клиент с теми же параметрами запроса забирает слоты с EOPP
              и публикует их на сервере. Остальные ждут ответ и продолжают
              pipeline без своего запроса к EOPP.
            </div>
          </>
        )}
      </div>

      {(
        Object.keys(ENDPOINT_LABELS) as Array<
          keyof InjectorConfig["retryPerEndpoint"]
        >
      ).map((ep) => (
        <RetryEndpointRow key={ep} endpoint={ep} />
      ))}

      {/* Mock responses section (localhost only) */}
      {isLocalhost && (
        <div
          className="qn-form-section qn-fullscreen-wide"
          style={{ gridColumn: "1 / -1" }}
        >
          <h3
            className="qn-section-title qn-collapsible"
            onClick={() => toggleSection("mockResponses")}
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            <span className="qn-collapse-icon">
              {collapsed.mockResponses ? "▶" : "▼"}
            </span>{" "}
            Тестовые ответы
          </h3>
          {!collapsed.mockResponses && (
            <>
              {mockLoading ? (
                <div style={{ padding: "8px", color: "#999" }}>Загрузка...</div>
              ) : (
                <>
                  {MOCK_ENDPOINTS.map((ep) => {
                    const responses = mockConfig[ep.path] || ["success"];
                    return (
                      <div key={ep.path} style={{ marginBottom: "10px" }}>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            marginBottom: "4px",
                            display: "flex",
                            justifyContent: "space",
                            alignItems: "center",
                          }}
                        >
                          <span>{ep.label}</span>
                          <button
                            className="qn-mock-btn qn-mock-btn-add"
                            onClick={() => addMockAttempt(ep.path)}
                          >
                            + попытка
                          </button>
                        </div>
                        <div className="qn-mock-attempts">
                          {responses.map((mode, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                gap: "4px",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "10px",
                                  color: "#666",
                                  minWidth: "50px",
                                }}
                              >
                                #{idx + 1}
                              </span>
                              <select
                                id={`mock-${ep.path.replace(/\//g, "-").replace(/^\-/, "")}-attempt-${idx}`}
                                className="qn-form-input"
                                value={mode}
                                onChange={(e) =>
                                  updateMockMode(
                                    ep.path,
                                    idx,
                                    e.target.value as MockMode,
                                  )
                                }
                                style={{ minWidth: "140px" }}
                              >
                                <option value="success">
                                  {MODE_LABELS.success}
                                </option>
                                <option value="429">
                                  {MODE_LABELS["429"]}
                                </option>
                                <option value="400">
                                  {MODE_LABELS["400"]}
                                </option>
                                {ep.extraModes.includes("all_occupied") && (
                                  <option value="all_occupied">
                                    {MODE_LABELS.all_occupied}
                                  </option>
                                )}
                                {ep.extraModes.includes(
                                  "all_slots_occupied",
                                ) && (
                                  <option value="all_slots_occupied">
                                    {MODE_LABELS.all_slots_occupied}
                                  </option>
                                )}
                              </select>
                              {responses.length > 1 && (
                                <button
                                  className="qn-mock-btn qn-mock-btn-remove"
                                  onClick={() =>
                                    removeMockAttempt(ep.path, idx)
                                  }
                                  title="Удалить попытку"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div
                    style={{ display: "flex", gap: "8px", marginTop: "8px" }}
                  >
                    <button
                      className="qn-mock-btn qn-mock-btn-apply"
                      onClick={sendMockConfig}
                      disabled={mockSending}
                      style={{ flex: 1 }}
                    >
                      {mockSending ? "Отправка..." : "Применить"}
                    </button>
                    <button
                      className="qn-mock-btn qn-mock-btn-reset"
                      onClick={resetMockConfig}
                      disabled={mockSending}
                      style={{ flex: 1 }}
                    >
                      Сбросить
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default ConfigForm;
