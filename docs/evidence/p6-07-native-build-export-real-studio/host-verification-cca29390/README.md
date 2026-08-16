# Host verification — candidate `cca29390`

The candidate was rebuilt with the host's Node 24.18.0 runtime, then exercised
through fresh Studio servers and fresh visible Chrome profiles. The browser
driver only located rendered controls and sent ordinary mouse/keyboard events;
it did not call Studio APIs or inject browser/application state.

## Local native output

`local-browser-transcript.txt` records Studio opening
`examples/parsheets/starter.par.xlsx`, clicking the rendered **Browse…**
control, selecting `native-par-output.xlsx` in the visible Zenity native Save
dialog, building it, and clicking **Reveal file**. The matching selection and
completed-build screenshot/text captures show the rendered destination,
preflight, build result, and action. The resulting workbook is in `artifacts/`.

## Headless output

`headless-browser-transcript.txt` records a separate Studio process started
without `DISPLAY` or `WAYLAND_DISPLAY`. A fresh visible client typed
`headless-par-output.xlsx` in the rendered output field, built it, then
observed and clicked **Copy path** next to: “Opening local output is
unsupported from a headless or remote Studio session.” The result is in
`artifacts/`.

`build-cli.log`, `studio-*.log`, and `chrome-*.log` are terminal/process
evidence. `artifact-checksums.txt` confirms both produced files are recognised
as Microsoft Excel 2007+ workbooks. The retained `local-failure-rendered.*`
files document the initial Node 18 launcher attempt, whose stale Vite bundle
could not represent the candidate's new `artifact` dashboard state; the fresh
Node 24 rebuild immediately afterwards is the workflow evidence above.
