import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./registry-data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('from "./registry"', 'from "data:text/javascript,export {};"');
const { getAllHistoryEvents, getAllCommitments, getAllDisputes, getAllEvidences, getAllReviews, getReviewsForEvidence, getCommitmentVersionsForCommitment, invalidateRegistryDataCache, getCommitmentsForCreator, getRegistrySummary } = await import(
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

test("evidence, review, and dispute selectors page through on-chain records", async () => {
  const pages = (name) => {
    const cursors = [];
    return {
      cursors,
      fetch: async (cursor, limit) => {
        cursors.push([cursor, limit]);
        return cursor === null
          ? { records: [{ id: `${name}-1` }], next_cursor: `${name}-1` }
          : { records: [{ id: `${name}-2` }], next_cursor: null };
      },
    };
  };
  const evidence = pages("evidence");
  const reviews = pages("review");
  const disputes = pages("dispute");
  assert.deepEqual((await getAllEvidences({ getEvidences: evidence.fetch })).map(({ id }) => id), ["evidence-1", "evidence-2"]);
  assert.deepEqual((await getAllReviews({ getReviews: reviews.fetch })).map(({ id }) => id), ["review-1", "review-2"]);
  assert.deepEqual((await getAllDisputes({ getDisputes: disputes.fetch })).map(({ id }) => id), ["dispute-1", "dispute-2"]);
  assert.deepEqual(evidence.cursors, [[null, 50], ["evidence-1", 50]]);
  assert.deepEqual(reviews.cursors, [[null, 50], ["review-1", 50]]);
  assert.deepEqual(disputes.cursors, [[null, 50], ["dispute-1", 50]]);
});

test("public commitment selector uses created events and preserves decimal u64 IDs", async () => {
  const id = "9007199254740993";
  const records = await getAllCommitments({
    getHistoryEvents: async () => ({
      records: [
        { id: 1, actor: "alice.testnet", occurred_at_ns: 1, kind: { commitment_created: { commitment_id: id } } },
        { id: 2, actor: "alice.testnet", occurred_at_ns: 2, kind: { commitment_amended: { commitment_id: id, version: 2 } } },
      ], next_cursor: null,
    }),
    getCommitment: async (requestedId) => ({ commitment: { id: requestedId, created_at_ns: 10 }, current_version: { version: 2 } }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].commitment.id, id);
});

test("identical registry list scans share a fresh result and can be invalidated", async () => {
  let calls = 0;
  const client = {
    getHistoryEvents: async () => {
      calls += 1;
      return { records: [{ id: 1, actor: "alice.testnet", occurred_at_ns: 1, kind: {} }], next_cursor: null };
    },
  };
  const first = await getAllHistoryEvents(client);
  const second = await getAllHistoryEvents(client);
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  invalidateRegistryDataCache();
  await getAllHistoryEvents(client);
  assert.equal(calls, 2);
});

test("review selector fetches only the selected evidence review pages", async () => {
  const cursors = [];
  const reviews = await getReviewsForEvidence({
    getReviewsByEvidence: async (evidenceId, cursor, limit) => {
      assert.equal(String(evidenceId), "77");
      assert.equal(limit, 50);
      cursors.push(cursor);
      return cursor === null
        ? { records: [{ id: 1, evidence_id: "77" }], next_cursor: "1" }
        : { records: [{ id: 2, evidence_id: "77" }], next_cursor: null };
    },
  }, "77");
  assert.deepEqual(cursors, [null, "1"]);
  assert.deepEqual(reviews.map(({ id }) => id), [1, 2]);
});

test("commitment version history is fetched only for a selected commitment and reuses its cached pages", async () => {
  const requests = [];
  const client = {
    getCommitmentVersions: async (commitmentId, cursor, limit) => {
      requests.push([String(commitmentId), cursor, limit]);
      return cursor === null
        ? { versions: [{ version: 2 }, { version: 1 }], next_cursor: 2 }
        : { versions: [{ version: 3 }], next_cursor: null };
    },
  };
  const versions = await getCommitmentVersionsForCommitment(client, "77");
  assert.deepEqual(versions.map(({ version }) => version), [3, 2, 1]);
  assert.deepEqual(requests, [["77", null, 50], ["77", 2, 50]]);
  await getCommitmentVersionsForCommitment(client, "77");
  assert.equal(requests.length, 2);
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
