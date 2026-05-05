import { create } from 'zustand';
import type { InjectorConfig, PipelineStage, QueueItemState } from '@/types';

export type InjectorStatus = 'idle' | 'running' | 'scheduling' | 'done' | 'error';

type CollapsibleSection = 'slotRetry' | 'slotCoordination' | 'retryGetAvailableSlots' | 'retryGenerateCaptcha' | 'retryValidateCaptcha' | 'retrySubmitReschedule' | 'retrySubmitCreate' | 'retryMode' | 'mockResponses';

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
  queueItems: QueueItemState[] | null;
  queueIndex: number | null;
  role: 'master' | 'slave' | null;
  consumerId: number | null;
  totalConsumers: number | null;
  isFullscreen: boolean;
  authKey: string;
  authLoading: boolean;
  authError: string;

  setConfig: (config: InjectorConfig) => void;
  updateField: <K extends keyof InjectorConfig>(key: K, value: InjectorConfig[K]) => void;
  updateRetryEndpoint: <E extends keyof InjectorConfig['retryPerEndpoint']>(endpoint: E, field: keyof InjectorConfig['retryPerEndpoint'][E], value: InjectorConfig['retryPerEndpoint'][E][typeof field]) => void;
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
  setQueueItems: (items: QueueItemState[] | null) => void;
  setQueueIndex: (idx: number | null) => void;
  updateQueueItemStatus: (idx: number, status: QueueItemState['status'], error?: string) => void;
  setRole: (role: 'master' | 'slave' | null) => void;
  setConsumerId: (id: number | null) => void;
  setTotalConsumers: (n: number | null) => void;
  toggleFullscreen: () => void;
  reset: () => void;
  setAuthKey: (key: string) => void;
  clearAuthKey: () => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string) => void;
}

const defaultCollapsed: Record<CollapsibleSection, boolean> = {
  slotRetry: true,
  retryGetAvailableSlots: true,
  retryGenerateCaptcha: true,
  retryValidateCaptcha: true,
  retrySubmitReschedule: true,
  retrySubmitCreate: true,
  retryMode: true,
  mockResponses: true,
};

export const useInjectorStore = create<InjectorState>((set, get) => ({
  config: {} as InjectorConfig,
  status: 'idle',
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
  queueItems: null,
  queueIndex: null,
  role: null,
  consumerId: null,
  totalConsumers: null,
  isFullscreen: (() => {
    const saved = localStorage.getItem('injector_fullscreen');
    return saved === null ? true : saved === 'true';
  })(),
  authKey: (() => {
    const api = localStorage.getItem('injector_api_key');
    if (api) return api;
    const auth = localStorage.getItem('injector_auth_key');
    if (auth) {
      localStorage.setItem('injector_api_key', auth);
      localStorage.removeItem('injector_auth_key');
      return auth;
    }
    return '';
  })(),
  authLoading: false,
  authError: '',

  setConfig: (config) => set({ config }),
  updateField: (key, value) => set((state) => {
    const newConfig = { ...state.config, [key]: value };
    if (newConfig.reservationId) {
      const { mode: _, ...toSave } = newConfig;
      try { localStorage.setItem(`injector_config_${newConfig.reservationId}`, JSON.stringify(toSave)); } catch {}
    }
    return { config: newConfig };
  }),
  updateRetryEndpoint: (endpoint, field, value) => set((state) => {
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
      try { localStorage.setItem(`injector_config_${newConfig.reservationId}`, JSON.stringify(toSave)); } catch {}
    }
    return { config: newConfig };
  }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setResult: (result) => set({ result }),
  startSchedule: (time, config) => set({ status: 'scheduling', scheduleTime: time, scheduledConfig: config }),
  cancelSchedule: () => set({ status: 'idle', scheduleTime: null, scheduledConfig: null }),
  addLog: (msg) => set((state) => ({
    logs: [...state.logs, { ts: new Date().toISOString().slice(11, 21), msg }],
  })),
  clearLogs: () => set({ logs: [] }),
  setStage: (stage) => set({ currentStage: stage }),
  toggleSection: (section) => set((state) => ({
    collapsedSections: { ...state.collapsedSections, [section]: !state.collapsedSections[section] },
  })),
  setUsageLogId: (id) => set({ usageLogId: id }),
  setCaptchaId: (id) => set({ captchaId: id }),
  setSolvedVariantIndex: (idx) => set({ solvedVariantIndex: idx }),
  setCaptchaValidated: (val) => set({ captchaValidated: val }),
  setQueueItems: (items) => set({ queueItems: items }),
  setQueueIndex: (idx) => set({ queueIndex: idx }),
  setRole: (role) => set({ role }),
  setConsumerId: (id) => set({ consumerId: id }),
  setTotalConsumers: (n) => set({ totalConsumers: n }),
  updateQueueItemStatus: (idx, status, error) => set((state) => {
    if (!state.queueItems) return { queueIndex: null };
    const updated = state.queueItems.map((item, i) => i === idx ? { ...item, status, error } : item);
    return { queueItems: updated, queueIndex: idx + 1 < updated.length ? idx + 1 : null };
  }),
  toggleFullscreen: () => set((state) => {
    const next = !state.isFullscreen;
    localStorage.setItem('injector_fullscreen', String(next));
    return { isFullscreen: next };
  }),
  reset: () => set({ status: 'idle', error: null, result: null, scheduleTime: null, scheduledConfig: null, logs: [], currentStage: null, usageLogId: null, captchaId: null, solvedVariantIndex: null, captchaValidated: null, queueItems: null, queueIndex: null, role: null, consumerId: null, totalConsumers: null }),
  setAuthKey: (key) => {
    localStorage.setItem('injector_api_key', key);
    set({ authKey: key, authError: '' });
  },
  clearAuthKey: () => {
    localStorage.removeItem('injector_api_key');
    set({ authKey: '', authError: '' });
  },
  setAuthLoading: (loading) => set({ authLoading: loading, authError: '' }),
  setAuthError: (error) => set({ authError: error, authLoading: false }),
}));
