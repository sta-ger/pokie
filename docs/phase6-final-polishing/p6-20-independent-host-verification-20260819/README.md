# P6-20 independent host verification — finding

Candidate: `0e4a51cae737747c202841d521e522c6c4f0847e`; Node `v24.18.0`.
The candidate's normal build passed and `npm pack --ignore-scripts` produced
`pokie-1.3.0.tgz` (`sha256:188f2d1b6cb0a5871ad748a044dc3fc7f82afe66cf38b93450a7fe9b24573d3b`).

P1 `p6-20-current-candidate-player-parity`: the real public
`sta-ger/pokie-examples` checkout at
`530c2c7ff709361d93fe60f59b20436be719d209` installed that tarball, but its
public `npm run build` failed after Vite transformed 853 modules. Rollup
rejected `Worker` from browser-external `worker_threads`, imported by
`pokie/dist/esm/simulation/parallel/SimulationWorkerCoordinator.js`. The
public deterministic Player cannot render, so package-start/client/dev parity
cannot be established.

P1 `p6-20-current-candidate-player-parity`: a fresh headed Chrome profile
used only rendered-control coordinate input against a current-candidate Studio.
The visible registered fixture's **Open** button was clicked once. Thirty
seconds later Studio was still on Projects; Workspace, Play, and Replay were
not reached. `studio-open-post-click.png` records that post-click screen.

Only this summary, the concise transcript, and one representative screenshot
are retained. No tarball, clone, browser profile, automation source, raw log,
or generated output tree is committed.

| Retained file | SHA-256 |
| --- | --- |
| `studio-open-post-click.png` | `c5713513ab2415c2e0cfdc28e2165495484e54a369e2a9b3409f42ad78c556b7` |
