# P5PA-04 independent host browser rerun

Candidate commit: `84dc6653cebcc6c3c590fcdc373863852f4ab0cc`.

Result: **passed**.  A fresh local Studio was rebuilt from the candidate with Node 24 and served a newly built, deep-validated two-mode Outcome Library fixture.  A fresh Chrome profile then used rendered Studio controls only: selected `buyFeature` in Play, created a session, spun round 1, opened Replay → Session Spin, and selected that recorded round.  The rendered Loaded replay card visibly states `mode buyFeature` in **Identities**.

Evidence:

- `17-candidate-rebuild-node24-terminal.log` — source build and Vite bundle build.
- `18-real-multimode-fixture-terminal.log` — real two-mode fixture creation and deep validation.
- `19-final-fresh-studio-server-terminal.log` and `20-final-fresh-chrome-terminal.log` — fresh local server/client startup.
- `21-final-session-spin-browser-driver-terminal.log` and `06-session-spin-browser-action-transcript.txt` — complete visible mouse/keyboard action transcript.
- `06-play-buyfeature-recorded-round.png` and matching visible text — Play round after `buyFeature` selection.
- `07-replay-session-spin-mode-buyfeature-provenance.png` and matching visible text — recorded Session Spin displaying `mode buyFeature`.

`session-spin-provenance-rerun.mjs` is the audit driver. It reads only rendered controls/text, sends mouse/keyboard CDP input at visible coordinates, and captures the browser surface; it does not call Studio APIs or mutate the DOM/application state.
