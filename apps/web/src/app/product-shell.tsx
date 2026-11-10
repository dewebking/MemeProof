"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import WalletConnect from "./wallet-connect";
import DiscoverTokens from "./discover-tokens";
import { CreateCommitmentForm, RegisterTokenForm } from "./registry-actions";
import { CommunityReviewExperience, DisputeManagementExperience, EvidenceSubmissionExperience } from "./registry-experiences";
import { ActivityRegistryView, MyCommitmentsView, OverviewRegistryView } from "./registry-views";
import { RegistryPassportDirectory } from "./registry-passports";
import { useNearWallet } from "./wallet-context";

const nav = [
  ["/overview", "Overview", "O"], ["/discover", "Discover", "D"],
  ["/register-token", "Register token", "◉"], ["/my-commitments", "Commitments", "C"], ["/create-commitment", "New commitment", "+"],
  ["/evidence", "Submit evidence", "↗"], ["/verification", "Reviews & disputes", "◉"],
  ["/activity", "Activity", "↗"], ["/profile", "Profile", "◉"], ["/settings", "Settings", "⚙"],
];

function NavigationIcon({ name }: { name: string }) {
  const iconPaths: Record<string, ReactNode> = {
    O: <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/></>,
    D: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    C: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    "+": <><path d="M12 5v14M5 12h14"/></>,
    "↗": <><path d="M4 16 9 11l4 3 7-8"/><path d="M14 6h6v6"/></>,
    "◉": <><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
    "⚙": <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.4 1.7 1.7 0 0 0 1-1.6V4h3.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.4 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.4h-.2a1.7 1.7 0 0 0-1.2.9Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name] ?? iconPaths.O}</svg>;
}

