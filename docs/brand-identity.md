# MemeProof brand identity — Stage 1

## Selected direction: The Open Record

The mark uses two open, inward-facing record edges with a continuous evidence line passing through the gap. The open sides communicate transparency and ongoing review. The line is a trace through a record, not a checkmark or automatic verdict. Its rounded stroke geometry remains recognizable when reduced to the app icon or favicon.

### Concepts explored

1. **The Open Record (selected):** two open record edges surrounding an evidence trace. It ties the symbol to a public record and a claim that can be followed without suggesting the platform makes an automatic judgment.
2. **The Three-Point Trail:** three linked points for Promise, Evidence, and Review, with different shapes and spacing to show that the steps are related but distinct. It explains the workflow well, but behaves more like a process diagram than an independent brand mark.
3. **The Indexed Ledger:** a ledger edge with a cut-in index and a visible record line. It suggests permanence and retrieval, but risks reading as a generic document or filing icon.

## Wordmark and typography

The wordmark pairs a compact, confident sans for “Meme” with a quieter serif “Proof.” This gives the name a small editorial contrast while keeping it readable in navigation. Product copy and controls use a system sans stack; selected display headings use a restrained serif stack. The current implementation avoids a network font dependency.

## Color system

| Role | Token | Value |
| --- | --- | --- |
| Forest ink | `--brand-forest` | `#173B34` |
| Warm paper | `--brand-paper` | `#F7F5EE` |
| Canvas | `--brand-canvas` | `#F4F3EE` |
| Warm surface | `--brand-surface` | `#FFFEFA` |
| Evidence mint | `--brand-mint` | `#75D5AE` |
| Strong mint | `--brand-mint-strong` | `#2B805F` |
| Warning amber | `--brand-warning` | `#A66C2C` |
| Challenge red | `--brand-danger` | `#A94D49` |

Forest anchors the identity, warm paper supports light product surfaces, and mint highlights evidence. Amber and red remain reserved for warning and challenge states. `--font-ui`, `--font-display`, `--radius-control`, `--radius-panel`, and `--shadow-soft` provide the shared typography and component foundations.

## Logo assets

- `apps/web/public/brand/memeproof-primary.svg` — stacked primary logo.
- `apps/web/public/brand/memeproof-light.svg` — horizontal lockup for light surfaces.
- `apps/web/public/brand/memeproof-dark.svg` — reversed lockup for dark surfaces.
- `apps/web/public/brand/memeproof-monochrome.svg` — one-color reproduction.
- `apps/web/public/brand/memeproof-symbol.svg` — standalone mark.
- `apps/web/public/brand/memeproof-icon.svg` — compact app icon.
- `apps/web/src/app/icon.svg` — Next.js favicon source.
- `apps/web/src/app/brand-logo.tsx` — inline mark and responsive wordmark used in the landing and workspace navigation.
- `/brand-system` — in-app brand presentation with logo variations and color swatches.

## Reference study

Font In Logo informed the attention to type and wordmark pairing. 60fps provided a catalogue view of interaction details rather than a page template. Recent, Landbook, and Landdding exposed curated references across identity, interface, and web compositions. MotionSites Studio was accessible and reviewed for its focused showcase framing. `motionsites.ai` could not be opened by the browser tool. `godly.website` redirected to Recent and returned an access error, so those two destinations were not visually inspected. No reference was copied; the selected mark is based on MemeProof’s public record and evidence model.
