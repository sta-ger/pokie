# P7-15 independent packed-CLI reel lifecycle

Candidate: `7f97bc547e6e509375746cf7cec40495f7ef7f2b` (`pokie@1.3.0`).
Run on 2026-08-26 in a fresh temporary directory. This directory was created with
`mktemp`; it contained a new `npm init` project and no checkout `node_modules`.

## Provenance and invocation

The candidate was built once with `npm run build`, then packed without rerunning
scripts. The installed public package tarball was:

```
pokie-1.3.0.tgz  sha256:baa1144ce6147233e840e80bafa96d20e58f9357475542f8576daf081c0e0c9b
```

In the new project, `npm install --ignore-scripts ../pokie-1.3.0.tgz` installed
that tarball. Every CLI action below used `npx --no-install pokie`; none used the
checkout executable or its `node_modules` self-dependency.

The principal input was the documented public
`examples/blueprints/generated-reels.blueprint.json`, copied into the fresh
project unchanged (`sha256:a58f146d0a65b5ae3fe61784755c1b49f6a30fca9f7658a9b14f5fc5df2035e4`).
It supplies weighted + circular-distance reels (1 and 2) and a count-based,
locked-position reel (3). Its before/after SHA-256 was identical.

Two temporary, non-product inputs were mechanically derived from that copy only
to exercise the public stack form described by `pokie reel generate`:

- `stack-composition.blueprint.json` replaced entry 1 with
  `length: 6`, `symbolCounts: {A:2,K:4}`, `seed:71`, locked positions 0 and 5
  set to `A`, and `stack(A, length 2, exactly 1 stack)`.
- `impossible-stack.blueprint.json` replaced entry 1 with one `A`, five `K`s,
  and the same required two-`A` stack, with `maxAttempts:3`.

No generated JSON was manually edited or repaired.

## Transcript (command, exit code, readback)

All commands below ran from the fresh installed-CLI project.

| Command | Exit | Result |
| --- | ---: | --- |
| `pokie reel generate generated-reels.blueprint.json --reel 1 --seed 424242 --format json` (twice) | 0, 0 | Byte-identical JSON previews (`cmp` exit 0): deterministic seed override. |
| `pokie reel generate generated-reels.blueprint.json --format json` | 0 | Generated reels 1–4 succeeded: lengths 30/28/34/24; declared seeds 20260713/20260714/7/999; count/locked reel 3 had `W` at position 0. |
| `pokie reel generate stack-composition.blueprint.json --reel 1 --format json` | 0 | Readback strip `A K K K K A`; endpoints form the required wrap-aware two-`A` stack. |
| `pokie reel generate generated-reels.blueprint.json --reel 3 --seed 424242 --apply --out applied.blueprint.json --format json` | 0 | Wrote only the requested output; readback has no top-level `reelStrips`, entry 3 is literal, length 34. |
| `pokie validate applied.blueprint.json --format json` | 0 | `valid: true`. |
| `pokie reel generate generated-reels.blueprint.json --materialize --out materialized.blueprint.json --format json` | 0 | Readback has no `reelStripGeneration`; five literal reels of lengths 18/30/28/34/24. |
| `pokie validate materialized.blueprint.json --format json` | 0 | `valid: true`. |
| `pokie par export materialized.blueprint.json --out materialized.par.xlsx` | 0 | Workbook exported from unchanged generated output. |
| `pokie par import materialized.par.xlsx --out par-readback.blueprint.json --format json` then `pokie validate par-readback.blueprint.json --format json` | 0, 0 | PAR readback contains five literal reels and validates `true`. |
| `pokie build applied.blueprint.json --target tsPackage --out applied-package` | 0 | TypeScript package published with `dist/index.js`. |
| `pokie build materialized.blueprint.json --target tsPackage --out materialized-package`; install the same tarball there; `pokie validate materialized-package --format json` | 0, 0, 0 | Built package loads as package `generated-reels` v0.1.0 and validates `true`. |
| `pokie reel generate impossible-stack.blueprint.json --reel 1 --apply --out impossible-output.blueprint.json --format json` | 1 | No output file was created. Plain diagnostic: `Found 0 stack(s); expected 1–1.` It names no internal algorithm class. |

The first source copy remained unchanged (`a58f…2035e4` before and after), so
`--out` paths were the only persisted workflow outputs. The failing `--apply`
also left its requested output absent, demonstrating all-or-nothing safe-write
behavior without a repair step.

## Output checksums

Only checksums are retained; the temporary project, generated Blueprints,
workbook, package trees, install trees, and raw command logs were removed after
these readbacks.

```
71ed7abe88bcebad86513bc8cbb45fc21bced5b1efbabfca8dae5fecf65e2a76  applied.blueprint.json
1ce363dcbba754dffe2a0de114a970dfa167edc488dc1b68e9c4be89d80768d3  materialized.blueprint.json
8643b0aa615ded90861cba6c2deba938b7167a3cd27417fc31c3c3980bec90ec  materialized.par.xlsx
8e13913b7bc6129d64c41dd0cde489ddd79030be694ffbd23d437d8ad9db45b3  par-readback.blueprint.json
36b31abc9b37af50119a2d89526acf28e885c570091deb129c883a45db219f81  applied-package/package.json
078f3449ef611f2a4372296e12b5f9acc5a1c572283ed3fb20cbde3a5fdc639a  applied-package/dist/index.js
eb3071245efe94bfa24e1bbe0c5b20c45d757faae88fef62be65db50342a65aa  materialized-package/package.json
4ceb620325a87208923e8bc9724a5742c1af271e7b071cff289f83573dff3604  materialized-package/dist/index.js
```
