# PC-16 independent Studio sweep

- Candidate: 8c52757cf8610a4e330e2e13d1bb12de1d406d31
- Studio command: `node ./dist/cli/pokie.js --no-open`
- Profiles: two fresh, isolated visible Chromium profiles across the two permitted launches. The first reached artifact detection; the second reached a registered package's Play session.
- Generated inputs: two deterministic `create --random` Blueprints built as TypeScript packages by the candidate CLI; only checksums are retained.
- Console failures: 0; network failures: 0.
- Cleanup: Studio and both Chromium profile processes received SIGTERM; isolated runtime removed.

## Targeted regression command

One serialized, complete-file command passed before the browser work (3 suites, 4 tests):

`npm run test:targeted -- tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/scripts/pc-16-studio-sweep.test.mjs`

## Bounded outcome

The second launch reached the rendered Play session, then the harness precondition compared the pre-spin text with an ASCII dash while the product rendered a different dash. It consequently stopped before emitting the `Spin` click. This is recorded as a selector/driver limitation, not a product finding: no rendered product error, browser-console failure, or network failure was observed. The two-launch cap precludes a corrected rerun, so Simulation, Replay, Build/Export, project-history/deep-link recovery, and screenshots are deliberately not claimed.

## Rendered actions

- success: Projects navigation for pc16-alpha (139 ms) — POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated idea. Your projects No games yet. Start a g
- success: Enter pc16-alpha artifact path (45 ms) — POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated idea. Your projects No games yet. Start a g
- success: Check pc16-alpha generated package (227 ms) — POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated idea. Your projects No games yet. Start a g
- success: Register pc16-alpha generated package (197 ms) — POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit starter, a blank design, or a generated idea. Your projects Search projects Game ty
- success: Open pc16-alpha through Projects (165 ms) — POKIE Studio / Your projects / Pc16 Alpha / Overview Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Start by playing a round Open Play to spin a real round and find a win or free-games feature. Use Game Model t
- success: Play tab opens (144 ms) — POKIE Studio / Your projects / Pc16 Alpha / Play Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Play prepares this game for a real round and creates a session in Studio. Nothing else needs to be set up. Start P
- success: Play session starts (168 ms) — POKIE Studio / Your projects / Pc16 Alpha / Play Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Play Spin Scenarios Scenario searches use real settled spins and leave their final round in this Play session. Fin

## Harness notes

- 2026-09-05T12:31:46.431Z candidate=8c52757cf8610a4e330e2e13d1bb12de1d406d31 built_cli=./dist/cli/pokie.js display=:100
- 2026-09-05T12:31:49.346Z generated artifact name=pc16-alpha blueprint_sha256=c811bc4f4ca67dd1d8e9b0c573326e2a01b48698f524d2bc6bf5ebd34abe0390 package_manifest_sha256=debc9a6404846d3ce738bb13d76dca4328d7105adbc9411756314fcd42622542
- 2026-09-05T12:31:52.247Z generated artifact name=pc16-beta blueprint_sha256=c0e0d57e03b17bc489a84a39ab0ca2f45e13d654eef280a362163bd512e9d423 package_manifest_sha256=8ea3fb097c7c03d3734a0397ba2df1fac5adca1092df1c0b0ef3f84a7328c2c6
- 2026-09-05T12:31:53.752Z studio_launch_command=node ./dist/cli/pokie.js --no-open url=http://127.0.0.1:3200 isolated_runtime=/home/stager/Work/sta-ger/agents/runtime/verifier-tools/pokie-verifier-tools-3s3qx8ly/pokie-pc16-verifier-F8yecz
- 2026-09-05T12:31:54.417Z fresh_visible_chromium_profile=profile-a path=/home/stager/Work/sta-ger/agents/runtime/verifier-tools/pokie-verifier-tools-3s3qx8ly/pokie-pc16-verifier-F8yecz/profiles/profile-a
- 2026-09-05T12:31:54.981Z action=Projects navigation for pc16-alpha status=success latency_ms=139 visible="POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit sta"
- 2026-09-05T12:31:55.028Z action=Enter pc16-alpha artifact path status=success latency_ms=45 visible="POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit sta"
- 2026-09-05T12:31:55.257Z action=Check pc16-alpha generated package status=success latency_ms=227 visible="POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit sta"
- 2026-09-05T12:31:55.455Z action=Register pc16-alpha generated package status=success latency_ms=197 visible="POKIE Studio Start a game Projects Projects Return to a game you already started, or add a game you made elsewhere. Open a game to play, test, and export it. New here? Go to Start a game to begin with a ready-to-edit sta"
- 2026-09-05T12:31:55.623Z action=Open pc16-alpha through Projects status=success latency_ms=165 visible="POKIE Studio / Your projects / Pc16 Alpha / Overview Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Start by playing a round Open "
- 2026-09-05T12:31:55.768Z action=Play tab opens status=success latency_ms=144 visible="POKIE Studio / Your projects / Pc16 Alpha / Play Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Play prepares this game for a real"
- 2026-09-05T12:31:55.939Z action=Play session starts status=success latency_ms=168 visible="POKIE Studio / Your projects / Pc16 Alpha / Play Overview Game Model Play Simulation Replay Build/Export Provably Fair Pc16 Alpha pc16-alpha · v0.1.0 Show project location Close project Play Spin Scenarios Scenario searc"
