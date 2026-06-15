import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(new URL("./HomePage.jsx", import.meta.url), "utf8");
const tabSource = readFileSync(new URL("./CaptchaTab.jsx", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("../../../styles/05-pages.css", import.meta.url), "utf8");

test("home workspace owns logs as a separate bottom area", () => {
  assert.match(homeSource, /import LogViewer from "\.\/LogViewer"/);
  assert.match(homeSource, /home-workspace__logs/);
  assert.doesNotMatch(tabSource, /LogViewer/);
});

test("narrow home workspace places logs after the side panel", () => {
  assert.match(pageCss, /grid-template-areas:\s*"queue side"\s*"logs side"/);
  assert.match(pageCss, /\.home-workspace__logs\s*\{[\s\S]*grid-area:\s*logs;/);
  assert.match(pageCss, /@media \(max-width:\s*1180px\)[\s\S]*grid-template-areas:\s*"queue"\s*"side"\s*"logs"/);
});

test("home side strips stay above the tabs", () => {
  assert.match(
    homeSource,
    /<aside[\s\S]*<HomeOperatorStrip operators=\{connectedOperators\} \/>[\s\S]*<HomeScheduledEventsStrip events=\{scheduledEvents\} \/>[\s\S]*data-eopp-component="HomeTabsNav"/,
  );
  assert.doesNotMatch(
    homeSource,
    /<div className="home-side-panel__body">[\s\S]*<HomeOperatorStrip/,
  );
});

test("home tabs expose operator entry next to training only conditionally", () => {
  assert.match(homeSource, /import \{ getCurrentOperatorPageUrl \} from "\.\/homeOperatorAccess"/);
  assert.match(homeSource, /const operatorPageUrl = getCurrentOperatorPageUrl\(operatorProfile\);/);
  assert.match(
    homeSource,
    /data-eopp-component="HomeTabsTrainingLink"[\s\S]*\{operatorPageUrl && \([\s\S]*data-eopp-component="HomeTabsOperatorLink"[\s\S]*target="_blank"/,
  );
});
