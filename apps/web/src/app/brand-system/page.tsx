import Image from "next/image";
import Link from "next/link";

export default function BrandPage() {
  return (
    <main className="brand-page">
      <header className="brand-page-header">
        <Link className="brand" href="/"><Image src="/brand/memeproof-horizontal.svg" alt="MemeProof" width={250} height={49} priority /></Link>
        <span>IDENTITY SYSTEM · 2026</span>
      </header>

      <section className="brand-sheet-hero">
        <div>
          <span className="brand-sheet-kicker">THE OPEN RECORD</span>
          <h1>Promises deserve proof.</h1>
          <p>Two open record edges frame a line of evidence. The line can be followed, questioned and reviewed; it never claims to decide the outcome on its own.</p>
        </div>
        <Image src="/brand/memeproof-dark.svg" alt="MemeProof logo on a dark background" width={390} height={76} priority />
      </section>

      <section className="brand-sheet-section" aria-labelledby="logo-variations">
        <div className="brand-sheet-heading"><span>01 / SIGNATURE</span><h2 id="logo-variations">One mark, a few clear roles.</h2></div>
        <div className="brand-logo-grid">
          <div className="brand-logo-tile brand-logo-primary"><span>PRIMARY LOCKUP</span><Image src="/brand/memeproof-primary.svg" alt="Primary stacked MemeProof logo" width={360} height={164} /></div>
          <div className="brand-logo-tile"><span>HORIZONTAL WORDMARK</span><Image src="/brand/memeproof-light.svg" alt="Horizontal MemeProof logo for light backgrounds" width={390} height={76} /></div>
          <div className="brand-logo-tile"><span>STANDALONE SYMBOL</span><Image src="/brand/memeproof-symbol.svg" alt="Standalone open record symbol" width={80} height={80} /></div>
          <div className="brand-logo-tile brand-logo-icon"><span>COMPACT APP ICON / FAVICON</span><Image src="/brand/memeproof-icon.svg" alt="Compact MemeProof app icon" width={76} height={76} /></div>
          <div className="brand-logo-tile"><span>MONOCHROME</span><Image src="/brand/memeproof-monochrome.svg" alt="Monochrome MemeProof logo" width={390} height={76} /></div>
          <div className="brand-logo-tile brand-logo-inverse"><span>DARK SURFACE</span><Image src="/brand/memeproof-dark.svg" alt="MemeProof logo for dark surfaces" width={390} height={76} /></div>
        </div>
      </section>

      <section className="brand-sheet-section brand-sheet-system" aria-labelledby="brand-system">
        <div className="brand-sheet-heading"><span>02 / MATERIAL</span><h2 id="brand-system">Warm paper. Deep ink. Clear signal.</h2></div>
        <div className="brand-swatches">
          <div style={{ background: "#f4f3ee" }}><b>Paper</b><small>#F4F3EE · canvas</small></div>
          <div style={{ background: "#173b34", color: "#f7f5ee" }}><b>Forest</b><small>#173B34 · brand ink</small></div>
          <div style={{ background: "#75d5ae" }}><b>Mint</b><small>#75D5AE · evidence signal</small></div>
          <div style={{ background: "#fffefa" }}><b>Warm white</b><small>#FFFEFA · surface</small></div>
        </div>
      </section>
      <footer className="brand-sheet-footer"><span>MEMEPROOF · STAGE 1</span><Link href="/overview">Return to workspace ↗</Link></footer>
    </main>
  );
}
