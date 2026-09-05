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
