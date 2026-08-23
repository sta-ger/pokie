# P6V-05 host verification — inconclusive (native-picker driver)

Product source SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
This evidence commit is a documentation-only descendant; its only product-tree delta is this
transcript. Read-only companion checkout SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both checkouts were clean before and after the retry.

The persistent controller harness was repaired in place before this retry. The repair scrolls
the associated rendered `Browse…` control into the viewport, verifies its centre is inside the
viewport, emits a trusted pointer sequence there, and then requires a *new* visible native window
to become active before typing a path. It uses the inherited controller X display and the exact
candidate command `node ./dist/cli/pokie.js --no-open`, with a new Studio registry and Chrome profile.

On the fresh recovery launch, Studio rendered **Design Game**, the visible **Show advanced options
(JSON mode, load/save by path)** action, and the associated **PAR sheet path** **Browse…** button.
The harness recorded the rendered click. No new native-picker window appeared during the bounded
30-second semantic wait, so no path was entered, no PAR import request was accepted, and Studio
rendered no product error. This is a driver/readiness result rather than a product finding.

The native-picker action is the earliest prerequisite for the physical XLSX import, diagnostics,
apply/save/export/reimport and canonical comparison. Those steps therefore were not performed.
Without an accepted imported fixture, a Studio Play/Replay session bound to that physical journey
could not be reached, and no companion `npm start` or candidate public `dev` Player claim is made.
No generated project/output tree, XLSX export, browser profile, raw log, screenshot, automation
source, PID file, or symlink is retained in this evidence directory.
