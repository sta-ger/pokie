# PC-04 candidate role-mission transcript — 2026-08-28

Candidate checked: `e5e2b31ec5d200b8ad4ae620f115357e3d454fcc`.

## Independence limitation

The first five CLI-role observations were made in fresh `/tmp` work areas
before manual product-source or PC-04-evidence review. However, the previous
PC-04 transcript and Studio client source were then consulted to repair the
rendered Studio route before the Studio observation. This retained transcript
therefore records the real candidate behavior, but is **not sufficient to
claim the requested all-six-role clean-room independence boundary**.

## Frozen role observations

| Role / natural goal | Public actions and real artifacts | Observation / obstacle |
| --- | --- | --- |
| 1. Math designer — create a portable design | Fresh `designer`: `create --random --seed 2404`; read the generated Blueprint with `inspect`. | Created `blueprint.json`; it advertised package, Outcome, Stake and PAR handoffs. |
| 2. PAR specialist — move design through a workbook | Fresh `par-specialist`: `par export blueprint.json`. | Created the real `design.par.xlsx`; no obstacle. |
| 3. Model editor — recover an editable model | Fresh `model-editor`: `par import design.par.xlsx --format json`; read the result with `inspect`. | Created an editable `editable-blueprint.json`; the non-interactive terminal could not complete the optional wizard `edit` confirmation, but the imported Game Blueprint was recognized as editable source. |
| 4. Runtime operator — create and verify runnable code | Fresh `runtime-operator`: `build editable-blueprint.json --target tsPackage`; `validate --format json`. | Created a real TypeScript game package; validation was `valid: true`. |
| 5. Simulation analyst — quantify and report real execution | Fresh `simulation-analyst`: `sim game --rounds 200 --seed pc04-rerun --workers 1 --format json`; `report simulation.json --format markdown`. | Created JSON and Markdown reports: 200 rounds, 25.50% sampled RTP, 11.00% hit frequency. The report correctly warned that 200 rounds is noisy. |
| 6. Deployment/reuse integrator — deploy Outcome and Stake data | Fresh `deployment-engineer` and its handoff `integration-consumer`: build Outcome Library; build Stake export; `import stake-export --format json`; `inspect`; `validate --deep --format json`; `export imported-outcomes/config.json --to adapter`. | Outcome/Stake artifacts were real; generic import returned JSON, deep validation returned `valid: true`, and generated `config.json` re-exported a recognized Stake export. Import reported one expected informational hash difference because Stake does not retain every original library field. |

## Rendered Studio observation

The candidate was built, then one fresh Studio process was started from this
checkout with exactly `node ./dist/cli/pokie.js --no-open`. In a fresh Chromium
profile, the visible Projects page checked and added the real runtime package.
It rendered its project type (`Playable game`), location, and `Added from your
computer` orientation. Moving that directory and selecting the rendered Open
button displayed `The game could not be found. Check the path and try again.`
([screenshot](studio-stale-path.png)). Restoring the exact directory and
selecting Open rendered the `PC04 PAR Journey` Overview with its location,
valid status, and Game Model, Play, Simulation, Replay, Build/Export, and
Provably Fair navigation ([screenshot](studio-recovered-project.png)).

## Compact identity ledger

| Artifact | SHA-256 |
| --- | --- |
| PAR workbook | `b09a2a4d29bee02a74c2d31e58190fb97fe2067614b3428591b3062a54b8d911` |
| Imported Blueprint | `d9b6dafa68fbf6c1f4e6654dae1e3306c2dc15e1df36eab395231656e6f56fc3` |
| Seeded simulation JSON | `0f75f1d4f9d01dcbe00ee345b15f2e57c686d29e632e78fb120099a42994fd34` |
| Outcome manifest | `07346e639414def3884c3eb1755b152e4a695c7166418ee037062711f26b1cab` |
| Imported `config.json` | `7a712b766eeedb68cb4f948147859861b633b172e665ad4b3db8fdc9b6ee0ec6` |
| Re-exported Stake manifest | `66ac0b0a002672e36b56a2554bda2fcb5638a33f9575afffed83bf38fd6eb8fb` |
| Stale-path screenshot | `c7e471bd8e7f9f8e2a7976b2cf6e1d9cd48ce82e55fda08ec53bb8e23b88445c` |
| Recovered-project screenshot | `e22fa03023df07aa02378fd5f3686d5d3300fdfa0180f914cfcd3de628b3da3d` |

Only this transcript and two 80–92 KiB screenshots are retained. Generated
projects, reports, profiles, raw logs, and the harness were discarded or left
outside the committed evidence tree.
