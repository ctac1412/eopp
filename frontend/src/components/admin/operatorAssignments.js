export function normalizeAllowedMasters(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (value == null) return [];
  return value;
}

export function buildAssignmentDraft(rows) {
  return Object.fromEntries(
    rows.map((op) => [
      op.id,
      {
        companyIds: Array.isArray(op.company_ids) ? op.company_ids.map(String) : [],
        masterKeyIds: normalizeAllowedMasters(op.allowed_master_keys),
      },
    ]),
  );
}

export function toggleCompanyAssignment(current, companyId, checked) {
  const cid = String(companyId);
  const companyIds = new Set((current.companyIds || []).map(String));
  if (checked) companyIds.add(cid);
  else companyIds.delete(cid);
  return { ...current, companyIds: Array.from(companyIds) };
}

export function toggleMasterAssignment(current, { masterKeyId, checked, key }) {
  const keyId = Number(masterKeyId);
  const companyIds = new Set((current.companyIds || []).map(String));
  if (checked && key?.company_id != null) {
    companyIds.add(String(key.company_id));
  }
  const masterKeyIds = new Set((current.masterKeyIds || []).map(Number));
  if (checked) masterKeyIds.add(keyId);
  else masterKeyIds.delete(keyId);
  return {
    ...current,
    companyIds: Array.from(companyIds),
    masterKeyIds: Array.from(masterKeyIds),
  };
}

export function buildBulkAssignments(operators, assignmentDraft) {
  return operators.map((op) => {
    const draft = assignmentDraft[op.id] || { companyIds: [], masterKeyIds: [] };
    return {
      operator_id: op.id,
      company_ids: (draft.companyIds || []).map(Number).filter(Boolean),
      master_key_ids: (draft.masterKeyIds || []).map(Number).filter(Boolean),
    };
  });
}
