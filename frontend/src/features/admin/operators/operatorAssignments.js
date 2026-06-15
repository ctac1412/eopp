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

export function buildAssignmentDraft(operators = []) {
  return Object.fromEntries(
    operators.map((operator) => [
      operator.id,
      {
        companyIds: (operator.company_ids || []).map(String),
        masterKeyIds: normalizeAllowedMasters(operator.allowed_master_keys),
      },
    ]),
  );
}

export function toggleMasterAssignment(current, { masterKeyId, checked, key }) {
  const companyIds = new Set((current.companyIds || []).map(String));
  const masterKeyIds = new Set((current.masterKeyIds || []).map(Number).filter(Boolean));
  if (checked) {
    masterKeyIds.add(Number(masterKeyId));
    if (key?.company_id != null) companyIds.add(String(key.company_id));
  } else {
    masterKeyIds.delete(Number(masterKeyId));
  }
  return {
    companyIds: Array.from(companyIds),
    masterKeyIds: Array.from(masterKeyIds),
  };
}

export function buildBulkAssignments(operators = [], draft = {}) {
  return operators.map((operator) => {
    const entry = draft[operator.id] || {};
    return {
      operator_id: operator.id,
      company_ids: (entry.companyIds || []).map(Number).filter(Boolean),
      master_key_ids: (entry.masterKeyIds || []).map(Number).filter(Boolean),
    };
  });
}
