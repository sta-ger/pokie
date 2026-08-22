# P6V-03 — bounded independent browser rerun

Candidate: `0777df5e48f320e899ee988f70b8dba0c2577f9c`
Run: 2026-08-22; fresh XDG-backed Studio registry and Chrome profile; candidate Studio launched with `node ./dist/cli/pokie.js --no-open`.

## Rendered record

The fresh Design Game screen rendered the three creation choices **Recommended**, **Blank**, and **Random**. Recommended rendered a valid 5×3 / three-payline model with literal reel strips, normal symbols, paytable and bets. Layout, Symbols, Reels, Paytable, and Bets were individually opened through the visible accordion controls.

The verifier added visible `W` and `S` symbols and selected their Wild and Scatter controls. Studio then correctly rendered its validation that these referenced symbols were absent from literal strips. On the visible Reel Strip Modeler, replacing the first two displayed strip values with `W` and `S` caused every rendered strip list to become empty. Studio rendered eleven errors: five non-empty-strip errors and six missing-symbol errors. The action was not retried because the model was already pending/invalid and the operation changes persisted modelling data.

Consequently Create Project, save/close/reopen, Play/feature, Simulation, Replay, Outcome Library, and Stake Engine were not reachable on a valid Valera model. No product files, test files, generated output, browser profile, or automation script are retained here. This file supersedes all prior P6V-03 recovery and duplicate reports.

## Scope result

This is a finding record, not a passing workflow record: a normal rendered literal-strip edit destructively clears the complete strip model and blocks the required journey.
