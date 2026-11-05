import Link from "next/link";

const steps = [
  ["01", "Define the promise", "Make the outcome specific, dated and possible to check."],
  ["02", "Attach the evidence", "Keep supporting material linked to the commitment it speaks to."],
  ["03", "Record the review", "Show what was assessed, who assessed it and what changed."],
];

export default function Home() {
  return (
    <main className="landing landing-premium">
      <header className="landing-header">
        <Link className="brand" href="/"><span className="brand-mark">M</span><span>MemeProof</span></Link>
        <nav aria-label="Main navigation"><Link href="/discover">Explore passports</Link><Link href="/overview">Product preview</Link></nav>
        <Link className="button button-primary landing-open" href="/overview">Open workspace <span aria-hidden="true">↗</span></Link>
      </header>
      <section className="hero hero-premium">
        <div className="hero-copy">
          <div className="hero-overline"><span className="hero-live-dot"/> PUBLIC ACCOUNTABILITY <i/> BUILT FOR NEAR</div>
          <h1>Trust should have<br/><em>a public record.</em></h1>
          <p>MemeProof gives token teams a clear place to make measurable commitments, attach evidence and keep every review in view.</p>
          <div className="hero-actions"><Link href="/create-commitment" className="button button-primary">Make a commitment <span aria-hidden="true">↗</span></Link><Link href="/discover" className="button button-quiet">Explore passports</Link></div>
          <div className="hero-assurance"><span className="near-monogram">N</span><span><b>NEAR testnet preview</b><small>Public records, built to be verifiable</small></span><span className="assurance-divider"/><span className="assurance-note">No outcome without evidence</span></div>
        </div>
        <div className="hero-art" aria-label="Illustrative token commitment passport">
          <div className="hero-orbit orbit-a"/><div className="hero-orbit orbit-b"/><div className="hero-orbit orbit-c"/>
          <div className="hero-side-note"><span className="hero-side-mark">↗</span><span>Every promise<br/><b>leaves a trail</b></span></div>
          <article className="passport-preview passport-preview-premium">
            <div className="passport-topline"><span className="passport-wordmark"><span className="passport-glyph">M</span> TOKEN PASSPORT</span><span className="demo-tag">ILLUSTRATIVE</span></div>
            <div className="passport-identity"><div className="token-avatar avatar-blue">M</div><div className="passport-token-name"><strong>Moonshot Club</strong><small>moonshot.token <i/> NEAR testnet</small></div><span className="passport-verified" aria-label="Example verified identity">✓</span></div>
            <div className="passport-commitment-label"><span>COMMITMENT</span><span>#MP-014</span></div>
            <h2>Publish a monthly treasury report</h2>
            <p className="passport-description">A public breakdown of holdings and spending, published once per month.</p>
            <div className="passport-details"><div><span>DEADLINE</span><b>30 Nov 2026</b></div><div><span>STATUS</span><b className="status-pill status-evidence">Evidence submitted</b></div></div>
            <div className="passport-progress-label"><span>Commitment history</span><span>02 of 03 steps</span></div>
            <div className="passport-progress"><span/></div>
            <div className="passport-trail"><div className="trail-icon trail-complete">✓</div><div><b>Promise recorded</b><small>Creator-defined criteria</small></div><span className="trail-line"/><div className="trail-icon trail-current">02</div><div><b>Evidence attached</b><small>Awaiting review</small></div></div>
          </article>
          <div className="hero-footnote"><span className="footnote-line"/>A sample record · Not live registry data</div>
        </div>
        <div className="hero-bottom-rule"/>
      </section>
      <section className="trust-strip trust-strip-premium"><span className="trust-lead">A record people can follow.</span><div><span><b>01</b> Promise</span><i/><span><b>02</b> Evidence</span><i/><span><b>03</b> Review</span></div><span className="trust-meta">Transparent by design <span>↗</span></span></section>
      <section className="how-section how-premium"><div className="section-heading"><div><div className="eyebrow">A BETTER STANDARD OF ACCOUNTABILITY</div><h2>From promise to proof,<br/><em>without losing the trail.</em></h2></div><p>Commitments remain distinct from evidence. Reviews remain distinct from both. A clear record gives every step its source.</p></div><div className="steps-grid steps-premium">{steps.map(([number, title, description]) => <article className="step-card" key={number}><span className="step-number">{number}</span><div className="step-rule"/><h3>{title}</h3><p>{description}</p><span className="step-arrow" aria-hidden="true">↗</span></article>)}</div></section>
      <section className="landing-bottom landing-bottom-premium"><div><span className="eyebrow">NEAR TESTNET · PRODUCT PREVIEW</span><h2>Start with a promise<br/>someone can verify.</h2><p>Explore the interface today. Wallet connection is available on NEAR testnet; registry actions remain in development.</p></div><div className="landing-bottom-actions"><Link className="button button-primary" href="/overview">Enter the workspace <span aria-hidden="true">↗</span></Link><span><i/> NEAR testnet only</span></div></section>
      <footer className="landing-footer"><Link className="brand" href="/"><span className="brand-mark">M</span><span>MemeProof</span></Link><span>Public accountability for NEAR tokens.</span><span>Preview environment · 2026</span></footer>
    </main>
  );
}
