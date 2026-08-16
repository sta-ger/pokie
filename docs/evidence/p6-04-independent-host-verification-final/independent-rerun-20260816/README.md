# P6-04 independent host-side reopen rerun

Candidate `010f1c13c96cacb7b326e3deadcd71ce340ecb64` was rebuilt and exercised
through a newly started local Studio (`127.0.0.1:46158`) and a fresh Chrome
profile (`127.0.0.1:9258`). The browser recorder used the rendered Studio UI
and browser mouse/keyboard events only.

`11-projects-after-restart.png` shows both persisted managed projects:
`P6 Random Owner` and `P6 Recommended Owner`. The successful
`reopen-browser-transcript.txt` records traversal to the visible **Open**
control for `P6 Random Owner`; `12-random-reopened.png` is the resulting
Workspace capture, showing its name, Blueprint type, Managed origin, and
valid status.

The original direct background launches were reaped by the host when their
shells ended; their terminal captures are retained as `02-*` / `04-*` and the
first recorder connection failure as `05-*`. The passing interaction used the
persistent Studio and Chrome terminal sessions captured in `06-*` / `07-*`,
and the final successful recorder terminal capture is `09-*`.
