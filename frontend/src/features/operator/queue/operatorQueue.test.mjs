import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOperatorAnswerResult,
  applyOperatorProgress,
  createOperatorQueueEntry,
  removeOperatorCaptcha,
} from "./operatorQueue.js";

test("operator queue entry is created only from distributed operator captcha messages", () => {
  assert.equal(createOperatorQueueEntry({ type: "new_captcha" }), null);
  assert.equal(
    createOperatorQueueEntry({
      type: "new_captcha",
      captcha_id: "cap-1",
      distribution: { operator_id: 0, assigned: [0] },
    }),
    null,
  );

  assert.deepEqual(
    createOperatorQueueEntry({
      type: "new_captcha",
      captcha_id: "cap-2",
      images: { 0: "image" },
      icons_image: "icons",
      all_icons: [{ position: 1 }],
      distribution: { operator_id: 12, assigned: [1, 3] },
    }),
    {
      captchaId: "cap-2",
      id: "cap-2",
      captchaType: 1,
      operatorId: 12,
      assigned: [1, 3],
      mainImage: "image",
      iconImage: "icons",
      allIcons: [{ position: 1 }],
      currentPos: 1,
      solvedCount: 0,
      answeredPositions: [],
      markers: [],
      foreignMarkers: [],
      complete: false,
      waiting: false,
    },
  );
});

test("operator queue entry preserves puzzle fields for full-card operator solving", () => {
  assert.deepEqual(
    createOperatorQueueEntry({
      type: "new_captcha",
      captcha_id: "puzzle-1",
      tiles: [{ tileId: "tile-a", imageData: "jpeg-a" }],
      variants: [["tile-a"], ["tile-b"]],
      top3: ["1"],
      confident: true,
      created_at: 123,
      timeout: 30,
      owner_label: "master",
      owner_api_key_id: 7,
      distribution: { operator_id: 1 },
    }),
    {
      captchaId: "puzzle-1",
      id: "puzzle-1",
      captchaType: 0,
      operatorId: 1,
      tiles: [{ tileId: "tile-a", imageData: "jpeg-a" }],
      variants: [["tile-a"], ["tile-b"]],
      top3: ["1"],
      confident: true,
      createdAt: 123,
      timeout: 30,
      ownerLabel: "master",
      ownerApiKeyId: 7,
      complete: false,
      waiting: false,
    },
  );
});

test("operator queue removal updates active index without touching unknown captchas", () => {
  const queue = [{ captchaId: "a" }, { captchaId: "b" }, { captchaId: "c" }];

  assert.deepEqual(removeOperatorCaptcha(queue, 1, "missing"), {
    queue,
    activeIndex: 1,
    removedIndex: -1,
  });
  assert.deepEqual(removeOperatorCaptcha(queue, 1, "b"), {
    queue: [{ captchaId: "a" }, { captchaId: "c" }],
    activeIndex: 1,
    removedIndex: 1,
  });
  assert.deepEqual(removeOperatorCaptcha(queue, 2, "a"), {
    queue: [{ captchaId: "b" }, { captchaId: "c" }],
    activeIndex: 1,
    removedIndex: 0,
  });
});

test("operator progress updates only the matching captcha and foreign markers", () => {
  const queue = [
    {
      captchaId: "a",
      operatorId: 10,
      assigned: [0, 2],
      answeredPositions: [],
      solvedCount: 0,
      foreignMarkers: [],
    },
  ];

  assert.equal(applyOperatorProgress(queue, "missing", {}), queue);

  const next = applyOperatorProgress(queue, "a", {
    answered_positions: [0, 1],
    all_coords: {
      0: { operator_id: 10, x: 11, y: 22 },
      1: { operator_id: 15, x: 33, y: 44 },
    },
  });

  assert.deepEqual(next[0].answeredPositions, [0, 1]);
  assert.equal(next[0].solvedCount, 1);
  assert.deepEqual(next[0].foreignMarkers, [{ x: 33, y: 44, label: 2 }]);
});

test("operator answer result can move to waiting or update next icon state", () => {
  const entry = {
    captchaId: "a",
    operatorId: 10,
    assigned: [0, 2],
    currentPos: 0,
    mainImage: "old",
    iconImage: "old-icon",
    allIcons: [],
    answeredPositions: [],
    markers: [],
    foreignMarkers: [],
    waiting: false,
  };

  assert.equal(
    applyOperatorAnswerResult(entry, { waiting: true }, { x: 1, y: 2 }).waiting,
    true,
  );

  const next = applyOperatorAnswerResult(
    entry,
    {
      image: "new",
      icon: "new-icon",
      icon_position: 2,
      solved_count: 1,
      answered_positions: [0],
      all_icons: [{ position: 2 }],
    },
    { x: 8, y: 9, label: 1 },
  );

  assert.deepEqual(next, {
    ...entry,
    mainImage: "new",
    iconImage: "new-icon",
    currentPos: 2,
    solvedCount: 1,
    answeredPositions: [0],
    allIcons: [{ position: 2 }],
    markers: [{ x: 8, y: 9, label: 1 }],
  });
});
