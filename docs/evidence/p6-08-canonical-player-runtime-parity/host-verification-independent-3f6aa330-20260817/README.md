# Independent P6-08 host verification — finding

Candidate: `3f6aa330fc9d51369a86d72d79459901b74ce0e2`.

The real visible browser workflow itself passed the requested Player parity
checks. A newly generated `fixture-slot` package, fresh Studio Play, fresh
Studio Replay, and a clean clone of the public `pokie-examples` repository
installed with the candidate tarball all rendered the deterministic round:
`A C A / A A C / A A A`, the highlighted A line, credits `1004`, and the
complete `A=5`, `B=3`, `C=1` paytable. Studio presents the paytable as the
visible `Symbol / 3` table (rather than a literal `Paytable` heading) and the
round multiple as `Total win 5.00 (5.00x)`.

The candidate nevertheless has a P1 public-workflow failure: its ordinary
`npm run build` stops in `prebuild`/ESLint before packaging or serving can
complete. The logged error is `no-nested-ternary` at
`cli/studio-client/src/components/common/roundPresentation.ts:47:21`. To
isolate browser parity from that build-gate failure, the independent rerun
then built the CLI/Studio bundle directly under Node 24, packed that exact
bundle with lifecycle scripts disabled, and drove only visible browser
controls. Those temporary workaround steps are recorded in the terminal logs;
they do not make the normal package workflow pass.

`browser-ui-rerun.mjs` is the prior-audit-derived visible-browser driver. It
uses Chrome DevTools only for navigation, rendered-text inspection, coordinate
mouse/keyboard input, and screenshots. It does not call application APIs or
inject DOM/application state. `browser-transcript.txt` records the index-link
and rendered `Play` control used for the public examples flow.

Key evidence:

- `01-candidate-build-terminal.log` — standard build fails at ESLint.
- `03-candidate-build-cli-node24-terminal.log` — fresh Studio/client TypeScript
  build succeeds with the repaired `ReplayDescriptor.credits` type.
- `13-browser-workflow-complete-terminal.log` and `browser-transcript.txt` —
  complete visible four-surface workflow.
- `20-` through `23-*.png`, `*.txt`, and `*-grid.json` — screenshots and
  rendered browser data for each surface.
- `cross-surface-grid-comparison.json` — all four rendered grids are identical.
