# Host-side rerun — `ff49df902217414cd0dc0d7262b284afe736a92e`

2026-09-05 UTC. The verifier confirmed `HEAD` was the requested candidate and
ran the reviewer-specified eleven whole test files once in one sequential
`npm run test:targeted -- <all files>` process. The execution wrapper detached
the process output before its final status could be retained; it subsequently
exited, so this run is not claimed as an independently observed green result.

`npm run build-cli` was then run once. Studio launch one and the repaired
launch-two retry used exactly `node ./dist/cli/pokie.js --no-open`, each with a
new Chromium profile and isolated POKIE home. Both rendered the public Studio
start screen. On launch two, the visible **Create game** control was activated
once; Studio then rendered `Valid — no issues found` for the starter Blueprint
and disabled the control while the page still showed `Design Your Game`.

The harness's semantic workspace predicate was incorrectly satisfied by the
start-page copy, so it shut down before observing a workspace transition or a
rendered product error. This is a verifier driver/readiness limitation, not a
product finding. No further launch was permitted. The runtime screenshot is
not retained; its SHA-256 was
`b6de1a5b07ddde92e9758bea9ea4b90f52392bd6af83e3dbfb8c147fdf7897cb`.

## Focused recovery attempt 2026-09-05 UTC

This descendant remains bound to candidate
`ff49df902217414cd0dc0d7262b284afe736a92e`. The exact required eleven-file
`npm run test:targeted -- …` command was started once as one sequential
process. The execution wrapper detached its terminal stream after the command
had exited, so no green result is claimed for that run. One candidate build was
also run before any Studio launch.

The repaired persistent harness used the ordered rendered checklist for all
six roles and the lifecycle branches. Launch one created a clean managed
Starter Slot through visible **Create game**, then completed the visible Player
`New Play session → Spin` round and a visible 10,000-round Analyst report.
Its old report predicate did not recognize the already-rendered local
`Open full report` control; the harness was repaired in place before launch
two.

Launch two, with a new registry, Documents root, and Chromium profile, again
created the clean managed project and rendered the Reviewer disclosure:
`Best-effort reproducibility: replay plays a fresh session forward…`.
Build/Export then rendered the exact Outcome Library preflight and the enabled
visible `Generate exact outcome library (base)` control. The harness's click
helper rejected that off-viewport control before scrolling it into view. It
therefore did not emit a generation request, cancellation, retry, or mutation.
This is **inconclusive: selector**, not a rendered product failure. The two
launches allowed for this invocation were exhausted before Publisher recovery,
Author, Stake, output-to-input/repeat/reverse, stale/cross-project,
project-switch, cleanup, and late-destination variants could be exercised.

Only the bounded result summaries lived in the controller-owned harness
(SHA-256: `eef49e9ccd848d6040966a1dc411183458e12680a37374e5e0ac6366cfe4033a`
for launch one and
`df7f4b50fa5a8f8e89a31aca3e9c71d69f30375404010f76a91579e57b893539`
for launch two); no generated projects, profiles, raw logs, screenshots, or
automation files are retained in this evidence directory.
