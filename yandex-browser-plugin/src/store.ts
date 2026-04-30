import { create } from 'zustand';
import type { InjectorConfig, PipelineStage } from '@/types';

export type InjectorStatus = 'idle' | 'running' | 'scheduling' | 'done' | 'error';

interface InjectorState {
  config: InjectorConfig;
  status: InjectorStatus;
  error: string | null;
  result: unknown | null;
  scheduleTime: number | null;
  scheduledConfig: InjectorConfig | null;
  logs: Array<{ ts: string; msg: string }>;
  currentStage: PipelineStage | null;
  collapsedSections: { slotRetry: boolean; errorRetry: boolean };

  setConfig: (config: InjectorConfig) => void;
  updateField: <K extends keyof InjectorConfig>(key: K, value: InjectorConfig[K]) => void;
  setStatus: (status: InjectorStatus) => void;
  setError: (error: string | null) => void;
  setResult: (result: unknown) => void;
  startSchedule: (time: number, config: InjectorConfig) => void;
  cancelSchedule: () => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
  setStage: (stage: PipelineStage | null) => void;
  toggleSection: (section: 'slotRetry' | 'errorRetry') => void;
  reset: () => void;
}

export const useInjectorStore = create<InjectorState>((set, get) => ({
  config: {} as InjectorConfig,
  status: 'idle',
  error: null,
  result: null,
  scheduleTime: null,
  scheduledConfig: null,
  logs: [],
  currentStage: null,
  collapsedSections: { slotRetry: true, errorRetry: true },

  setConfig: (config) => set({ config }),
  updateField: (key, value) => set((state) => ({ config: { ...state.config, [key]: value } })),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setResult: (result) => set({ result }),
  startSchedule: (time, config) => set({ status: 'scheduling', scheduleTime: time, scheduledConfig: config }),
  cancelSchedule: () => set({ status: 'idle', scheduleTime: null, scheduledConfig: null }),
  addLog: (msg) => set((state) => ({
    logs: [...state.logs, { ts: new Date().toISOString().slice(11, 19), msg }],
  })),
  clearLogs: () => set({ logs: [] }),
  setStage: (stage) => set({ currentStage: stage }),
  toggleSection: (section) => set((state) => ({
    collapsedSections: { ...state.collapsedSections, [section]: !state.collapsedSections[section] },
  })),
  reset: () => set({ status: 'idle', error: null, result: null, scheduleTime: null, scheduledConfig: null, logs: [], currentStage: null }),
}));
