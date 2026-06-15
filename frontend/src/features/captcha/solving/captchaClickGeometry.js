export function getImageClickCoordinates({ event, imageElement, naturalSize }) {
  if (!event || !imageElement || !naturalSize?.w || !naturalSize?.h) {
    return null;
  }

  const rect = imageElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  return {
    x: Math.round((event.clientX - rect.left) * naturalSize.w / rect.width),
    y: Math.round((event.clientY - rect.top) * naturalSize.h / rect.height),
  };
}

export function getVisibleCaptchaIcons({ icons = [], assigned = [], iconDisplayMode }) {
  if (iconDisplayMode !== "own_only") return icons;
  const assignedSet = new Set(assigned);
  return icons.filter((icon) => assignedSet.has(icon.position));
}

export function getMarkerColor(label, index = 0) {
  const colors = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];
  const colorIndex = (label != null ? label - 1 : index) % colors.length;
  return colors[colorIndex < 0 ? 0 : colorIndex];
}
