# P6-20 independent host verification — finding

Candidate `f8a90bf40d8bbfb9bb29db6163e6473f8147dd25` and the required clean
companion `09a0889b8d335eeacbdb277c37376d97de96c268` were verified on Node
`v24.18.0`. The candidate package tarball was
`sha256:0e269e7b72239b0087f2342f1cfe022ae3a157e81b0f74dcbe39f8203c36f4a3`.

P1 `p6-20-current-candidate-player-parity`: the packed candidate omits its
declared client and CommonJS runtime files. The companion's real `npm start`
Vite workflow starts, but its public Fixture Slot entry cannot resolve
`pokie/client/player`. The generated fixture's real `npm start`/`pokie dev`
workflow and fresh Studio both report the missing
`node_modules/pokie/dist/cjs/index.js`; Studio visibly disables Play. Thus the
deterministic Player round and Replay cannot be reached through the requested
public workflow.

`studio-package-error.png` is the single representative fresh-browser Studio
capture. `verification-transcript.txt` contains the bounded command and UI
observations. No generated fixture, tarball, browser profile, server log, or
automation source is retained.
