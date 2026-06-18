import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const scheduler = readFileSync(resolve(root, "src/components/Scheduler.tsx"), "utf8");
const backgroundApi = readFileSync(resolve(root, "src/api/background.ts"), "utf8");

test("scheduler waits for backend planning response before local scheduling", () => {
  assert.doesNotMatch(scheduler, /checkStream/);
  assert.match(scheduler, /await sendScheduledEvent\(/);
  assert.match(scheduler, /backendErrorMessage\(\s*error,/);
  assert.match(scheduler, /status === 412/);
  assert.match(scheduler, /startSchedule\(targetUtcSeconds,\s*config\)/);
  assert.ok(
    scheduler.indexOf("await sendScheduledEvent(") <
      scheduler.indexOf("startSchedule(targetUtcSeconds, config)"),
  );
});

test("direct run surfaces backend launch guard errors from usage registration", () => {
  assert.match(backgroundApi, /error\.status === 400/);
  assert.match(backgroundApi, /parseBackendErrorMessage\(error,/);
});
