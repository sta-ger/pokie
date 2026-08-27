# QA-investigator mission

**Starting goal only:** “Try public validation and import as a new user. When
something is wrong, can I identify the artifact and recover without code?”

**Fresh context:** `/tmp/pc04-qa-investigator-Q9uW/`. The role began with
installed help and made all input through public commands. It did not open
source, tests, prior evidence, or a data-format specification.

| # | Natural action | Observation and recovery | Created or read |
| --- | --- | --- | --- |
| 1 | `pokie create QA Probe --random --seed 91 --out qa.blueprint.json`; `pokie validate qa.blueprint.json --format json` | Both exit 0; valid baseline established. | Created/read: `qa.blueprint.json`. |
| 2 | `pokie build qa.blueprint.json --target outcomeLibrary --sample 20 --seed qa-91 --out qa-outcomes`; `pokie validate qa-outcomes --deep --format json` | Both exit 0; public validation identifies an Outcome Library. | Created/read: `qa-outcomes/`. |
| 3 | Followed `import --help`; `pokie import qa-outcomes --out imported-from-outcomes` | **PC04-QA-01:** exit 1 only says `stakeengine-import-index-missing`; it does not identify the supplied Outcome Library, accepted inputs, or next step. No output written. | Read: `qa-outcomes/`; `imported-from-outcomes/` absent. |
| 4 | `pokie export qa.blueprint.json --to adapter --out qa-stake`; `pokie import qa-stake --out imported-stake` | Both exit 0. The imported Blueprint includes an explicit reconstruction-loss warning. | Created/read: `qa-stake/`, `imported-stake/`. |
| 5 | `pokie import qa-stake --out imported-format --format json` | **PC04-QA-02:** help advertises `--format`, but delegated handler rejects it. Removing that documented option is the only observed recovery. | `imported-format/` absent, then created on retry without `--format`. |

The QA role could find a viable Stake recovery but could not repair an
incompatible Outcome-Library import from product output. Both defects are
retained, not explained with private context.

`SOURCE INSPECTION: not performed before completion.`
