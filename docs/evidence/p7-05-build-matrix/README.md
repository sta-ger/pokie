# P7-05 current-candidate independent matrix rerun

Candidate: `673a9bea3195a33adf8269575d3ae1bc8403a5a0`.

The required single serial `npm run test:targeted -- <16 complete files>` command
reported **16/16 passing suites** and **1,488/1,488 passing tests**. Jest then
retained an open handle after printing that final summary; the already-complete
runner was terminated before any next command.

The candidate was rebuilt successfully. Fresh temporary sources exercised all
nine supported CLI cells, each with its default-output `--dry-run` (no default
path was created), an explicit-output build, and `pokie inspect` structural
readback. A non-empty explicit destination refused the build and preserved its
only sentinel file. No staging paths remained. Two Outcome-library requests
correctly reported reuse of the compatible managed Outcome Project; the rendered
and CLI output identify that actual result rather than claiming the requested
path was written.

Studio was launched twice, each time only as `node ./dist/cli/pokie.js --no-open`.
The second fresh visible Studio session used Projects → Detect → Register → Open
→ Build/Export and rendered successful `Built to …` results for Blueprint →
TypeScript package, Outcome Library, and Stake Engine export. The next visible,
idempotent Outcome Library build remained `Status: Ready to build` after its
single safe retry, without a pending, accepted request, or rendered product
error. Consequently the remaining public-UI cells are selector/driver
inconclusive, not a product finding. The complete bounded observations and
checksums are in `matrix-observations.json`; generated sources, output trees,
browser profiles, automation, and logs were removed.
