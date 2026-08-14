# P6-02 actual-candidate host browser verification

Candidate: `30b9a5cf290896f73930af946da598f838a94932`.

Result: **finding P2** (`p6-02-registry-lifecycle-cache-bypass`). The actual
candidate Studio bundle was rebuilt with a temporary Node 24 runtime. The
bundle contains both the timestamped `refresh` query and `cache: no-store`
(`06-built-candidate-registry-call.txt`). The normal Studio build command
exposed an unrelated TypeScript failure (`01-build-cli.log`), so Vite's actual
production build was used to serve the candidate source; it completed with
Node 24 (`06-vite-node24-production-build.log`).

The browser driver used rendered-element discovery and Chrome mouse/keyboard
events only. It did not call Studio product APIs or inject DOM/application
state. `browser-action-transcript-create.txt` records a guided Blueprint Save
and its visible managed row. The host then moved precisely that saved directory
without changing the Blueprint inode, size, mode, or SHA-256
(`09-host-external-move-and-integrity.txt`).

After the host move, normal visible Studio navigation from **Design Game** back
to **Projects** timed out after 30 seconds (`browser-action-transcript-remount-after-move.txt`).
The rendered capture `07-post-reload-missing-status-timeout.png` and companion
text still show the old path with **Open** and **Remove**, not `(missing)` and
**Relocate**. This fails the required visible refresh acceptance criterion.

For boundary diagnosis, a fresh Studio/client restart then truthfully rendered
the same entry as `(missing)` with **Relocate** (`10-after-studio-restart-status.*`).
The public Relocate form repaired the canonical record without a duplicate
(`08-relocated-managed-no-duplicate.*`); the zero-byte hash diff in
`14-relocation-file-integrity-diff.txt` shows no file mutation. A final fresh
Studio/client restart retained the one relocated managed row with **Open** and
no missing marker (`10-after-studio-restart-truthful-status.*`).
