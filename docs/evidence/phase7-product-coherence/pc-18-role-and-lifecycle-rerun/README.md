# PC-18 independent host verification — recovery inconclusive

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
This evidence commit changes this README only.

## Bounded complete-file verification

The persisted single complete-file command passed on this exact candidate:
11 suites and 59 tests. It covered the listed PC-18 role/lifecycle,
interoperability, parity, Studio-context/product, planner, and managed-outcome
files. This recovery invocation reused that passed criterion and built the
candidate Studio bundle once with `npm run build-cli`.

## Rendered public workflow recovery

Four newly isolated Studio launches used only
`node ./dist/cli/pokie.js --no-open`, each with a fresh registry and Chromium
profile. No private Studio API was used.

The repaired journey created the recommended game, entered the rendered `Play`
workspace, completed a no-win round, and reached the terminal Simulation
report. It then selected the rendered native `Session Spin` option, loaded the
recorded round, and showed truthful provenance: `Recorded -- Play tab spin`,
config hash, completeness, inspectability, and the appropriate unavailable
reproduction/comparison states for a live spin.

The same journey opened `Build/Export`, reached `Generate exact outcome library
(base)`, and visibly accepted `Cancel generation`. The cancellation control
disappeared and the generate action became enabled again, after which the
harness made its one safe retry. The retry did not yield a rendered product
error. Its local-result observer selected a heading-only element and therefore
did not recognize the later terminal state before its bounded wait elapsed;
Stake handoff, destination safety, and stale/cross-project cleanup remain
unreached. This is a driver/readiness limitation, not a product finding.

Representative transcript checksums (raw transcripts, profiles, projects, and
outputs are deliberately not retained):

```text
0f8f826d84fa066184cdce42c981d29c722dba4d7ce300607f1e98153fca4804  final recovery journey
8ed14c1da8b67f35ca1a7590abb963d82d3c1078d18ca80976e7506d715779b6  cancellation-control journey
```
