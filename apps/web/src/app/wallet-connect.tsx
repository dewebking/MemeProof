"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const connectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectorDialogRef = useRef<HTMLElement | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (!selectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !["restoring", "connecting", "disconnecting"].includes(state)
      ) {
        setSelectorOpen(false);
        clearError();
        connectTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [clearError, selectorOpen, state]);

  useEffect(() => {
    if (!selectorOpen || accountId) return;
    selectorDialogRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [accountId, selectorOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    accountMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
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
    void connect(walletId).then((connected) => {
      if (connected) {
        setSelectorOpen(false);
        window.requestAnimationFrame(() => accountTriggerRef.current?.focus());
      }
    });
  }

  function navigateAccountMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    );
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  function trapSelectorFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !selectorDialogRef.current) return;
    const controls = Array.from(
      selectorDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copyAccountId() {
    if (!accountId) return;
    try {
      await navigator.clipboard.writeText(accountId);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("failed");
    }
    window.setTimeout(() => setCopyFeedback("idle"), 1800);
  }

  const busy =
    state === "restoring" ||
    state === "connecting" ||
    state === "disconnecting";

  return (
    <div
      ref={accountMenuRef}
      className="wallet-control"
      onBlur={(event) => {
        const control = event.currentTarget;
        window.setTimeout(() => {
          if (!control.contains(document.activeElement)) setAccountMenuOpen(false);
        }, 0);
      }}
    >
      {accountId ? (
        <>
          <button
            type="button"
            ref={accountTriggerRef}
            className="wallet-account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            aria-controls="wallet-account-menu"
            onClick={() => setAccountMenuOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setAccountMenuOpen(true);
              }
            }}
            title={accountId}
          >
            <span className="wallet-account-mark" aria-hidden="true">
              {accountId.slice(0, 1).toUpperCase()}
            </span>
            <span className="wallet-account-short">
              {accountId.length > 17
                ? `${accountId.slice(0, 8)}…${accountId.slice(-5)}`
                : accountId}
            </span>
            <span className="wallet-account-mobile">
              {accountId.length > 10
                ? `${accountId.slice(0, 4)}...${accountId.slice(-4)}`
                : accountId}
            </span>
            <span className="wallet-network-indicator" aria-label="Connected to NEAR testnet"><i aria-hidden="true" /><span>Testnet</span></span>
            <span className="wallet-account-chevron" aria-hidden="true">
              ⌄
            </span>
          </button>
          {accountMenuOpen && (
            <div
              className="wallet-account-menu"
              id="wallet-account-menu"
              role="menu"
              aria-label="Connected NEAR account"
              onKeyDown={navigateAccountMenu}
            >
              <span className="wallet-account-label">CONNECTED ACCOUNT</span>
              <b className="wallet-account-id" title={accountId}>
                {accountId}
              </b>
              <div className="wallet-menu-network"><i aria-hidden="true" /><span><b>NEAR testnet</b><small>Development network</small></span></div>
              <button type="button" role="menuitem" onClick={() => void copyAccountId()} aria-live="polite">
                {copyFeedback === "copied" ? "Account ID copied" : copyFeedback === "failed" ? "Could not copy account ID" : "Copy account ID"}
              </button>
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
                  void disconnect().then(() => {
                    window.requestAnimationFrame(() => connectTriggerRef.current?.focus());
                  });
                }}
              >
                {state === "disconnecting" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          ref={connectTriggerRef}
          type="button"
          onClick={() => {
            clearError();
            setSelectorOpen(true);
          }}
          disabled={busy}
          aria-busy={busy}
          aria-haspopup="dialog"
          className="wallet-connect-trigger"
        >
          {busy && <span className="wallet-spinner" aria-hidden="true" />}
          {!busy && <svg className="wallet-connect-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6.5h12.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A2.5 2.5 0 0 1 2 13V5a2 2 0 0 1 2-2h10"/><path d="M13 10h4m-1.5-1.5v3"/></svg>}
          <span className="wallet-connect-label">
            {state === "restoring"
              ? "Restoring wallet..."
              : state === "connecting"
                ? "Connecting..."
                : "Connect wallet"}
          </span>
          <span className="wallet-connect-network"><i aria-hidden="true" />NEAR testnet</span>
        </button>
      )}
      {error && (
        <p role="alert" className="wallet-error">
          {error}
        </p>
      )}
      {selectorOpen &&
        !accountId &&
        createPortal(
          <div
            className="wallet-selector-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy) {
                setSelectorOpen(false);
                clearError();
                window.requestAnimationFrame(() => connectTriggerRef.current?.focus());
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="near-wallet-selector-title"
              className="wallet-selector-dialog"
              ref={selectorDialogRef}
              onKeyDown={trapSelectorFocus}
            >
              <div>
                <h2 id="near-wallet-selector-title">
                  Choose a NEAR testnet wallet
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectorOpen(false);
                    clearError();
                    window.requestAnimationFrame(() => connectTriggerRef.current?.focus());
                  }}
                  disabled={busy}
                  aria-label="Close wallet selector"
                  className="wallet-selector-close"
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
                <ul className="wallet-options">
                  {wallets.map((wallet) => (
                    <li key={wallet.id}>
                      <button
                        type="button"
                        onClick={() => chooseWallet(wallet.id)}
                        disabled={busy}
                        className="wallet-option"
                      >
                        <Image
                          src={wallet.icon}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="wallet-option-icon"
                        />
                        <span className="wallet-option-copy">
                          <span className="wallet-option-name">
                            {wallet.name}
                          </span>
                          <span className="wallet-option-description">
                            {wallet.description}
                          </span>
                        </span>
                        {state === "connecting" && (
                          <span
                            className="wallet-connecting"
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
