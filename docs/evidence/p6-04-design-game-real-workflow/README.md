# P6-04 Design Game Studio verification

This bounded evidence set records the successful browser workflow for the
P6-04 fix. It contains no browser profile, cache, database, binary, lock/PID,
or terminal/archive artifact.

## Representative browser evidence

- `01-recommended-created-workspace.png` — Recommended creation with the
  edited name `P6 Recommended Edited`, opened as a managed Blueprint.
- `02-recommended-play.png` and `02-recommended-simulation.png` — the edited
  Recommended project completed a spin and a 25-round simulation.
- `03-deterministic-random-generated.png` — the visible default seed
  `20260815` generated `Royal Grand Stampede`.
- `04-random-created-workspace.png` — that generated Blueprint was created,
  registered, and opened as managed.
- `05-after-restart-projects.png` — both managed projects remained listed with
  their edited/generated names after a fresh Studio and browser restart.

`workflow-browser-transcript.txt` and `restart-browser-transcript.txt` give
the concise observed action sequence. `managed-projects/` retains the two
Blueprint files produced by that workflow; `studio-config/pokie/projects.json`
is the corresponding two-project persisted registry used for the restart.

`CHECKSUMS.sha256` covers every retained evidence artifact above, excluding
this README and the checksum manifest itself.
