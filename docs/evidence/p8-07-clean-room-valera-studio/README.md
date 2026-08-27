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

Recovery used four further isolated Chromium profiles with the same candidate
launcher. The final fresh-profile pass used Reels **Edit**, duplicated the
rendered reel 1 symbol 1, then saved and returned to the normal Reels
**Edit** surface. A new Play session settled a real Spin with **Round complete
— no win this round**. The rendered TypeScript Game Package **Build** then
completed with **Built to …/tsPackage**. The generated artifact was not
retained: 6 files, 17,278 bytes, manifest SHA-256
0887b093ceef10203293f9ef041d9ee516b7f8dc9a24311d5ca122b2de1a191f.

Earlier timeouts were harness-only (an off-viewport control and stale
local-result labels); the final pass observed each local transition. A
harness-only second Build was sent after the first success because its
detector did not yet recognize “Built to”; its nonempty-output-directory
message is not a product finding, and the detector was repaired without
another launch. Each rendered transition used a bounded 10–60 second local
state observation. No rendered product defect was observed.
