# Repository Guidelines

## Project Structure & Module Organization

The working directory currently contains no source files, tests, assets, or Git metadata. As the project is added, keep application code in a clearly named source directory (such as `src/`), automated tests in `tests/` or alongside the modules they cover, and static files in `assets/` or `public/`. Keep documentation and configuration at the repository root when they apply across the project. Update this guide when the actual layout is established.

## Build, Test, and Development Commands

No build system or development commands are defined yet. When adding one, document the canonical install, local-run, test, and build commands here (for example, `npm install`, `npm run dev`, `npm test`, and `npm run build` for a Node-based project). Use the commands declared by the project’s manifests rather than introducing undocumented alternatives.

## Coding Style & Naming Conventions

Follow the conventions and formatter adopted by each language or framework; keep formatting consistent and run the project formatter before submitting changes. Use descriptive names that reflect a module’s responsibility. Prefer the language’s common naming style (for example, `snake_case` for Python modules and `camelCase` for JavaScript functions), and use consistent casing for filenames within each area.

## Testing Guidelines

No test framework or coverage target is configured yet. Add tests for new behavior and regression fixes, name test files consistently with the chosen framework, and document the command that runs the full suite. Keep tests deterministic and independent of external services unless those dependencies are explicitly part of the test.

## Commit & Pull Request Guidelines

There is no Git history from which to infer commit conventions. Use short, imperative commit subjects (for example, `Add input validation`). Pull requests should explain the change and its motivation, list relevant verification steps, link related issues when available, and include screenshots for user-visible changes.

## Security & Configuration

Do not commit credentials, private keys, or local environment files. Provide safe example configuration with placeholder values, and document required variables without exposing secrets.
