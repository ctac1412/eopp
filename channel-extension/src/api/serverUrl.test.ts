import assert from "node:assert/strict";

import { resolveServerUrl } from "./serverUrl";

assert.equal(
  resolveServerUrl("https://45.12.75.110", "http://127.0.0.1:8766"),
  "http://127.0.0.1:8766",
);

assert.equal(
  resolveServerUrl("https://45.12.75.110", "http://localhost:8766"),
  "http://localhost:8766",
);

assert.equal(
  resolveServerUrl("https://45.12.75.110", "https://eopp.epd-portal.ru"),
  "https://45.12.75.110",
);
