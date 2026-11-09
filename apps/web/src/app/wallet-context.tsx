"use client";

import { NearConnector } from "@hot-labs/near-connect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getRegistryClient,
  RegistryTransactionError,
  type RegistryTransactionResult,
  type NearWalletSigner,
} from "../lib/near/registry";
import { invalidateRegistryDataCache } from "../lib/near/registry-data";

export type WalletState =
  "restoring" | "disconnected" | "connecting" | "connected" | "disconnecting";

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
}

type NearWallet = Awaited<ReturnType<NearConnector["connect"]>>;

interface WalletContextValue {
  state: WalletState;
  accountId: string | null;
  wallet: NearWallet | null;
  wallets: WalletOption[];
  walletsLoading: boolean;
  transactionPending: boolean;
  error: string | null;
  clearError: () => void;
  connect: (walletId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  switchWallet: () => Promise<void>;
  submitRegistryFunction: <T>(
    methodName: string,
    args: Record<string, unknown>,
    attachedDepositYocto: bigint,
  ) => Promise<RegistryTransactionResult<T>>;
}

const TESTNET_NEAR_WALLETS = new Set([
  "meteor-wallet",
  "intear-wallet",
  "ledger",
  "nightly-wallet",
]);
const RESTORE_TIMEOUT_MS = 5000;
const CONNECTION_TIMEOUT_MS = 60000;

const WalletContext = createContext<WalletContextValue | null>(null);

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

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const transactionPendingRef = useRef(false);
  const allowSignInRef = useRef(false);
  const [state, setState] = useState<WalletState>("disconnected");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<NearWallet | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [transactionPending, setTransactionPending] = useState(false);
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

    connector.on("wallet:signIn", (event) => {
      if (!active || !allowSignInRef.current) return;
      const account = event.accounts.find((item) =>
        isAccountId(item.accountId),
      );
      if (
        !account ||
        !TESTNET_NEAR_WALLETS.has(event.wallet.manifest.id) ||
        event.wallet.manifest.features.testnet !== true
      )
        return;
      setWallet(event.wallet);
      setAccountId(account.accountId);
      setState("connected");
      setError(null);
    });
    connector.on("wallet:signOut", () => {
      if (!active) return;
      setWallet(null);
      setAccountId(null);
      setState("disconnected");
      allowSignInRef.current = false;
    });

    void connector.whenManifestLoaded
      .then(async () => {
        if (!active) return;
        const eligibleWallets = connector.availableWallets
          .filter(
            (candidate) =>
              TESTNET_NEAR_WALLETS.has(candidate.manifest.id) &&
              candidate.manifest.features.testnet === true,
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
        allowSignInRef.current = true;
        try {
          const session = await withTimeout(
            connector.getConnectedWallet(),
            RESTORE_TIMEOUT_MS,
          );
          if (
            !TESTNET_NEAR_WALLETS.has(session.wallet.manifest.id) ||
            session.wallet.manifest.features.testnet !== true
          ) {
            throw new Error(
              "The saved wallet is not enabled for NEAR testnet.",
            );
          }
          const restoredAccount = session.accounts.find((account) =>
            isAccountId(account.accountId),
          )?.accountId;
          if (!restoredAccount) throw new Error("No valid account in session.");
          if (active) {
            setWallet(session.wallet);
            setAccountId(restoredAccount);
            setState("connected");
            setError(null);
          }
        } catch {
          allowSignInRef.current = false;
          await connector.disconnect().catch(() => undefined);
          window.localStorage.removeItem("selected-wallet");
          if (active) {
            setWallet(null);
            setAccountId(null);
            setState("disconnected");
          }
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setWalletsLoading(false);
        setWallets([]);
        setError(messageOf(cause, "Could not load supported NEAR wallets."));
      });

    return () => {
      active = false;
      connector.removeAllListeners();
      connectorRef.current = null;
    };
  }, []);

