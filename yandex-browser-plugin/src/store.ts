/**
 * EOPP Browser Extension - Zustand Store (Глобальное состояние)
 *
 * Хранит:
 * - config: текущая конфигурация инжектора
 * - status: статус (idle/running/scheduling/done/error)
 * - error: сообщение об ошибке
 * - result: результат выполнения pipeline
 * - scheduleTime / scheduledConfig: запланированный запуск
 * - logs: массив логов выполнения
 * - currentStage: текущая стадия pipeline
 * - showModal: видимость модального окна
 *
 * Методы:
 * - setConfig, setStatus, setError, setResult - сеттеры
 * - addLog - добавление лога
 * - startPipeline - запуск pipeline
 * - scheduleRun - планирование запуска
 *
 * Используется: всеми компонентами расширения
 */
import { create } from "zustand";
import type { InjectorConfig, PipelineStage, ApiKeyStatusResponse, TimeOrderPreset } from "@/types";

export type InjectorStatus =
  | "idle"
  | "running"
  | "scheduling"
  | "done"
  | "error";

type CollapsibleSection =
  | "slotRetry"
  | "retryGetAvailableSlots"
  | "retryGenerateCaptcha"
  | "retryValidateCaptcha"
  | "retrySubmitReschedule"
  | "retrySubmitCreate"
  | "mockResponses"
  | "reservationData";

interface InjectorState {
  config: InjectorConfig;
  status: InjectorStatus;
  error: string | null;
  result: unknown | null;
  scheduleTime: number | null;
  scheduledConfig: InjectorConfig | null;
  logs: Array<{ ts: string; msg: string }>;
  currentStage: PipelineStage | null;
  collapsedSections: Record<CollapsibleSection, boolean>;
  usageLogId: number | null;
  captchaId: string | null;
  solvedVariantIndex: number | null;
  captchaValidated: boolean | null;
  isFullscreen: boolean;
  authKey: string;
  authKeyStatus: ApiKeyStatusResponse | null;
  authLoading: boolean;
  authError: string;
  authChecking: boolean;
  timeOrderPresets: TimeOrderPreset[];
  activePresetId: string | null;

  setConfig: (config: InjectorConfig) => void;
  updateField: <K extends keyof InjectorConfig>(
    key: K,
    value: InjectorConfig[K],
  ) => void;
  updateRetryEndpoint: <E extends keyof InjectorConfig["retryPerEndpoint"]>(
    endpoint: E,
    field: keyof InjectorConfig["retryPerEndpoint"][E],
    value: InjectorConfig["retryPerEndpoint"][E][typeof field],
  ) => void;
  setStatus: (status: InjectorStatus) => void;
  setError: (error: string | null) => void;
  setResult: (result: unknown) => void;
  startSchedule: (time: number, config: InjectorConfig) => void;
  cancelSchedule: () => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
  setStage: (stage: PipelineStage | null) => void;
  toggleSection: (section: CollapsibleSection) => void;
  setUsageLogId: (id: number | null) => void;
  setCaptchaId: (id: string | null) => void;
  setSolvedVariantIndex: (idx: number | null) => void;
  setCaptchaValidated: (val: boolean | null) => void;
  toggleFullscreen: () => void;
  reset: () => void;
  setAuthKey: (key: string) => void;
  clearAuthKey: () => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string) => void;
  saveTimeOrderPreset: (name: string) => string;
  loadTimeOrderPreset: (id: string) => void;
  deleteTimeOrderPreset: (id: string) => void;
  clearActivePreset: () => void;
}

const defaultCollapsed: Record<CollapsibleSection, boolean> = {
  slotRetry: true,
  retryGetAvailableSlots: true,
  retryGenerateCaptcha: true,
  retryValidateCaptcha: true,
  retrySubmitReschedule: true,
  retrySubmitCreate: true,
  mockResponses: true,
  reservationData: true,
};

