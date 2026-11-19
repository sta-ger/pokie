# Testing

This guide is for people working on POKIE itself. Consumers of the package can start with
[`docs/README.md`](README.md) and the [main README](../README.md).

## Install

Use Node 24 (`nvm use`) and install from the lockfile:

```bash
npm ci
```

ESLint 10 uses `eslint.config.mjs`. The remaining overrides pin the Jest browser environment,
`test-exclude`, and the ESLint peer used by `eslint-plugin-react`. They are not an audit substitute:
npm does not apply a dependency's `overrides` to consumers, so every runtime dependency must be clean
as installed.

## Commands

| Command | What it runs | When to use it |
|---|---|---|
| `npm test` | Unit tests plus the companion examples suite | Everyday development |
| `npm run check:full` | Lint, fast tests, typecheck and integration tests | Before opening a PR |
| `npm run check:release` | Lint, typecheck, coverage, the real pack/install smoke test and the production dependency audit | Before a release |
| `npm run test:integration` | Integration lane only | Server, worker and real-filesystem changes |
| `npm run test:targeted -- <files...>` | Exact named files, one process per file | Verifying a focused correction |
| `npm run test:coverage` | Unit, examples and integration lanes with coverage | Checking coverage |
| `npm run test:packaging` | Real `npm pack` → install → spawn smoke test | Verifying the published package boundary |
| `npm run audit:prod` | `npm audit --omit=dev` | Verifying production dependencies before a release |

`npm test` runs only the fast Jest lane. It does not lint, collect coverage or run the packaging
smoke test; `check:full` adds lint, typecheck and integration, and `check:release` adds coverage,
packaging and the production audit.

## Dependency audit

`npm run audit:prod` is the release gate and must stay at zero. Audit the packed install too: root
`overrides` only affect this checkout, while consumers resolve the ranges in the tarball.
`npm run test:packaging` installs the real archive and asserts that its `npm audit --omit=dev` result
is zero.

The XLSX runtime dependency is the maintained `exceljs-community` 4.6.1 fork, installed under the
`exceljs` alias. Upstream `exceljs@4.4.0` is unmaintained and pulls `uuid@8`, whose advisory applies
to consumers even when a root override replaces it here.

The full `npm audit` also covers development tooling. It currently reports moderate findings in
Jest's `glob`/`minimatch` chain
([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Those packages are not in
the packed production tree. The findings are recorded here instead of being hidden with a
repository-wide override, audit setting or vendored fork. Re-run both audits when dependencies
change.

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

Atomic-directory publication tests exercise the real `renameat2` syscall. When the host `mv` predates
`--exchange` but the Linux kernel supports the syscall, the test harness installs a test-only `mv` shim;
production still requires a capable host. No assertions are skipped or weakened.
