# Current host-side browser verification — P6-02

Candidate `4b40a06fa595f0e864b8e17043c983706ebdcbed` was rebuilt with Node 24,
then started as a new local Studio process with the Project A fixture. Two
separate new headless Chrome profiles were launched. The browser driver used
only rendered-control observation, screenshot capture, and normal CDP
mouse/keyboard input; it did not call Studio product endpoints or write page
DOM/state.

The required public starting point, `#/project/play`, visibly rendered Project
A (`Playable Game`) and the Play control. After 30 seconds, it remained
`#/project/play`; it never became the required project-scoped URL
`#/project/%2F...%2Fproject-a/play`. The clean second-browser reproduction
is captured in `00-legacy-project-a-play-before-route-scope-check.png`, its
URL/text companions, `06-browser-action-transcript.txt`, and
`08-clean-browser-rerun-terminal.log`.

This fails the prerequisite for the requested A → B → Back/Forward isolation
workflow: a historical A entry has no project identity, so Back cannot be
proven to restore A independently of the server's mutable current project.
The workflow correctly stopped at that visible failure rather than using a
private API or synthesizing a scoped history entry. `00-build-current.log`,
`01-fresh-studio-server.log`, the two Chrome logs/CDP versions, and
`09-process-shutdown-check.txt` retain build, fresh-runtime, browser, and
shutdown provenance.
