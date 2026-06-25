import assert from "node:assert/strict";
import test from "node:test";
import { moneyAmountSchema, safeTextSchema } from "./validateRequest.js";

test("safeTextSchema accepts ordinary trimmed text", () => {
  const result = safeTextSchema("Room name").parse("  Dinner split  ");

  assert.equal(result, "Dinner split");
});

test("safeTextSchema rejects control characters", () => {
  assert.throws(
    () => safeTextSchema("Room name").parse("Dinner\u0007split"),
    /invalid characters/,
  );
});

test("moneyAmountSchema accepts two decimal places", () => {
  const result = moneyAmountSchema().parse("42.75");

  assert.equal(result, 42.75);
});

test("moneyAmountSchema rejects more than two decimal places", () => {
  assert.throws(
    () => moneyAmountSchema().parse("42.755"),
    /at most 2 decimal places/,
  );
});
