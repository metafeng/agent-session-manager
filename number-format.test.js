import test from "node:test";
import assert from "node:assert/strict";
import { formatChineseMagnitude } from "./public/number-format.js";

test("formats numbers using Chinese magnitude units", () => {
  assert.equal(formatChineseMagnitude(9_999), "9,999");
  assert.equal(formatChineseMagnitude(12_500), "1.25 万");
  assert.equal(formatChineseMagnitude(31_398_940), "3.14 千万");
  assert.equal(formatChineseMagnitude(313_989_400), "3.14 亿");
});

test("handles zero and invalid values", () => {
  assert.equal(formatChineseMagnitude(0), "0");
  assert.equal(formatChineseMagnitude("not-a-number"), "0");
});
