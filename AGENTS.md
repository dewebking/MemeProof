# Repository Guidelines

## Approved architecture

- MemeProof is a NEAR accountability app; development and deployment target **NEAR testnet only**.
- Token identity is the pair `(network_id, token_contract_address)`. Never identify a token by ticker alone. The first version uses manual contract-address entry.
- `apps/web` is the Next.js, React, TypeScript, and Tailwind frontend. `contracts/memeproof-registry` is a separate Rust NEAR contract. `packages/shared` holds frontend-safe shared types.
- Supabase stores evidence files and searchable application projections. Evidence hashes and opaque references are recorded on-chain. Never put secrets or large/private evidence contents on-chain.
- AI may assist reviewers, but cannot independently set a final verdict. Deadline expiry alone never marks a commitment failed.
- Commitment bonds, Trezu, SputnikDAO governance, and NEAR Intents are deferred. Voting eligibility and verification rules must be explicit before those features are built.
- Do not fake blockchain functionality. Label scaffolding and mock/static content clearly; chain actions require real wallet signatures and testnet transactions.

## Structure

- `apps/web/`: Next.js app, UI, and later minimal server routes.
- `contracts/memeproof-registry/`: Rust contract and contract tests.
- `packages/shared/`: shared types and validation schemas.
- `supabase/migrations/`: database migrations when Supabase is introduced.
- `docs/`: architecture decisions and runbooks.

## Development commands

From the repository root, use `npm install`, `npm run dev`, `npm run build`, and `npm run lint`. Run the Rust contract tests with `cargo test --manifest-path contracts/memeproof-registry/Cargo.toml`; build with `cargo near build` from the contract directory after installing the NEAR Rust toolchain. See `README.md` for setup details.

Use Node.js 20.9 or later, Rust stable matching the pinned near-sdk MSRV, and Windows 10 PowerShell-compatible commands. Keep dependency versions in manifests/lockfiles. Do not add unpinned global tools or undocumented setup steps.

## Coding and security

- Keep formatting consistent; use Prettier for TypeScript and `cargo fmt` for Rust.
- Add deterministic tests for new behavior and regression fixes.
- Never commit credentials, private keys, `.env` files, wallet seed phrases, or service-role keys. Update `.env.example` with placeholders only.
- Validate every client input again at trusted boundaries. Enforce contract authorization and duplicate-vote prevention in contract code, not only in the UI.
- Preserve original commitments and append historical evidence, verification, vote, and dispute records; no silent rewrite or deletion.
- Do not expose API secrets in `NEXT_PUBLIC_*` variables. Never let AI alone determine verification or status.
