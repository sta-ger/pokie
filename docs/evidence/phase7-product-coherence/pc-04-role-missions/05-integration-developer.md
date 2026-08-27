# Integration-developer mission

**Starting goal only:** “Turn our game into an Outcome artifact and a Stake
artifact, deploy one locally, and prove the exported artifact can be reused.”

**Fresh context:** `/tmp/pc04-integration-developer-R6eB/`, with only valid
real `integration.blueprint.json`. The role started at public root/build/export/
import/serve help and received no implementation knowledge.

| # | Natural action | Observation | Created or read |
| --- | --- | --- | --- |
| 1 | `pokie build integration.blueprint.json --target outcomeLibrary --sample 20 --seed integration-05 --out outcome-library`; `pokie validate outcome-library --deep --format json` | Both exit 0; finite sampling provenance and base mode were visible. | Read: Blueprint. Created/read: `outcome-library/`. |
| 2 | `pokie sample outcome-library --mode base --seed reuse-sample`; `pokie sim outcome-library --mode base --rounds 20 --seed reuse-sim --out outcome-simulation.json`; `pokie report outcome-library --format json --out outcome-report.json` | All exit 0; each downstream command consumed the real library. | Created: simulation/report files. Read: library. |
| 3 | `pokie export integration.blueprint.json --to adapter --out stake-export`; `pokie import stake-export --out reused-library` | Both exit 0. Import explicitly warns that the reconstructed library is lossy, avoiding false byte-equivalence. | Created/read: `stake-export/`, `reused-library/`. |
| 4 | `pokie validate reused-library --deep --format json`; `pokie replay reused-library --mode base --seed reuse-sim --round 1 --out reused-replay.json` | Both exit 0; reused artifact remains publicly valid and replayable. | Created: replay. Read: reused library. |
| 5 | `pokie serve outcome-library --mode base --port 0` | Product announced a local outcome-source URL; `GET /game` returned 200, then intentional termination was clean. | Read: library. Created: ephemeral deployment endpoint. |

| Persistent artifact | Producer | Reused by |
| --- | --- | --- |
| `outcome-library/` | `build --target outcomeLibrary` | validate, sample, sim, report, serve |
| `stake-export/` | `export --to adapter` | `import` |
| `reused-library/` | `import stake-export` | validate, replay |
| report/simulation/replay JSON | downstream public commands | integration result review |

Outcome → Stake → deployment → reuse is thus exercised using real files at
every persistent boundary.

`SOURCE INSPECTION: not performed before completion.`
