import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("./OperationsDashboardTab.jsx", import.meta.url), "utf8");

assert.match(component, /pluginChannels/);
assert.match(component, /\/admin\/plugin-channel\/sessions/);
assert.match(component, /assignChannelToMaster/);
assert.match(component, /releaseChannel/);
assert.match(component, /dragChannel/);
assert.match(component, /ops-channel-rail/);
assert.match(component, /ops-master-card__channels/);
assert.doesNotMatch(component, /draggable=\{!channel\.claimed_master_key_id\}/);
assert.match(component, /headers:\s*adminHeaders\(adminToken\)/);
assert.match(component, /dragIntent/);
assert.match(component, /masterDropClass/);
assert.match(component, /can-drop/);
assert.match(component, /cannot-drop/);
assert.doesNotMatch(component, /className=\{`ops-master-scope/);
assert.match(component, /dragScrollAnimationRef/);
assert.match(component, /updateDragAutoScroll/);
assert.match(component, /stopDragAutoScroll/);
assert.match(component, /sortedMasters/);
assert.match(component, /localeCompare\(keyLabel\(right\),\s*"ru"/);
assert.match(component, /distributeActiveOperators/);
assert.match(component, /\/admin\/operator-distribution\/active\/round-robin/);
assert.match(component, /Распределить активных/);

const styles = await readFile(new URL("../../styles/05-pages.css", import.meta.url), "utf8");

assert.match(styles, /\.ops-company-group__masters\s*\{[\s\S]*minmax\(250px,\s*1fr\)/);
assert.match(styles, /\.ops-master-card \.ant-card-body\s*\{[\s\S]*padding:\s*0\.48rem/);
