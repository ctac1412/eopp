import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("disabled plugin channel flow is absent from admin UI and permissions", async () => {
const adminPage = await readFile(new URL("../AdminPage.jsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../shared/tabs.js", import.meta.url), "utf8");
const permissions = await readFile(
  new URL("../../../../../server/src/modules/access/permissions.py", import.meta.url),
  "utf8",
);

assert.doesNotMatch(tabs, /id:\s*"channels"/);
assert.doesNotMatch(tabs, /path:\s*"channels"/);
assert.doesNotMatch(tabs, /PluginChannelTab/);
assert.doesNotMatch(tabs, /component:\s*PluginChannelTabContainer/);
assert.doesNotMatch(adminPage, /channels/);
assert.doesNotMatch(permissions, /"channels"/);
});
