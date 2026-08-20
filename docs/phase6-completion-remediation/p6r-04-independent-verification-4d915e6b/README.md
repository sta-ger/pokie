# P6R-04 independent host verification

Candidate: `4d915e6bc32b058b0d695eaaa5f628ac9f3939a4`.

## Executed checks

- Built this checkout once, then launched Studio with exactly
  `node ./dist/cli/pokie.js --no-open` (served at `http://127.0.0.1:3200`).
- Ran one complete-file targeted Jest command covering the eight paths named in
  the persisted request. Its per-run Jest result cache recorded seven passed
  files and one failed file:
  `ProjectDashboardPage.replayWorkflow.test.tsx` (`[0,58257]`; the other seven
  records are `[1,...]`). This is a P2 regression finding for the rendered
  Replay workflow; this verification did not establish an implementation root
  cause.
- From the public root route, used rendered mouse/keyboard controls to create,
  save, register, and open `P6 Random Name Final`. The concise interaction
  transcript is retained below; the desktop workspace screenshot is the sole
  screenshot retained from the successful portion.

## Inconclusive rendered continuation

After navigating to Projects, the rendered `Open` control was invoked once.
The later rendered observation remained on Projects and showed no product
error. Per the verification policy, the elapsed wait is a driver/readiness
inconclusive observation, not an additional product defect. The required
desktop/mobile Project and Build/Export inspection was therefore not reached.

## Checksums

```text
browser-transcript.txt  28b56a6670c6b7e760b25d07f6762f9e4e7a036915e7d4603087e848dc342420
desktop-workspace.png   9fe053d9f6d8bc0accd4eff487134483a8756dd77d100e610f2482dc118bf68c
```
