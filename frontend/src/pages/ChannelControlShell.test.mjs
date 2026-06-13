import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("./ChannelControlShell.jsx", import.meta.url), "utf8");

assert.match(component, /export function ChannelControlShell/);
assert.match(component, /function companyLabel/);
assert.match(component, /function userLabel/);
assert.match(component, /function routeLabel/);
assert.match(component, /onClaim/);
assert.match(component, /onRelease/);
assert.match(component, /onSendCommand/);
assert.match(component, /onCloseChannel/);
assert.match(component, /refresh_snapshot/);
assert.match(component, /stop_pipeline/);
assert.match(component, /channel-control-shell__context/);
assert.match(component, /channel-control-shell__commands/);
assert.match(component, /channel-control-shell__state/);
assert.match(component, /channel-control-shell__logs/);
