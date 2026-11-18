# Testing

This guide is for people working on POKIE itself. Consumers of the package can start with
[`docs/README.md`](README.md) and the [main README](../README.md).

## Install

Use Node 24 (`nvm use`) and install from the lockfile:

```bash
npm ci
```

ESLint 10 uses `eslint.config.mjs`. The React plugin currently needs `@eslint/compat` and its scoped
ESLint peer override. The dependency overrides in `package.json` keep installs free of deprecated
transitive packages; remove each override when the upstream package adopts a supported patched version.
The vendored Picomatch patch is documented in [`vendor/README.md`](../vendor/README.md).

## Commands

| Command | What it runs | When to use it |
|---|---|---|
| `npm test` / `npm run check:fast` | Unit and component tests | Everyday development |
| `npm run check:full` | Fast tests, typecheck, integration tests and Studio workflow tests | Before opening a PR |
| `npm run check:release` | Lint, typecheck, coverage and the real pack/install smoke test | Before a release |
| `npm run test:integration` | Integration lane only | Server, worker and real-filesystem changes |
| `npm run test:targeted -- <files...>` | Exact named files, one process per file | Verifying a focused correction |
| `npm run test:workflows` | Studio jsdom workflow lane only | Studio navigation, polling and job lifecycle |
| `npm run test:coverage` | Unit, component, integration and workflow lanes with coverage | Checking coverage |
| `npm run test:packaging` | Real `npm pack` → install → spawn smoke test | Verifying the published package boundary |
| `npm run test:report -- --lane <fast\|full\|release>` | Runs a lane through `jest --json` and prints the slowest suites | Diagnosing test performance |

`npm test` does not collect coverage and does not run the packaging smoke test. Those have their own
commands and are included in `check:release`.

## Jest projects

- **`pokie`** — fast unit/component lane for the library and CLI. Tests are transpile-only; import a
  concrete source file when a test needs a single class instead of pulling the full barrel.
- **`pokie-examples`** — runs the companion `pokie-examples` checkout when it is available and skips
  cleanly when it is not.
- **`studio-client-components`** — React/jsdom component tests for the Studio frontend.
- **`studio-client-workflows`** — heavier Studio workflow tests that use real timers and navigation
  guards. They run in a separate process with a bounded heap.
- **`pokie-integration`** — real HTTP servers, worker threads and heavier filesystem workflows.
- **`pokie-packaging`** — the real package tarball, install and installed-CLI smoke test.

The workflow runner starts each heavy file in its own Node process so one suite cannot exhaust the
shared heap for the next one. `test:targeted` resolves the named files across Jest projects and runs
them serially, which makes focused verification deterministic.

## Test layout

- `tests/session`, `tests/simulation`, `tests/server`, `tests/replay` — runtime behaviour.
- `tests/generated`, `tests/parsheet`, `tests/stakeengine`, `tests/weightedoutcome`,
  `tests/pregenerated` — authored models and artifact formats.
- `tests/cli` — CLI commands, materialization, packaging and Studio server routes.
- `tests/cli/studio-client` — React component and workflow tests.
- `tests/project`, `tests/externaladapter`, `tests/certification`, `tests/fairness` — project
  conversion, deployment adapters and evidence workflows.
- `tests/v2` — cross-cutting runtime, math and package contracts.
- `tests/packaging` — real archive/install checks.

Use `npm run test:targeted -- path/to/file.test.ts` while iterating. A full `check:full` or
`check:release` is still required before larger changes are considered complete.
