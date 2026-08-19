# P6-20 Projects responsive closure — final host rerun

Candidate `2e80a2cf27877f28995d50ef99587f48a52c6b3f` was built with Node `v24.18.0` (`npm run build-cli`) and inspected in one fresh Chrome profile against one local Studio/client launch. The committed companion checkout was read-only, clean, and at required HEAD `09a0889b8d335eeacbdb277c37376d97de96c268`.

Chrome was visibly resized to 405 px. The real rendered Projects UI used labelled, vertical project cards rather than a compressed table. The card view retained identity/path, green Available or orange Needs attention status, type, origin, last-opened metadata, selection, and Open/Relocate/Remove controls. Rendered controls were used to filter by `Sample Slot`, select a missing record, enter and confirm bulk removal (one stale registration was forgotten; no project file was deleted), advance Page 1 to Page 2 of 68, and open an available Blueprint. Open completed in the visible Workspace overview.

No P0, P1, or material P2 defect was observed for Projects.

The only retained images are `02-projects-405-cards.png`, representative proof
of the 405 px card treatment, and `05-project-open-workspace.png`, proof that
the rendered Open action completed in Workspace. The other exercised controls
are recorded above without duplicate screenshots or a checksum manifest.

No browser profile, generated project/output tree, raw log, process file, or automation source is retained.
