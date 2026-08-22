# P6V-03 independent host rerun — readiness inconclusive

Candidate checked: `a87e90d8ced5febdccd6979915c9b35a66795f7d`.

`npm run build-cli` completed for that checkout. One fresh HOME/XDG Studio
registry and one fresh visible Chrome profile then launched Studio from this
source checkout only as `node ./dist/cli/pokie.js --no-open`.

Through rendered controls, the verifier set the Recommended model's name to
`P6V03 Recommended`, received `Valid — no issues found.`, clicked `Create
Project`, and observed its Workspace with `Overview` and `Close project`.
The one subsequent rendered `Close project` action produced neither an
observable Home/Workspace transition nor a rendered Studio error before the
bounded semantic wait expired. No duplicate action was emitted. This is a
driver/readiness boundary, not a product finding; Blank, Random, Valera
modelling, and persistence portions were consequently not reached.

No screenshot, generated project/output tree, Chrome profile, registry, raw
log, PID file, or automation source is retained.
