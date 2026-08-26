# Machine-run transcript — P7-19

Candidate: `9bb5cf4ebdef008954262f388a4699e9f1cd0b5d`
CLI package: `pokie@1.3.0`; tarball SHA-256 `82462d1cde78c375bb5e38d015c00e0e02b04d25d897f786358ef43d1dfea498`.

## Clean-room provenance

`mktemp -d /tmp/p7-19-clean-room-valera.XXXXXX` -> `/tmp/p7-19-clean-room-valera.A409NF` (exit 0)

`npm install --ignore-scripts --no-audit --no-fund <candidate>/pokie-1.3.0.tgz` (exit 0; 99 packages)

All later commands ran from that directory through `./node_modules/.bin/pokie`.
The packed tarball contained `package/README.md` and no `package/docs/` tree. `test -d
node_modules/pokie/docs` reported `absent`. No source, fixture, project output, or local
configuration from the candidate checkout was used; generated outputs were never edited.

## Learn and create/package journey

| Command | Exit | Readback/result |
| --- | ---: | --- |
| `pokie --version` | 0 | `1.3.0` |
| `pokie`, `pokie --help`, and per-command `--help` for create/build/validate/inspect/sim/report/diff/replay/export/par/fairness/serve/dev/sample | 0 | Public command grammar and next actions available. |
| `pokie create valera --blank --out valera.blueprint.json` | 0 | Created Blueprint `Valera`, id `valera`, v`0.1.0`. |
| `pokie inspect valera.blueprint.json` | 0 | Identified a Game Blueprint and offered build/export actions. |
| `pokie validate valera.blueprint.json --format json --out valera-blueprint-validation.json` | 0 | `valid: true`, no errors/warnings. |
| `pokie build valera.blueprint.json --target tsPackage --out valera-package --dry-run` | 0 | Valid; expected six package files; blueprint hash `aa79…65fd`; no destination written. |
| `pokie build valera.blueprint.json --target tsPackage --out valera-package` | 0 | Runnable package created. |
| `pokie inspect valera-package` / `pokie validate valera-package --format json --out valera-package-validation.json` | 0 / 0 | POKIE game package; `valid: true`, game `valera`. |

## Simulation, report, diff, and replay

| Command | Exit | Artifact readback |
| --- | ---: | --- |
| `pokie sim valera-package --rounds 24 --seed valera-19-a --format json --out valera-sim-a.json` | 0 | 24 rounds, RTP `0.875`, hit frequency `0.333333`, max win `5`. |
| `pokie sim valera-package --rounds 24 --seed valera-19-b --format json --out valera-sim-b.json` | 0 | 24 rounds, RTP `0.958333`, hit frequency `0.25`, max win `6`. |
| `pokie report valera-sim-a.json --format markdown --out valera-sim-a.md` | 0 | Rendered simulation report, retaining seed and re-run command. |
| `pokie diff valera-sim-a.json valera-sim-b.json --format json --out valera-sim-diff.json` | 0 | `changed: true`; seed, RTP, hit frequency, and max win differences reported. |
| `pokie replay valera-package --seed valera-19-a --round 7 --format json --out valera-replay.json` | 0 | Round 7 read back with a 3×3 screen, total bet `7`, total win `6`. |

## Outcome, Stake, and PAR branches

| Command | Exit | Artifact readback |
| --- | ---: | --- |
| `pokie build valera.blueprint.json --target outcomeLibrary --out valera-outcomes` | 0 | Exact Outcome Library built; preflight enumerated 91,125 reel-stop combinations. |
| `pokie inspect valera-outcomes` / `pokie validate valera-outcomes --deep --format json --out valera-outcomes-validation.json` | 0 / 0 | Outcome Library; deep validation `valid: true`, no issues. |
| `pokie sample valera-outcomes --mode base --seed valera-19-sample` | 0 | Portable round-1 descriptor: library `valera-base`, outcome `outcome-cdfe226aa77997e1`, selection `derived-round-seed-v1`. |
| `pokie replay valera-outcomes --mode base --seed valera-19-sample --round 1 --format json --out valera-outcome-replay.json` | 0 | Exact replay selected the same outcome id and library hash. |
| `pokie build valera.blueprint.json --target stakeAdapter --out valera-stake` | 0 | Stake export created (14,950 Stake books); `inspect` identifies it as Stake Engine export. |
| `pokie par export valera.blueprint.json --out valera.par.xlsx` | 0 | PAR workbook created; `inspect` identifies a PAR workbook. |
| `pokie par import valera.par.xlsx --out valera-imported.blueprint.json --format json` | 0 | Imported Blueprint reports matching POKIE provenance/hash. |
| `pokie validate valera-imported.blueprint.json --format json --out valera-imported-validation.json` | 0 | `valid: true`; two explicit math-quality warnings only. |
| `pokie build valera.blueprint.json --target parWorkbook --out valera-built.par.xlsx` | 0 | Alternate build target produced a readable PAR workbook. |
| `pokie build valera-outcomes --target stakeAdapter --out valera-outcome-stake` | 0 | Outcome Library also exports to Stake successfully. |

## Public serve/dev workflows

| Command | Exit | Semantic readiness/readback |
| --- | ---: | --- |
| `pokie serve valera-package --port 41719 --host 127.0.0.1` | 0 after termination | Rendered `POKIE dev server listening on http://127.0.0.1:41719`; public `GET /health` -> `{"status":"ok"}`. |
| `pokie dev valera-package --port 41720 --host 127.0.0.1 --client-port 41721 --client-host 127.0.0.1 --no-open` | 0 after termination | Rendered API and client ready URLs; public API `GET /health` -> `{"status":"ok"}` and client `GET /` contained `<title>POKIE client`. |

Both deliberate server terminations occurred only after their rendered ready state and successful public HTTP
readback. No server process remained afterward.

## Findings and error readback

1. **P2 — packed documentation gap blocks certification discoverability.** `pokie certification build --help`
   requires a config and directs the newcomer to `docs/certification-evidence-bundle.md`; the packed tarball has
   no `docs/` directory. The installed README likewise uses relative `docs/...` references. With the stipulated
   packed CLI plus packaged public documentation, the certification config cannot be authored without outside or
   internal knowledge.
2. **P2 — `export` advertises unsupported Blueprint input for Stake adapter.** `pokie export --help` says its
   source is “a source descriptor or Blueprint Project” and accepts `--to adapter`. Yet
   `pokie export valera.blueprint.json --to adapter --out should-not-exist-stake` exited **1**, wrote no output,
   and said the Blueprint “is not a valid Stake Engine export config.” The advertised direct build alternative
   works, but that does not make the advertised export route usable.
3. **P2 — `validate` rejects the CLI's own valid Stake export.** After the successful Stake build above,
   `pokie validate valera-stake --format json` exited **1** with project kind `outcome-library` and
   `outcome-library-bundle-manifest-missing` for `manifest.json`. `pokie inspect valera-stake` correctly calls
   the same artifact a Stake Engine export. This blocks the documented validate workflow for that generated
   artifact.

The generated `valera-outcomes` (14 MiB), packages, Stake trees, workbooks, temporary logs, and the installed
dependencies are intentionally not retained. Their representative sizes and checksums are recorded separately;
the retained evidence is three small text files only.
