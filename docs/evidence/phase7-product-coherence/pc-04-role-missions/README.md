# PC-04 independent role-mission rerun — 2026-08-27

Candidate: `bda9fb6ea7a23c23bed0559435dd98d598cf6c11`.

## Independence boundary

Before reading source, tests, or the superseded PC-04 evidence, this verifier
started at `node ./dist/cli/pokie.js --help` and froze the public command map:
PAR import/export; Blueprint/package/Outcome/Stake builds; inspect; deep
validation; simulation/report; and Studio. After that marker, it read the
superseded role names only to make the fresh missions comparable. Each named
CLI role used a distinct newly-created directory beneath
`/tmp/pc04-independent-C5RTVO`; Studio used a newly-created Chromium profile.
All generated directories/profiles and full logs were discarded after the
checksums below were recorded.

## Fresh role transcript

| Role and natural goal | Public actions and frozen result |
| --- | --- |
| Math designer — PAR to editable model, runtime, and report | `create --random --seed 101`, `par export`, `par import --format json`, `inspect`, `validate`, `build --target tsPackage`, `sim --rounds 80 --seed pc04-math`, and Markdown `report` all exited 0. The imported Blueprint and runtime package were valid. |
| Game developer — runnable game and simulation | `create --random --seed 102`, `build --target tsPackage`, `inspect`, `validate`, `sim --rounds 80 --seed pc04-runtime`, and Markdown `report` all exited 0. |
| Integration developer — Outcome/Stake deployment and reuse | `create --random --seed 103`, Outcome build/sample, `inspect`, `validate --deep`, Stake build, `import`, `inspect`, `validate --deep`, then `export imported-stake/config.json --to adapter` all exited 0. This is the repaired public reuse path. |
| QA investigator — recoverability | `create --random --seed 106`, baseline validation, Outcome build/deep validation, Stake export/import/deep validation succeeded. Importing an Outcome Library was rejected as an unsupported input. Supplying documented `import --format json` to a Stake import was rejected with `Unknown option "--format"`; no output directory was written. |
| Frontend developer — browser player handoff | A fresh package was built and validated. A first permitted fresh Chromium launch received real `pokie dev` output: `POKIE dev server listening` and `POKIE client UI listening` at new localhost ports. The automation’s URL matcher expected a path suffix and timed out before browser navigation; this is a driver/readiness limitation, not a rendered product failure. |
| Developer opening another project — Studio orientation/stale recovery | A second permitted fresh Chromium launch started Studio with the required exact command `node ./dist/cli/pokie.js --no-open`; it announced `POKIE Studio listening on http://127.0.0.1:3200`. The physical address-bar navigation did not leave Chromium’s blank tab, so no rendered Studio control, stale marker, recovery control, or product error was observed. The two-launch cap prevents a further launch. |

Supplementary public CLI checks used two further fresh directories: a JSON
Outcome analysis (`seed 104`) and a portable PAR workbook with successful
`inspect` (`seed 105`). They are represented by their retained checksums.

## Real artifact ledger

Only identities, not generated artifacts, are retained.

| Artifact | SHA-256 |
| --- | --- |
| Math PAR workbook | `84defa748d9e0d1962889515fea1de9bb792ad6189db7c1692ede2a5fb6b82e7` |
| Imported editable Blueprint | `ed2cee008f8135eec84a1374ffc3eb7c1ebecbcd70ee7477de45a8d8ab25e163` |
| Math simulation JSON | `c5ad0b66413a5b96a2291c2fca1a7eba02b8997e6fd48b3dbafa6905f296e538` |
| Runtime simulation JSON | `4a9967f4278bae1f050ab1dc9f9f5770d001c0c9546eb567a938b27960ff0835` |
| Outcome manifest | `9cab77eb1ac29b5169023b38ec7a29f5e55db744ce877527b1657effdba803d7` |
| Stake export manifest | `7811e6d92318344f342549927182a47a955d98e758755bbc632c988f52dfd29b` |
| Imported Stake `config.json` | `7a712b766eeedb68cb4f948147859861b633b172e665ad4b3db8fdc9b6ee0ec6` |
| Re-exported Stake manifest | `98151f052081e7531290c26eac55fb3713b0f89f5a0ea2bba8b6fae33c9ae8b1` |
| Analyst JSON report | `e8455e2947da27039a5f5cbbbd3f7e7e5f253b8713bedce83d1a63b64c4ceda0` |
| Publisher PAR workbook | `53795fb42ef04bf1418aee71fb95d9326e2da35ddd44145bac7af582b7cf1b36` |

## Findings and limit

**PC04-QA-02 (P2):** `pokie import --help` advertises `--format <format>` but
the delegated Stake importer rejects `--format json` as unknown. The successful
recovery is to omit the documented option; the failed invocation left no
destination directory. No source, DOM/state injection, or private API was used.

The CLI artifact criteria pass, including the requested `config.json`
re-export. Rendered Studio stale-project orientation/recovery remains
unverified because the browser driver never reached a rendered page and the
per-invocation public-launch budget was exhausted. This wait expiration is not
recorded as a product defect.
