# P6-10 host-side Studio verification

Fresh production Studio assets were built from this candidate, then Chrome drove the rendered Studio UI over a local Studio server. `terminal-transcript.txt` records the public CLI preparation of a finite TypeScript package, native outcome-library bundle, and the Studio-generated Stake Engine export. The package and outcome-library UI runs both completed 24 rounds and exposed reports; their browser transcripts and screenshots are named by project type.

`browser-transcript-stake-export.txt` and screenshots `03`/`04` record the visible Studio Build/Export flow that generated the canonical library and wrote the Stake project. A fresh Studio server opened on that Stake project; `browser-transcript-stake-guidance.txt` and screenshot `05` show its direct Simulation route’s capability guidance. That rendered guidance contains neither `ENOTDIR` nor a package-path loading error.

The normal `npm run build` lint attempt is preserved in `build-transcript.txt`; it is blocked by unrelated existing ReplayTab lint violations and Node 18's incompatible Vite runtime. The succeeding direct build stages use the locally installed Node 24 runtime and are recorded in the same transcript.
