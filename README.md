# MemeProof

MemeProof is a NEAR-based accountability platform for memecoin creators. It is intended to provide a public Commitment Passport for each registered token, containing immutable commitments, evidence references, verification history, and community review records.

## Phase 1 status

This repository currently contains the project foundation only: a Next.js landing page and a minimal Rust contract scaffold. The page does not connect to a wallet or blockchain, and the contract does not yet register tokens or commitments. No product functionality is simulated as live.

Development targets **NEAR testnet only**. Token identity will always use both network ID and token contract address; ticker is display metadata only. Evidence bytes will live in Supabase, while evidence hashes and references will be recorded on-chain. AI can assist reviewers but cannot decide verdicts. Deadline expiry alone will not mark a commitment failed.

## Requirements

- Windows 10 with PowerShell
- Node.js 20.9 or later and npm
- Rust stable toolchain and `cargo-near` for contract WASM builds
- Visual Studio C++ Build Tools may be required for native Rust dependencies on Windows

## Install and run the frontend

From the repository root:

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. Other scripts are `npm run build`, `npm run start`, and `npm run lint`.

Copy `.env.example` to `.env.local` only when configuring services. The current Phase 1 frontend requires no environment variables. Never expose service-role keys or AI credentials through `NEXT_PUBLIC_*` variables.

## Contract tests and build

Run unit tests:

```powershell
cargo test --manifest-path contracts/memeproof-registry/Cargo.toml
```

Format Rust code:

```powershell
cargo fmt --manifest-path contracts/memeproof-registry/Cargo.toml -- --check
```

Install NEAR's Rust contract tooling following the official [near-sdk-rs instructions](https://github.com/near/near-sdk-rs). From the contract directory, build the WebAssembly artifact:

```powershell
Set-Location contracts/memeproof-registry
cargo near build
```

The testnet contract deployment and wallet flow are intentionally not configured in Phase 1. Do not deploy this scaffold as a production registry; it only exposes a read-only development-network label.

## Workspace

- `apps/web`: Next.js frontend.
- `contracts/memeproof-registry`: Rust NEAR contract workspace.
- `packages/shared`: frontend-safe shared types.
- `supabase/migrations`: reserved for future database schema migrations.
- `docs/architecture.md`: approved technical architecture.

## Security

Never commit `.env` files, credentials, wallet seed phrases, or private keys. Evidence uploads must be validated and hash-bound before product release. Supabase service credentials belong only in server-side environments. All chain writes must be user-signed and testnet-scoped during development.
