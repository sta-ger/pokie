# P6V-03 exact-candidate fresh-profile driver boundary

Candidate checked: `b59ee5a4aea0f271fff7c14c23f292f52fce160e` (the checkout
HEAD). `npm run build-cli` completed before the UI work.

Two isolated headed runs used a new HOME/XDG Studio registry and a new visible
Chrome profile each time. Studio was launched from this source checkout only as
`node ./dist/cli/pokie.js --no-open`; Chrome then used the inherited display.
Both reached the rendered `New Blueprint` → `Recommended` editor.

The visible `Game id` field did not retain `valera-mathematician` after the
normal mouse click, select-all, text-entry, and blur sequence; the bounded
semantic postcondition therefore never arrived. The second run included the
one safe label-normalization repair and showed the same result. No rendered
Studio/product error appeared, no Create Project request was emitted, and no
model, save, close, or reopen action was reached. This is driver-inconclusive,
not a product finding.

No screenshot, generated project/output tree, browser profile, registry, raw
log, PID file, or automation source is retained for this boundary.

## Focused harness-recovery continuation

The candidate ancestry and retained screenshot checksums were rechecked, and
`npm run build-cli` completed before this continuation. Four fresh HOME/XDG
registries and visible Chrome profiles launched Studio from this checkout only
as `node ./dist/cli/pokie.js --no-open`.

The first three bounded launches repaired the native-picker active-window
inspection, New Blueprint chooser readiness, and native-radio selector
handling respectively; each stopped before its next rendered product action.
The fourth reached Recommended Valera metadata, a fourth payline, PNG artwork
for A through the verified active native picker, A Wild, K Scatter, and
generated Reel 1 counts (A=2, K=1, Q=1, J=1). It stopped in the driver before
the next rendered locked-position/constraint action. No rendered Studio/product
error, Create Project request, duplicate non-idempotent request, save, close,
or reopen action occurred. With the four-launch allowance exhausted, stack,
constraint, paytable, mode persistence, and reopen verification remain
driver-inconclusive rather than product findings.

All temporary registries, profiles, projects, logs, processes, and the
temporary harness were removed. No new screenshot or generated artifact is
retained.
