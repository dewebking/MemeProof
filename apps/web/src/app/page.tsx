export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b border-white/10 pb-6">
        <span className="text-xl font-semibold tracking-tight">MemeProof<span className="text-emerald-400">.</span></span>
        <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">NEAR testnet</span>
      </header>
      <section className="my-auto max-w-2xl py-24">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">Commitment passports</p>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">Promises should be <span className="text-emerald-300">provable.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">MemeProof is building public, verifiable accountability records for NEAR tokens. The registry and wallet flows are under development.</p>
        <p className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">Phase 1 foundation is ready. No live blockchain actions are enabled yet.</p>
      </section>
      <footer className="border-t border-white/10 pt-5 text-xs text-zinc-500">Token identity is network and contract address scoped.</footer>
    </main>
  );
}
