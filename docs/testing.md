# Testing

This guide is for people working on POKIE itself. Consumers of the package can start with
[`docs/README.md`](README.md) and the [main README](../README.md).

## Install

Use Node 24 (`nvm use`) and install from the lockfile:

```bash
npm ci
```

ESLint 10 uses `eslint.config.mjs`. The dependency overrides in `package.json` keep installs free of
deprecated transitive packages; remove each override when the upstream package adopts a supported
patched version.

## Commands

| Command | What it runs | When to use it |
|---|---|---|
| `npm test` / `npm run check:fast` | Unit tests plus the companion examples suite | Everyday development |
| `npm run check:full` | Fast tests, typecheck and integration tests | Before opening a PR |
| `npm run check:release` | Lint, typecheck, coverage and the real pack/install smoke test | Before a release |
| `npm run test:integration` | Integration lane only | Server, worker and real-filesystem changes |
| `npm run test:targeted -- <files...>` | Exact named files, one process per file | Verifying a focused correction |
| `npm run test:coverage` | Unit, examples and integration lanes with coverage | Checking coverage |
| `npm run test:packaging` | Real `npm pack` → install → spawn smoke test | Verifying the published package boundary |
| `npm run test:report -- --lane <fast\|full\|release>` | Runs a lane through `jest --json` and prints the slowest suites | Diagnosing test performance |

`npm test` does not collect coverage and does not run the packaging smoke test. Those have their own
commands and are included in `check:release`.

## Jest projects

- **`pokie`** — the fast library/CLI unit lane.
- **`pokie-examples`** — the companion `pokie-examples` checkout when `POKIE_EXAMPLES_PATH` points to it.
  Skips cleanly when the checkout is absent.
- **`pokie-integration`** — real HTTP servers, worker threads and heavier filesystem workflows.
- **`pokie-packaging`** — the real package tarball, install and installed-CLI smoke test.

## Test layout

- `tests/session`, `tests/simulation`, `tests/server`, `tests/replay` — runtime behaviour.
- `tests/generated`, `tests/parsheet`, `tests/stakeengine`, `tests/weightedoutcome`,
  `tests/pregenerated` — authored models and artifact formats.
- `tests/cli` — CLI commands, materialization and package scaffolding.
- `tests/project`, `tests/externaladapter`, `tests/certification`, `tests/fairness` — project conversion,
  deployment adapters and evidence workflows.
- `tests/v2` — cross-cutting money, runtime and package contracts.
- `tests/packaging` — real archive/install checks.

Use `npm run test:targeted -- path/to/file.test.ts` while iterating. A full `check:full` or
`check:release` is still required before larger changes are considered complete.

Platform-specific tests may require a real browser or GNU coreutils with `mv --exchange`; keep those
in their own lane rather than weakening assertions in the main suite.
