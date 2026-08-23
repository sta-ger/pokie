# P6V-05 host verification — inconclusive (native-picker readiness)

Candidate product SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
Candidate companion SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
The product checkout is a clean documentation-only descendant of the product candidate; the
read-only companion checkout was clean and exactly at its recorded SHA before and after this run.

The retained evidence was present and truthful: it contained no successful criterion. The persistent
controller harness was repaired in place for the complete recorded history, then used for four fresh,
isolated launches. Each launch started Studio directly from this checkout with
`node ./dist/cli/pokie.js --no-open`, with a new registry/profile and the inherited controller display.

On each launch the visible Studio workflow reached **Design Game** → **Show advanced options** →
**PAR sheet path** → **Browse…**. The harness activated the visible Chromium window, used the one
permitted safe OS-level retry only after its first rendered click had no local state, and then observed a
new top-level Zenity native picker. It activated that picker, verified it as the active window, and
entered the absolute copied `starter.par.xlsx` fixture path. No Studio product error rendered. In the
final bounded inspection, the picker-request response capture was shown to be tied to the availability
preflight rather than the picker completion; it cannot establish a selected/cancelled result. Most
importantly, the visible **PAR sheet path** control never rendered the selected path after the picker
closed.

Therefore physical import was not established. Diagnostics, managed Blueprint save, physical export,
reimport/hash/semantic comparison, Studio Play/Replay, companion `npm start`, public client/dev, and CLI
Replay remain unreached. This is a driver/readiness inconclusive result, not a product finding. No
generated project/output tree, browser profile, automation source, raw log, screenshot, PID file, or
symlink is retained; the assigned harness workspace is outside this evidence directory.
