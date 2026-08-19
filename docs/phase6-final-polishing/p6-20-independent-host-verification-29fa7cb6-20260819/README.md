# P6-20 independent host verification — finding

Candidate: `29fa7cb693cc976ca3cdd118f53408ad8a109be9`; Node `v24.18.0`.
The normal candidate build passed and its packed tarball was
`sha256:ca4062ef85c7119ff553abe7a4f16a6b3a204baa874a16758e6f90b678eb591e`.

## Public `pokie-examples`

A fresh HTTPS clone of `sta-ger/pokie-examples` at
`530c2c7ff709361d93fe60f59b20436be719d209` installed that exact tarball.
Its public `npm run build` reached `853 modules transformed`, then Rollup
failed: `"finished" is not exported by "__vite-browser-external"`, imported
from `pokie/dist/esm/stakeengine/StakeEngineBundleStreamingExporter.js`
(`stream/promises`). This is a P1 browser-bundling defect: the packed
candidate cannot complete the public production build.

The reachable public Vite page still rendered the **Verifiable spin** fixture
in a fresh headed browser. One visible **Play** click produced a round and its
rendered audit trail (`rounds drawn so far: 2`, stop positions
`[22, 1, 22, 18, 18]`); `public-verifiable-spin.png` is the capture.

## Fresh Studio UI

One fresh headed Chrome profile against this candidate's local Studio used
only rendered controls and coordinate clicks: **Design Game → Create Project
→ Play → New Play session → Spin → Replay → Session Spin → Session 1**. The
recorded round loaded in Replay as **Full**, **Inspectable AVAILABLE**, and
**Exportable AVAILABLE**, with `Pokie version 1.3.0`; the representative
capture is `studio-replay-session-spin.png`. No P0, P1, or material P2 issue
was observed in this Studio path.

The two permitted public workflow launches were the public examples flow and
the fresh Studio flow. Consequently, the separate generated-package
`npm start`, `pokie client`, and `pokie dev` comparison was not launched in
this invocation; the parity criterion remains not reached. No generated
tarball, clone, Studio project, browser profile, source script, raw log, or
output tree is retained.

| Retained file | SHA-256 |
| --- | --- |
| `public-verifiable-spin.png` | `a5fc31288fecaed0cfd289a02a8170d8d0418ac1951e3697c2dc427cdfac618d` |
| `studio-replay-session-spin.png` | `5d031319941b9e67760b1b754fa6d868fd5dc2dbedfe8097792197629da2d646` |
