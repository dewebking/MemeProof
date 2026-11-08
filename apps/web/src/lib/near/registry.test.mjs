import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("./registry.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  NearRegistryClient,
  RegistryTransactionError,
  serializeTransactionArgs,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function rpcResponseText(text) {
  const bytes = new TextEncoder().encode(text);
  return {
    ok: true,
    json: async () => ({ result: { result: [...bytes] } }),
  };
}

const client = new NearRegistryClient({
  networkId: "testnet",
  rpcUrl: "https://rpc.testnet.near.org",
  contractId: "registry.testnet",
});

test("view calls encode u64 cursors exactly and decode large response integers", async () => {
  const cursor = "18446744073709551614";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.params.account_id, "registry.testnet");
    assert.equal(
      Buffer.from(body.params.args_base64, "base64").toString(),
      '{"after_id":18446744073709551614,"limit":4}',
    );
    return rpcResponseText(
      '{"records":[{"id":18446744073709551614}],"next_cursor":18446744073709551615}',
    );
  };

  const page = await client.getTokens(cursor, 4);
  assert.equal(page.records[0].id, cursor);
  assert.equal(page.next_cursor, "18446744073709551615");
});

test("view calls report RPC errors and reject invalid page limits", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ error: { message: "Unknown method" } }),
  });
  await assert.rejects(client.getConfig(), {
    kind: "rpc",
    message: "Unknown method",
  });
  assert.throws(() => client.getTokens(null, 51), { kind: "configuration" });
});

test("transaction arguments preserve decimal u64 strings through HOT signing", async () => {
  const args = {
    token_id: "18446744073709551615",
    deadline_at_ns: "1735689600123456789",
  };
  const submittedArgs = {
    ...args,
    title: "title",
    description: "description",
    criteria: "criteria",
  };
  const wallet = {
    signAndSendTransaction: async (request) => {
      assert.equal(request.network, "testnet");
      assert.equal(request.signerId, "alice.testnet");
      assert.equal(request.receiverId, "registry.testnet");
      const action = request.actions[0];
      assert.equal(action.params.methodName, "create_commitment_decimal");
      assert.deepEqual(
        JSON.parse(JSON.stringify(action.params.args)),
        submittedArgs,
      );
      assert.equal(action.params.gas, "100000000000000");
      assert.equal(action.params.deposit, "1");
      return {
        transaction: { hash: "tx-hash" },
        status: {
          SuccessValue: Buffer.from(
            JSON.stringify({ id: args.token_id }),
          ).toString("base64"),
        },
      };
    },
  };
  assert.deepEqual(serializeTransactionArgs(args), args);
  const result = await client.createCommitment(
    wallet,
    "alice.testnet",
    {
      ...submittedArgs,
    },
    1n,
  );
  assert.deepEqual(result, {
    value: { id: args.token_id },
    transactionHash: "tx-hash",
  });
});

test("submit_evidence sends the contract's exact JSON argument types", async () => {
  const wallet = {
    signAndSendTransaction: async (request) => {
      const action = request.actions[0];
      assert.equal(action.params.methodName, "submit_evidence");
      assert.deepEqual(action.params.args, {
        commitment_id: 1,
        version: 1,
        reference: "https://example.com/evidence.json",
        content_hash: "a".repeat(64),
      });
      assert.equal(typeof action.params.args.commitment_id, "number");
      assert.equal(typeof action.params.args.version, "number");
      return {
        transaction: { hash: "evidence-tx" },
        status: { SuccessValue: Buffer.from("{}").toString("base64") },
      };
    },
  };

  await client.submit(
    wallet,
    "alice.testnet",
    "submit_evidence",
    {
      commitment_id: "1",
      version: 1,
      reference: "https://example.com/evidence.json",
      content_hash: "a".repeat(64),
    },
    0n,
  );
});

test("Rust u64 write identifiers serialize as numbers while u32 and decimal-entry strings retain their types", () => {
  assert.deepEqual(
    serializeTransactionArgs(
      {
        target: {
          commitment: { commitment_id: "12", version: 3 },
        },
      },
      "open_dispute",
    ),
    { target: { commitment: { commitment_id: 12, version: 3 } } },
  );
  assert.deepEqual(
    serializeTransactionArgs({ evidence_id: "23" }, "submit_review"),
    { evidence_id: 23 },
  );
  assert.deepEqual(
    serializeTransactionArgs({ dispute_id: "34" }, "resolve_dispute"),
    { dispute_id: 34 },
  );
  assert.deepEqual(
    serializeTransactionArgs(
      { token_id: "18446744073709551615", deadline_at_ns: "1735689600123456789" },
      "create_commitment_decimal",
    ),
    { token_id: "18446744073709551615", deadline_at_ns: "1735689600123456789" },
  );
  assert.throws(
    () =>
      serializeTransactionArgs(
        { commitment_id: "9007199254740992" },
        "submit_evidence",
      ),
    (error) =>
      error instanceof RegistryTransactionError &&
      error.kind === "configuration",
  );
});

test("transaction failures and wallet rejections are surfaced with useful kinds", async () => {
  const failedWallet = {
    signAndSendTransaction: async () => ({
      status: { Failure: { ActionError: { index: 0 } } },
    }),
  };
  await assert.rejects(
    client.submit(failedWallet, "alice.testnet", "register_token", {}, 0n),
    (error) =>
      error instanceof RegistryTransactionError && error.kind === "transaction",
  );

  const rejectingWallet = {
    signAndSendTransaction: async () => {
      throw new Error("User rejected the request");
    },
  };
  await assert.rejects(
    client.submit(rejectingWallet, "alice.testnet", "register_token", {}, 0n),
    (error) =>
      error instanceof RegistryTransactionError &&
      error.kind === "wallet_rejected",
  );
});

test("transaction args reject BigInt so exact u64 values cannot be silently JSON-corrupted", () => {
  assert.throws(
    () => serializeTransactionArgs({ deadline_at_ns: 1735689600123456789n }),
    (error) =>
      error instanceof RegistryTransactionError &&
      error.kind === "configuration",
  );
});
