export function buildHomeOperatorTags(connectedOperators = []) {
  return connectedOperators
    .map((operator, index) => {
      const label = operator.login || operator.nickname || (operator.id != null ? `#${operator.id}` : "");
      if (!label) return null;
      return {
        key: operator.id != null ? `operator-${operator.id}` : `operator-${index}-${label}`,
        label,
        online: !!operator.online,
        assignedIcons: Array.isArray(operator.assigned_icons) ? operator.assigned_icons : [],
      };
    })
    .filter(Boolean);
}
