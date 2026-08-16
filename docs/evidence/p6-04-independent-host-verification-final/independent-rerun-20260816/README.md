# P6-04 independent host-side reopen rerun

Candidate `010f1c13c96cacb7b326e3deadcd71ce340ecb64` was exercised through a
newly started local Studio and a fresh browser client. The browser recorder
used the rendered Studio UI and browser mouse/keyboard events only.

Retained evidence is intentionally limited to the successful rerun:

- `10-provenance.txt` records the candidate and verification workflow.
- `reopen-browser-transcript.txt` records Projects → visible **Open** for
  `P6 Random Owner` → reopened Workspace after restart.
- `11-projects-after-restart.png` shows the persisted managed projects.
- `12-random-reopened.png` shows the reopened `P6 Random Owner` Workspace
  with Blueprint type, Managed origin, and valid status.

`CHECKSUMS.sha256` covers every retained artifact except the checksum manifest
itself.
