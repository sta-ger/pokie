# P6-07 host verification

Verified candidate: `cca29390ac54b4e55471345272fa1484b0e23ac6`
([P6-07] open PAR workbooks for export), rebuilt with Node `v24.18.0` and
exercised through fresh Studio and Chrome instances. The browser driver used
only rendered controls and ordinary mouse/keyboard events.

Retained evidence:

- `local-native-workflow-transcript.txt` — open `starter.par.xlsx`, choose an
  XLSX destination in the native Save dialog, Build, then Reveal file.
- `local-native-save-build-reveal.{png,txt}` — representative completed local
  build state, including the selected XLSX destination and Reveal file action.
- `headless-workflow-transcript.txt` — type an XLSX destination, Build, then
  Copy path in a Studio session without local-display support.
- `headless-build-copy-path.{png,txt}` — representative completed headless
  state, including Copy path and the explicit unsupported-local-output message.

Generated workbooks, output trees, launch/process logs, PIDs, stale attempts,
and superseded captures are deliberately not retained.
