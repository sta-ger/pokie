# P7-03 independent packed-CLI rerun

Candidate: `68b893ac84ed80fed9fef59d930fbb18d08293c1` (clean checkout before the run).  On 2026-08-25, this checkout was built, packed with `npm pack`, then installed into a new temporary prefix with `npm install --ignore-scripts --no-audit --no-fund <tarball>`.  The packed `pokie-1.3.0.tgz` SHA-256 was `2ad3f09c0e5001bd4a677bc7b19c4d5b0bdf28ea9b9a2da52a7ebf6fab7b3e2b`; every public command below used that prefix's `node_modules/.bin/pokie`, never the checkout's self-dependency.

All projects and fixtures were created in a new temporary directory by the recorded CLI commands (apart from plain sentinel files used only to demonstrate refusal paths).  No generated project trees, package installs, browser data, or raw logs are retained here.

## CLI journey

| Command / interaction | Result |
| --- | --- |
| PTY `pokie create Interactive-Default --out interactive-created.json`; Enter through defaults, confirm `y` | exit 0; created `Interactive Default` / `Interactive-Default`, 5x3. |
| PTY `pokie edit interactive-created.json --out interactive-edited.json`; change only name to `Interactive Edited`, preserve defaults, confirm `y` | exit 0; displayed `name: Interactive Default -> Interactive Edited` and saved the explicit output. |
| non-TTY `pokie create noninteractive-misuse --out should-not-exist.json` | exit 1; actionable instruction to use a terminal, `--blank`, or `--random`. |
| `pokie create --blank` | exit 0; default output `./blank-slot.blueprint.json`, manifest `blank-slot` / `Blank Slot`. |
| `pokie create Blank-Explicit --blank --out blank-explicit.blueprint.json` then identical repeat | first exit 0; repeat exit 1: destination already exists and must not be overwritten. |
| `pokie create --blank --out ''` | exit 1: `--out requires a non-empty file path`. |
| `pokie create Seeded-Random --random --seed 424242 --out seeded-{a,b}.blueprint.json` | both exit 0; each reports generator `1.1.0`, strategy `default-line-pay`; byte-identical outputs (`cmp -s`, exit 0). |
| `pokie validate blank-slot.blueprint.json` and `pokie validate seeded-a.blueprint.json` | both exit 0, `valid yes`. The random blueprint has 3 per-reel generation entries. |
| `pokie build <blank/random blueprint> --target tsPackage --out <new package>`; `npm install --prefix <package> --no-save <candidate tarball>`; `npm run build --prefix <package>`; `pokie validate <package>` | both branches completed all commands with exit 0 and final `valid yes`. A repeat build into populated `random-package` exited 1 with the safe “already exists and is not empty” diagnostic. |
| `pokie init init-ready --package-name init-ready --game-id init-ready --game-name 'Init Ready'` | exit 0; created package files, completed its own install/build/verify, and reported the package prepared and verified. Follow-up `pokie validate init-ready` exited 0. |
| `pokie init init-ready --no-prepare` | exit 0; safely updated package metadata and skipped existing `tsconfig.json`, `README.md`, and `src/index.ts`. |
| non-empty directory: `pokie init existing-nonempty --no-prepare`, then `--yes --no-prepare` | refusal exit 1 with explicit `--yes` guidance; confirmed merge exit 0, preserving the sentinel. |
| regular-file target and regular-file `src` target with `pokie init ... --no-prepare` | each exit 1 with an actionable “not a directory” diagnostic. |

Structural-check command (exit 0) parsed each generated JSON and required a manifest id and nonempty symbols.  It observed: blank 3x3; seeded random 3x3 with 3 per-reel entries; interactive create 5x3; interactive edit retained 5x3.

## Checksums

```
bac457b821b4d6c0e5ed8d625ba7b989a92a4775acdfa773d1a414c070bf5003  blank-slot.blueprint.json
048bbe47ffcca35e5be8f14972149c21b6309263578e6fb0a5861b583f03eb4f  blank-explicit.blueprint.json
71e980a5b28804b0c9bba7320be1ec37a4e3e85a0c9be8342e894c03854a6726  seeded-a.blueprint.json
71e980a5b28804b0c9bba7320be1ec37a4e3e85a0c9be8342e894c03854a6726  seeded-b.blueprint.json
707761e136580109df4c88d2886e514c4833628698bbac45e2bcb5b3072cccfd  blank-package/dist/index.js
fd75ce39605023a00da4b58811b56a019d9e56f5bf321aea2094b275ff507fa1  random-package/dist/index.js
c95752db672bcabb29ef6ab1c0a768e68287073d823eda084ca051176173b4cd  init-ready/dist/index.js
```

## Exact-candidate related tests — finding

One complete-file command was run exactly once:

```sh
npm run test:targeted -- tests/cli/commands/EditCommand.test.ts tests/cli/RandomBuildWorkflow.integration.test.ts tests/cli/BuildWorkflow.integration.test.ts tests/cli/InitCommandWorkflow.integration.test.ts
```

Result: exit 1; 3 suites passed, 1 failed; 24 tests passed, 1 failed.  The only failure was in `tests/cli/RandomBuildWorkflow.integration.test.ts`:

```
Expected: "my-random-game"
Received: "My Random Game"
```

The failure is the test's expectation of `blueprint.manifest.name` after `CreateCommand.run(["my-random-game", "--random", "--seed", "5"])`; the installed CLI's observed random-create output title-cases the positional name (the independent run similarly produced `Seeded Random` from `Seeded-Random`).
