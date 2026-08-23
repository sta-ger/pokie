# P6V-05 host verification — inconclusive (native-picker readiness)

Product source SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
Read-only companion checkout SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both were clean before and after this retry; the product tree remains the exact candidate, with
this documentation-only descendant as the sole retained delta.

The persistent controller harness was repaired in place and used the exact candidate command
`node ./dist/cli/pokie.js --no-open`, a fresh Studio registry, a fresh Chromium profile, and the
inherited controller X display. It exercised the rendered **Design Game** → **Show advanced
options (JSON mode, load/save by path)** → **PAR sheet path** **Browse…** workflow. The first
trusted browser pointer had no local pending state or emitted request, so the harness made the one
permitted safe OS-level retry after activating and verifying the Chromium window. That retry emitted
the browser's normal native-browse request, opened a new native picker window, activated and verified
that window, and entered the absolute fixture path `starter.par.xlsx`.

After the picker completed, the rendered **PAR sheet path** field never received that path within
the bounded semantic wait. Studio showed no rendered error. The interaction therefore did reach the
physical native picker, but did not reach an accepted physical import; this is readiness/driver
inconclusive rather than a product defect. It is not evidence of any successful import, export, or
Player result.

The native-picker transition is the earliest prerequisite for PAR diagnostics, managed Blueprint
save, physical export/reimport and canonical comparison. Consequently those steps, Studio Play and
Replay, companion `npm start`, candidate public `dev`, and CLI Replay were not reached. No generated
project/output tree, XLSX export, browser profile, raw log, screenshot, automation source, PID file,
or symlink is retained here.
