"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import WalletConnect from "./wallet-connect";
import { Badge, Button, Card } from "./ui";
import DiscoverTokens from "./discover-tokens";

const nav = [
  ["/overview", "Overview", "O"], ["/discover", "Discover", "D"],
  ["/my-commitments", "Commitments", "C"], ["/create-commitment", "New commitment", "+"],
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
        {nav.slice(0, 2).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}</Link>)}
        <div className="nav-group-label nav-group-spaced">Your workspace</div>
        {nav.slice(2, 5).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}{href === "/create-commitment" && <span className="nav-plus"><NavigationIcon name="+"/></span>}</Link>)}
        <div className="nav-group-label nav-group-spaced">Account</div>
        {nav.slice(5).map(([href, label, icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "nav-active" : ""}`}><span className="nav-icon"><NavigationIcon name={icon}/></span>{label}</Link>)}
      </nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="live-dot" /><div><b>NEAR testnet</b><small>Development network</small></div></div><div className="sidebar-foot">MemeProof preview <span>v0.1</span></div></div>
    </aside>
    {open && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setOpen(false)} />}
    <div className="app-main"><header className="topbar"><button className={`menu-toggle ${open ? "menu-toggle-open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open}><span/><span/><span/></button><div className="breadcrumb"><Link href="/overview">Workspace</Link><span>/</span><b>{nav.find(([href]) => href === path)?.[1] ?? "Commitment Passport"}</b></div><div className="topbar-right"><span className="testnet-chip"><i /> NEAR TESTNET</span><WalletConnect /></div></header><main className="page-content" key={path}>{children}</main><footer className="app-footer"><span>MemeProof · NEAR testnet preview</span><span>Application data is not connected yet</span></footer></div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function EmptyState({ title, text, href, action }: { title: string; text: string; href?: string; action?: string }) {
  return <div className="empty-state"><div className="empty-icon">⌁</div><h3>{title}</h3><p>{text}</p>{href && <Link className="button button-primary button-small" href={href}>{action ?? "Get started"} <span>→</span></Link>}</div>;
}
function DemoBanner() { return <div className="demo-banner"><span className="demo-dot" /><span><Badge variant="info">Preview mode</Badge> Product records and activity are not connected to live data.</span></div>; }
function Metric({ label, value, note, mark }: { label: string; value: string; note: string; mark: string }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><i>{mark}</i></div><strong>{value}</strong><small>{note}</small></article>; }

export function ProductPage({ page }: { page: string }) {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [saved, setSaved] = useState(false);

  if (page === "overview") return <>
    <PageHeading eyebrow="OVERVIEW / NEAR TESTNET" title="Accountability overview" description="A transparent view of what has been promised, evidenced and reviewed." action={<Link href="/create-commitment" className="button button-primary">＋ New commitment</Link>} />
    <DemoBanner />
    <Card className="registry-intro">
      <div className="registry-intro-copy"><span className="registry-kicker"><i /> REGISTRY STATUS</span><h2>The public record starts with a clear promise.</h2><p>MemeProof is preparing its NEAR testnet registry. Once it is connected, this workspace will show source-linked records and every status change.</p><Link href="/discover" className="text-link">Explore the passport directory <span>↗</span></Link></div>
      <div className="lifecycle" aria-label="Commitment lifecycle"><div className="lifecycle-step"><span className="lifecycle-number">01</span><span className="lifecycle-mark mark-promise">P</span><b>Promise</b><small>Creator defines a measurable outcome</small></div><div className="lifecycle-connector"/><div className="lifecycle-step"><span className="lifecycle-number">02</span><span className="lifecycle-mark mark-evidence">E</span><b>Evidence</b><small>Creator submits supporting material</small></div><div className="lifecycle-connector"/><div className="lifecycle-step"><span className="lifecycle-number">03</span><span className="lifecycle-mark mark-review">R</span><b>Review</b><small>Checks and decisions are attributed</small></div></div>
    </Card>
    <section className="stat-ribbon" aria-label="Registry summary"><div className="stat-ribbon-label"><span className="eyebrow">REGISTRY SNAPSHOT</span><small>Live metrics appear after indexer setup</small></div><Metric label="Registered tokens" value="—" note="No registry data" mark="◎" /><Metric label="Commitments" value="—" note="No records available" mark="◷" /><Metric label="Verified" value="—" note="No review results" mark="✓" /><Metric label="Disputed / failed" value="—" note="No status records" mark="!" /></section>
    <div className="overview-grid dashboard-lower"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">LATEST RECORDS</span><h2>Recent activity</h2><p>Every event will include its source and transaction reference.</p></div><Link href="/activity">Activity log ↗</Link></div><div className="timeline-empty"><span className="timeline-spine"/><div className="timeline-node">·</div><div><b>Awaiting the first registry event</b><p>Evidence submissions, verification checks and disputes will appear here in chronological order.</p></div></div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">CREATOR VIEW</span><h2>My commitments</h2><p>Your published accountability record.</p></div><Link href="/my-commitments">Open ↗</Link></div><EmptyState title="Your record is empty" text="Connect a NEAR testnet wallet and publish a measurable commitment when registry actions are available." href="/create-commitment" action="Draft a commitment" /></section></div>
  </>;

  if (page === "discover") return <><PageHeading eyebrow="PUBLIC REGISTRY" title="Discover token passports" description="Explore token data from Meme.Cooking. Passport commitments and verification are not available from this source." /><DiscoverTokens query={query} setQuery={setQuery} /></>;

  if (page === "create-commitment") return <><PageHeading eyebrow="NEW COMMITMENT" title="Make a promise measurable" description="Create a clear commitment that can be understood, evidenced and reviewed." /><div className="form-layout"><div className="form-main panel"><div className="stepper">{[1,2,3].map(n => <div key={n} className={`stepper-item ${step >= n ? "stepper-current" : ""}`}><span>{step > n ? "✓" : `0${n}`}</span><b>{["Commitment", "Criteria & deadline", "Review"][n-1]}</b></div>)}</div><form onSubmit={e => { e.preventDefault(); if (step < 3) setStep(step+1); else setMessage("Draft saved in this session. Wallet-signed submission is not available yet."); }}>
    {step === 1 && <><h2>What are you committing to?</h2><p className="form-hint">Write a specific promise that the community can understand.</p><label className="field-label">Token contract address<input required placeholder="e.g. token.example.testnet" /></label><small className="field-caption">Token identity uses the NEAR testnet and contract address.</small><label className="field-label">Commitment title<input required minLength={8} placeholder="e.g. Publish a monthly treasury report" /></label><label className="field-label">Commitment description<textarea required rows={4} placeholder="Describe what will be delivered and who it benefits." /></label></>}
    {step === 2 && <><h2>Define success clearly</h2><p className="form-hint">Specific criteria help reviewers assess the outcome fairly.</p><label className="field-label">Success criteria<textarea required rows={4} placeholder="What observable conditions must be met?" /></label><label className="field-label">Deadline<input required type="date" min={new Date().toISOString().slice(0,10)} /></label><label className="field-label">How can this be verified?<textarea required rows={3} placeholder="Describe the evidence or on-chain activity that can demonstrate completion." /></label></>}
    {step === 3 && <><h2>Review your commitment</h2><p className="form-hint">Review the information before creating a local draft.</p><div className="review-placeholder">Your commitment details are held in the form. Submission will require a NEAR testnet wallet signature when the registry is available.</div><DemoBanner /></>}
    <div className="form-actions">{step > 1 && <Button variant="quiet" onClick={() => setStep(step-1)}>← Back</Button>}<Button type="submit">{step < 3 ? "Continue →" : "Save draft"}</Button></div>{message && <p role="status" className="form-success">{message}</p>}</form></div><aside className="side-note panel"><div className="note-icon">✳</div><h3>Good commitments are clear</h3><p>Use a single outcome, a date, and proof that someone else can check.</p><div className="note-rule"/><p className="muted">Commitments are intended to be immutable once published.</p></aside></div></>;

  if (page === "evidence") return <><PageHeading eyebrow="EVIDENCE SUBMISSION" title="Add evidence to a commitment" description="Evidence is submitted by the creator and remains distinct from a verification result." /><DemoBanner /><div className="form-layout"><section className="panel form-main"><form onSubmit={e => { e.preventDefault(); setMessage("Evidence draft saved locally. File storage and wallet submission are not connected."); }}><label className="field-label">Commitment reference<input required placeholder="Enter commitment ID" /></label><label className="field-label">Evidence files<span className="upload-zone"><input type="file" multiple onChange={e => setFileName(Array.from(e.target.files ?? []).map(f => f.name).join(", "))} /><span className="upload-icon">↑</span><b>{fileName || "Choose files or drag them here"}</b><small>File upload will be enabled with secure evidence storage.</small></span></label><label className="field-label">Transaction reference <span className="optional">Optional</span><input placeholder="NEAR transaction hash" /></label><label className="field-label">Evidence description<textarea required rows={4} placeholder="Explain what this evidence shows and how it supports the commitment." /></label><button className="button button-primary" type="submit">Save evidence draft</button>{message && <p role="status" className="form-success">{message}</p>}</form></section><aside className="side-note panel"><h3>Submission history</h3><EmptyState title="No evidence submitted" text="Creator-submitted evidence will be listed with its date and transaction reference." /></aside></div></>;

  if (page === "passport") return <><PageHeading eyebrow="TOKEN PASSPORT" title="Commitment Passport" description="A public record of token identity, promises, evidence and review history." /><DemoBanner /><section className="panel passport-empty passport-empty-premium"><div className="passport-empty-copy"><span className="passport-empty-icon">◉</span><div className="eyebrow">PUBLIC REGISTRY / AWAITING FIRST RECORD</div><h2>Every record begins with a commitment.</h2><p>No tokens are registered in the application yet. When the testnet registry is connected, this passport will preserve token identity and append each commitment, evidence submission and review.</p><Link href="/discover" className="button button-primary">Browse token directory <span aria-hidden="true">↗</span></Link></div><div className="passport-record-preview"><div className="passport-record-head"><span>RECORD STRUCTURE</span><Badge variant="neutral">NO REGISTRY DATA</Badge></div><div className="passport-record-row"><span className="passport-record-index">01</span><span><b>Token identity</b><small>Network and contract address</small></span><em>Not registered</em></div><div className="passport-record-row"><span className="passport-record-index">02</span><span><b>Commitments</b><small>Original terms and deadlines</small></span><em>No records</em></div><div className="passport-record-row"><span className="passport-record-index">03</span><span><b>Evidence</b><small>Creator-submitted material</small></span><em>No submissions</em></div><div className="passport-record-row"><span className="passport-record-index">04</span><span><b>Review history</b><small>Attributed checks and decisions</small></span><em>No entries</em></div></div></section><div className="overview-grid"><section className="panel"><h2>Evidence & verification</h2><EmptyState title="No records yet" text="Evidence records and on-chain verification results will appear here." /></section><section className="panel"><h2>Community review & disputes</h2><EmptyState title="No review history" text="Review decisions and disputes will be shown as separate, attributable events." /></section></div></>;
  if (page === "verification") return <><PageHeading eyebrow="REVIEW HISTORY" title="Verification & disputes" description="Follow each review result, its source and any dispute without losing the original record." /><DemoBanner /><div className="metrics-grid"><Metric label="On-chain checks" value="—" note="No adapter results" mark="⌘" /><Metric label="Community review" value="—" note="Review policy not configured" mark="◉" /><Metric label="AI analysis" value="Advisory only" note="No analysis available" mark="✳" /><Metric label="Open disputes" value="—" note="No dispute records" mark="!" /></div><div className="overview-grid"><section className="panel"><h2>Verification history</h2><EmptyState title="No verification results" text="Supported transaction checks will show their source, timestamp and outcome here." /></section><section className="panel"><h2>Raise a dispute</h2><p className="form-hint">Disputes create an append-only record linked to the affected commitment.</p><form onSubmit={e => { e.preventDefault(); setMessage("Dispute draft saved locally. On-chain dispute submission is not available yet."); }}><label className="field-label">Commitment ID<input required placeholder="Enter commitment ID" /></label><label className="field-label">Reason<textarea required rows={3} placeholder="Explain which record you are disputing and why." /></label><button className="button button-primary" type="submit">Save dispute draft</button>{message && <p role="status" className="form-success">{message}</p>}</form></section></div></>;

  if (page === "settings") return <><PageHeading eyebrow="PREFERENCES" title="Settings" description="Manage your connection and application preferences." /><div className="settings-grid"><section className="panel settings-card"><h2>Network</h2><p>Development network used by this application.</p><div className="settings-row"><span><b>NEAR testnet</b><small>Chain actions are not enabled yet.</small></span><span className="testnet-chip"><i /> ACTIVE</span></div></section><section className="panel settings-card"><h2>Application preferences</h2><p>Control how this preview behaves in your browser.</p><label className="toggle-row"><span><b>Reduced motion</b><small>Keep transitions subtle and minimal.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Demo labels</b><small>Show labels on illustrative product content.</small></span><input type="checkbox" defaultChecked /></label></section></div></>;

  if (page === "profile") return <><PageHeading eyebrow="YOUR ACCOUNT" title="Profile & wallet" description="Manage your public creator profile and NEAR testnet connection." /><DemoBanner /><div className="profile-grid"><section className="panel profile-card"><div className="profile-avatar">?</div><div><span className="demo-tag">PROFILE PREVIEW</span><h2>Creator profile</h2><p>Your display name and public creator history will appear here.</p></div><Button variant="secondary" onClick={() => setSaved(!saved)}>{saved ? "Saved" : "Edit profile"}</Button></section><section className="panel settings-card"><h2>Connected NEAR account</h2><p>Wallet management is handled by the HOT Connect selector above.</p><div className="empty-inline"><span className="near-symbol">Ⓝ</span><span>Connect a wallet to view your account details.</span></div></section><section className="panel"><div className="panel-heading"><div><h2>Commitment history</h2><p>Records associated with your connected account</p></div></div><EmptyState title="No commitments found" text="Your published commitments will appear here after registry integration." href="/create-commitment" action="Create commitment" /></section></div></>;

  if (page === "my-commitments") return <><PageHeading eyebrow="YOUR RECORD" title="My commitments" description="Track the promises published from your connected NEAR account." action={<Link className="button button-primary" href="/create-commitment">＋ Create commitment</Link>} /><DemoBanner /><section className="panel"><div className="panel-heading"><div><h2>Commitment history</h2><p>Original criteria and every status change remain visible.</p></div><select aria-label="Filter commitments"><option>All commitments</option><option>Evidence submitted</option><option>Disputed</option></select></div><EmptyState title="Your record starts here" text="Connect your wallet and publish a commitment when the testnet registry is available." href="/create-commitment" action="Create a commitment" /></section></>;

  return <><PageHeading eyebrow="ACTIVITY" title="Activity history" description="A chronological record of submissions, checks, reviews and disputes." /><DemoBanner /><section className="panel"><div className="panel-heading"><div><h2>All recorded events</h2><p>Events will be attributed to their source and transaction.</p></div><select aria-label="Filter activity"><option>All activity</option><option>Evidence</option><option>Verification</option><option>Disputes</option></select></div><EmptyState title="No activity recorded" text="When the app is connected to the NEAR registry, its indexed events will appear here." /></section></>;
}