export const useInjectorStore = create<InjectorState>((set, get) => ({
  config: {} as InjectorConfig,
  status: "idle",
  error: null,
  result: null,
  scheduleTime: null,
  scheduledConfig: null,
  logs: [],
  currentStage: null,
  collapsedSections: defaultCollapsed,
  usageLogId: null,
  captchaId: null,
  solvedVariantIndex: null,
  captchaValidated: null,
  isFullscreen: (() => {
    const saved = localStorage.getItem("_fs");
    return saved === null ? true : saved === "true";
  })(),
  authKey: (() => {
    const api = localStorage.getItem("_k");
    if (api) return api;
    const auth = localStorage.getItem("_a");
    if (auth) {
      localStorage.setItem("_k", auth);
      localStorage.removeItem("_a");
      return auth;
    }
    return "";
  })(),
  authKeyStatus: null,
  authLoading: false,
  authError: "",
  authChecking: false,
  timeOrderPresets: (() => {
    try {
      const saved = localStorage.getItem("_top");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })(),
  activePresetId: null,

  setConfig: (config) => set({ config }),
  updateField: (key, value) =>
    set((state) => {
      const newConfig = { ...state.config, [key]: value };
      if (newConfig.reservationId) {
        const { mode: _, ...toSave } = newConfig;
        try {
          localStorage.setItem(
            `_c_${newConfig.reservationId}`,
            JSON.stringify(toSave),
          );
        } catch {}
      }
      return { config: newConfig };
    }),
  updateRetryEndpoint: (endpoint, field, value) =>
    set((state) => {
      const newConfig: InjectorConfig = {
        ...state.config,
        retryPerEndpoint: {
          ...state.config.retryPerEndpoint,
          [endpoint]: {
            ...state.config.retryPerEndpoint[endpoint],
            [field]: value,
          },
        },
      };
      if (newConfig.reservationId) {
        const { mode: _, ...toSave } = newConfig;
        try {
          localStorage.setItem(
            `_c_${newConfig.reservationId}`,
            JSON.stringify(toSave),
          );
        } catch {}
      }
      return { config: newConfig };
    }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setResult: (result) => set({ result }),
  startSchedule: (time, config) =>
    set({ status: "scheduling", scheduleTime: time, scheduledConfig: config }),
  cancelSchedule: () =>
    set({ status: "idle", scheduleTime: null, scheduledConfig: null }),
  addLog: (msg) =>
    set((state) => ({
      logs: [
        ...state.logs,
        { ts: new Date().toISOString().slice(11, 21), msg },
      ],
    })),
  clearLogs: () => set({ logs: [] }),
  setStage: (stage) => set({ currentStage: stage }),
  toggleSection: (section) =>
    set((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [section]: !state.collapsedSections[section],
      },
    })),
  setUsageLogId: (id) => set({ usageLogId: id }),
  setCaptchaId: (id) => set({ captchaId: id }),
  setSolvedVariantIndex: (idx) => set({ solvedVariantIndex: idx }),
  setCaptchaValidated: (val) => set({ captchaValidated: val }),
  toggleFullscreen: () =>
    set((state) => {
      const next = !state.isFullscreen;
      localStorage.setItem("_fs", String(next));
      return { isFullscreen: next };
    }),
  reset: () =>
    set({
      status: "idle",
      error: null,
      result: null,
      scheduleTime: null,
      scheduledConfig: null,
      logs: [],
      currentStage: null,
      usageLogId: null,
      captchaId: null,
      solvedVariantIndex: null,
      captchaValidated: null,
    }),
  setAuthKey: (key) => {
    localStorage.setItem("_k", key);
    set({ authKey: key, authError: "" });
  },
  setAuthKeyStatus: (status) => set({ authKeyStatus: status }),
  clearAuthKey: () => {
    localStorage.removeItem("_k");
    set({ authKey: "", authKeyStatus: null, authError: "" });
  },
  setAuthLoading: (loading) => set({ authLoading: loading, authError: "" }),
  setAuthError: (error) => set({ authError: error, authLoading: false }),
  setAuthChecking: (checking) => set({ authChecking: checking }),
  saveTimeOrderPreset: (name: string) => {
    const { config } = get();
    const id = `preset_${Date.now()}`;
    const preset: TimeOrderPreset = {
      id,
      name,
      timeOrder: config.timeOrder || [[]],
      preferredMode: config.preferredMode || "soft",
    };
    set((state) => {
      const next = [...state.timeOrderPresets, preset];
      localStorage.setItem("_top", JSON.stringify(next));
      return { timeOrderPresets: next, activePresetId: id };
    });
    return id;
  },
  loadTimeOrderPreset: (id: string) => {
    const { timeOrderPresets } = get();
    const preset = timeOrderPresets.find((p) => p.id === id);
    if (preset) {
      set((state) => {
        const nextConfig = {
          ...state.config,
          timeOrder: preset.timeOrder,
          preferredMode: preset.preferredMode,
        };
        return { config: nextConfig, activePresetId: id };
      });
    }
  },
  deleteTimeOrderPreset: (id: string) => {
    set((state) => {
      const next = state.timeOrderPresets.filter((p) => p.id !== id);
      localStorage.setItem("_top", JSON.stringify(next));
      return {
        timeOrderPresets: next,
        activePresetId: state.activePresetId === id ? null : state.activePresetId,
      };
    });
  },
  clearActivePreset: () => {
    set({ activePresetId: null });
  },
}));
