export function createOperatorQueueEntry(message) {
  const distribution = message?.distribution;
  if (!message?.captcha_id) {
    return null;
  }

  const variants = Array.isArray(message.variants) ? message.variants : [];
  const tiles = Array.isArray(message.tiles) ? message.tiles : [];
  const isPuzzle = variants.length > 0 && message.captcha_type !== 1;

  if (isPuzzle) {
    return {
      captchaId: message.captcha_id,
      id: message.captcha_id,
      captchaType: message.captcha_type || 0,
      operatorId: distribution?.operator_id || 0,
      tiles,
      variants,
      top3: Array.isArray(message.top3) ? message.top3 : [],
      confident: !!message.confident,
      createdAt: message.created_at,
      timeout: message.timeout,
      ownerLabel: message.owner_label || "",
      ownerApiKeyId: message.owner_api_key_id ?? null,
      complete: false,
      waiting: false,
    };
  }

  if (!distribution || distribution.operator_id <= 0) {
    return null;
  }

  const assigned = Array.isArray(distribution.assigned)
    ? distribution.assigned
    : [];

  return {
    captchaId: message.captcha_id,
    id: message.captcha_id,
    captchaType: message.captcha_type || 1,
    operatorId: distribution.operator_id,
    assigned,
    mainImage: message.images?.["0"] || "",
    iconImage: message.icons_image || "",
    allIcons: message.all_icons || [],
    currentPos: assigned[0],
    solvedCount: 0,
    answeredPositions: [],
    markers: [],
    foreignMarkers: [],
    complete: false,
    waiting: false,
  };
}

export function removeOperatorCaptcha(queue, activeIndex, captchaId) {
  const removedIndex = queue.findIndex(
    (entry) => entry.captchaId === captchaId,
  );
  if (removedIndex < 0) return { queue, activeIndex, removedIndex };

  const nextQueue = queue.filter((_, index) => index !== removedIndex);
  let nextActiveIndex;
  if (removedIndex === activeIndex) {
    nextActiveIndex =
      nextQueue.length > 0 ? Math.min(removedIndex, nextQueue.length - 1) : -1;
  } else if (removedIndex < activeIndex) {
    nextActiveIndex = activeIndex - 1;
  } else {
    nextActiveIndex = activeIndex;
  }

  return { queue: nextQueue, activeIndex: nextActiveIndex, removedIndex };
}

export function applyOperatorProgress(queue, captchaId, message) {
  const index = queue.findIndex((entry) => entry.captchaId === captchaId);
  if (index < 0) return queue;

  const next = [...queue];
  const entry = { ...next[index] };

  if (message.answered_positions) {
    entry.answeredPositions = message.answered_positions;
    entry.solvedCount = message.answered_positions.filter((position) =>
      entry.assigned.includes(position),
    ).length;
  }

  if (message.all_coords) {
    entry.foreignMarkers = Object.keys(message.all_coords)
      .filter(
        (position) =>
          message.all_coords[position].operator_id !== entry.operatorId,
      )
      .map((position) => ({
        x: message.all_coords[position].x,
        y: message.all_coords[position].y,
        label: parseInt(position, 10) + 1,
      }));
  }

  next[index] = entry;
  return next;
}

export function applyOperatorAnswerResult(entry, data, clickedMarker) {
  if (data.waiting) {
    return {
      ...entry,
      waiting: true,
      mainImage: "",
      iconImage: "",
      markers: [],
      foreignMarkers: [],
      allIcons: [],
    };
  }

  return {
    ...entry,
    mainImage: data.image || entry.mainImage,
    iconImage: data.icon || entry.iconImage,
    currentPos: data.icon_position,
    solvedCount: data.solved_count,
    answeredPositions: data.answered_positions || entry.answeredPositions,
    allIcons: data.all_icons || entry.allIcons,
    markers: clickedMarker ? [...entry.markers, clickedMarker] : entry.markers,
  };
}
