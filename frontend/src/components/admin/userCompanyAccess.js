export function emptyAccess() {
  return { allCompanies: false, companyIds: [] };
}

export function normalizeAccess(value) {
  if (!value) return emptyAccess();
  return {
    allCompanies: value.allCompanies === true || value.all_companies === true,
    companyIds: (value.companyIds || value.company_ids || [])
      .map((id) => String(id))
      .filter(Boolean),
  };
}

export function upsertAccessCompany(current, companyId) {
  const normalized = normalizeAccess(current);
  const id = String(companyId || "");
  if (!id) return normalized;
  const companyIds = new Set(normalized.companyIds);
  companyIds.add(id);
  return { allCompanies: false, companyIds: Array.from(companyIds) };
}

export function removeAccessCompany(current, companyId) {
  const normalized = normalizeAccess(current);
  const id = String(companyId || "");
  return {
    allCompanies: false,
    companyIds: normalized.companyIds.filter((existing) => existing !== id),
  };
}

export function isAccessCompanySelected(current, companyId) {
  const normalized = normalizeAccess(current);
  return normalized.companyIds.includes(String(companyId || ""));
}

export function toggleAccessCompany(current, companyId) {
  return isAccessCompanySelected(current, companyId)
    ? removeAccessCompany(current, companyId)
    : upsertAccessCompany(current, companyId);
}

export function toggleAccessAll(current, checked) {
  const normalized = normalizeAccess(current);
  return checked
    ? { allCompanies: true, companyIds: [] }
    : { ...normalized, allCompanies: false };
}

export function accessPayloadFromForm(value) {
  const normalized = normalizeAccess(value);
  return {
    all_companies: normalized.allCompanies,
    company_ids: normalized.companyIds.map(Number).filter(Boolean),
  };
}
