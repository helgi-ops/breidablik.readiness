import { test } from "vitest";
import assert from "node:assert/strict";
import { shouldReingestValdPayload } from "../idempotency";

const hash = "same-hash";

test("the same moment in Postgres and VALD format is not a change", () => {
  // Real pair from vald_raw_tests: Postgres keeps 6 decimals and its own offset.
  assert.equal(
    shouldReingestValdPayload({
      previousPayloadHash: hash,
      nextPayloadHash: hash,
      previousSourceUpdatedAt: "2026-04-28T13:49:01.754454+00:00",
      nextSourceUpdatedAt: "2026-04-28T13:49:01.7544544Z",
    }),
    false,
  );
});

test("a later source timestamp is still re-ingested", () => {
  assert.equal(
    shouldReingestValdPayload({
      previousPayloadHash: hash,
      nextPayloadHash: hash,
      previousSourceUpdatedAt: "2026-04-28T13:49:01.754454+00:00",
      nextSourceUpdatedAt: "2026-04-28T13:49:02.000Z",
    }),
    true,
  );
});

test("a changed payload or a missing previous hash is re-ingested", () => {
  assert.equal(shouldReingestValdPayload({ previousPayloadHash: "old", nextPayloadHash: hash }), true);
  assert.equal(shouldReingestValdPayload({ previousPayloadHash: null, nextPayloadHash: hash }), true);
});

test("a missing source timestamp is not a change", () => {
  assert.equal(
    shouldReingestValdPayload({
      previousPayloadHash: hash,
      nextPayloadHash: hash,
      previousSourceUpdatedAt: null,
      nextSourceUpdatedAt: "2026-04-28T13:49:01.7544544Z",
    }),
    false,
  );
});

test("unparseable timestamps fall back to a plain comparison", () => {
  const base = { previousPayloadHash: hash, nextPayloadHash: hash };
  assert.equal(shouldReingestValdPayload({ ...base, previousSourceUpdatedAt: "n/a", nextSourceUpdatedAt: "n/a" }), false);
  assert.equal(shouldReingestValdPayload({ ...base, previousSourceUpdatedAt: "n/a", nextSourceUpdatedAt: "unknown" }), true);
});
