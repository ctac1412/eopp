import { create } from "zustand";

const STORAGE_KEY = "kiosk_api_key";

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

const useCaptchaStore = create((set) => ({
  queue: [],
  logs: [],
  selectedCard: null,
  selectedCaptchaId: null,
  apiKey: loadApiKey(),
  sseError: null,

  setApiKey: (key) => {
    localStorage.setItem(STORAGE_KEY, key);
    set({ apiKey: key });
  },

  clearApiKey: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ apiKey: "" });
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
          createdAt: captcha.created_at * 1000,
          timeout: captcha.timeout || 10,
        },
      ],
    })),

  markSolved: (captchaId) =>
    set((state) => ({
      selectedCard: null,
      queue: state.queue.map((q) =>
        q.id === captchaId ? { ...q, solved: true } : q,
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
