"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import WalletConnect from "./wallet-connect";
import { Card } from "./ui";
import DiscoverTokens from "./discover-tokens";
import { CommunityReviewForm, CreateCommitmentForm, DisputeActions, EvidenceSubmissionForm, RegisterTokenForm } from "./registry-actions";
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
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return <div className="app-frame">
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link className="brand" href="/"><span className="brand-mark">M</span><span>MemeProof</span></Link>
      <div className="workspace-label">WORKSPACE <span>TESTNET</span></div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <div className="nav-group-label">Registry</div>
        {nav.slice(0, 3).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}</Link>)}
        <div className="nav-group-label nav-group-spaced">Your workspace</div>
        {nav.slice(3, 8).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}{href === "/create-commitment" && <span className="nav-plus"><NavigationIcon name="+"/></span>}</Link>)}
        <div className="nav-group-label nav-group-spaced">Account</div>
        {nav.slice(8).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}</Link>)}
      </nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="live-dot" /><div><b>NEAR testnet</b><small>Development network</small></div></div><div className="sidebar-foot">MemeProof preview <span>v0.1</span></div></div>
    </aside>
    {open && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setOpen(false)} />}
    <div className="app-main"><header className="topbar"><button className={`menu-toggle ${open ? "menu-toggle-open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open}><span/><span/><span/></button><div className="breadcrumb"><Link href="/overview">Workspace</Link><span>/</span><b>{nav.find(([href]) => href === path)?.[1] ?? "Commitment Passport"}</b></div><div className="topbar-right"><span className="testnet-chip"><i /> NEAR TESTNET</span><WalletConnect /></div></header><main className="page-content" key={path}>{children}</main><footer className="app-footer"><span>MemeProof · NEAR testnet preview</span><span>Registry pages read from the configured contract</span></footer></div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function ProductPage({ page }: { page: string }) {
  const [query, setQuery] = useState("");
  const { accountId, state } = useNearWallet();

  if (page === "overview") return <>
    <PageHeading eyebrow="OVERVIEW / NEAR TESTNET" title="Accountability overview" description="A transparent view of what has been promised, evidenced and reviewed." action={<Link href="/create-commitment" className="button button-primary">＋ New commitment</Link>} />
    <Card className="registry-intro">
      <div className="registry-intro-copy"><span className="registry-kicker"><i /> REGISTRY STATUS · NEAR TESTNET</span><h2>Promises, evidence and review history in one public record.</h2><p>Counts and activity below are read directly from the configured MemeProof registry contract on NEAR testnet.</p><Link href="/discover" className="text-link">Explore token passports <span>↗</span></Link></div>
      <div className="lifecycle" aria-label="Commitment lifecycle"><div className="lifecycle-step"><span className="lifecycle-number">01</span><span className="lifecycle-mark mark-promise">P</span><b>Promise</b><small>Creator defines a measurable outcome</small></div><div className="lifecycle-connector"/><div className="lifecycle-step"><span className="lifecycle-number">02</span><span className="lifecycle-mark mark-evidence">E</span><b>Evidence</b><small>Creator submits supporting material</small></div><div className="lifecycle-connector"/><div className="lifecycle-step"><span className="lifecycle-number">03</span><span className="lifecycle-mark mark-review">R</span><b>Review</b><small>Checks and decisions are attributed</small></div></div>
    </Card>
    <OverviewRegistryView />
  </>;

  if (page === "discover") return <><PageHeading eyebrow="PUBLIC REGISTRY" title="Discover token passports" description="Explore token data from Meme.Cooking. Passport commitments and verification are not available from this source." /><DiscoverTokens query={query} setQuery={setQuery} /></>;

  if (page === "create-commitment") return <><PageHeading eyebrow="NEW COMMITMENT" title="Make a promise measurable" description="Create a clear commitment that can be understood, evidenced and reviewed." /><CreateCommitmentForm /></>;

  if (page === "register-token") return <><PageHeading eyebrow="TOKEN REGISTRATION / NEAR TESTNET" title="Register a token" description="Add a token contract identity to the on-chain MemeProof registry." /><RegisterTokenForm /></>;

  if (page === "evidence") return <><PageHeading eyebrow="EVIDENCE SUBMISSION" title="Add evidence to a commitment" description="Submit a public evidence reference and content hash to the NEAR registry." /><EvidenceSubmissionForm /></>;

  if (page === "passport") return <><PageHeading eyebrow="MEMEPROOF REGISTRY / NEAR TESTNET" title="Token passports" description="Browse token identities registered on MemeProof, matched by network and contract address." /><RegistryPassportDirectory /></>;
  if (page === "verification") return <><PageHeading eyebrow="REVIEW HISTORY" title="Community reviews & disputes" description="Record attributable reviews and follow dispute proposals, responses and outcomes." /><div className="overview-grid"><CommunityReviewForm /><section className="panel"><h2>Review policy</h2><p className="form-hint">The contract prevents duplicate reviews by one account for the same evidence. Community reviews are records for people to assess; they do not set a final verdict.</p></section></div><DisputeActions /></>;

  if (page === "settings") return <><PageHeading eyebrow="NETWORK & ACCOUNT" title="Settings" description="Review the network and wallet used for registry actions." /><div className="settings-grid"><section className="panel settings-card"><h2>Network</h2><p>MemeProof registry reads and transactions are restricted to NEAR testnet.</p><div className="settings-row"><span><b>NEAR testnet</b><small>Registry actions require the configured testnet contract.</small></span><span className="testnet-chip"><i /> ACTIVE</span></div></section><section className="panel settings-card"><h2>Wallet connection</h2><p>Connect or manage a supported testnet wallet from the selector in the top bar.</p><div className="settings-row"><span><b>{accountId ?? "No wallet connected"}</b><small>{state === "connected" ? "Connected to NEAR testnet" : state === "restoring" ? "Restoring saved connection" : "Read access is available without a wallet"}</small></span></div></section><section className="panel settings-card"><h2>Application preferences</h2><p>Display preferences are not currently saved or synchronized to an account.</p><div className="empty-inline">No persistent preferences are configured.</div></section></div></>;

  if (page === "profile") return <><PageHeading eyebrow="YOUR ACCOUNT" title="Profile & wallet" description="Your public identity in the registry is your connected NEAR testnet account." /><div className="profile-grid"><section className="panel profile-card"><div className="profile-avatar">Ⓝ</div><div><span className="eyebrow">NEAR TESTNET ACCOUNT</span><h2>{accountId ?? (state === "restoring" ? "Restoring wallet…" : "No wallet connected")}</h2><p>{accountId ? "This account ID is attributed to records it creates or submits on-chain." : "Connect a wallet from the top bar to view your creator history."}</p></div></section><section className="panel settings-card"><h2>Account connection</h2><p>Wallet management is handled by the selector above.</p><div className="empty-inline"><span className="near-symbol">Ⓝ</span><span>{state === "connected" ? "Connected to NEAR testnet" : state === "restoring" ? "Restoring saved connection" : "Disconnected · public registry reads remain available"}</span></div></section><MyCommitmentsView /></div></>;

  if (page === "my-commitments") return <><PageHeading eyebrow="YOUR RECORD" title="My commitments" description="Track the promises published from your connected NEAR account." action={<Link className="button button-primary" href="/create-commitment">＋ Create commitment</Link>} /><MyCommitmentsView /></>;

  return <><PageHeading eyebrow="ACTIVITY" title="Activity history" description="A chronological record of submissions, checks, reviews and disputes." /><ActivityRegistryView /></>;
}

