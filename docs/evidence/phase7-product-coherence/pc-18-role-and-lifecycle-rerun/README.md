# PC-18 independent host verification — finding

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
This evidence commit changes this README only.

## Bounded complete-file verification

The persisted single complete-file command passed on this exact candidate:
11 suites and 59 tests. It covered the listed PC-18 role/lifecycle,
interoperability, parity, Studio-context/product, planner, and managed-outcome
files. This recovery invocation reused that passed criterion and built the
candidate Studio bundle once with `npm run build-cli`.

## Rendered public workflow recovery

This recovery used a newly isolated Studio launch with a fresh registry and
Chromium profile, started only with `node ./dist/cli/pokie.js --no-open`. No
private Studio API was used.

The clean journey created the recommended game, entered the rendered `Play`
workspace, completed a settled round, reached the terminal Simulation report,
then selected rendered `Session Spin` and inspected its recorded round.

The same journey opened `Build/Export`, reached `Generate exact outcome library
(base)`, and visibly accepted `Cancel generation`. The cancellation control
disappeared and the generate action became enabled again, after which the
harness made its one safe retry. The local rendered result was instead:

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

That blocks the Studio-created Outcome Library and its required Stake Engine
handoff. The displayed Stake action listed `generateOutcomeLibrary` as a
prerequisite. The harness' attempted off-viewport Stake click was not counted
as a user action or a product result; the visible Outcome Library failure is
the finding. Destination safety, stale/cross-project behavior, and cleanup
cannot be completed past this failed prerequisite.

Representative transcript checksums (raw transcripts, profiles, projects, and
outputs are deliberately not retained):

```text
b697da0fbb59520d1f82bd88bf6348e8f4d5d7e26c6c5223bcb803015230c7e6  fresh rendered recovery finding
```
