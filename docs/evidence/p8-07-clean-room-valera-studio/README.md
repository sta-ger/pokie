# P8-07 clean-room Studio verification

Candidate: `4a3e099bf46b637afab4459e9e015ce82b1ef7ce` (verified from its
evidence-only descendant `c7e9c2390bba3dfecf6eef1e595326a9866b48ca`).

Two new Chromium profiles used the public Studio only, launched exactly with:

```sh
node ./dist/cli/pokie.js --no-open
```

The second, repaired run rendered the Recommended starter form, created a
project, and reached Overview with **Validation: Valid — no issues found**.
It opened the Game Model's rendered Reels editor, then created a Play session
and completed one real rendered spin: **You won 28.00** (total win 28.00x).
The bounded dashboard capture is
`dashboard-validation.png` (SHA-256
`b9d0e774e5b306fcb996c88f28fa5cb6a81a28904ec23fb1a737cd9d6fce1765`).

The Reels editor uses its visibly rendered contextual **Edit**, native
generation-mode radios, and per-symbol fields—not the previously assumed
reel-selector action. This is a harness selector recovery observation, not a
product defect. In Build/Export, one rendered **Build** click for the ready
TypeScript Game Package produced no local pending, success, or error state;
the control still read **Status: Ready to build** after bounded observation.
No duplicate build was sent. The two-launch limit prevented the required safe
rendered retry, so artifact completion and saving an edit remain
driver-inconclusive. No product error was rendered.
