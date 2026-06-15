import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("./CaptchaReviewModal.jsx", import.meta.url), "utf8");
const operatorsSource = readFileSync(new URL("../operators/OperatorsTab.jsx", import.meta.url), "utf8");
const detailsSource = readFileSync(new URL("../reports/OperationDetails.jsx", import.meta.url), "utf8");
const reportsSource = readFileSync(new URL("../reports/ReportsTab.jsx", import.meta.url), "utf8");

test("captcha review modal renders operator click markers", () => {
  assert.match(modalSource, /data-eopp-component="CaptchaReviewModal"/);
  assert.match(modalSource, /operator_answers/);
  assert.match(modalSource, /captcha-review-marker/);
  assert.match(modalSource, /\/admin\/captcha-label\//);
  assert.match(modalSource, /images\?\.\["0"\]/);
  assert.match(modalSource, /icons_image/);
  assert.match(modalSource, /captcha-review__image-layer/);
  assert.match(modalSource, /normalizeCoordinate/);
});

test("journal details and operator logs can open captcha review", () => {
  const fieldSource = detailsSource.match(/function Field[\s\S]*?function CaptchaStatus/)?.[0] ?? "";

  assert.doesNotMatch(fieldSource, /CaptchaReviewModal/);
  assert.match(detailsSource, /operation-details__tech-tabs/);
  assert.match(detailsSource, /Тех\. логи/);
  assert.match(detailsSource, /operator_names/);
  assert.match(detailsSource, /financeEntries/);
  assert.match(detailsSource, /financeKindLabel/);
  assert.doesNotMatch(detailsSource, /API key/);
  assert.match(reportsSource, /finance-entries\?usage_log_id=/);
  assert.match(reportsSource, /finance\/recalculate/);
  assert.match(reportsSource, /financeEntries=\{financeEntries\[selectedRecord\.id\] \|\| \[\]\}/);
  assert.match(detailsSource, /onRecalculateFinance/);
  assert.match(detailsSource, /Обновить/);
  assert.match(detailsSource, /setReviewCaptcha\(row\)/);
  assert.match(detailsSource, /onDoubleClick:\s*\(\)\s*=>\s*setReviewCaptcha\(row\)/);
  assert.match(detailsSource, /<CaptchaReviewModal\s+captcha=\{reviewCaptcha\}/);
  assert.match(operatorsSource, /activeTab === "dashboard" \? renderDashboard\(\) : renderSettings\(\)/);
  assert.doesNotMatch(operatorsSource, /const groupedAnswers = useMemo/);
  assert.match(operatorsSource, /data=\{answers\}/);
  assert.doesNotMatch(operatorsSource, /data=\{groupedAnswers\}/);
  assert.match(operatorsSource, /setReviewCaptcha\(reviewFromAnswer\(row\)\)/);
  assert.match(operatorsSource, /icon_rate/);
  assert.match(operatorsSource, /billing_mode/);
  assert.match(operatorsSource, /Тариф оператора/);
  assert.match(operatorsSource, /Бесплатный/);
});
