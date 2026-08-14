# Fresh candidate rerun: P6-02 registry lifecycle

Candidate `6adf3490a4593d36dd794cc143115fbb040e10d4` was rebuilt with `npm run build` and run as a new local Studio server. The Studio configuration directory, Documents directory, and Chrome profile were all isolated beneath this rerun directory.

The browser driver used Chrome's ordinary visible-control mouse and keyboard input. It observed element geometry and rendered text only; it did not alter DOM or application state and did not use Studio API routes as workflow actions.

Finding: the visible guided `Save` successfully created a managed Blueprint Project (`04-managed-save-visible-refresh-source.*`). Immediately selecting the visible `Projects` navigation showed `No projects yet -- import or design one below.` for the full 30-second browser wait (`15-rerun-managed-save-projects-stale.*`, `browser-action-transcript-phase1.txt`). The saved managed source and persisted registry record exist (`04-managed-project-path.txt`, `16-host-persisted-registry-observation.txt`), so persistence succeeded while the required in-place Projects refresh failed.

Because the first mandatory acceptance criterion failed, the bounded lifecycle was stopped before later checks could be treated as passing. `12-browser-phase1-terminal.log` is the browser-driver terminal log; `00-candidate-build.log`, `10-studio-phase1.log`, and `11-cdp-phase1-version.json` document the exact freshly-built local runtime.
