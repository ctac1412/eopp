export function isAllAccessibleMasters(value) {
  return value == null;
}

export function normalizeAllowedMasters(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  if (value == null) return [];
  return value;
}

export function serializeAllowedMasters(mode, ids) {
  if (mode === "all") return null;
  return (ids || []).map(Number).filter(Boolean);
}
