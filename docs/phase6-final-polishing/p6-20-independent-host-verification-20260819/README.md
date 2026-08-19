# P6-20 independent host verification — finding

Candidate: `0e4a51cae737747c202841d521e522c6c4f0847e` (Node `v24.18.0`).
The normal candidate build completed, then `npm pack --ignore-scripts` produced
`pokie-1.3.0.tgz` with SHA-256
`188f2d1b6cb0a5871ad748a044dc3fc7f82afe66cf38b93450a7fe9b24573d3b`.

Two independent P1 findings block the requested parity claim:

1. A fresh HTTPS clone of public `sta-ger/pokie-examples` at
   `530c2c7ff709361d93fe60f59b20436be719d209` has no **Fixture Slot** or
   **Open deterministic round** surface. After installing the packed candidate,
   its real `npm run build` reached Rollup but failed because browser external
   `worker_threads` has no `Worker` export for
   `pokie/dist/esm/simulation/parallel/SimulationWorkerCoordinator.js`. The
   screenshot records the real public Vite index without the required fixture.
2. A fresh local Studio from this exact candidate rendered the registered
   fixture's **Open** action. A coordinate click on that visible control left
   the browser on Projects for 60 seconds; the fixture Workspace, Play, and
   Replay were not reached.

The package `npm start`, standalone `pokie client`, and `pokie dev` surfaces
each accepted `fixture-round`, created a session, and spun a nine-cell round.
The bounded audit did not claim full Player parity: its control enumerator
excluded the native rendered `Paytable` `<summary>`, so it stopped before its
post-spin paytable assertion instead of retrying that interaction.

Only this summary, a concise transcript, and one representative public-page
capture are retained. No generated tarball, clone, package tree, profile,
automation source, PID file, or raw log is committed.

| Retained file | SHA-256 |
| --- | --- |
| `public-pokie-examples-index-no-fixture.png` | `1422396ed557aeb9350bc3606ac3f9351af9f07cf7e84fb5078e8d9478c9cb7d` |
