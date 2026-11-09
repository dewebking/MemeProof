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
  RegistryReadError,
  RegistryTransactionError,
  serializeTransactionArgs,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  client.clearReadCache();
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

function makeReadClient(fetchImpl, options = {}) {
  return new NearRegistryClient({
    networkId: "testnet",
    rpcUrl: "https://primary.testnet.example",
    contractId: "registry.testnet",
  }, {
    fetch: fetchImpl,
    sleep: async () => undefined,
    random: () => 0,
    onDiagnostic: () => undefined,
    ...options,
  });
}

function httpResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

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
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return ({
    ok: true,
    json: async () => ({ error: { message: "Unknown method" } }),
    });
  };
  await assert.rejects(client.getConfig(), (error) =>
    error instanceof RegistryReadError
      && error.kind === "contract_call"
      && /Unknown method/.test(error.message),
  );
  assert.equal(calls, 1, "permanent contract errors are not retried or sent to a second provider");
  assert.throws(() => client.getTokens(null, 51), { kind: "configuration" });
});

test("read-only RPC uses the configured primary when it succeeds", async () => {
  const calls = [];
  const readClient = makeReadClient(async (url) => {
    calls.push(url);
    return rpcResponseText('{"network_id":"testnet"}');
  });
  assert.deepEqual(await readClient.getConfig(), { network_id: "testnet" });
  assert.deepEqual(calls, ["https://primary.testnet.example"]);
});

test("primary RPC transient failure retries then falls back to FastNear testnet", async () => {
  const calls = [];
  const readClient = makeReadClient(async (url) => {
    calls.push(url);
    if (url.includes("primary")) return httpResponse(503, {});
    return rpcResponseText('{"network_id":"testnet"}');
  });
  assert.deepEqual(await readClient.getConfig(), { network_id: "testnet" });
  assert.deepEqual(calls, [
    "https://primary.testnet.example",
    "https://primary.testnet.example",
    "https://rpc.testnet.fastnear.com",
  ]);
  assert.ok(calls.every((url) => !url.includes("mainnet")));
});

test("both testnet read providers unavailable returns a classified error", async () => {
  const calls = [];
  const readClient = makeReadClient(async (url) => {
    calls.push(url);
    return httpResponse(503, {});
  });
  await assert.rejects(readClient.getConfig(), (error) =>
    error instanceof RegistryReadError && error.kind === "rpc_unavailable",
  );
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => !url.includes("mainnet")));
});

test("invalid JSON response fails over and remains classifiable if both providers return malformed JSON", async () => {
  let calls = 0;
  const readClient = makeReadClient(async () => {
    calls += 1;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError("bad json"); } };
  });
  await assert.rejects(readClient.getConfig(), (error) =>
    error instanceof RegistryReadError && error.kind === "invalid_response",
  );
  assert.equal(calls, 2, "malformed data is not retried against the same provider");
});

test("timed out read is retried once and can then succeed", async () => {
  let calls = 0;
  const readClient = makeReadClient(async (_url, init) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }
    return rpcResponseText('{"network_id":"testnet"}');
  }, { timeoutMs: 5 });
  assert.deepEqual(await readClient.getConfig(), { network_id: "testnet" });
  assert.equal(calls, 2);
});

test("HTTP 429 honors Retry-After before retrying the same testnet provider", async () => {
  const waits = [];
  let calls = 0;
  const readClient = makeReadClient(async () => {
    calls += 1;
    if (calls === 1) return httpResponse(429, {}, { "retry-after": "0.25" });
    return rpcResponseText('{"network_id":"testnet"}');
  }, { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await readClient.getConfig(), { network_id: "testnet" });
  assert.equal(calls, 2);
  assert.ok(waits[0] >= 250);
});

test("overlapping identical read calls are deduplicated", async () => {
  let calls = 0;
  let resolveFetch;
  const gate = new Promise((resolve) => { resolveFetch = resolve; });
  const readClient = makeReadClient(async () => {
    calls += 1;
    await gate;
    return rpcResponseText('{"network_id":"testnet"}');
  });
  const first = readClient.getConfig();
  const second = readClient.getConfig();
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveFetch();
  assert.deepEqual(await Promise.all([first, second]), [
    { network_id: "testnet" },
    { network_id: "testnet" },
  ]);
});

test("mainnet RPC endpoints are rejected and are never used as fallback", async () => {
  assert.throws(() => new NearRegistryClient({
    networkId: "testnet",
    rpcUrl: "https://rpc.mainnet.near.org",
    contractId: "registry.testnet",
  }), { kind: "configuration" });
  assert.throws(() => new NearRegistryClient({
    networkId: "testnet",
    rpcUrl: "https://rpc.example.com",
    contractId: "registry.testnet",
  }), { kind: "configuration" });
  assert.throws(() => new NearRegistryClient({
    networkId: "testnet",
    rpcUrl: "https://rpc.mainnet.testnet.example",
    contractId: "registry.testnet",
  }), { kind: "configuration" });
});

test("a read finishing after cache invalidation cannot repopulate stale data", async () => {
  let calls = 0;
  let resolveFirst;
  const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const readClient = makeReadClient(async () => {
    calls += 1;
    if (calls === 1) return firstResponse;
    return rpcResponseText('{"network_id":"fresh"}');
  });

  const beforeInvalidation = readClient.getConfig();
  await Promise.resolve();
  assert.equal(calls, 1);
  readClient.clearReadCache();
  assert.deepEqual(await readClient.getConfig(), { network_id: "fresh" });

  resolveFirst(rpcResponseText('{"network_id":"stale"}'));
  assert.deepEqual(await beforeInvalidation, { network_id: "stale" });
  assert.deepEqual(await readClient.getConfig(), { network_id: "fresh" });
  assert.equal(calls, 2, "the late pre-invalidation read must not replace the fresh cached result");
});

test("missing contract configuration has a distinct read error", () => {
  const keys = ["NEXT_PUBLIC_NEAR_NETWORK_ID", "NEXT_PUBLIC_NEAR_RPC_URL", "NEXT_PUBLIC_REGISTRY_CONTRACT_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NEXT_PUBLIC_NEAR_NETWORK_ID = "testnet";
    process.env.NEXT_PUBLIC_NEAR_RPC_URL = "https://rpc.testnet.near.org";
    delete process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID;
    assert.throws(() => NearRegistryClient.fromEnvironment(), (error) =>
      error instanceof RegistryReadError
        && error.kind === "configuration"
        && /NEXT_PUBLIC_REGISTRY_CONTRACT_ID/.test(error.message),
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
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

test("an uncertain wallet submission is never retried or duplicated", async () => {
  let submissions = 0;
  const wallet = {
    signAndSendTransaction: async () => {
      submissions += 1;
      throw new Error("RPC connection closed before a result arrived");
    },
  };
  await assert.rejects(
    client.submit(wallet, "alice.testnet", "register_token", {}, 0n),
    (error) => error instanceof RegistryTransactionError
      && error.kind === "submission_uncertain"
      && /Check transaction status before trying again/.test(error.message),
  );
  assert.equal(submissions, 1);
});

test("missing wallet transaction return data requires status verification before retry", async () => {
  const wallet = { signAndSendTransaction: async () => ({ status: {} }) };
  await assert.rejects(
    client.submit(wallet, "alice.testnet", "register_token", {}, 0n),
    (error) => error instanceof RegistryTransactionError
      && error.kind === "submission_uncertain"
      && /Check transaction status before trying again/.test(error.message),
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
