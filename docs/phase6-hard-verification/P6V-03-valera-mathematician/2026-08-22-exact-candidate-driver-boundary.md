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
