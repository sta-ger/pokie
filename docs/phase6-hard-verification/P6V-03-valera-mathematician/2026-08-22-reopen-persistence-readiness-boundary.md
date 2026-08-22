# P6V-03 reopen persistence — readiness boundary

Candidate `b59ee5a4aea0f271fff7c14c23f292f52fce160e` remains an
ancestor of this evidence-only checkout; the candidate-to-HEAD diff contains
only retained evidence files. The requested retained files remain present and
their recorded SHA-256 values still match.

The persisted harness was repaired in place and used for four isolated headed
Studio launches. Each created new HOME/XDG registry and Chrome profile and
launched this checkout only as `node ./dist/cli/pokie.js --no-open`.

1. The rendered `Show advanced options` action did not expose a JSON control.
2. Its one safe rendered retry exposed `Hide advanced options` and the native
   Form/JSON controls; the former prefix locator had targeted the hidden radio.
3. The repaired associated visible JSON label still produced no JSON editor.
4. The harness then proved that the rendered JSON radio became checked after
   its idempotent action, but the local `Blueprint JSON` editor did not render
   during the bounded semantic wait. No rendered Studio/product error appeared.

No blueprint edit, Create Project request, close, reopen, or output action was
emitted. Thus persistence remains unverified. The result is readiness-
inconclusive rather than a product finding. No browser profile, registry,
generated project/output, raw log, PID file, or automation source is retained
as evidence.
