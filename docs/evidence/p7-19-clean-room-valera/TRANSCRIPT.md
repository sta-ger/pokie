# Clean-room Valera journey

## Scope and provenance

- Candidate checkout HEAD: `3e9c3339c0d5afd4fb87423fe1f89eef5b5b14c1`.
- Fresh context: `mktemp -d /tmp/p7-19-clean-room.XXXXXX`, then
  `npm install --ignore-scripts --no-audit --no-fund --prefix <fresh>/install ./pokie-1.3.0.tgz`.
  It installed 99 packages and exited `0`.
- Pack command: `npm pack` exited `0`, producing the `pokie@1.3.0` tarball
  whose observed SHA-256 is in `CHECKSUMS.sha256`. The pack's `prepack` build
  completed before installation; no other build, install, or pack was started.
- Installed executable: `<fresh>/install/node_modules/.bin/pokie`; `--version`
  printed `1.3.0` and exited `0`. No command set `NODE_OPTIONS` or an increased
  heap limit.
- Before product work, only the installed package's `README.md` and
  `docs/cli.md` were read. The latter's public workflow specifies
  `build -> inspect -> validate -> sim -> report -> replay -> serve/dev`, and
  command help documented the direct Blueprint targets `outcomeLibrary` and
  `stakeAdapter`, as well as `report` and `diff`.

All paths below are paths inside that fresh temporary context. Commands were
run exactly through the installed executable; generated files were never edited.

## Command record

| Command | Exit | Public result / readback |
| --- | ---: | --- |
| `pokie create Valera --random --seed 719 --out valera.blueprint.json` | 0 | Created deterministic Game Blueprint `Valera`; the CLI printed the same reproduction command. |
| `pokie inspect valera.blueprint.json` | 0 | Identified a Game Blueprint and offered only public next actions: build `tsPackage`, `outcomeLibrary`, `stakeAdapter`, or PAR workbook. |
| `pokie build valera.blueprint.json --target outcomeLibrary --out valera-outcomes` | 0 | Direct export succeeded. It selected 5,000 deterministic bounded-coverage draws from 759,375 reel-stop combinations and wrote `manifest.json`, `index_base.json`, and `outcomes_base.jsonl`. |
| `pokie build valera.blueprint.json --target stakeAdapter --out valera-stake` | 0 | Direct export succeeded. It wrote `pokie-manifest.json`, `index.json`, `lookup_base.csv`, and `books_base.jsonl.zst`. |
| `pokie inspect valera-outcomes` | 0 | Identified Outcome Library; next actions were deep validation, exact report, simulation, local serving, or Stake export. |
| `pokie inspect valera-stake` | 0 | Identified Stake Engine export; next actions were exact report or comparison with another outcome source. It correctly did not advertise unsupported run/validate actions. |
| `pokie validate valera-outcomes --deep` | 0 | `valid yes`; `No issues found.` |
| `pokie validate valera-stake` | 0 | `valid yes`. One documented, non-failing warning says a reconstructed library hash differs because a Stake export cannot recover round IDs, full win breakdowns, or provenance; no error was reported. |
| `pokie report valera-outcomes --format markdown --out outcome-report.md` | 0 | Read back native exact analysis: base RTP `58.98%`, hit frequency `24.20%`, standard deviation `1.3428`. |
| `pokie report valera-stake --format markdown --out stake-report.md` | 0 | Read back Stake exact analysis with the same base RTP `58.98%`, hit frequency `24.20%`, and standard deviation `1.3428`. |
| `pokie diff valera-outcomes valera-stake --format json --out outcome-vs-stake.diff.json` | 0 | Both sides reported `issues: []`; base-mode RTP delta was `1.2212453270876722e-15`, with hit-frequency and zero-win deltas `0`—ordinary floating-point representation only. |

## Conclusions

The installed current CLI directly exported the fresh deterministic Blueprint to
both mutually consumable Outcome Library and Stake adapter formats without an
increased heap setting or internal-source knowledge. `inspect` guidance was
registered and runnable for each artifact surface, including the corrected
public `report <path>` and `diff <path> <otherPath>` continuation. Structural
readback, deep Outcome validation, Stake validation, reports, and cross-format
diff all completed. No P2-or-higher product finding was observed.

Only this transcript, the scope note, and checksums are retained. There are no
generated artifacts, logs, profiles, automation scripts, or hidden-state files
in this evidence directory.
