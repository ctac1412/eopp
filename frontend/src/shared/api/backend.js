import { apiRequest } from "./httpClient.js";
import { API_BASE_URL } from "./endpoints.js";

function encode(value) {
  return encodeURIComponent(value);
}

function buildUrl(path, query) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${API_BASE_URL}${path}`, origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }
  return `${url.pathname}${url.search}`;
}

function request(path, options = {}) {
  return apiRequest(path, options);
}

function adminPath(path) {
  return path.startsWith("/admin/") ? path : `/admin${path}`;
}

export const backend = {
  request,
  url: buildUrl,
  auth: {
    login: (payload) => request("/auth/login", { method: "POST", json: payload }),
    logout: () => request("/auth/logout", { method: "POST" }),
    me: () => request("/auth/me"),
    pluginKeys: () => request("/auth/plugin-keys"),
  },
  captcha: {
    solve: (payload) => request("/solve", { method: "POST", json: payload }),
    answerDistribution: (payload) => request("/distribution/answer", { method: "POST", json: payload }),
    validateKey: () => request("/validate-key"),
    apiKeys: (query) => request("/api-keys", { query }),
    trainingCourses: () => request("/training/courses"),
    triggerTest: (payload) => request("/trigger-test", { method: "POST", json: payload }),
    public: {
      list: () => request("/public/captchas"),
      sendSelected: (payload) => request("/public/captchas/send-selected", { method: "POST", json: payload }),
    },
    history: {
      usageLog: (query) => request("/usage-log", { query }),
    },
  },
  training: {
    resolveOperator: (uuid) => request("/training/resolve-operator", { query: { uuid } }),
    validateKey: () => request("/validate-key"),
    courses: () => request("/training/courses"),
    runs: (params) => request(`/training/runs?${params}`),
    start: (payload) => request("/training/start", { method: "POST", json: payload }),
    runResults: (runId) => request(`/training/run/${encode(runId)}/results`),
    captcha: (captchaId) => request(`/training/captcha/${encode(captchaId)}`),
    runStatus: (runId) => request(`/training/run/${encode(runId)}/status`),
    next: (runId) => request(`/training/run/${encode(runId)}/next`),
    complete: (runId) => request(`/training/run/${encode(runId)}/complete`, { method: "POST" }),
    answer: (runId, payload) => request(`/training/run/${encode(runId)}/answer`, { method: "POST", json: payload }),
    cancel: (runId) => request(`/training/run/${encode(runId)}/cancel`, { method: "POST" }),
  },
  operator: {
    masters: (uuid) => request(`/operators/${encode(uuid)}/masters`),
    sendChat: (payload) => request("/chat/send", { method: "POST", json: payload }),
    answerDistribution: (payload) => request("/distribution/answer", { method: "POST", json: payload }),
  },
  admin: {
    request: (path, options) => request(path, options),
    auth: {
      me: () => request("/auth/me"),
      logout: () => request("/auth/logout", { method: "POST" }),
    },
    invoices: {
      list: (query, options) => request("/admin/invoices", { ...options, query }),
      create: (payload, options) => request("/admin/invoices", { ...options, method: "POST", json: payload }),
      update: (id, payload, options) => request(`/admin/invoices/${encode(id)}`, { ...options, method: "PUT", json: payload }),
      patch: (id, payload, options) => request(`/admin/invoices/${encode(id)}`, { ...options, method: "PATCH", json: payload }),
    },
    captchaLabel: {
      get: (captchaId, options) => request(`/admin/captcha-label/${encode(captchaId)}`, options),
      save: (payload, options) => request("/admin/captcha-label/save", { ...options, method: "POST", json: payload }),
      saveCoordinates: (captchaId, payload, options) =>
        request(`/admin/captcha-label/${encode(captchaId)}/save-coordinates`, { ...options, method: "POST", json: payload }),
      saveBoxes: (captchaId, payload, options) =>
        request(`/admin/captcha-label/${encode(captchaId)}/save-boxes`, { ...options, method: "POST", json: payload }),
    },
    slots: {
      clearGroups: (options) => request("/admin/slots-group/clear", { ...options, method: "POST" }),
    },
    resource: (path, options) => request(adminPath(path), options),
  },
  streams: {
    mainUrl: (query) => buildUrl("/stream", query),
    operatorUrl: (uuid) => buildUrl(`/operators/${encode(uuid)}/stream`),
    adminSlotsUrl: () => buildUrl("/admin/stream/slots"),
  },
};
