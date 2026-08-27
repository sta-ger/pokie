# PC-04 independent exact-candidate role missions — 2026-08-27

Candidate: `e01cd5d0859492106605282a2b4505641a9abbd6`.

## Independence boundary

Before reading source or this superseded evidence, the verifier ran the public
candidate command `node ./dist/cli/pokie.js --help`, then queried only public
subcommand help and performed the observations below. The six role contexts
were newly created below `/tmp/pokie-pc04-fresh.dTSfyf`; Studio used two newly
created Chromium profiles, and its only rendered verification launch used
`node ./dist/cli/pokie.js --no-open`. Generated projects, profiles, and full
logs were discarded. The checksums below identify real artifacts without
retaining them.

## Frozen six-role transcript

| Role / natural goal | Public actions; created or read artifacts | Result / obstacle |
| --- | --- | --- |
| Math designer — PAR to editable model | In `designer`, created `northstar.blueprint.json` with `create --random --seed 7301`, inspected it, and exported `northstar.par.xlsx`. | Both source and real PAR workbook were created; inspect offered PAR, package, Outcome, and Stake next actions. |
| Game developer — editable runnable package | In `par-analyst`, imported that workbook with `par import --format json`, inspected the resulting Blueprint, then built and inspected `editable-package`. | A real imported editable Blueprint and TypeScript package were created; no obstacle. |
| Frontend developer — browser-facing handoff | In a separate fresh Studio profile, opened the rendered Studio home route and read its valid starter design, `Create game`, and advanced file/JSON controls. | The rendered handoff screen loaded from the exact candidate; no source or private product API was used. |
| QA investigator — runtime/report recovery signal | In `runtime-analyst`, validated the real package, simulated 400 seeded rounds, and rendered Markdown and JSON reports. | Package validation was valid; simulation/report files were created. The report appropriately warned that 400 rounds is a noisy estimate. |
| Integration developer — Outcome/Stake deployment | In `outcome-deployer`, built a bounded Outcome Library from the package, inspected it, and passed `validate --deep`; in its fresh Stake work area, built and inspected a Stake export. | Real Outcome and Stake artifacts were created and deep validation passed for the Outcome Library. |
| Developer opening another project — orientation, stale path, recovery | In a second fresh Studio profile, used visible controls to check and add the actual package path, read its project card, then temporarily moved that package. `Open` rendered “The game could not be found.” After restoring the real directory, the visible Remove → Confirm → Check game → Add to projects → Open recovery led to the Northstar workspace. | Rendered Studio showed project type/location/orientation and a stale-path error, then recovered to Overview, Game Model, Play, Simulation, Replay, Build/Export, and Provably Fair. [Recovered workspace screenshot](studio-recovered-workspace.png). |

## Artifact journeys and compact ledger

1. **PAR → editable model → runtime → simulation/report:** real Blueprint →
   PAR XLSX → imported Blueprint → TypeScript package → valid package → 400-round
   seeded simulation → Markdown/JSON report. This completed.
2. **Outcome/Stake deployment and reuse:** real package → Outcome Library
   (inspectable and deep-valid) → Stake export. The required generic reuse step
   did not complete: `pokie import <stake-export> --format json --out imported`
   rendered `Unknown option "--format"`; no `imported` directory or `config.json`
   existed, so a re-export through `config.json` was impossible.

| Retained identity | SHA-256 |
| --- | --- |
| PAR workbook | `412fa21d4d3168e8dbba1bb970d5d5a8cdce8a14c0c31992f61e974b533ee07c` |
| Imported editable Blueprint | `354230a97634623b290c1feec1caa3a852e05951ab92bacf8564a686ced828a3` |
| Seeded simulation JSON | `9f107fa12774b7511c21946428326853f0717952a82978ab9813eaaa3dd16ea6` |
| Outcome manifest | `196ffa4e7f4e2cb1cfd0f94dc46c4bc98b897563b0bf53bb8839029cfebf54ba` |
| Stake manifest | `6bb1ed5d7140a517d30163c049c2aa2b35cb5f6d66c18bd91d264d9332726668` |
| Recovered Studio screenshot | `41cd7c4ee731f2b068bcd2074f0f222b848ef926ec40a3ad50d1b90f18480dc9` |

## Finding

**PC04-QA-02 (P2):** `pokie import --help` publicly advertises `--format`, but
the generic Stake import delegates to a command that rejects `--format json`.
This blocks the requested inspect → deep-validate → `config.json` re-export
reuse journey. The failed command wrote no output directory; no retry omitted
the documented option because that would not verify the required interface.

The retained payload is this transcript and one 73 KiB rendered screenshot;
no generated project, raw log, profile, automation script, or build output is
retained.
