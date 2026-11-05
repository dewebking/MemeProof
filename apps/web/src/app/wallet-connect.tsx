"use client";

import { NearConnector } from "@hot-labs/near-connect";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type WalletState =
  "restoring" | "disconnected" | "connecting" | "connected" | "disconnecting";

type WalletOption = {
  id: string;
  name: string;
  icon: string;
  description: string;
};

// These wallet IDs currently have explicit NEAR testnet support in the HOT
// Connect manifest. Intentionally omit WalletConnect and EVM bridge adapters.
const TESTNET_NEAR_WALLETS = new Set([
  "meteor-wallet",
  "intear-wallet",
  "ledger",
  "nightly-wallet",
]);
const RESTORE_TIMEOUT_MS = 5000;
const CONNECTION_TIMEOUT_MS = 60000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("The wallet did not respond in time.")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isAccountId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default function WalletConnect() {
  const connectorRef = useRef<NearConnector | null>(null);
  const [state, setState] = useState<WalletState>("disconnected");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const connector = new NearConnector({
      network: "testnet",
      features: { testnet: true },
      autoConnect: false,
      excludedWallets: ["ethereum-wallets", "wallet-connect", "unity-wallet"],
      footerBranding: null,
      cspNonce:
        document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ||
        undefined,
    });
    connectorRef.current = connector;

    const onSignIn = (event: { accounts: Array<{ accountId: string }> }) => {
      if (!active) return;
      const account = event.accounts.find((item) =>
        isAccountId(item.accountId),
      );
      if (!account) return;
      setAccountId(account.accountId);
      setState("connected");
      setSelectorOpen(false);
      setError(null);
    };
    const onSignOut = () => {
      if (!active) return;
      setAccountId(null);
      setState("disconnected");
      setSelectorOpen(false);
      setError(null);
    };
    connector.on("wallet:signIn", onSignIn);
    connector.on("wallet:signOut", onSignOut);

    void connector.whenManifestLoaded.then(async () => {
      if (!active) return;
      const eligibleWallets = connector.availableWallets
        .filter(
          (wallet) =>
            TESTNET_NEAR_WALLETS.has(wallet.manifest.id) &&
            wallet.manifest.features.testnet === true,
        )
        .map(({ manifest }) => ({
          id: manifest.id,
          name: manifest.name,
          icon: manifest.icon,
          description: manifest.description,
        }));
      setWallets(eligibleWallets);
      setWalletsLoading(false);
      if (eligibleWallets.length === 0) {
        setError(
          "No supported NEAR testnet wallets could be loaded. Check your connection and try again.",
        );
      }

      if (!window.localStorage.getItem("selected-wallet")) return;
      setState("restoring");
      try {
        const session = await withTimeout(
          connector.getConnectedWallet(),
          RESTORE_TIMEOUT_MS,
        );
        if (!TESTNET_NEAR_WALLETS.has(session.wallet.manifest.id)) {
          throw new Error("The saved wallet is not enabled for NEAR testnet.");
        }
        const restoredAccount = session.accounts.find((account) =>
          isAccountId(account.accountId),
        )?.accountId;
        if (!restoredAccount) throw new Error("No valid account in session.");
        if (active) {
          setAccountId(restoredAccount);
          setState("connected");
          setError(null);
        }
      } catch {
        await connector.disconnect().catch(() => undefined);
        if (active) {
          setAccountId(null);
          setState("disconnected");
        }
      }
    });

    return () => {
      active = false;
      connector.removeAllListeners();
      connectorRef.current = null;
    };
  }, []);

  async function connect(wallet: WalletOption) {
    const connector = connectorRef.current;
    if (!connector || !TESTNET_NEAR_WALLETS.has(wallet.id)) return;
    setState("connecting");
    setError(null);
    try {
      const selectedWallet = await withTimeout(
        connector.connect({ walletId: wallet.id }),
        CONNECTION_TIMEOUT_MS,
      );
      const accounts = await withTimeout(
        selectedWallet.getAccounts({ network: "testnet" }),
        RESTORE_TIMEOUT_MS,
      );
      const account = accounts.find((item) =>
        isAccountId(item.accountId),
      )?.accountId;
      if (!account)
        throw new Error("The wallet returned no valid NEAR account.");
      setAccountId(account);
      setState("connected");
      setSelectorOpen(false);
    } catch (cause) {
      setAccountId(null);
      setState("disconnected");
      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet connection failed. Please choose a wallet and try again.",
      );
    }
  }

  async function disconnect() {
    const connector = connectorRef.current;
    if (!connector) return;
    setState("disconnecting");
    setError(null);
    try {
      await connector.disconnect();
      setAccountId(null);
      setState("disconnected");
    } catch (cause) {
      setState("connected");
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect wallet.",
      );
    }
  }

  async function switchWallet() {
    const connector = connectorRef.current;
    if (!connector) return;
    setError(null);
    try {
      await connector.disconnect();
      setAccountId(null);
      setState("disconnected");
      setSelectorOpen(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not switch wallet.",
      );
    }
  }

  const busy =
    state === "restoring" ||
    state === "connecting" ||
    state === "disconnecting";

  return (
    <div className="flex flex-col items-end gap-2">
      <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">
        NEAR TESTNET
      </span>
      {accountId ? (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span
            className="max-w-56 truncate text-emerald-200"
            title={accountId}
          >
            {accountId}
          </span>
          <button
            type="button"
            onClick={switchWallet}
            disabled={busy}
            className="rounded-md border border-white/15 px-3 py-2 text-zinc-200 transition hover:border-white/30 disabled:opacity-50"
          >
            Switch Wallet
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="rounded-md border border-white/15 px-3 py-2 text-zinc-200 transition hover:border-white/30 disabled:opacity-50"
          >
            {state === "disconnecting" ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setSelectorOpen(true);
          }}
          disabled={busy}
          className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
        >
          {state === "restoring"
            ? "Restoring wallet..."
            : state === "connecting"
              ? "Connecting..."
              : "Connect NEAR Wallet"}
        </button>
      )}
      {state === "connected" && (
        <p role="status" className="text-xs text-emerald-300">
          Wallet connected to NEAR testnet.
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-rose-300">
          {error}
        </p>
      )}
      {selectorOpen && !accountId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setSelectorOpen(false);
              setError(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="near-wallet-selector-title"
            className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-900 p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2
                id="near-wallet-selector-title"
                className="text-lg font-semibold text-white"
              >
                Choose a NEAR testnet wallet
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSelectorOpen(false);
                  setError(null);
                }}
                disabled={busy}
                aria-label="Close wallet selector"
                className="rounded px-2 py-1 text-zinc-300 hover:bg-white/10 disabled:opacity-50"
              >
                Close
              </button>
            </div>
            {walletsLoading ? (
              <p className="py-6 text-sm text-zinc-300">
                Loading supported wallets...
              </p>
            ) : wallets.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {wallets.map((wallet) => (
                  <li key={wallet.id}>
                    <button
                      type="button"
                      onClick={() => void connect(wallet)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-lg border border-white/10 p-3 text-left transition hover:border-emerald-300/50 hover:bg-white/5 disabled:opacity-50"
                    >
                      <Image
                        src={wallet.icon}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded-lg bg-white/10 object-contain p-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-white">
                          {wallet.name}
                        </span>
                        <span className="block truncate text-xs text-zinc-400">
                          {wallet.description}
                        </span>
                      </span>
                      {state === "connecting" && (
                        <span className="text-xs text-emerald-300">
                          Connecting...
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm text-zinc-300">
                No NEAR testnet wallets are currently available.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-rose-300">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
