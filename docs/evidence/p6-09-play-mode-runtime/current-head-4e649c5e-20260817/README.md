# P6-09 independent browser rerun — passed

Candidate: `4e649c5e153760ee30b2a8f9984e5a11ed3acefc`.

This is a fresh build and local Studio/client run against the candidate's
verification-only `mode-semantics-game` package. Chrome used a fresh profile
at a 1440×1800 viewport. `browser-ui-rerun.mjs` used CDP only to navigate,
read rendered controls/text, send coordinate mouse input, and capture the
rendered page; it made no Studio API calls and did not inject DOM or state.

| Visible workflow | Rendered completed artifact | Result |
| --- | --- | --- |
| Base spin | `base`, stake `1.00` | Pass (`11-play-base-spin-*`) |
| Ante spin | `ante`, stake `1.25` | Pass (`12-play-ante-spin-*`) |
| Buy feature | `buyFeature`, stake `50.00`; selector reset to `base` | Pass (`13-play-buyfeature-provenance-and-reset-*`) |
| Following normal spin | `base`, stake `1.00` | Pass (`14-play-post-buy-normal-spin-*`) |
| Replay → Session Spin → completed buy round | `buyFeature`, stake `50.00` | Pass (`15-replay-session-spin-buyfeature-provenance-*`) |

`10-browser-workflow-success-terminal.log` and `browser-transcript.txt`
record the browser-only actions and assertions. `verification-results.json`
has an empty findings list. `01-build-current-head-terminal.log`,
`06-studio-fresh-terminal.log`, `07-chrome-fresh-terminal.log`, and
`08-chrome-fresh-version.json` preserve local host/build/browser evidence.
