import { create } from 'zustand'

const useCaptchaStore = create((set) => ({
  queue: [],
  logs: [],
  selectedCard: null,
  selectedCaptchaId: null,

  addCaptcha: (captcha) =>
    set((state) => ({
      selectedCard: null,
      queue: [
        ...state.queue,
        { ...captcha, solved: false, createdAt: captcha.created_at * 1000, timeout: captcha.timeout || 10 },
      ],
    })),

  markSolved: (captchaId) =>
    set((state) => ({
      selectedCard: null,
      queue: state.queue.map((q) =>
        q.id === captchaId ? { ...q, solved: true } : q
      ),
    })),

  removeCaptcha: (captchaId) =>
    set((state) => ({
      queue: state.queue.filter((q) => q.id !== captchaId),
    })),

  addLog: (msg, cls) =>
    set((state) => ({
      logs: [
        { time: new Date().toLocaleTimeString(), msg, cls: cls || 'action' },
        ...state.logs,
      ],
    })),

  setSelectedCard: (captchaId, cardIndex) => set({ selectedCard: cardIndex, selectedCaptchaId: captchaId }),

  getActiveCaptcha: () => {
    const state = useCaptchaStore.getState()
    return state.queue.find((q) => !q.solved) || null
  },

  getUnsolvedCount: () => {
    const state = useCaptchaStore.getState()
    return state.queue.filter((q) => !q.solved).length
  },
}))

export default useCaptchaStore
