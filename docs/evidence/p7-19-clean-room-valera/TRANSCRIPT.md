# Bounded transcript — P7-19

Candidate: `03e0474c558bd55bcd3946292473cf07ecd80c0a`
Date: 2026-08-26 UTC
Context: a fresh `/tmp/p7-19-clean-room-valera.*` directory. All POKIE invocations below
were `./node_modules/.bin/pokie` from that directory, after installing the packed candidate.

## Provenance and packaged documentation

| Command/check | Exit | Result |
| --- | ---: | --- |
| `git rev-parse HEAD` | 0 | `03e0474c558bd55bcd3946292473cf07ecd80c0a` before packing. |
| `npm pack --json` | 0 | Built one `pokie-1.3.0.tgz`; SHA-256 is recorded in `CHECKSUMS.sha256`. |
| `npm init -y && npm install --ignore-scripts <candidate>/pokie-1.3.0.tgz` | 0 | Fresh install: 99 packages. |
| `pokie --help` | 0 | Installed CLI exposed the public command set and next steps. |
| Installed README Markdown-link check | 0 | 10 unique `.md` targets, 0 missing: `docs/{README,cli,external-adapter-sdk,game-packages,math-modeling,outcome-library-bundle,paytable-and-wins,provably-fair,reel-strip-generation,reels-and-sequences}.md`. |
| `pokie certification build --help` | 0 | Names `docs/certification-evidence-bundle.md`; the installed document existed and supplied the documented `modes`/`seed`/`sampleCount` config. |

## Deterministic public Blueprint and interoperable artifacts

| Command | Exit | Artifact readback/result |
| --- | ---: | --- |
| `pokie create Valera --random --seed 190719 --preset default --out journey/valera.blueprint.json` | 0 | Created reproducible `Valera` Blueprint; generator `1.1.0`, strategy `default-line-pay`. |
| `pokie validate journey/valera.blueprint.json --format json` | 0 | `kind: blueprint`, `valid: true`, no errors or warnings. |
| `pokie build journey/valera.blueprint.json --target outcomeLibrary --out journey/valera-outcomes` | 0 | Standard heap completed. Preflight reported `85,766,121` raw combinations and selected documented deterministic bounded coverage: 5,000 outcomes. |
| `pokie validate journey/valera-outcomes --deep --format json` | 0 | `kind: outcome-library`, `valid: true`, no issues. |
| `pokie build journey/valera.blueprint.json --target stakeAdapter --out journey/valera-stake` | 0 | Standard heap completed a 5,000-outcome Stake export. |
| `pokie validate journey/valera-stake --format json` | 0 | `kind: stake-engine`, `valid: true`; one documented informational lossy-import hash warning only. |
| `pokie report journey/valera-stake --format json --out journey/stake-report.json` | 0 | Readable exact Stake analysis: mode `base`, 5,000 outcomes, RTP `0.3188000000000004`. |
| `pokie import journey/valera-stake --out journey/valera-imported-outcomes` | 0 | Wrote documented adapter source descriptor (`config.json`, `libraries/base.json`, `source-provenance.json`). |
| `pokie export journey/valera-imported-outcomes/config.json --to adapter --out journey/valera-stake-roundtrip` | 0 | Readback/re-export completed; `cmp` returned 0 for original vs. round-trip `index.json`, `lookup_base.csv`, and `books_base.jsonl.zst`. |
| `pokie par export journey/valera.blueprint.json --out journey/valera.par.xlsx` | 0 | Readable PAR workbook written. |
| `pokie par import journey/valera.par.xlsx --out journey/valera-par-imported.blueprint.json` | 0 | Imported `Valera`, 6 x 3, 6 symbols; recorded provenance hash matched. |
| `pokie validate journey/valera-par-imported.blueprint.json --format json` | 0 | `valid: true`, no errors or warnings. |
| `pokie certification build journey/valera-outcomes journey/certification-config.json --out journey/valera-certification` | 0 | Wrote manifest and 50 deterministic samples for `base`. |
| `pokie certification verify journey/valera-certification --source journey/valera-outcomes` | 0 | Certification bundle verified successfully. |

The documented imported-Stake output is a re-export descriptor, not an Outcome Library Bundle.
An attempted `pokie validate journey/valera-imported-outcomes --deep` therefore exited 1 with the expected
`outcome-library-bundle-manifest-missing` message; the installed `stake-engine-import.md` explicitly directs
users to feed `config.json` back to `pokie export --to adapter`, which succeeded above. This was recorded as
discoverability/readback evidence, not a product finding.

## Package lifecycle and outcome generation

| Command | Exit | Artifact readback/result |
| --- | ---: | --- |
| `pokie build journey/valera.blueprint.json --target tsPackage --out journey/valera-package` | 0 | Runnable package written; build summary records Blueprint hash `sha256:7c625d11dbfe442e8e1caa8f7ed0350d44fadea0e1e38efb2e2f9b986a1e78f8`. |
| `pokie inspect journey/valera-package` / `pokie validate journey/valera-package --format json` | 0 / 0 | Identified a POKIE game package, `valid: true`. |
| `pokie sim journey/valera-package --rounds 1000 --seed valera-before --out journey/before.json --format json` | 0 | 1,000 rounds; RTP `0.261`, hit frequency `0.111`, max win `10`. |
| `pokie report journey/before.json --format markdown --out journey/before.md` | 0 | Markdown readback retained seed and reproducibility command. |
| `pokie sim journey/valera-package --rounds 1000 --seed valera-after --out journey/after.json --format json` | 0 | 1,000 rounds; RTP `0.302`, hit frequency `0.119`, max win `9`. |
| `pokie diff journey/before.json journey/after.json` | 0 | Reported the seeded-run deltas (RTP `+4.10 pp`, hit frequency `+0.80 pp`). |
| `pokie replay journey/valera-package --seed valera-before --round 42 --out journey/replay.json --format json` | 0 | Read back round 42 with a 6 x 3 screen, total bet `42`, total win `14`. |
| `pokie generate journey/valera-package --sample 5000 --seed valera-generated --out journey/generated-outcomes.json --format json` | 0 | Readback found exactly 5,000 outcomes; diagnostics record `bounded-coverage`, source size `85,766,121`, and the seed. |

One initial public `generate` invocation used `--seed` without documented `--sample`; it exited 1 with the
actionable CLI usage message. Reading its public `--help` supplied the corrected command above. No artifact was
written by the rejected invocation.

## Public local/dev lifecycle

| Command | Exit | Semantic ready state |
| --- | ---: | --- |
| `pokie serve journey/valera-package --host 127.0.0.1 --port 0` | 0 after intentional SIGINT | Rendered `POKIE dev server listening on http://127.0.0.1:34029`. |
| `pokie dev journey/valera-package --host 127.0.0.1 --port 0 --client-host 127.0.0.1 --client-port 0 --no-open` | 0 after intentional SIGINT | Rendered API `http://127.0.0.1:46007` and client UI `http://127.0.0.1:34021`. |

Each server was stopped only after its rendered readiness state; no process remained. Generated artifacts and
temporary logs were discarded after the checksums below were recorded. No product failure was observed.
