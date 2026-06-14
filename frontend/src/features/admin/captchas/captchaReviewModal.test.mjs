import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("./CaptchaReviewModal.jsx", import.meta.url), "utf8");
const operatorsSource = readFileSync(new URL("../operators/OperatorsTab.jsx", import.meta.url), "utf8");
const detailsSource = readFileSync(new URL("../reports/OperationDetails.jsx", import.meta.url), "utf8");

test("captcha review modal renders operator click markers", () => {
  assert.match(modalSource, /data-eopp-component="CaptchaReviewModal"/);
  assert.match(modalSource, /operator_answers/);
  assert.match(modalSource, /captcha-review-marker/);
});

test("journal details and operator logs can open captcha review", () => {
  assert.match(detailsSource, /operator_names/);
  assert.match(detailsSource, /setReviewCaptcha\(row\)/);
  assert.match(operatorsSource, /activeTab === "dashboard" \? renderDashboard\(\) : renderSettings\(\)/);
  assert.match(operatorsSource, /const groupedAnswers = useMemo/);
  assert.match(operatorsSource, /data=\{groupedAnswers\}/);
  assert.match(operatorsSource, /setReviewCaptcha\(reviewFromAnswer\(row\)\)/);
  assert.match(operatorsSource, /icon_rate/);
  assert.match(operatorsSource, /Тариф за иконку/);
});
