# V2C-14 independent public-workflow receipt

Candidate product identity: `dbff168105b2c99d37cc71bd3f3911e9fca99bfe`.
This evidence commit is documentation-only; it does not change executable
candidate sources. Collection used the candidate-built Studio command
`node ./dist/cli/pokie.js --no-open` in a fresh isolated application and
browser profile. The candidate build receipt reports `npm run build-cli`, exit
0, output hash `7df6eb341b20adda4e4bd3524c056f78f2ee083744b3e57676b0d5893af9a32f`.

## Retained public observations

The immutable interactive transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-14-66686c77a6f60567/run-2026-10-15T12-52-19-659Z/transcript.json`.
It records the candidate-bound fixture paths, isolated configuration/documents
paths, browser observations, and Studio lifecycle receipts.

- Studio loaded `bounded-cascade.blueprint.json`, rendered its JSON rule
  `mechanics.cascade.maxCascades: 10`, retained a deliberately malformed
  draft, and rendered `blueprint-mechanics-invalid` for `"bad"` with the
  integer range `[1, 100]`. Reload restored the valid JSON; explicit **Save
  game** opened the saved `bounded-cascade` workspace.
- Studio's TypeScript Game Package builder created the new empty destination
  `.../Documents/tsPackage`, reporting lifecycle job
  `b2d46c2eaa7046f28f56d996bcb50f54` as completed. The built package was then
  opened through its displayed **Open as Project** control and rendered as a
  read-only playable game.
- Artifact file hashes: `package.json`
  `75157c1de0920d17504e696134f08cfa2634d024ea5c04c7b2e54f3c5e71f01c`,
  `dist/index.js`
  `ec50371801e87b26a3a81212a1a5a4741780c3573493b2196644dbc70d7a7ce6`.
  CLI loader commands, both exit 0, were
  `node ./dist/cli/pokie.js sim <tsPackage> --rounds 12 --workers 1 --seed v2c14-cascade --format json`
  and `node ./dist/cli/pokie.js replay <tsPackage> --round 12 --seed v2c14-cascade --format json`.
  Simulation reported 12 completed logical rounds, 12 accepted subrounds,
  no carried/excluded subrounds, total stake `0.6`, total win `0`, and config
  hash `sha256:9c40e9e6b2d06f68bafdd4f5cd51c31deee6e50932d5dcf30f5da30447b628fd`.

The retained screenshots (not committed) are in that same run directory:
`1-observation.png` `a63e391b289b3d9de87a7f613e16ed00ae162dfbd7f75fa78626c053664ab8d2`,
`2-observation.png` `587f76ef38588965b76a072dc24a9f127d5fdb5392dcd4e2a520e7e4ca17744d`,
`3-observation.png` `72b85104d5b8048ad7d1f351f317ff8495193b63f75b8d2ef2504fef9ba43c8d`,
and `4-observation.png` `dc6a50a7216d7f8a1a3fccca153c6b78aa1c4191173eaa51c163e838ca25abed`.
Independent visual inspection found the validation error and completed build
surfaces legible; this is only a partial visual review because no Play or
report surface was collected.

## Incomplete matrix and driver boundary

The retained driver subsequently rejected each unique rendered `Play`, `Open
Play`, `Close project`, and breadcrumb action with `No unique enabled rendered
hit target; inspect again`, despite the immediately preceding transcript
observations containing exactly one enabled public control and its bounds. No
browser action was emitted after those errors. Consequently no action-local
result exists for cascade delivery, respin continuation, collection
threshold/reset, Studio simulation/report downloads, or Recent Simulation
replay. This is recorded as a driver-inconclusive collection boundary, not a
product finding and not a substitute for those observations.
