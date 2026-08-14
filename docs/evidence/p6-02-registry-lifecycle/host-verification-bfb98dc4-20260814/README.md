# P6-02 independent host-side browser verification

Candidate: `bfb98dc4737d3c2b55b99d3f0585a852df34e259`.

## Finding P2: visible Relocate does not complete

The candidate was compiled directly from its source with the locally available Node 24
runtime (`15-fresh-candidate-direct-build.log`). The normal `npm run build` gate is also
retained in `01-candidate-build.log`; it stops on an unrelated pre-existing lint error in a
test file before it rebuilds `dist`, so it was not used as the runtime artifact.

`fresh-candidate-workflow/` contains a fresh isolated Studio server, Chrome profile, app
configuration, browser transcripts, screenshots, server/browser logs, and the relocated
Blueprint artifact. The browser driver locates only rendered controls and sends normal
Chrome mouse/keyboard input; it makes no Studio product API calls and does not modify DOM
or application state.

The focused fresh rerun in `fresh-candidate-workflow/focused-reproduction/` created and
saved a managed Blueprint, then the host moved the exact saved file. `pre-move-sha256.txt`
and `post-move-sha256.txt` retain the matching file hashes. The browser selected rendered
**Design Game** and then rendered **Projects**. This time it correctly refreshed to
`(missing)` with **Relocate** (`tab-revisit-terminal.log` and
`15-remounted-projects-missing-relocate.png`).

The same rendered workflow then clicked **Relocate**, entered the generated artifact's
path through the keyboard, and clicked the rendered form confirmation. It remained on the
Relocate form for 30 seconds rather than updating to one non-missing canonical row
(`relocate-terminal.log`, `browser-action-transcript-manual-relocate.txt`, and
`07-post-reload-missing-status-timeout.png`). The generated Blueprint remains available
at `fixtures/relocated-managed/blueprint.json`, but the public flow did not complete its
registry repair, so neither canonical-record preservation nor truthful post-relocation
restart state can be accepted.

The root cause is in the public client relocation completion path: its POST/action does
not settle into the `upsertEntry`/`removeEntry` update after the rendered confirmation is
clicked. Temporary Chrome profiles are intentionally ignored; all retained evidence is in
the committed text, logs, screenshots, configuration, and generated Blueprint artifact.
