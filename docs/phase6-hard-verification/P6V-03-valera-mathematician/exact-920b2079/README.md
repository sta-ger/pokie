# P6V-03 exact-SHA rendered rerun — bounded result

Candidate source: `920b2079acde4a581bd9b520df38aa3268753205` (the harness checked
`git rev-parse HEAD` before starting Studio).  One `npm run build-cli` preceded
the rerun.  Each of the two allowed launches used the candidate source checkout
only as `node ./dist/cli/pokie.js --no-open`, a new disposable Studio HOME/XDG
registry, and a new Chromium profile.

The second fresh run visibly completed Recommended, Random, Blank, and final
Recommended creation; valid Valera identifiers; Layout, Symbols, Reels,
Paytable, and Bets; A wild/K scatter; focused native-picker artwork selection;
literal reel A entry; and a Symbol weights A=2 edit.  The first run stopped at
an accessibility-label-versus-page-text wait before selecting reel 1.  That
selector was repaired in `current.mjs` before the second launch.

After the second run selected Literal again, its post-switch wait made the same
label-versus-visible-text mistake and expired.  No rendered Studio error was
observed.  The fresh-launch allowance was exhausted, so this evidence does not
claim the literal-restoration confirmation, save/reopen, Play, Simulation,
Replay, Outcome Library, or Stake Engine workflow.  This is selector-inconclusive
host evidence, not a product finding.

| File | Rendered proof | SHA-256 |
| --- | --- | --- |
| `01-literal-reels.png` | Literal reel editor after visible A addition | `4b3ba471b69ebd543f38baa98f0a9ecfea52c31a90845830cc3a9bc0275ec3e8` |
| `02-symbol-weights.png` | Generated reel's visible Symbol weights editor after A=2 addition | `5e763ab24293dae86974e12ad7d65a5c5f09c0689d4aedb4e0f0a7e808a07bf7` |
| `transcript.txt` | Timestamped rendered-control record and bounded selector outcome | — |
