# P6-05 independent host verification — finding

Candidate: `b5e2379cd3f5d4004aa8fe54f06388721951ccfa`.

Chrome was started headlessly with a fresh profile and driven only by rendered-control coordinate
clicks and browser keyboard input. Studio was a freshly built local server from this candidate.
The complete browser action record is `browser-workflow-transcript.txt`; `browser-terminal.log` and
`studio-terminal.log` are the host logs.

## Finding: P1 — Symbols Save leaves a stale Game Model View

The rendered workflow edited Symbols, changed the sixth symbol to `WILD_FINAL`, and clicked the
section's visible **Save**. The actual persisted Blueprint records `WILD_FINAL` in `symbols`,
`wilds`, `symbolWeights`, and `symbolArtwork` (`09-persisted-blueprint-after-ui-save.json`).
However, after the component's own Save-triggered refresh had settled for 60 seconds, the rendered
Game Model still showed the prior `WILD` symbol. `08-stale-symbols-view-after-save.png` and its text
transcript capture that stale View; the source artifact and `persisted-artifact-terminal.log` capture
the contrary saved truth.

This fails the required Edit → mutate → dirty → Save → View behavior: an operator cannot trust the
View immediately following a successful save. It also prevented a clean completion of the requested
reload/restart/artwork sequence, so those acceptance claims are not passed by this verification.

`01-initial-artwork-visible.png` confirms the declared project-relative native PNG was visibly
rendered before the edit. The `workspace/` directory is the real fixture and resulting persisted
artifact; its PNG and Blueprint checksums are in `artifact-checksums.sha256`.
