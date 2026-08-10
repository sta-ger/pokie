# P5PA-04 real Studio browser rerun

Result: **finding** — the candidate correctly exposes and executes the `buyFeature` (non-first) mode through Overview/Exact Analysis, Play, Simulation, and direct Replay. However, a recorded Play round opened through Replay → Session Spin does not visibly render its selected outcome-library mode, so a Studio user cannot verify recorded round provenance from the public UI.

## Environment and method

- Candidate: `4ca65b5be8ce5e1a612f2ffd5dde0945745d2a85`.
- `01-build-terminal.log` records the candidate rebuild/typechecks. The installed Vite requires Node 24, so the final Vite build uses the host's already-installed Node 24 binary; the TypeScript/CLI build used the candidate's normal local tooling.
- `build-real-multimode-bundle.mjs` created a real two-mode native Outcome Library (`base` and `buyFeature`) through the candidate's compiled `OutcomeLibraryBundleWriter`; `02-fixture-build-terminal.log` records its successful deep CLI validation.
- `03-studio-server-terminal.log` records a fresh `pokie studio` process using that fixture. `04-chrome-terminal.log` records fresh local Chrome with remote debugging enabled.
- `browser-ui-rerun.mjs` drove only rendered Studio controls through visible mouse/keyboard CDP events. It makes no Studio API requests and neither inserts DOM content nor mutates application state.

## Browser evidence

`ACTION-TRANSCRIPT.txt` and `05-browser-driver-terminal.log` capture the complete action sequence. Each PNG has a matching `-visible-text.txt` browser transcript.

1. `02-overview-exact-analysis-buyfeature.png`: rendered Overview lists both real modes and Draw an outcome on `buyFeature` visibly reports library `buy-browser-lib`.
2. `03-play-buyfeature-round-provenance.png`: the real Play mode control was selected to `buyFeature`, then New session and Spin executed a round.
3. `04-simulation-buyfeature-completed.png`: after the same visible non-first selection, the 20-round Simulation completed.
4. `05-replay-buyfeature-completed.png`: a direct Replay from seed visibly reports `outcome library mode "buyFeature"` in both its loaded target and completed job result.
5. `06-replay-session-spin-recorded-mode-provenance.png`: the actual recorded Play round is selected from Session Spin. Its inspector identifies the source as `Recorded -- Play tab outcome-library draw`, but contains no `Outcome library mode` / `buyFeature` row.
6. `07-build-export-visible.png`: Build/Export is reachable and rendered for the same Outcome Library.

## Root cause

`ReplayTab.tsx` renders `RoundArtifactInspector` when `selectedSpin.debug?.artifact` exists. The row for `selectedSpin.studioModeName` is only in that conditional branch's artifact-unavailable fallback. Real outcome-library Play rounds have complete artifacts, so their persisted `studioModeName` is not displayed in the successful Session Spin inspector.
