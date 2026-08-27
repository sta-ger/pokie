# PC-03 — blind Studio rerun ledger

Candidate: `a2083eb4d433fd52e42ad32ae1725bdd070d08c1`.

## Method and bounded outcome

On 2026-08-27, a newly isolated Studio home, registry, and Chromium profile
started this checkout with exactly:

```sh
node ./dist/cli/pokie.js --no-open
```

The public listener rendered at `http://127.0.0.1:3200`. The exploration used
only rendered labels and browser mouse/keyboard events; no project path,
application state, private endpoint, source-guided route, or fabricated
artifact was used. Temporary profiles and generated data were removed. No
screenshots are retained because the visible text below is the smallest useful
proof.

The browser renderer exposed the following actual public states before the
host-side visible-window driver became unavailable:

| Visible action | Rendered outcome |
| --- | --- |
| Fresh **Design Your Game** → **Choose a different start** | The menu offered **Open a saved game design** and described continuing from a saved design file. |
| **Open a saved game design** | The design screen expanded a public **Saved game design** path field, **Browse…**, **Back**, and **Open saved game design**. |
| Enter `/definitely-not-a-pokie-project` and press **Open saved game design** | The rendered actionable failure was `"/definitely-not-a-pokie-project" doesn't exist. Check the path, or use Browse to pick an existing location. The saved game design could not be found. Check the path and try again.` The original Design screen and **Create game** remained rendered. |
| Initial automatic validation | The status read `Studio is checking this game design automatically. Create game will show any fixes that are needed.` It then rendered `Valid — no issues found.` |

The test did not retain or make a second **Create game** request. The first
rendered click after the invalid saved-design error did not transition to a
pending, success, or rendered product-error state; the still-rendered
**Back** control showed that the failed open subflow remained active. This is
not evidence of a product defect and was not duplicated while the interaction
was unresolved.

## Rerun boundary

During the same launch, Chromium's DevTools renderer continued to expose the
public UI, but Fluxbox/Xvfb reported no mapped Chromium client window or active
browser window. That prevents the required visible host interaction needed to
finish the saved-project **Close/Open**, generic project-import, reload,
browser Back/Forward, and stale-state portions. The run was therefore stopped
without a second create/open request or fabricated evidence. No rendered
product error, stale diagnostic, or loading failure was observed beyond the
actionable missing-file message above.

This replaces the earlier broader ledger rather than carrying its unrepeatable
claims forward. A later verification must use a mapped visible Chromium window
and then complete the remaining public controls from this fresh-profile route.
