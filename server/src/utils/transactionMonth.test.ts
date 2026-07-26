import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidTransactionMonthInput,
  parseTransactionMonth,
} from "./transactionMonth.js";

test("parseTransactionMonth accepts month numbers", () => {
  assert.equal(parseTransactionMonth("1"), 1);
  assert.equal(parseTransactionMonth(12), 12);
});

test("parseTransactionMonth accepts full and abbreviated month names", () => {
  assert.equal(parseTransactionMonth("January"), 1);
  assert.equal(parseTransactionMonth("sept"), 9);
  assert.equal(parseTransactionMonth("DEC"), 12);
});

test("transaction month validation rejects unsupported values", () => {
  assert.equal(isValidTransactionMonthInput(""), true);
  assert.equal(isValidTransactionMonthInput("13"), false);
  assert.equal(isValidTransactionMonthInput("Smarch"), false);
});
