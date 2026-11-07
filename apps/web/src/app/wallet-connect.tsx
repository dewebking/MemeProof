"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNearWallet } from "./wallet-context";

export default function WalletConnect() {
  const {
    state,
    accountId,
    wallets,
    walletsLoading,
    error,
    clearError,
    connect,
    disconnect,
    switchWallet: switchConnectedWallet,
  } = useNearWallet();
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (!selectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !["restoring", "connecting", "disconnecting"].includes(state)
      ) {
        setSelectorOpen(false);
        clearError();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [clearError, selectorOpen, state]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountMenuRef.current?.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeMenu);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [accountMenuOpen]);

  async function switchWallet() {
    clearError();
    try {
      await switchConnectedWallet();
      setSelectorOpen(true);
    } catch {
      // The provider keeps the existing session and exposes the failure message.
    }
  }

  function chooseWallet(walletId: string) {
    void connect(walletId);
  }

  const busy =
    state === "restoring" ||
    state === "connecting" ||
    state === "disconnecting";

  return (
    <div
      ref={accountMenuRef}
      className="wallet-control flex flex-col items-end gap-2"
    >
      <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">
        NEAR TESTNET
      </span>
      {accountId ? (
        <>
          <button
            type="button"
            className="mobile-account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            aria-controls="wallet-account-menu"
            onClick={() => setAccountMenuOpen((current) => !current)}
            title={accountId}
          >
            <span className="mobile-account-mark" aria-hidden="true">
              {accountId.slice(0, 1).toUpperCase()}
            </span>
            <span className="mobile-account-short">
              {accountId.length > 17
                ? `${accountId.slice(0, 8)}…${accountId.slice(-5)}`
                : accountId}
            </span>
            <span className="mobile-account-chevron" aria-hidden="true">
              ⌄
            </span>
          </button>
          {accountMenuOpen && (
            <div
              className="mobile-account-menu"
              id="wallet-account-menu"
              role="menu"
              aria-label="Connected NEAR account"
            >
              <span className="mobile-account-label">CONNECTED ACCOUNT</span>
              <b className="mobile-account-id" title={accountId}>
                {accountId}
              </b>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setAccountMenuOpen(false);
                  void switchWallet();
                }}
              >
                Switch wallet
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setAccountMenuOpen(false);
                  void disconnect();
                }}
              >
                {state === "disconnecting" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          )}
          <div className="connected-actions flex flex-wrap items-center justify-end gap-3 text-sm">
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
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            clearError();
            setSelectorOpen(true);
          }}
          disabled={busy}
          aria-busy={busy}
          className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
        >
          {busy && <span className="wallet-spinner" aria-hidden="true" />}
          <span className="desktop-wallet-label">
            {state === "restoring"
              ? "Restoring wallet..."
              : state === "connecting"
                ? "Connecting..."
                : "Connect NEAR Wallet"}
          </span>
          <span className="mobile-wallet-label">
            {busy ? "Connecting…" : "Connect wallet"}
          </span>
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
      {selectorOpen &&
        !accountId &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy) {
                setSelectorOpen(false);
                clearError();
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
                    clearError();
                  }}
                  disabled={busy}
                  aria-label="Close wallet selector"
                  className="rounded px-2 py-1 text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
              {walletsLoading ? (
                <p
                  className="wallet-loading py-6 text-sm text-zinc-300"
                  role="status"
                >
                  <span className="wallet-spinner" aria-hidden="true" /> Loading
                  supported wallets...
                </p>
              ) : wallets.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {wallets.map((wallet) => (
                    <li key={wallet.id}>
                      <button
                        type="button"
                        onClick={() => chooseWallet(wallet.id)}
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
                          <span
                            className="wallet-connecting text-xs text-emerald-300"
                            role="status"
                          >
                            <span
                              className="wallet-spinner"
                              aria-hidden="true"
                            />
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
          </div>,
          document.body,
        )}
    </div>
  );
}
