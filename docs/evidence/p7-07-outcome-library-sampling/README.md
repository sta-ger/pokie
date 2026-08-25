# P7-07 independent packed CLI verification

Candidate: `dbabb512c8cb3c75f031cae94d763a6893115ca1` (`pokie@1.3.0`).  The
source checkout was clean before packing.  `npm pack --pack-destination <fresh
temp>` built that checkout, then its `pokie-1.3.0.tgz` was installed into a
separate fresh directory with `npm install --ignore-scripts --no-package-lock`.
Only `<temp>/install/node_modules/.bin/pokie` was used for the public CLI
lifecycle; no checkout CLI or private API was used.

Provenance checksums:

- tarball: `6daf3289ab301eda4a9d73018590326fe6ec3419b41ecbc28232d97d82bd6fda`
- installed `dist/cli/pokie.js`: `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`

The large Blueprint has three 300-stop reels: `300^3 = 27,000,000` raw
positions. `build --target outcomeLibrary --sample 12 --seed p7-07-seed-alpha`
reported a manifest generator of `strategy=bounded-coverage`,
`totalOutcomeSpaceSize=27000000`, and `sampledRawCount=12`, showing direct
sampling rather than exact enumeration. Exact choice was also exercised on a
small 2x3 fixture using `--exact` (exit 0).

Same-seed sampled outcome-stream SHA-256 values matched:
`3098b5f51543c1599ecf6d8563fa2b15162f7fb5ecf9aca96f1eae6e4bb12095`.
Changing only the seed produced
`fd22d4cb4543194601f2bf04a03e9b4f3bad0b7fd7b53315ae1c5dbba6199416`.
The two same-seed manifest files differ only in the volatile `generatedAt`
timestamp; their generated stream and index/library hash are identical.

See [TRANSCRIPT.md](TRANSCRIPT.md) for commands, exit codes, concise
artifact readback, server check, invalid-option diagnostics, and the required
whole-file targeted-test result.
