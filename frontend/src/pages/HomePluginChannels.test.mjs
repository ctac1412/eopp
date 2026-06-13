import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const homePage = await readFile(new URL("./HomePage.jsx", import.meta.url), "utf8");
const component = await readFile(new URL("./HomePluginChannels.jsx", import.meta.url), "utf8");

assert.match(homePage, /HomePluginChannels/);
assert.match(component, /\/admin\/plugin-channel\/sessions/);
assert.match(component, /setInterval/);
assert.match(component, /claimChannel/);
assert.match(component, /releaseChannel/);
assert.match(component, /ChannelControlShell/);
assert.match(component, /onSendCommand=\{sendCommand\}/);
assert.match(component, /onCloseChannel=\{closeChannel\}/);
assert.match(component, /Каналы EOPP/);
