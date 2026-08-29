# PC-12 independent verification — blocked browser run

Candidate `3b6bf3efcb69ec6af7b450e0887bc10d703dabc9` was built with `npm run build-cli`.
The clean examples checkout was `/home/stager/Work/sta-ger/pokie-examples` at
`1ecbca95994e19c171fc8cd4aa9065705e9e27b5`.  The persisted harness made two isolated copies of
the deterministic `playable-game` fixture and invoked the supplied PC-12 runner once.

The runner created its isolated packed consumer, then stopped before Studio, Vite, or Chromium launched.
`import.meta.resolve("pokie/client/player")` returned a valid `file:///…/node_modules/pokie/dist/cli/client/player/index.js`
URL, but `assertExactCandidatePlayerExport` treats that URL as a filesystem path and rejects it. The concise
machine transcript is retained in `current-run/TRANSCRIPT.txt`; no capture, checksum, or comparison can
truthfully be recorded after this pre-browser assertion.

The independently executed whole-file companion test was green:

`POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples npm run test:targeted -- /home/stager/Work/sta-ger/pokie-examples/tests/ui.test.ts`

It reported 1 suite passed and 2 tests passed. The runner's `finally` cleanup completed; no PC-12 Studio,
Vite, Chromium, or temporary runner profile remained.
