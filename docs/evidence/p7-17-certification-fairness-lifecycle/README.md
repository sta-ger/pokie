# P7-17 independent public lifecycle verification

Candidate: `4548dfb74383803436615c3821265d23c5d245ad`  
Status: **finding** — the packed, freshly installed public CLI cannot start the
requested Outcome Library/native-bundle portion of the lifecycle.

The tarball was made by this checkout's one completed `npm pack` build and
installed into a fresh `/tmp` directory; its SHA-256 was
`b9bdbe826afa7e663273b4abe116360a0d41a7d394b221749bdbad4292ea8164`.
The verifier invoked only the installed package entrypoint
`node <fresh>/node_modules/pokie/dist/cli/pokie.js`, never this checkout's
`node_modules/.bin/pokie`.

The first public command, Blueprint → TypeScript game package, completed with
exit 0 and emitted the package read back in the transcript.  The next required
public command, `outcomelibrary generate`, exited 1 with `Unknown command
"outcomelibrary"`.  Public `--help` also omits `outcomelibrary` and
`outcomesource`; both verb roots themselves return the same actionable unknown
command diagnostic.  Consequently no public path remains to produce the
required sampled library/native bundle or to perform the downstream
`outcomesource`, certification, and fairness lifecycle without substituting
private implementation calls or editing artifacts.

The one required serial complete-file machine run did pass: 16 suites, 235
tests, across the two integration suites, both command suites, every test file
under `tests/certification`, and every test file under `tests/fairness`.

See [TRANSCRIPT.md](TRANSCRIPT.md) for the bounded command/result record.
