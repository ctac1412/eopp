import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminPage = await readFile(new URL("../../AdminPage.jsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../../features/admin/shared/tabs.js", import.meta.url), "utf8");
const permissions = await readFile(new URL("../../../../server/src/modules/access/permissions.py", import.meta.url), "utf8");
const component = await readFile(new URL("./PluginChannelTab.jsx", import.meta.url), "utf8");

assert.match(tabs, /id:\s*"channels"/);
assert.match(permissions, /"channels"/);
assert.match(adminPage, /PluginChannelTab/);
assert.match(adminPage, /activeTab === "channels"/);
assert.match(component, /Панель управления сессией/);
assert.match(component, /Исполнитель/);
assert.match(component, /executor_token/);
assert.match(component, /\/admin\/plugin-channel\/sessions/);
assert.match(component, /\/claim/);
assert.match(component, /\/commands/);
assert.match(component, /\/close/);
