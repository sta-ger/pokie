# PC-04 independent role missions — 2026-08-28

Candidate product source: `e5e2b31ec5d200b8ad4ae620f115357e3d454fcc`.
The checkout differs from that commit only in this retained evidence directory.

## Clean-room boundary

Six role contexts were newly created beneath one fresh `/tmp/pokie-pc04-cleanroom-*`
parent. The public CLI help and candidate CLI were the only product interfaces read
while each role acted. Each role's output and artifact hashes were frozen before
this prior PC-04 evidence or product source was read. Generated trees, raw logs,
profiles, and the harness remain outside this evidence directory.

## Frozen role transcripts

| Role — natural goal | Public actions | Created/read artifacts | Observed obstacle |
| --- | --- | --- | --- |
| 1. Blueprint author — make a valid game design | `create --random --seed 4101`; `inspect`; `validate --format json` | `blueprint.json`, identified as a Blueprint; validation `valid: true` | None. |
| 2. PAR analyst — exchange a design through a spreadsheet and recover an editable model | `create --random --seed 4102`; `par export`; `par import`; `validate --format json` | `source.par.xlsx` and `editable-model.json`; imported model identified as a valid Blueprint | None. |
| 3. Runtime operator — run and measure a playable package | `create --random --seed 4103`; `build --target tsPackage`; `inspect`; `sim --rounds 120 --seed pc04-role3 --format json`; `report --format markdown` | runtime package, `simulation.json`, and `simulation.md` | Simulation correctly warned that 120 rounds is statistically noisy. |
| 4. Outcome librarian — prepare and check deployable outcomes | `create --random --seed 4104`; `build --target outcomeLibrary`; `inspect`; `validate --deep --format json` | Outcome Library (`manifest.json`, index and outcomes); deep validation `valid: true` | None. |
| 5. Deployment engineer — publish both Outcome and Stake forms | `create --random --seed 4105`; `build --target outcomeLibrary`; `build --target stakeAdapter`; `inspect` | Outcome Library plus Stake deployment containing `pokie-manifest.json`, index, lookup and books | None. |
| 6. Integration consumer — reuse a generic Stake export | `create --random --seed 4106`; `build --target stakeAdapter`; `import --format json`; `inspect`; `validate --deep --format json`; `export imported-outcomes/config.json --to adapter` | generic Stake export; imported Outcome Library with generated `config.json`; re-exported Stake manifest | One expected informational import notice: a Stake export cannot retain all original library fields, so its reconstructed library hash differs. Deep validation still returned `valid: true`. |

The new missions independently exercised each required file type. The previously
candidate-bound, continuous PAR → editable Blueprint → runtime package → seeded
simulation/report journey was also retained and checked today: workbook
`b09a2a4d29bee02a74c2d31e58190fb97fe2067614b3428591b3062a54b8d911`,
imported Blueprint
`d9b6dafa68fbf6c1f4e6654dae1e3306c2dc15e1df36eab395231656e6f56fc3`,
and simulation JSON
`0f75f1d4f9d01dcbe00ee345b15f2e57c686d29e632e78fb120099a42994fd34`.
Outcome Library → Stake deployment and generic Stake → Outcome import →
`config.json` re-export completed in fresh roles 5–6. Independent files are
represented only by checksums; no generated product trees are retained.

| Artifact | SHA-256 |
| --- | --- |
| PAR workbook | `653c824f3df74ecd2c13fb630176c1b71fb6ddeec05cb03a974b379724409516` |
| Editable PAR-imported Blueprint | `b392ad36f6c35024067ea02da5e696479158730661428067566d5c03d8f277d0` |
| Runtime package manifest | `61cc9c06816a0cca37548a8157ea62be82eef6f80ee669e7e50b89e6a3742468` |
| Simulation JSON | `185ce0eaab08533a6f0e68ecaaa5d5201931a0d9acd4f75590d9e96182814d61` |
| Rendered simulation report | `54ec664901d13dcfb3a86f29ac9c72e6a8f6b25bdf593a1f49241f12395c4921` |
| Outcome deployment manifest | `4a6e57e235eb6b338b4ee061890b2490f1089727520d42936ff467a00b4f4acb` |
| Stake deployment manifest | `57d5d0b293b5a9dcec91d1d32fea5083d6e178985a36a6728cb9fd60d88b1def` |
| Imported `config.json` | `7a712b766eeedb68cb4f948147859861b633b172e665ad4b3db8fdc9b6ee0ec6` |
| Re-exported Stake manifest | `5837956a0e0533e309757294dd3be67ad9a6aad636102e734bfb9bedb4a5fcc2` |

## Rendered Studio verification

The retained exact-candidate Studio run was checked for file presence, SHA-256
values, and rendered content. It started from this source checkout with
`node ./dist/cli/pokie.js --no-open` in a fresh Chromium profile. It shows the
project as `Playable game`, its location and `Added from your computer`; after
the runtime directory was moved, the rendered Open action showed the specific
stale-path error ([screenshot](studio-stale-path.png)). After restoring the
directory, the recovered Overview rendered `Valid — no issues found`, the
location, and the Game Model, Play, Simulation, Replay, Build/Export, and
Provably Fair routes ([screenshot](studio-recovered-project.png)).

| Retained Studio proof | SHA-256 |
| --- | --- |
| Stale path | `c7e471bd8e7f9f8e2a7976b2cf6e1d9cd48ce82e55fda08ec53bb8e23b88445c` |
| Recovered project | `e22fa03023df07aa02378fd5f3686d5d3300fdfa0180f914cfcd3de628b3da3d` |

Only this concise transcript and two representative screenshots (under 100 KiB
each) are retained.
