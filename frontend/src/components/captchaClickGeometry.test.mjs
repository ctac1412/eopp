import assert from "node:assert/strict";
import test from "node:test";

import {
  getImageClickCoordinates,
  getVisibleCaptchaIcons,
} from "./captchaClickGeometry.js";

function eventAt(clientX, clientY) {
  return { clientX, clientY };
}

function imageWithRect(rect) {
  return {
    getBoundingClientRect() {
      return rect;
    },
  };
}

test("click coordinates map from rendered size to natural image size", () => {
  const coords = getImageClickCoordinates({
    event: eventAt(150, 90),
    imageElement: imageWithRect({ left: 50, top: 20, width: 200, height: 100 }),
    naturalSize: { w: 1000, h: 500 },
  });

  assert.deepEqual(coords, { x: 500, y: 350 });
});

test("click coordinates handle non-square image scaling", () => {
  const coords = getImageClickCoordinates({
    event: eventAt(260, 240),
    imageElement: imageWithRect({ left: 20, top: 40, width: 480, height: 400 }),
    naturalSize: { w: 1200, h: 800 },
  });

  assert.deepEqual(coords, { x: 600, y: 400 });
});

test("click coordinates return null until natural size and element are available", () => {
  assert.equal(
    getImageClickCoordinates({
      event: eventAt(100, 100),
      imageElement: null,
      naturalSize: { w: 1000, h: 500 },
    }),
    null,
  );
  assert.equal(
    getImageClickCoordinates({
      event: eventAt(100, 100),
      imageElement: imageWithRect({ left: 0, top: 0, width: 200, height: 100 }),
      naturalSize: null,
    }),
    null,
  );
});

test("visible captcha icons hide foreign icons in own-only mode", () => {
  const icons = [
    { position: 0, icon: "a" },
    { position: 1, icon: "b" },
    { position: 4, icon: "e" },
  ];

  assert.deepEqual(
    getVisibleCaptchaIcons({
      icons,
      assigned: [1, 4],
      iconDisplayMode: "own_only",
    }).map((icon) => icon.position),
    [1, 4],
  );
});

test("visible captcha icons keep every icon outside own-only mode", () => {
  const icons = [
    { position: 0, icon: "a" },
    { position: 1, icon: "b" },
    { position: 4, icon: "e" },
  ];

  assert.deepEqual(
    getVisibleCaptchaIcons({
      icons,
      assigned: [1, 4],
      iconDisplayMode: "own_then_foreign",
    }).map((icon) => icon.position),
    [0, 1, 4],
  );
});
