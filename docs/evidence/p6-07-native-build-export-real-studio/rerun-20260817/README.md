# P6-07 independent browser rerun — finding

Candidate `bc50eb6c49d5aead08e569c767495a6b5d367f06` was rebuilt, then
verified through fresh local Studio servers and fresh visible Chrome windows.
No Studio private API was used to perform the workflows: the browser driver
clicked rendered controls at their visible coordinates and used the visible
Zenity native dialog through normal keyboard interaction.

## What passed

- `directory-native-browser-transcript.txt` records a real local Studio
  Blueprint Build/Export workflow: `Browse…` opened a visible Zenity folder
  dialog, the returned destination was rendered in the Build preflight, Build
  completed, and `Open output folder` was clicked.  The matching PNG/TXT
  captures show the rendered preflight, completed build, and action.
- `par-headless-browser-transcript.txt` records a fresh Studio server started
  without `DISPLAY` or `WAYLAND_DISPLAY`.  A visible Studio client typed a
  destination, built it, then rendered and clicked `Copy path` alongside the
  clear “Opening local output is unsupported from a headless or remote Studio
  session.” state.  The generated package is under `artifacts/`.

## Finding — P1

The required local PAR XLSX native file-save workflow cannot be reached.
`par-native-failure-rendered.png` and `.txt` show that a Studio server opened
on `examples/parsheets/starter.par.xlsx` enters the Project dashboard but
reports:

`"studio" is not supported for a "parWorkbook" project (missing the
"runtime.execute" capability). Supported by: tsPackage.`

Only Overview and Game Model are rendered, so there is no Build/Export card,
no `Output file (optional)` field, and no `Browse…` file-save action to drive.
The candidate adds `parWorkbook.exchange` to the frontend tab filter, but the
server-side `loadProjectDashboardContext` still tries to materialize/load the
workbook as a runnable package before returning a dashboard with that
capability.  This is a product reachability defect, not an external or human
prerequisite.

`build-cli.log`, `studio-*.log`, and `chrome-*.log` are fresh terminal/log
evidence.  `CHECKSUMS.sha256` hashes the concise rerun evidence and generated
artifacts.