export function ProductShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem("memeproof-sidebar-collapsed") === "true");
      setSidebarPreferenceReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (sidebarPreferenceReady) {
      window.localStorage.setItem("memeproof-sidebar-collapsed", String(collapsed));
    }
  }, [collapsed, sidebarPreferenceReady]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return <div className={`app-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside id="workspace-navigation" className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand-row"><Link className="brand" href="/" aria-label="MemeProof home"><BrandLogo /></Link><button type="button" className="sidebar-collapse-toggle" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-controls="workspace-navigation" aria-expanded={!collapsed}><span aria-hidden="true">{collapsed ? "›" : "‹"}</span></button></div>
      <div className="workspace-label">WORKSPACE <span>TESTNET</span></div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <div className="nav-group-label">Registry</div>
        {nav.slice(0, 3).map(([href, label, icon]) => <Link key={href} href={href} title={collapsed ? label : undefined} aria-label={label} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span><span className="nav-link-label">{label}</span></Link>)}
        <div className="nav-group-label nav-group-spaced">Your workspace</div>
        {nav.slice(3, 8).map(([href, label, icon]) => <Link key={href} href={href} title={collapsed ? label : undefined} aria-label={label} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span><span className="nav-link-label">{label}</span></Link>)}
        <div className="nav-group-label nav-group-spaced">Account</div>
        {nav.slice(8).map(([href, label, icon]) => <Link key={href} href={href} title={collapsed ? label : undefined} aria-label={label} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span><span className="nav-link-label">{label}</span></Link>)}
      </nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="live-dot" /><div><b>NEAR testnet</b><small>Development network</small></div></div><div className="sidebar-foot">MemeProof preview <span>v0.1</span></div></div>
    </aside>
    {open && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setOpen(false)} />}
    <div className="app-main"><header className="topbar"><div className="topbar-start"><button ref={menuToggleRef} className={`menu-toggle ${open ? "menu-toggle-open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="workspace-navigation"><span/><span/><span/></button><div className="breadcrumb"><Link href="/overview">Workspace</Link><span aria-hidden="true">/</span><b>{nav.find(([href]) => href === path)?.[1] ?? "Commitment Passport"}</b></div></div><div className="topbar-right"><span className="testnet-chip"><i /> NEAR TESTNET</span><WalletConnect /></div></header><main className="page-content" key={path}>{children}</main><footer className="app-footer"><span>MemeProof · NEAR testnet preview</span><span>Registry pages read from the configured contract</span></footer></div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function ProductPage({ page }: { page: string }) {
  const [query, setQuery] = useState("");
  const { accountId, state } = useNearWallet();

  if (page === "overview") return <>
    <section className="overview-hero" aria-labelledby="overview-title">
      <div className="overview-hero-copy"><span className="overview-kicker"><i /> MEMEPROOF REGISTRY <b>NEAR TESTNET</b></span><h1 id="overview-title">Keep every promise <em>in the open.</em></h1><p>Commit to a measurable outcome, attach the evidence, and let the community review the record.</p><div className="overview-actions"><Link href="/create-commitment" className="button overview-primary">Create a commitment <span aria-hidden="true">↗</span></Link><Link href="/passport" className="overview-secondary">Explore token passports <span aria-hidden="true">↗</span></Link></div><span className="overview-source-note">Live registry records · NEAR testnet</span></div>
      <div className="lifecycle lifecycle-editorial" aria-label="The MemeProof process: Promise, Evidence, Review">
        <div className="lifecycle-step lifecycle-promise"><span className="lifecycle-symbol" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M18 9H9v46h9M46 9h9v46h-9"/><path d="M21 32h8l5-12 7 24 5-12h8"/><circle cx="32" cy="32" r="27" strokeDasharray="2 5"/></svg></span><b>PROMISE</b><small>A measurable commitment</small></div>
        <span className="lifecycle-connector" aria-hidden="true"><i /></span>
        <div className="lifecycle-step lifecycle-evidence"><span className="lifecycle-symbol" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M17 9h22l10 10v36H17z"/><path d="M39 9v12h12M24 31h18M24 39h18M24 47h10"/><path d="m11 25-5 7 5 7M53 25l5 7-5 7"/></svg></span><b>EVIDENCE</b><small>Proof attached to the record</small></div>
        <span className="lifecycle-connector" aria-hidden="true"><i /></span>
        <div className="lifecycle-step lifecycle-review"><span className="lifecycle-symbol" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M5 32s10-17 27-17 27 17 27 17-10 17-27 17S5 32 5 32Z"/><circle cx="32" cy="32" r="8"/><path d="m28 32 3 3 6-7"/></svg></span><b>REVIEW</b><small>An independent community assessment</small></div>
      </div>
    </section>
    <OverviewRegistryView />
  </>;

  if (page === "discover") return <><section className="discover-hero" aria-labelledby="discover-title"><div className="discover-hero-copy"><span className="discover-eyebrow"><i /> TOKEN DISCOVERY <b>NEAR TESTNET</b></span><h1 id="discover-title">Find a token.<br/><em>Follow its record.</em></h1><p>Explore external launch listings from Meme.Cooking. Open any token to check its full contract identity against the MemeProof registry.</p></div><div className="discover-hero-note"><span>LISTING ≠ REGISTRY RECORD</span><p>Meme.Cooking listings are external market listings. MemeProof registration is checked separately using the <b>NEAR network and contract address</b>.</p><Link href="/passport">Browse MemeProof records <span aria-hidden="true">↗</span></Link></div></section><DiscoverTokens query={query} setQuery={setQuery} /></>;

  if (page === "create-commitment") return <><section className="commitment-hero" aria-labelledby="commitment-hero-title"><div className="commitment-hero-copy"><span className="commitment-hero-kicker"><i /> ACCOUNTABILITY STARTS HERE <b>NEAR TESTNET</b></span><h1 id="commitment-hero-title">Make a promise <em>measurable.</em></h1><p>Put a clear outcome on record. Set the terms now, then attach evidence for the community to review.</p><div className="commitment-hero-note"><span aria-hidden="true">↗</span>Published terms are permanent and visible on the registry.</div></div><div className="commitment-hero-steps" aria-label="Commitment lifecycle"><div className="commitment-hero-step"><span>01</span><b>Promise</b><small>Set the outcome</small></div><i aria-hidden="true"/><div className="commitment-hero-step"><span>02</span><b>Evidence</b><small>Show what happened</small></div><i aria-hidden="true"/><div className="commitment-hero-step"><span>03</span><b>Review</b><small>Let others assess</small></div></div></section><CreateCommitmentForm /></>;

  if (page === "register-token") return <><PageHeading eyebrow="TOKEN REGISTRATION / NEAR TESTNET" title="Register a token" description="Add a token contract identity to the on-chain MemeProof registry." /><RegisterTokenForm /></>;

  if (page === "evidence") return <><PageHeading eyebrow="EVIDENCE SUBMISSION" title="Make the promise verifiable" description="Evidence is the material that helps others verify whether a project's promise has been fulfilled." /><EvidenceSubmissionExperience /></>;

  if (page === "passport") return <div className="passport-directory-page"><PageHeading eyebrow="PUBLIC ACCOUNTABILITY / NEAR TESTNET" title="Token passports" description="A public record of token identities, commitments and evidence on MemeProof." /><RegistryPassportDirectory /></div>;
  if (page === "verification") return <><PageHeading eyebrow="COMMUNITY REVIEW / DISPUTE MANAGEMENT" title="Assess evidence. Resolve disputes." description="Record an independent assessment, or follow a dispute through its on-chain lifecycle." /><CommunityReviewExperience /><DisputeManagementExperience /></>;

  if (page === "settings") return <><PageHeading eyebrow="NETWORK & ACCOUNT" title="Settings" description="Review the network and wallet used for registry actions." /><div className="settings-grid settings-grid-editorial"><section className="panel settings-card settings-network-card"><div className="settings-card-kicker"><span className="settings-card-icon">N</span><span>NETWORK CONFIGURATION</span></div><h2>NEAR testnet</h2><p>MemeProof registry reads and signed actions are restricted to the testnet network.</p><div className="settings-row"><span><b>Registry network</b><small>Transactions are signed for NEAR testnet only.</small></span><span className="testnet-chip"><i /> ACTIVE</span></div><div className="settings-row"><span><b>Token identity</b><small>Network plus full contract address. Tickers are never used as identity.</small></span></div></section><section className="panel settings-card settings-wallet-card"><div className="settings-card-kicker"><span className="settings-card-icon">Ⓝ</span><span>WALLET CONNECTION</span></div><h2>{state === "connected" ? "Account connected" : state === "restoring" ? "Restoring session" : "Read only access"}</h2><p>Manage your supported NEAR testnet wallet with the selector in the top bar.</p><div className="settings-account"><span className={`settings-connection-mark ${state === "connected" ? "is-connected" : ""}`}><i /></span><div><b>{accountId ?? "No wallet connected"}</b><small>{state === "connected" ? "Connected · NEAR testnet" : state === "restoring" ? "Checking saved wallet session" : "Public registry reads remain available"}</small></div></div></section><section className="panel settings-card settings-data-card"><div className="settings-card-kicker"><span className="settings-card-icon">↗</span><span>RECORDS & PREFERENCES</span></div><h2>Your records stay verifiable</h2><p>Commitments, amendments, evidence references, reviews and disputes are read from the public NEAR testnet registry. Display preferences are not currently configurable.</p><div className="settings-data-note"><i /> Registry content is public. Evidence files remain at their original public references; only their URI and SHA-256 hash are recorded on-chain.</div></section></div></>;

  if (page === "profile") return <><PageHeading eyebrow="YOUR ACCOUNT" title="Profile & wallet" description="Your public identity in the registry is your connected NEAR testnet account." /><div className="profile-grid profile-grid-editorial"><section className="panel profile-card profile-identity-card"><div className="profile-avatar">{accountId ? accountId.slice(0, 1).toUpperCase() : "Ⓝ"}</div><div className="profile-identity-copy"><span className="eyebrow">NEAR TESTNET ACCOUNT</span><h2>{accountId ?? (state === "restoring" ? "Restoring wallet…" : "No wallet connected")}</h2><p>{accountId ? "Account ID attributed to records it creates or submits on-chain." : "Connect a wallet from the top bar to view your creator history."}</p></div><span className={`profile-connection-badge ${state === "connected" ? "is-connected" : ""}`}><i />{state === "connected" ? "Connected" : state === "restoring" ? "Restoring" : "Disconnected"}</span></section><section className="panel settings-card profile-network-card"><div className="settings-card-kicker"><span className="settings-card-icon">N</span><span>ACTIVE NETWORK</span></div><h2>NEAR testnet</h2><p>Wallet signing and registry actions use the test network.</p></section><section className="panel settings-card profile-access-card"><div className="settings-card-kicker"><span className="settings-card-icon">↗</span><span>ACCOUNT ACCESS</span></div><h2>{accountId ? "Public creator record" : "Browse without connecting"}</h2><p>{accountId ? "Your commitment history is loaded from the registry and remains visible to everyone." : "Public registry records remain available. A connected account is needed to show your creator commitments."}</p></section><MyCommitmentsView variant="profile" /></div></>;

  if (page === "my-commitments") return <><PageHeading eyebrow="YOUR RECORD" title="Commitment log" description="A clear history of the commitments recorded by your connected NEAR account." action={<Link className="button button-primary" href="/create-commitment">＋ Create commitment</Link>} /><MyCommitmentsView /></>;

  return <><PageHeading eyebrow="ACTIVITY" title="Activity history" description="A chronological record of submissions, checks, reviews and disputes." /><ActivityRegistryView /></>;
}

