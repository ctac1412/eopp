export function getCurrentOperatorPageUrl(operatorProfile) {
  if (!operatorProfile?.active || !operatorProfile?.uuid) {
    return "";
  }
  return `/operators/${encodeURIComponent(operatorProfile.uuid)}`;
}
