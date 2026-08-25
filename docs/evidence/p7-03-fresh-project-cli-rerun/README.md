# P7-03 exact-candidate packed-CLI lifecycle rerun

Candidate: `a5b8ef1b506711080d7702ee4e1242c8f55c8306`. The clean checkout was packed with `npm pack --json`; the resulting `pokie-1.3.0.tgz` SHA-256 is `2ad3f09c0e5001bd4a677bc7b19c4d5b0bdf28ea9b9a2da52a7ebf6fab7b3e2b`. It was installed from that tarball into a new temporary prefix using `npm install --ignore-scripts --no-audit --no-fund <tarball>` (exit 0); its installed public CLI reported `1.3.0` (exit 0).

Every command below used only that fresh prefix's `node_modules/.bin/pokie`, in a separate fresh temporary work directory. No generated project trees, package installs, raw logs, browser data, or automation are retained. The only hand-created files were plain sentinels for refusal checks.

The prior candidate's evidence is retained in [prior-rerun-68b893ac-20260825.md](prior-rerun-68b893ac-20260825.md).

## Installed CLI lifecycle

| Surface | Exact-candidate result |
| --- | --- |
| Interactive create (PTY) | `create Interactive-Default --out interactive-created.blueprint.json`, default answers and confirmation: exit 0; `Interactive Default` / `Interactive-Default`, 5x3. |
| Interactive edit (PTY) | `edit blank-slot.blueprint.json --out blank-edited.blueprint.json`: exit 0; only `name: Blank Slot -> Interactive Edited` changed, then saved on confirmation. |
| Blank, random, and repeat create | Blank create exit 0. Two `Seeded-Random --random --seed 424242` creates exited 0 and `cmp -s` exited 0. Repeating blank output exited 1 with `already exists`; empty `--out` exited 1 with `--out requires a non-empty file path`. Non-TTY interactive create exited 1 with terminal/`--blank`/`--random` guidance. |
| Structural validation | `validate` exited 0 for blank, random, edited, and interactive blueprints. JSON parsing confirmed nonempty symbols and manifest id/name: blank 3x3, edited 3x3, random 3x3 with three per-reel generation entries, interactive 5x3. Random output reports generator `1.1.0`, strategy `default-line-pay`. |
| Supported build/package handoff | Blank and random blueprints both built to new `tsPackage` directories (exit 0); each received a fresh tarball install (exit 0), `npm run build` (exit 0), and installed-CLI `validate` (exit 0). Repeat build to populated `random-package` exited 1 with the safe nonempty-destination diagnostic. |
| Init, repeat, conflicts, invalid paths | Fully prepared `init-ready` ran its install/build/verify and exited 0; follow-up validate exited 0. Repeating `init-ready --no-prepare` exited 0 and skipped existing source/config/docs. Nonempty init without `--yes` exited 1; `--yes` exited 0 and retained the sentinel. A regular-file target exited 1 as not a directory; a regular-file `src` target, with `--yes` to pass the intentional nonempty-dir guard, exited 1 as not a directory. |

## Checksums

```
266b637663ea54cf02fe0bf48f716897c9976ad00ee46553940f15c371b366cd  blank-slot.blueprint.json
6830b6d21a0c0cd1076d8cfffb1688f6b7d69c9c90f442aeb773af152564633c  blank-edited.blueprint.json
71e980a5b28804b0c9bba7320be1ec37a4e3e85a0c9be8342e894c03854a6726  seeded-a.blueprint.json
71e980a5b28804b0c9bba7320be1ec37a4e3e85a0c9be8342e894c03854a6726  seeded-b.blueprint.json
e4b04ab1d44e3ea6eadec7be7949778b711b7783b8b7897bb96a8528a564f6fa  interactive-created.blueprint.json
9547ede6fd5e1c426e07b9ba04924464dd0fe1ec4dd6ebd972f2949b4f1196f0  blank-package/dist/index.js
fd75ce39605023a00da4b58811b56a019d9e56f5bf321aea2094b275ff507fa1  random-package/dist/index.js
c95752db672bcabb29ef6ab1c0a768e68287073d823eda084ca051176173b4cd  init-ready/dist/index.js
```

## Exact-candidate related tests

One complete-file command was run exactly once, before packing:

```sh
npm run test:targeted -- tests/cli/commands/CreateCommand.test.ts tests/cli/commands/EditCommand.test.ts tests/cli/commands/InitCommand.test.ts tests/cli/scaffold/GamePackageMerger.test.ts tests/cli/RandomBuildWorkflow.integration.test.ts tests/cli/BuildWorkflow.integration.test.ts tests/cli/InitCommandWorkflow.integration.test.ts
```

Exit 0: 7/7 suites passed, 116/116 tests passed, 0 snapshots. This covers every reviewer-listed bounded related suite as a complete file on the exact candidate.
