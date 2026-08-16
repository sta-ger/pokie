# P6-05 independent host rerun — finding

Candidate verified: `942945cdaa75526d4884631ec8904cb451b40346`.

This is a fresh real-Studio/browser rerun, separate from the earlier finding at
the parent evidence directory. The candidate was rebuilt with Node `v24.18.0`,
then a fresh local Studio and a fresh Chrome profile were launched against the
fixture in `workspace/`. Browser actions were restricted to address-bar
navigations, rendered-control coordinate clicks, and browser keyboard input;
no Studio API, DOM, or application state was injected.

## Finding: P1 — Symbols Save still leaves a stale Game Model projection

The browser visibly edited symbol 6 from `WILD` to `WILD_FINAL` and clicked the
Symbols section's **Save**. The saved file is `workspace/blueprint.json` (and
the copied immutable observation `09-persisted-blueprint-after-ui-save.json`):
it contains `WILD_FINAL` in `symbols`, `wilds`, `symbolWeights`, and
`symbolArtwork`.

After the component's post-save refresh had a full 60 seconds to settle, the
rendered Game Model still showed `WILD` rather than `WILD_FINAL`.
`08-stale-symbols-view-after-corrected-save.png` and its text companion record
that rendered stale state. A second fresh Studio plus fresh Chrome instance
still rendered the old `WILD` view while the persisted fixture remained
`WILD_FINAL` (`10-restart-rendered-state.*`).

The visible initial page did render the declared native PNG
(`01-initial-artwork-visible.*`), but the required persisted post-save Game
Model view does not remain correct. This fails the first acceptance criterion;
the remaining end-to-end save/cancel and artwork/denial sequence cannot be
accepted as passing from this rerun.

The candidate's request-id guard rejects an older client response only when a
newer request is already known. The observed persisted-source versus rendered-
projection divergence still occurs after Save and across a fresh Studio/client
lifecycle, so the save path lacks an effective invalidation/authoritative
post-save projection boundary.

## Evidence map

- `browser-workflow-transcript.txt` — real rendered-control workflow through
  the failing Symbols Save.
- `08-stale-symbols-view-after-corrected-save.*` — screenshot and rendered
  text after the 60-second settle period.
- `09-persisted-blueprint-after-ui-save.json` and `workspace/blueprint.json`
  — source persisted by the visible Save.
- `restart-browser-workflow-transcript.txt` and `10-restart-rendered-state.*`
  — fresh Studio/client restart attempt and its still-stale rendered view.
- `host-terminal.log` — build/runtime host record; `CHECKSUMS.sha256` anchors
  the key screenshots and generated artifacts.

