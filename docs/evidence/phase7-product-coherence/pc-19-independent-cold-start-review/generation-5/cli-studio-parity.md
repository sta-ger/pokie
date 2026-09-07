# CLI-to-Studio saved-design boundary — 2026-09-07

Candidate product source: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`.

A new isolated profile used the candidate public CLI to create a deterministic
random blueprint (`seed 1907`) and `inspect` identified it as a Game Blueprint
with the expected package, Outcome Library, Stake, and PAR next actions. Fresh
Studio was then started exclusively with `node ./dist/cli/pokie.js --no-open`.

The visible route was:

1. `Start a game` → `Choose a different start` → `Open a saved game design`.
2. The local saved-design form rendered enabled `Browse…`; the action-local
   ready state was exactly `Saved game design/Browse: Browse…`.
3. One coordinate activation of that enabled rendered control immediately
   rendered its own terminal state: `"…/dist/cli/studio-client" is a folder,
   not a file. Point this at a file instead, or use Browse to pick one.` The
   form's `Browse…` and `Open saved game design` controls were then disabled.

No pending or created job was rendered. The native picker did not appear, so
the typed-file path was never injected. This is an action-local synchronous
terminal failure, not a page-wide alert or a timeout. Transient screenshot
checksum for the terminal UI (not retained):
`76c378fdcfabda5915566bdc21e4ea824434d5c12062142178a6ad03642bd270`.

The saved-design consumer boundary is therefore blocked. The separate isolated
examples-player and full role/lifecycle charter were not reached in this run.
