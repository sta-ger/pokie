# Bounded transcript

Date: 2026-08-26 (UTC)
Candidate: `02da699a5f6c62699765a89611a2b06783f63813`
Context: a new `mktemp` directory; all post-install POKIE commands used only
`$CLEAN_DIR/node_modules/.bin/pokie`, with documentation read only from
`$CLEAN_DIR/node_modules/pokie/`.

## Package and documentation discovery

| Command/check | Exit | Result |
| --- | ---: | --- |
| `npm pack --json --pack-destination $PACK_DIR` (from candidate) | 0 | `pokie-1.3.0.tgz`, SHA-256 `858df9634302905eb2fdcaec18fefecad4552f0f0bff40d6a25daf5837035731` |
| `npm init --yes && npm install ../pokie-1.3.0.tgz` (new directory) | 0 | Installed 99 packages; public CLI reports `1.3.0`. |
| Installed README `docs/` link existence check | 0 | 10 unique links; 0 missing: `README.md`, `cli.md`, `external-adapter-sdk.md`, `game-packages.md`, `math-modeling.md`, `outcome-library-bundle.md`, `paytable-and-wins.md`, `provably-fair.md`, `reel-strip-generation.md`, `reels-and-sequences.md`. |
| Installed docs inventory | 0 | 36 Markdown files, including `docs/certification-evidence-bundle.md` and `docs/stake-engine-export.md`. |
| `pokie certification --help` | 0 | Public help exposes `certification build <bundleDir> <config.json>` and `certification verify <certDir>`. |
| Read installed `docs/cli.md` and `docs/stake-engine-export.md` | 0 | Documents `create --random`, `export <source> --to adapter`, and `validate <project>`. |

## Public artifact journey

| Command | Exit | Readback/result |
| --- | ---: | --- |
| `pokie create valera --random --seed 719 --out artifacts/valera.blueprint.json` | 0 | Created Valera, id `valera`; CLI provenance: generator `1.1.0`, strategy `default-line-pay`, seed `719`. |
| `pokie inspect artifacts/valera.blueprint.json` | 0 | Identified a Game Blueprint and listed public next actions, including Stake Engine export. |
| `pokie validate artifacts/valera.blueprint.json --format json` | 0 | `kind: "blueprint"`, `valid: true`, no errors/warnings. |
| Blueprint readback | 0 | `manifest.id: "valera"`, 5 reels, 4 rows, 5 symbols; SHA-256 `ccc4a1cef84fc1744a5b2c396cd57ea5317ff8e28f55d805c377eb28d1ee15dc`. |
| `pokie export artifacts/valera.blueprint.json --to outcomes --out artifacts/outcome-library` | 134 | Fatal Node out-of-memory; no outcome-library artifact written. |
| `pokie export artifacts/valera.blueprint.json --to adapter --out artifacts/stake-adapter` | 134 | Fatal Node out-of-memory; no Stake adapter artifact written. |
| `pokie validate artifacts/stake-adapter --format json` | 1 | Not reachable as a Stake contract check: absent output was resolved as a non-POKIE package and reported `pokie-package-load-failed`. |

The direct adapter export failure is independently reproducible with the
recorded installed-package command and deterministic public Blueprint. It is
not an Outcome Library manifest error; the process aborts before any adapter
exists to validate.

## Minimal failure excerpts

`export --to outcomes`:

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

`export --to adapter`:

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

No generated projects, package tarballs, installation trees, raw command logs,
or automation scripts are retained in this evidence directory.
