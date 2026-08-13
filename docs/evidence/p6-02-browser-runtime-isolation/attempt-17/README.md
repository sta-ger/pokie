# Attempt 17 — fresh candidate browser verification

Status: **finding** (`p6-02-browser-runtime-isolation`).

This run rebuilt commit `80057321401ae3cc4655f4c0b56ce895a9043c05`, started a
fresh Studio with the real two-mode outcome-library fixture as Project A, and
launched a fresh Chrome profile. The driver used rendered-control discovery,
coordinate mouse clicks, ordinary keyboard text input, and physical browser
mouse Back/Forward buttons only. It made no Studio API calls and did not inject
DOM or application state.

In A, the visibly selected `buyFeature` mode was used to create a session and
play a round (`05-project-a-play-state.*`). After the visible Home → Projects
→ Detect → Register → Open flow for B, `06-project-b-fresh-play-state.*` shows
the fresh B Play form with no A mode picker, seed, session controls, or round;
`07-project-b-session-state.*` records B's independent session.

The browser's physical Back button then traversed B Play → B Overview → Home
Projects → Home Design → the historical A URL. The transcript records the
fourth location as `#/project/play`, exactly A's saved URL. But
`08-browser-back-historical-a-route.png` and its visible text show **Playable
Game With Bonus Round** (B) on that A route. Thus Back does not restore A and
B renders on A's historical route. Four physical Forward actions do return to
the B scoped Play route, as recorded by `09-browser-forward-project-b-route.*`.

The failure occurs because the initial Studio project route remains the legacy
unscoped `#/project/play`; the current candidate only encodes project identity
in routes opened through the Home `Open` flow. When history returns to that
legacy A entry, there is no A root to restore and the server's mutable B
context remains active.

`04-browser-driver.log` and `09-browser-action-transcript.txt` are the full
browser transcripts. `01-*` through `06-*` record local Studio/Chrome startup,
live processes, and clean shutdown. `browser-ui-current-candidate-rerun.mjs`
is the recorded visible-input-only driver used for this attempt.
