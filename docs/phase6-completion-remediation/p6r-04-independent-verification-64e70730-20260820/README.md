# P6R-04 independent rendered verification

Candidate: `64e70730bd1c2a33244c8fa412671dae9387df41`.

## Rendered workflow

One candidate build completed and one Studio instance was launched from this
checkout exactly as `node ./dist/cli/pokie.js --no-open`. Through the public
rendered Studio controls, a Recommended project was opened, its Reel Strip
Modeler changed Reel 1 to Generated, added visible symbol-count, spacing, and
no-stack constraints, previewed a successful generated strip, completed Done
and Use changes, and saved the Game Model. Build/Export then generated 256
exact outcomes and the single enabled Stake Engine Export action rendered
`Exported 4 file(s)`.

The first Reels-edit coordinate was below the visible browser viewport and
emitted no request; one safe rendered retry after scrolling the control into
view succeeded. Save's transient success label had already disappeared, but
the later rendered Game Model summary showed the saved Per-reel generation
mode, so the expired label wait is not a product finding.

## Targeted result

The required one-command, complete-file Jest invocation finished with `1`
failed suite, `7` passed suites, and `410/414` passing tests. All four failing
tests belong to `ProjectDashboardPage.replayWorkflow.test.tsx`: the Replay
surface's advanced-details control and project-location advanced-details
control both match the test's formerly unique `/Show advanced details/`
query. See `targeted-results.txt`.

## Retained files

| File | SHA-256 |
| --- | --- |
| `modeler-done-unsaved.png` | recorded in `checksums.txt` |
| `build-export-complete.png` | recorded in `checksums.txt` |

Generated projects, exports, browser profile, automation, and full logs are
not retained.
