# P6-02 registry lifecycle host verification

Candidate `c976000d915137c3f5c3e1554ac32c2a5b3d3afe` was freshly built with
`npm run build` and run as a new local Studio server. `XDG_CONFIG_HOME` and
`XDG_DOCUMENTS_DIR` pointed inside this evidence directory, making both the
registry and managed-project output isolated and inspectable.

The browser driver used a fresh Chrome profile and only rendered Studio
controls plus normal CDP mouse/keyboard events. It did not call product API
routes or modify DOM/application state.

Finding: after the visible guided `Save` created a managed Blueprint Project,
`04-managed-save-success.*` confirms the saved file. Navigating through the
visible `Projects` control then produced the rendered empty state in
`13-projects-panel-stale-after-managed-save.*`: **"No projects yet -- import
or design one below."** The host-side persisted-registry observation in
`14-host-persisted-registry-observation.txt` shows the matching `managed`
entry and confirms the blueprint file exists. Thus the managed registration is
written but the live Projects UI does not refresh, failing the requested
managed-create auto-registration lifecycle.

`09-browser-action-transcript-phase1.txt` and
`12-browser-phase1-terminal.log` give the complete browser transcript through
the failing acceptance check; Studio and Chrome logs are retained alongside
them. `12a-failed-dialog-visible-text.txt` is an earlier preserved probe of
the optional random-name field and is not needed for the lifecycle finding.
