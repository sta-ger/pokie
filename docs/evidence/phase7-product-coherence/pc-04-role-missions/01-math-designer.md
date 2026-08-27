# Math-designer mission

**Starting goal only:** “I have a PAR workbook. Make it an editable game model,
get a runnable version, and give me a simulation report.”

**Fresh context:** `/tmp/pc04-math-designer-7Xn9/`; only installed CLI help was
used. No source, tests, prior evidence, or implementation documentation was
opened before the terminal marker below.

| # | Natural public action | Observation and obstacle | Created or read |
| --- | --- | --- | --- |
| 1 | Read `pokie --help`, `pokie par --help`, and `pokie par import --help`. | `par import` was the discoverable workbook-to-Blueprint route. | Read: installed help streams. |
| 2 | `pokie par import supplied-math.par.xlsx --out math-model.blueprint.json --format json` | Exit 0; output identified an editable Blueprint and preserved game provenance. | Read: real `supplied-math.par.xlsx` (10,844 bytes). Created: `math-model.blueprint.json`. |
| 3 | `pokie validate math-model.blueprint.json --format json` | Exit 0, valid Blueprint; this confirmed the editable handoff. | Read: `math-model.blueprint.json`. |
| 4 | Read `build --help`; `pokie build math-model.blueprint.json --target tsPackage --out runtime-package` | Exit 0; a runnable package was generated without a compiler/template detour. | Read: Blueprint. Created: `runtime-package/`, including `package.json` and `pokie.entry`. |
| 5 | `pokie validate runtime-package --format json`; `pokie inspect runtime-package` | Both exit 0; inspection linked package provenance to the model. | Read: `runtime-package/`. |
| 6 | `pokie sim runtime-package --rounds 120 --seed math-par-01 --format json --out simulation.json`; `pokie report simulation.json --format markdown --out simulation.md` | Both exit 0. Report includes rounds, RTP, hit frequency, max win, seed, warning, and recommendation. | Created: `simulation.json`, `simulation.md`; read: package/report input. |

## Artifact ledger

| Artifact | Product producer | Purpose |
| --- | --- | --- |
| `supplied-math.par.xlsx` | supplied real PAR workbook | math input |
| `math-model.blueprint.json` | `par import` | editable model |
| `runtime-package/` | `build --target tsPackage` | runtime |
| `simulation.json`, `simulation.md` | `sim`, `report` | simulation/report |

The PAR → editable model → runtime → simulation/report journey is public and
file-backed. `par import` does not itself call the output an “editable model”;
the role confirmed that naturally with `validate` and `build`.

`SOURCE INSPECTION: not performed before completion.`
