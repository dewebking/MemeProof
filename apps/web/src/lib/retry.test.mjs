import assert from "node:assert/strict";
import test from "node:test";
import { withRetry } from "./retry.ts";

test("retries a transient failure with bounded backoff and returns the live result", async () => {
  let calls = 0;
  const waits = [];
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("provider_http_503");
      return "live response";
    },
    (error) => error instanceof Error && error.message.startsWith("provider_http_"),
    [10, 20],
    async (milliseconds) => { waits.push(milliseconds); },
  );
  assert.equal(result, "live response");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("does not retry a permanent error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls += 1; throw new Error("invalid response"); }, () => false, [10]),
    /invalid response/,
  );
  assert.equal(calls, 1);
});
