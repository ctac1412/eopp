import { adminHeaders, adminHeadersJson } from "../shared/adminClient.js";

function cleanFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function buildAdminUrl(path, filters = {}) {
  const params = new URLSearchParams(cleanFilters(filters));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function getJson(adminToken, path, filters) {
  const response = await fetch(buildAdminUrl(path, filters), {
    headers: adminHeadersJson(adminToken),
  });
  return parseJsonResponse(response);
}

async function sendJson(adminToken, path, method, payload) {
  const response = await fetch(path, {
    method,
    headers: adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export function listFinanceEntries(adminToken, filters = {}) {
  return getJson(adminToken, "/admin/finance-entries", filters);
}

export function createFinanceEntry(adminToken, payload) {
  return sendJson(adminToken, "/admin/finance-entries", "POST", payload);
}

export function updateFinanceEntry(adminToken, id, payload) {
  return sendJson(adminToken, `/admin/finance-entries/${id}`, "PUT", payload);
}

export async function deleteFinanceEntry(adminToken, id) {
  const response = await fetch(`/admin/finance-entries/${id}`, {
    method: "DELETE",
    headers: adminHeadersJson(adminToken),
  });
  return parseJsonResponse(response);
}

export function listProfitLots(adminToken, filters = {}) {
  return getJson(adminToken, "/admin/profit-lots", filters);
}

export function getFinanceReport(adminToken, filters = {}) {
  return getJson(adminToken, "/admin/finance-report", filters);
}

export function listCompanies(adminToken) {
  return getJson(adminToken, "/admin/companies");
}

export function listFinanceParticipants(adminToken) {
  return getJson(adminToken, "/admin/finance-participants");
}

export function listInvoices(adminToken) {
  return getJson(adminToken, "/admin/invoices");
}

export function listPayouts(adminToken) {
  return getJson(adminToken, "/admin/payouts");
}
