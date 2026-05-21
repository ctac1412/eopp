/**
 * EOPP Captcha Solver - Zustand Store (Глобальное состояние)
 *
 * Хранит:
 * - apiKey: API ключ (из localStorage или URL параметра)
 * - superKioskMode: режим супер-киоска (получает все капчи)
 * - queue: очередь активных капч для решения
 * - selectedCard: выбранный вариант капчи (index)
 * - selectedCaptchaId: ID текущей капчи
 * - logs: массив логов событий
 * - sseError: ошибка SSE подключения
 *
 * Методы:
 * - setApiKey / clearApiKey - управление ключом
 * - setSuperKioskMode / clearSuperKioskMode - переключение режима
 * - addCaptcha / markSolved / removeCaptcha - управление очередью
 * - addLog - добавление лога
 * - setSelectedCard - выбор варианта
 * - getActiveCaptcha / getUnsolvedCount - геттеры
 *
 * Используется: всеми компонентами для доступа к состоянию
 */
import { create } from "zustand";

const STORAGE_KEY = "kiosk_api_key";
const SUPER_KIOSK_KEY = "super_kiosk_mode";
const HELP_FOR_KEY = "super_kiosk_help_for";

function loadApiKey() {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("api_key");
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return "";
}

function loadSuperKioskMode() {
  return localStorage.getItem(SUPER_KIOSK_KEY) === "true";
}

function loadHelpFor() {
  const raw = localStorage.getItem(HELP_FOR_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const useCaptchaStore = create((set) => ({
  queue: [],
  logs: [],
  selectedCard: null,
  selectedCaptchaId: null,
  apiKey: loadApiKey(),
  superKioskMode: loadSuperKioskMode(),
  helpFor: loadHelpFor(),
  sseError: null,

  setApiKey: (key) => {
    localStorage.setItem(STORAGE_KEY, key);
    set({ apiKey: key });
  },

  clearApiKey: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ apiKey: "" });
  },

  setSuperKioskMode: (enabled) => {
    localStorage.setItem(SUPER_KIOSK_KEY, enabled ? "true" : "false");
    set({ superKioskMode: enabled });
  },

  clearSuperKioskMode: () => {
    localStorage.removeItem(SUPER_KIOSK_KEY);
    set({ superKioskMode: false });
  },

  setHelpFor: (ids) => {
    localStorage.setItem(HELP_FOR_KEY, JSON.stringify(ids));
    set({ helpFor: ids });
  },

  setSseError: (err) => set({ sseError: err }),

  addCaptcha: (captcha) =>
    set((state) => ({
      selectedCard: null,
      queue: [
        ...state.queue,
        {
          ...captcha,
          solved: false,
          solvedBySuper: false,
          solverLabel: null,
          createdAt: captcha.created_at * 1000,
          timeout: captcha.timeout || 10,
        },
      ],
    })),

  markSolved: (captchaId, solvedBySuper = false, solverLabel = null) =>
    set((state) => ({
      selectedCard: null,
      queue: state.queue.map((q) =>
        q.id === captchaId
          ? { ...q, solved: true, solvedBySuper, solverLabel }
          : q,
      ),
    })),

  removeCaptcha: (captchaId) =>
    set((state) => ({
      queue: state.queue.filter((q) => q.id !== captchaId),
    })),

  addLog: (msg, cls) =>
    set((state) => ({
      logs: [
        { time: new Date().toLocaleTimeString(), msg, cls: cls || "action" },
        ...state.logs,
      ],
    })),

  setSelectedCard: (captchaId, cardIndex) =>
    set({ selectedCard: cardIndex, selectedCaptchaId: captchaId }),

  getActiveCaptcha: () => {
    const state = useCaptchaStore.getState();
    return state.queue.find((q) => !q.solved) || null;
  },

  getUnsolvedCount: () => {
    const state = useCaptchaStore.getState();
    return state.queue.filter((q) => !q.solved).length;
  },
}));

export default useCaptchaStore;
