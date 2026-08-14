# Independent P6-02 browser verification

Candidate: `359f0f4ce0e95270c591a6fa4bb15bdb22f225f7`.

This run rebuilt the candidate with Node 24, created an isolated external
fixture, and launched a fresh local Studio instance and Chrome profile. The
driver (`browser-driver.mjs`, copied from the prior audit as a starting point)
uses only rendered-element discovery, CDP mouse/keyboard input, screenshots,
and rendered text. It makes no Studio product API calls and does not alter DOM
or application state.

## Result: finding P2

The first portion of the lifecycle passes in the visible UI:

- Managed **Save** immediately renders exactly one managed Projects row
  without a reload (`04-...` and `05-...`).
- Relative, absolute, and symlink imports produce one renamed external row;
  opening it visibly shows its name and id (`06-...` and `07-...`).
- Building a TypeScript package, adding it to Projects, and registering it
  again retains three total rows (`08-...` and `09-...`).

The lifecycle then fails at relocation. The host moved the exact managed
project directory recorded by visible Save into this evidence directory
(`10-relocation-host-action.txt`). The browser performed Ctrl+R against the
rendered Projects page, but for 30 seconds it never exposed **Relocate**
(`browser-action-transcript-phase2.txt`). A fresh Studio restart likewise
rendered the original managed location with ordinary **Open** and **Remove**
actions (`15-after-restart-timeout.png` and companion text). As relocation
cannot be completed in the public UI, removal/restart-recency cannot satisfy
the requested full lifecycle after that point.

`01-candidate-build.log`, `06-studio.log`, `13-studio-restart.log`, browser
transcripts, PNGs, and rendered-text captures provide the build, server,
browser, and visible-product evidence. `16-runtime-stop.txt` records clean
runtime shutdown.
