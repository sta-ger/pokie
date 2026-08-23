# P6V-04 exact-current Producer transcript

- Candidate SHA: `11ff577a23708ee834c513c201581b5db015f98a`.
- Evidence commit parent product source: the current checkout is a docs-only
  descendant of that SHA; `npm run build-cli` rebuilt its executable before the run.
- Fresh run: newly created `POKIE_STUDIO_HOME` registry and Chrome
  `--user-data-dir`; Studio launched from this checkout exactly as
  `node ./dist/cli/pokie.js --no-open`.

## Rendered Producer journey

Created and reopened the managed Blueprint project through Studio's Projects
UI. In Game Model, saved Game basics; added a payline; edited literal reel
strips and duplicated reel 1's first symbol; selected PNG artwork through the
focused native picker; marked A as scatter; added A x3 payout 2; added bet 10
and a bet mode; then configured free games with the rendered preselected
scatter A and award 3x10. Each edited section reached its own saved state.

Opened Play, started a rendered session, and spun a round. Simulation reached
its result state. In Replay, chose the rendered Session Spin, loaded the round,
observed the local Exportable/"Ready to download as JSON" state, and downloaded
JSON (SHA-256 `6794cb6b525209c8b374ff06fe2f8aa117c1b5ab369659604bc29831212c0dc5`).

In Build/Export, the TypeScript package completed, the exact base outcome
library completed, and Stake Engine export reported `Exported 4 file(s)`.
Representative generated-output checksums (outputs intentionally not retained):

- package `dist/index.js`: `60e417532a9312f8bd1816b128d664d3af2cf4ed7a04ac4ffd8b636a53b157a4`
- outcome library `manifest.json`: `017c4197f4526c05b6302cf28028e86d94180fc7a93fec5e8785d8f66c581c32`
- Stake Engine `pokie-manifest.json`: `65df7e41c0173201293bc0e9acc92a9d3fb720baae4dbcdf3ce009a8017365bb`

Finally closed the project and reopened it from the rendered Projects list.
No rendered error, P0, P1, or material P2 was observed.

## Representative screenshots

| File | SHA-256 | Rendered proof |
| --- | --- | --- |
| `screenshots/artwork-and-scatter.png` | `43e9c6373e28d18c4a32cab3d9d7ce2e72d6f04bbcda8261f6a4e5daa1e2d1be` | PNG artwork selected and A marked Scatter. |
| `screenshots/replay-json-ready.png` | `52b88557a19ffee39905989f52cb45d2820b8b80e085c5a90266d39b09e86e07` | Loaded Session Spin reports Exportable and ready for JSON. |
| `screenshots/build-export-complete.png` | `29ed785449ad7406567aa30a07a7bfd4b5f6aa4f7259f4f49f830e35b2dcb6eb` | Stake Engine export reports four generated files. |

Only this transcript and three representative screenshots are retained; no
project/output tree, profile, automation source, or full log is committed.
