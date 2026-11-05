import assert from "node:assert/strict";
import test from "node:test";
import {
  filterDiscoverTokens,
  matchesLaunchStatus,
} from "./discover-filter.ts";

const tokens = [
  {
    meme_id: 1,
    name: "Final Nene",
    symbol: "NENE",
    owner: "alice.near",
    token_id: "nene.meme-cooking.near",
    is_finalized: true,
  },
  {
    meme_id: 2,
    name: "Open QCat",
    symbol: "QCAT",
    owner: "bob.near",
    token_id: "qcat.meme-cooking.near",
    is_finalized: false,
  },
  {
    meme_id: 3,
    name: "Null Status",
    symbol: "NULL",
    owner: "carol.near",
    token_id: null,
    is_finalized: null,
  },
  {
    meme_id: 4,
    name: "Missing Status",
    symbol: "MISS",
    owner: "dave.near",
    token_id: undefined,
  },
  {
    meme_id: 5,
    name: "String Status",
    symbol: "STR",
    owner: "erin.near",
    is_finalized: "true",
  },
];

test("All includes every returned record, including records with unknown status", () => {
  assert.deepEqual(
    filterDiscoverTokens(tokens, "", "all").map((token) => token.meme_id),
    [1, 2, 3, 4, 5],
  );
});

test("Finalized and Not Finalized use strict boolean values only", () => {
  assert.deepEqual(
    filterDiscoverTokens(tokens, "", "finalized").map((token) => token.meme_id),
    [1],
  );
  assert.deepEqual(
    filterDiscoverTokens(tokens, "", "not_finalized").map(
      (token) => token.meme_id,
    ),
    [2],
  );
  assert.equal(matchesLaunchStatus(tokens[4], "finalized"), false);
});

test("unknown filter explicitly contains null, missing, and non-boolean status values", () => {
  assert.deepEqual(
    filterDiscoverTokens(tokens, "", "unknown").map((token) => token.meme_id),
    [3, 4, 5],
  );
  assert.deepEqual(
    filterDiscoverTokens(tokens, "null", "unknown").map((token) => token.meme_id),
    [3],
  );
});

test("search combines with each launch filter and clearing search restores filter results", () => {
  assert.deepEqual(
    filterDiscoverTokens(tokens, " NENE ", "finalized").map(
      (token) => token.meme_id,
    ),
    [1],
  );
  assert.deepEqual(
    filterDiscoverTokens(tokens, "bob.near", "not_finalized").map(
      (token) => token.meme_id,
    ),
    [2],
  );
  assert.deepEqual(filterDiscoverTokens(tokens, "qcat", "finalized"), []);
  assert.deepEqual(
    filterDiscoverTokens(tokens, "", "not_finalized").map(
      (token) => token.meme_id,
    ),
    [2],
  );
  assert.deepEqual(
    filterDiscoverTokens(tokens, "near", "all").map((token) => token.meme_id),
    [1, 2, 3, 4, 5],
  );
});
