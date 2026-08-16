# P6-04 Random Name Design Game verification

Candidate `0f28cf81e66c61c4b28081853fd8ff21712de1fa` was built with the local
supported Node 24 runtime and exercised through a fresh local Studio server
and fresh Chrome profile using rendered controls, mouse coordinates, and
browser keyboard input only.

The focused rerun entered `P6 Random Name Draft` into Random's optional
**Name (optional)** field, replaced it with `P6 Random Name Final`, generated
the named Blueprint, and created the project. The screenshots and browser
transcript show that the client remained rendered, generation retained the
edited name, and **Create Project** opened its Workspace.

- `01-random-name-edited.*` — the second visible Name entry is retained in the
  rendered Random dialog.
- `02-random-name-generated.*` — generation retained the final name under
  visible deterministic seed `20260815`.
- `03-random-created-workspace.*` — Create Project persisted, registered, and
  opened the named Blueprint Workspace.
- `03-after-restart-projects.*` — after a fresh Studio and Chrome restart, the
  rendered Projects view still lists `P6 Random Name Final` with **Open**.

`workflow-browser-transcript.txt` and `restart-browser-transcript.txt` are the
browser action transcripts; `10-browser-workflow-terminal.log` and
`13-browser-restart-terminal.log` are their terminal captures. The numbered
Studio/Chrome terminal logs record the two fresh server/browser lifecycles.
`managed-projects-next/` contains the actual Blueprint produced by the visible
workflow and `studio-config-next/pokie/projects.json` is the persisted registry
used for the restart.
