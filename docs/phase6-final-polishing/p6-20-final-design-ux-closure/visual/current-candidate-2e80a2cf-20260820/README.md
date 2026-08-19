# P6-20 Projects responsive closure — independent host rerun

Candidate `2e80a2cf27877f28995d50ef99587f48a52c6b3f` was built with Node `v24.18.0` (`npm run build-cli`) and inspected in one fresh Chrome profile against one local Studio/client launch. The committed companion checkout was read-only, clean, and at required HEAD `09a0889b8d335eeacbdb277c37376d97de96c268`.

Chrome was visibly resized to 405 px. The real rendered Projects UI used labelled, vertical project cards rather than a compressed table. The card view retained identity/path, green Available or orange Needs attention status, type, origin, last-opened metadata, selection, and Open/Relocate/Remove controls. Rendered controls were used to filter by `Sample Slot`, select a missing record, enter and confirm bulk removal (one stale registration was forgotten; no project file was deleted), advance Page 1 to Page 2 of 68, and open an available Blueprint. Open completed in the visible Workspace overview.

No P0, P1, or material P2 defect was observed for Projects.

| Evidence | SHA-256 |
| --- | --- |
| `01-projects-405-controls.png` | `342fe60370b54a96167c2ab24f314a24ef4530af965d71dd96f0f672ad680692` |
| `02-projects-405-cards.png` | `fd9c1f749d3f29a5d70b7b0de810d8d1d73ff75f19ee07f26f50f8e71e7cc3e3` |
| `03-projects-filter-selection.png` | `0fb2711eae8daf0f2fa81d7c7092068a34310307b1bd552ac4b9a3a326738d81` |
| `04-projects-pagination.png` | `c87ba81c2f20b77dcdeb0765ccf9585cd50573cdfb253da787f24cca4002917e` |
| `05-project-open-workspace.png` | `1484846f945569c5e023ca31b984c4b012654c13cd7b17cf269fbe143a1c7a4a` |

No browser profile, generated project/output tree, raw log, process file, or automation source is retained.
