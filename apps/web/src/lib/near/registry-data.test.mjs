import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./registry-data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('from "./registry"', 'from "data:text/javascript,export {};"');
const { getAllHistoryEvents, getCommitmentsForCreator, getRegistrySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("history and token pages are followed through the exclusive cursor", async () => {
  const cursors = [];
  const events = await getAllHistoryEvents({
    getHistoryEvents: async (cursor) => {
      cursors.push(cursor);
      return cursor === null
        ? { records: [{ id: 1, kind: {}, actor: "a", occurred_at_ns: 1 }], next_cursor: 1 }
        : { records: [{ id: 2, kind: {}, actor: "a", occurred_at_ns: 2 }], next_cursor: null };
    },
  });
  assert.deepEqual(cursors, [null, 1]);
  assert.deepEqual(events.map(({ id }) => id), [1, 2]);
});

test("creator commitments come only from their creation events and are deduplicated", async () => {
  const commitments = await getCommitmentsForCreator({
    getHistoryEvents: async () => ({
      records: [
        { id: 1, actor: "alice.testnet", occurred_at_ns: 1, kind: { commitment_created: { commitment_id: 8 } } },
        { id: 2, actor: "bob.testnet", occurred_at_ns: 2, kind: { commitment_created: { commitment_id: 9 } } },
        { id: 3, actor: "alice.testnet", occurred_at_ns: 3, kind: { commitment_amended: { commitment_id: 8, version: 2 } } },
        { id: 4, actor: "alice.testnet", occurred_at_ns: 4, kind: { commitment_created: { commitment_id: 8 } } },
      ], next_cursor: null,
    }),
    getCommitment: async (id) => ({ commitment: { id, created_at_ns: id === "8" ? 10 : 1 }, current_version: {} }),
  }, "alice.testnet");
  assert.deepEqual(commitments.map(({ commitment }) => commitment.id), ["8"]);
});

test("registry summary counts only on-chain event kinds and orders recent history first", async () => {
  const summary = await getRegistrySummary({
    getTokens: async () => ({ records: [{ id: 1 }], next_cursor: null }),
    getHistoryEvents: async () => ({
      records: [
        { id: 1, actor: "a", occurred_at_ns: 1, kind: { commitment_created: { commitment_id: 1 } } },
        { id: 2, actor: "a", occurred_at_ns: 2, kind: { evidence_submitted: { commitment_id: 1, evidence_id: 2 } } },
        { id: 3, actor: "a", occurred_at_ns: 3, kind: { review_recorded: { commitment_id: 1, review_id: 3 } } },
        { id: 4, actor: "a", occurred_at_ns: 4, kind: { dispute_raised: { dispute_id: 4, target: {} } } },
      ], next_cursor: null,
    }),
  });
  assert.deepEqual(
    [summary.tokenCount, summary.commitmentCount, summary.evidenceCount, summary.reviewCount, summary.disputeCount],
    [1, 1, 1, 1, 1],
  );
  assert.deepEqual(summary.events.map(({ id }) => id), [4, 3, 2, 1]);
});
