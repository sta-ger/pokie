# P5PA-08 independent host-browser verification

Status: **passed** on candidate `4ad24ecd7ea317d4902dbc5b80d290f4ded8be1b`.

The final successful session is `host-browser/`. It launched a fresh local
Studio from this candidate and a fresh headless Chrome profile. The browser
driver located rendered controls, used mouse coordinates and browser keyboard
events only, read rendered text/control values, and captured screenshots. It
did not call Studio APIs or inject application DOM/state.

The candidate was fully built with supported Node 24 before the browser reruns;
the complete terminal log is preserved at
`host-browser-attempt-2/01-full-candidate-build.log`. The final session's
identity, runtime, terminal logs, DevTools metadata, and complete browser
transcript are in `host-browser/`.

The final transcript and captures establish:

1. `06-unapplied-json-draft.*` — a visibly typed, unapplied draft marker in
   Blueprint JSON.
2. `07-mode-switch-warning.*` — switching to Form produces the explicit
   discard warning.
3. `08-cancel-preserves-draft.*` — Cancel keeps JSON mode and the exact marker.
4. `09-shared-unsaved-work-protection.*` and
   `10-shared-cancel-preserves-draft.*` — the same JSON-only draft triggers the
   New Blueprint unsaved-work protection and its Cancel preserves the marker.
5. `11-confirm-discards-and-switches-form.*` — Confirm removes the textarea
   and returns to Form mode, discarding the never-applied draft.

`host-browser-attempt-1/` through `host-browser-attempt-13/` are deliberately
preserved intermediate diagnostics from this verification run, including the
initial direct CLI-only build-order failure and browser-driver refinements.
