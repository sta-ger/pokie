# P10-03 candidate-reader targeted verification

Date: 2026-10-11. This record preserves the controller-owned focused result for
the reviewed product candidate
`6a150cd2c3efbf40d67f3625298f181a37e44bd2`. Before and after the command, the
receipt records that exact HEAD and an empty dirty-state value. Local review
also found `HEAD` equal to that SHA before this evidence record was added.

## Controller result

The controller ran exactly one serial whole-file invocation (no name filter):

```sh
npm run test:targeted -- \
  tests/cli/studio-client/src/productionStudioCandidate.test.tsx \
  tests/scripts/p9-11-corrective-closeout.test.mjs \
  tests/scripts/p9-11-produce-candidate.test.mjs
```

Machine receipt: `/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/c1fc18c8a89051e35fd40fec/result.json`
(SHA-256 `6c6302c6ef01e4a50960083556b0c800d5340e72759a76eab02297d44a0499d0`).
Its retained stdout and stderr siblings have SHA-256 respectively
`7c8313860c393e3ca17bb7201da15c6518f8f6497450adcb147a90fcc80b6bdd` and
`7ea93db8bf207809b7652c62efbd5727b629c7693ded9135e26af3027e539ad8`.
They remain controller runtime payloads and are deliberately not copied here.

The receipt is `completed`, return code 0, not timed out, and reports 31.273 s
wall/monotonic duration. Its terminal Jest summary is **3 passed suites / 83
passed tests / 0 snapshots**, in 29.625 s, for precisely the three paths above.
The per-suite lines are `p9-11-corrective-closeout`, `p9-11-produce-candidate`,
and `productionStudioCandidate`.

## Scope checked and retained boundaries

The two P9-11 files exercise the shared reader/producer and closeout contracts:
normal build-and-pack aggregate identity, archive/install byte authentication,
native installed Studio selection, and success-receipt rejection unless process
tree/resource cleanup and stdio closure are complete. The Studio candidate file
also rejects checkout-dist fallback and stale installed assets. Thus this is
focused contract evidence for the candidate-reader correction, not a new build,
pack, installation, browser run, release gate, or publication.

The existing independent installed math result remains
[P10-03 independent installed rerun](p10-03-independent-installed-rerun.md),
bound to its original `a9a0ead57276d8c7ebb06b7c0369b9f66000068f` identity.
That commit is an ancestor of this candidate; it is preserved, not relabelled as
this targeted result. Existing browser/persona records remain under
[`docs/audit-corrections`](../audit-corrections/README.md) and are likewise
preserved rather than replaced by this Node/Jest receipt. Official packaging,
release and public-browser workflow gates remain controller-owned.
