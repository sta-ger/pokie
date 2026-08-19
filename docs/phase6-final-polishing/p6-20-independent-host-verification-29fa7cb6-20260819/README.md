# P6-20 independent host verification — finding

Candidate verified: `29fa7cb693cc976ca3cdd118f53408ad8a109be9`.

The exact candidate completed its normal `npm run build` under Node
`v24.18.0`; `npm pack --ignore-scripts` produced `pokie-1.3.0.tgz` with
SHA-256 `5b76f8323c698a136f16e545feee64d5963d4aabfc6b8aacb4e70226199aa191`.

A fresh HTTPS clone of the public `sta-ger/pokie-examples` repository at
`530c2c7ff709361d93fe60f59b20436be719d209` installed that tarball and ran
its public `npm run build`. Vite transformed 853 modules then Rollup failed:
`finished` is not exported by `__vite-browser-external`, imported from
`pokie/dist/esm/stakeengine/StakeEngineBundleStreamingExporter.js`
(`stream/promises`). This is P1 `p6-20-current-candidate-player-parity`:
the packed candidate does not build in the public browser consumer.

A fresh headed Chrome attempt against the public Vite page did not reach a
rendered fixture, and the fresh local production Studio process stopped before
its Design screen could render. Those UI portions are recorded as not reached;
they do not alter the packaging finding. No screenshot was retained because
neither reached a representative rendered state.

Only this README and the concise transcript are committed. The rejected run's
screenshots, temporary clones, packages, profiles, server logs, and temporary
browser harness were removed.
