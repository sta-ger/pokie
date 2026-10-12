# P10-03 evidence finalization: `f9e64020`

Date: 2026-10-11. This is an evidence-policy correction only; it does not
rerun a build, package, installation, test, or workflow, and it does not alter
the preceding semantic verdict.

The supplied candidate and starting HEAD were both
`f9e640204be5dce633abe23b7266f0ca22f9b592`. The preserved host result reported
that this candidate's product and build inputs were byte-equivalent to the
authenticated installed candidate
`b602442205d0e028318854f672c57cb911873171`. Its serial installed-only
collection passed all 12 records; its bounded result receipt SHA-256 was
`93ee7bc5a3d7099e8b3c92023afdd95b9fb63a43aa897ef8d125df8ca7e3e4cb`.

The durable, reviewable command, package identity, fixture checksums, expected
and observed fractional/omitted/zero/positive outcomes, tolerances, timings,
Node/WASM replay, and exact Outcome Library/report observations remain in the
[installed rerun transcript](p10-03-b6024422-installed-rerun.md). That
transcript is the retained proof surface for this result. The former absolute
runtime `result.json` locator is deliberately not retained or referenced here:
runtime artifacts remain outside the repository and are identified only by the
bounded checksum above.

The preserved result's criterion outcomes remain passed: installed generated
CJS and freshly recompiled TypeScript observed `0.01 * 5 = 0.05`,
`1.5 * 5 = 7.5`, and `1e-7 * 5 = 5e-7`; omitted B/3 and A/3 and explicit zero
paid zero, while configured positive wins remained correct. Its supported
line-game Node/WASM initial and later serialization replay completed without
RNG rewind, and its exact eight-outcome report had only AAA pay 5 at stake 1
(RTP 0.625, hit frequency 0.125), with no unauthored payout.