  const connect = useCallback(async (walletId: string) => {
    const connector = connectorRef.current;
    if (!connector || !TESTNET_NEAR_WALLETS.has(walletId)) return false;
    if (transactionPendingRef.current) {
      setError(
        "Wait for the registry transaction to finish before switching wallets.",
      );
      return false;
    }
    allowSignInRef.current = true;
    setState("connecting");
    setError(null);
    try {
      const selectedWallet = await withTimeout(
        connector.connect({ walletId }),
        CONNECTION_TIMEOUT_MS,
      );
      if (selectedWallet.manifest.features.testnet !== true) {
        throw new Error("The selected wallet is not enabled for NEAR testnet.");
      }
      const accounts = await withTimeout(
        selectedWallet.getAccounts({ network: "testnet" }),
        RESTORE_TIMEOUT_MS,
      );
      const account = accounts.find((item) => isAccountId(item.accountId));
      if (!account)
        throw new Error("The wallet returned no valid NEAR account.");
      setWallet(selectedWallet);
      setAccountId(account.accountId);
      setState("connected");
      return true;
    } catch (cause) {
      allowSignInRef.current = false;
      await connector.disconnect().catch(() => undefined);
      window.localStorage.removeItem("selected-wallet");
      setWallet(null);
      setAccountId(null);
      setState("disconnected");
      setError(messageOf(cause, "Wallet connection failed. Please try again."));
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (transactionPendingRef.current) {
      setError(
        "Wait for the registry transaction to finish before disconnecting.",
      );
      return;
    }
    setState("disconnecting");
    setError(null);
    try {
      await connector.disconnect(wallet ?? undefined);
      setWallet(null);
      setAccountId(null);
      setState("disconnected");
      allowSignInRef.current = false;
    } catch (cause) {
      setState("connected");
      setError(messageOf(cause, "Could not disconnect wallet."));
    }
  }, [wallet]);

  const switchWallet = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (transactionPendingRef.current) {
      const error = new Error(
        "Wait for the registry transaction to finish before switching wallets.",
      );
      setError(error.message);
      throw error;
    }
    setError(null);
    try {
      await connector.disconnect(wallet ?? undefined);
      setWallet(null);
      setAccountId(null);
      setState("disconnected");
      allowSignInRef.current = false;
    } catch (cause) {
      setState("connected");
      setError(messageOf(cause, "Could not switch wallet."));
      throw cause;
    }
  }, [wallet]);

  const submitRegistryFunction = useCallback(
    async <T,>(
      methodName: string,
      args: Record<string, unknown>,
      attachedDepositYocto: bigint,
    ) => {
      if (!wallet || !accountId || state !== "connected") {
        throw new Error(
          "Connect a NEAR testnet wallet before submitting this transaction.",
        );
      }
      if (transactionPendingRef.current) {
        throw new Error(
          "A registry transaction is already awaiting wallet confirmation.",
        );
      }
      transactionPendingRef.current = true;
      setTransactionPending(true);
      setError(null);
      try {
        const client = getRegistryClient();
        const result = await client.submit<T>(
          wallet as unknown as NearWalletSigner,
          accountId,
          methodName,
          args,
          attachedDepositYocto,
        );
        client.clearReadCache();
        invalidateRegistryDataCache();
        return result;
      } catch (cause) {
        if (cause instanceof RegistryTransactionError && cause.kind === "submission_uncertain") {
          getRegistryClient().clearReadCache();
          invalidateRegistryDataCache();
        }
        throw cause;
      } finally {
        transactionPendingRef.current = false;
        setTransactionPending(false);
      }
    },
    [accountId, state, wallet],
  );

  const clearError = useCallback(() => setError(null), []);
  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      accountId,
      wallet,
      wallets,
      walletsLoading,
      transactionPending,
      error,
      clearError,
      connect,
      disconnect,
      switchWallet,
      submitRegistryFunction,
    }),
    [
      state,
      accountId,
      wallet,
      wallets,
      walletsLoading,
      transactionPending,
      error,
      clearError,
      connect,
      disconnect,
      switchWallet,
      submitRegistryFunction,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useNearWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context)
    throw new Error("useNearWallet must be used inside WalletProvider.");
  return context;
}
