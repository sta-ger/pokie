# P8-07 clean-room Studio journey

Candidate source: `379579246dc4b07da3499ae8187202475c6e016c`
Evidence commit parent: `07af7a74f8fff71596b1469dcd7fbfd431f95038` (only this evidence path differs)
Verified: 2026-08-27 UTC
Launch command: `node ./dist/cli/pokie.js --no-open`

## Method and scope

Two new temporary Chromium profiles were used. Studio was started from this
checkout's candidate-built `dist`, not its installed self-dependency. The
journey used only rendered Studio controls and its public **Docs index** link;
that link opened the public `pokie/docs/README.md` GitHub page. No private API,
DOM/state injection, generated artifact, browser profile, raw log, or harness
file is retained here.

## Visible journey transcript

1. **Learn and create.** Fresh Studio rendered `Start a game · POKIE Studio`,
   exposed Docs index/Getting started/CLI reference, and automatically marked
   all six starter-design sections valid. The author changed the game name to
   `P8 Studio Journey`.
2. **Author and validate.** In **Reels**, selected the rendered *Per-reel (Reel
   Strip Modeler)* control, selected reel 1, used the actual *Literal* control,
   added symbol `A`, then used its local **Preview**. It rendered `Literal
   strip Sequence: A, K, Q, J, A`. The explicit *Use changes* recovery action
   was shown for the unsaved draft; after applying it, validation remained
   `Valid — no issues found` and Studio clearly indicated that Create game would
   save the change.
3. **Open and run.** **Create game** opened the new editable project at
   `P8 Studio Journey · Overview · POKIE Studio`; Overview reported `Validation
   Valid — no issues found`. Play created a session and a real spin settled as
   `Round complete — no win this round`, with grid and round-artifact inspection
   available.
4. **Simulate and replay.** A 100-round Simulation completed, reporting RTP
   144.00%, hit frequency 15.00%, max win 28.00, and duration 0.0s. Its visible
   no-seed/low-round warnings included a concrete seeded-rerun recommendation;
   they were expected statistical/reproducibility guidance, not an error. A
   round-1 Replay completed with a full round artifact, debug/state snapshot,
   config hash, and enabled JSON download.
5. **Build and export.** Build/Export completed a TypeScript Game Package and an
   Outcome library. The latter displayed `Preflight: 1280 estimated item(s),
   1310720 estimated bytes` and `Built to .../outcomeLibrary`; the package
   displayed `Built to .../tsPackage`.

No rendered product error occurred. The only bounded performance value shown
by Studio was the completed simulation duration above; no UI latency/error
threshold was reached. During a second fresh launch, CDP observation of the
initial Studio page and public documentation action recorded no console
warning/error, runtime exception, or failed network request. Its final
screenshot capture stalled after browser focus moved to the new public GitHub
tab; this was a host-driver capture issue, not a rendered Studio symptom and
did not invalidate the completed first-launch journey.

## Generated-output checksums (outputs not retained)

```
9f074014261f1c5eb4cb03fe6b71a0478ae3098cad98a12b3ab3ea53ce6ff3f8  blueprint.json
5801eebe4535467deea2594d35e7b7adb6054fe5018aa3c44ebe707358abee3c  outcomeLibrary/manifest.json
3e779ee7ac5849c0b58b0242fac08f4385ef21b366ee66bee6d679849b3ecf49  tsPackage/package.json
```
