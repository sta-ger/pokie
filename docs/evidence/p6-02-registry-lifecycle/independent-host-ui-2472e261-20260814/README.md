# P6-02 independent host-side browser verification

Candidate `2472e2614ca75f5a2ebc12e75976814c3d3a7edc` passed the persisted
Projects relocation lifecycle request.

The candidate was freshly built (`01-fresh-candidate-build.log`) and run with
an isolated Studio registry/configuration and documents directory. A fresh
Chrome profile drove only visible Studio controls through CDP mouse and
keyboard input; it did not call Studio product APIs or inject DOM or
application state.

The browser created and saved a managed Blueprint (`04-*`,
`05-managed-project-visible.*`). The host then moved exactly that generated
directory. `05-host-external-move-and-integrity.txt` records identical inode,
mode, size, and SHA-256 before and after the move. Returning through rendered
**Design Game** then **Projects** visibly changed the row to `(missing)` and
exposed **Relocate** (`15-remounted-projects-missing-relocate.*`).

The rendered Relocate form accepted the moved Blueprint path and produced one
canonical Managed row at that new location, with **Open** and no missing
marker (`08-post-relocate-timeout.*`, `09-persisted-registry-after-ui-relocation.json`).
The name of that capture reflects the reusable driver’s overly strict wait;
the directly captured rendered state and persisted registry demonstrate the
completed UI action. `09-post-relocation-file-integrity.txt` records the
unchanged artifact hash and the one visible row.

Both Studio and Chrome were stopped, then launched fresh. The restarted
browser rendered the same one relocated Managed row with **Open** and no
missing marker (`10-after-studio-restart-truthful-status.*`,
`13-browser-restart-terminal.log`). Runtime/browser logs, browser action
transcripts, screenshots, the isolated registry, and the generated relocated
Blueprint are retained in this directory.
