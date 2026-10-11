# P10-03 independent installed math-contract rerun

Date: 2026-10-11. One serial independent host execution ran against the clean
product candidate `a9a0ead57276d8c7ebb06b7c0369b9f66000068f` (tree
`43c831e616ae45898fca6506a5f58b94eaa27909`), not a source import or edited
reference session.

## Package identity and invocation

One normal `npm run build` and one `npm pack --ignore-scripts` completed with
exit code 0. That archive was installed once into a fresh isolated consumer with
`npm install --prefix <isolated-consumer> --ignore-scripts --no-audit --no-fund
<archive>` (exit 0, 12,200 ms). It was `pokie@1.3.0`, SHA-256
`cf2ba9914fc919badbdbe8cff46a3590b8f9e4b1e36dbf6645a31367ff9dd326`.
The runner authenticated the candidate tree, archive contents and installed
bytes, then resolved installed CJS `dist/cjs/index.js`, ESM `dist/esm/index.js`,
WASM `dist/esm/wasm/browser.js`, and CLI `dist/cli/pokie.js`.

```sh
node scripts/math-contract-repro.mjs \
  --candidate /tmp/p10-installed-math-ALxpZ7/candidate.json \
  --compiler "$PWD/node_modules/typescript/lib/tsc.js" \
  --output /tmp/p10-installed-math-ALxpZ7/collection
```

This command exited 0 in 20,036 ms (started `2026-10-11T16:36:17.243Z`,
finished `2026-10-11T16:36:37.279Z`), with `status: passed`, drained resources
and no cleanup errors. Authentication command timings were 9 ms (tree), 51 ms
(archive list), 58 ms (type list), 181 ms (extract), 40 ms (native resolution),
and 147 ms (TypeScript 5.9.3). The compiler was `tsc.js` SHA-256
`2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983`.
The five generated TS fixture compiles exited 0 in 1,143, 1,167, 1,142, 1,193
and 1,138 ms. Installed CLI builds for TypeScript, WASM and exact library exited
0 in 1,527, 1,467 and 1,674 ms; installed CLI report exited 0 in 1,468 ms.

## Complete inputs and results

All fixtures use `rows:1`, `symbols:["A","B"]`, empty wild/scatter lists,
one all-zero payline and numeric `availableBets:[1,0.01,0.1,1.5,1e-7]`. Their
complete varying content, as executed, was:

```json
{"fractional":{"reels":3,"reelStrips":[["A"],["A"],["A"]],"paytable":{"A":{"3":5}}},"missing-symbol":{"reels":3,"reelStrips":[["B"],["B"],["B"]],"paytable":{"A":{"3":5}}},"missing-count":{"reels":5,"reelStrips":[["A"],["A"],["A"],["B"],["B"]],"paytable":{"A":{"5":10},"B":{"5":2}}},"zero":{"reels":3,"reelStrips":[["B"],["B"],["B"]],"paytable":{"A":{"3":5},"B":{"3":0}}},"positive":{"reels":3,"reelStrips":[["B"],["B"],["B"]],"paytable":{"A":{"3":5},"B":{"3":2}}},"reachable":{"reels":3,"reelStrips":[["A","B"],["A","B"],["A","B"]],"paytable":{"A":{"3":5}}}}
```

The complete constructor and assertions remain in
[math-contract-repro.mjs](../../scripts/math-contract-repro.mjs). Fixture
checksums: fractional `3420681487f83a2a3168aa3ab8b6189ae068f3dd6e5067fc746e769606d8eeaa`,
missing-symbol `20945838bc87b66e5872228def90820022c21efe41485fb10d965756869a8e7c`,
missing-count `da58af26e50a3a48c94c4260bdb9739ef464f7d11cc5eb0a98ef829d5b282bab`,
zero `4c7d402bf61624e2b8fe3395f021b21ebc20265cef2ffb8e46cb805bb751c103`,
positive `b85f01fa785fa9af414e9e3ed78dd56065c1abb3d98f9e9e1de30f504911c2dd`,
reachable `0ce55b403d6108e16a3cb180aaea9d3c9bcacfbaf3137621cc195a43ebd443e5`.

All ten CJS/compiled-TS cases passed: `fractional`, `missing-symbol`,
`missing-count`, `zero` and `positive` in each format. For both formats, the
fractional rows were expected/actual `0.01 → 0.05`, `1.5 → 7.5`, and
`1e-7 → 5e-7`; available bets stayed numeric. Omitted B/3 and A/3 paid exactly
0 with no win record, explicit B/3=0 paid 0, and configured B/3=2 paid twice
stake (including 0.02, 3 and 2e-7). Amount tolerance was
`32 * Number.EPSILON * max(abs(expected), 1e-7)`; ledger tolerance was that
budget scaled to absolute credits.

The reachable supported line fixture performed normal installed Node/WASM play
for ten commands, captured initial and after-round-four checkpoints, then
restored and replayed both continuations without RNG rewind. Screens, payouts,
credits and RNG states agreed. Runtime-only output checksums were WASM
`caec0883c51552e26b994517116210d68712252b13ee037f5ccd822912823621`, descriptor
`9ecc6abe80da5d4c87ef3babc5c8d7706a2f88c69daacf38c8196c9317dffba6`, and
parity checkpoint `91e1db308dbf455a4e98834d8a52b8f7af95da33ea13781b90802ac7c1db4570`.

The installed CLI exact library/report had eight unit-weight outcomes: only
`AAA` won, total win was 5 at stake 1, RTP 0.625 and hit frequency 0.125; report
issues contained no error. Instead of committing generated output, retained
checksums are manifest `bc72ed3b89cf22f7db8f3d84e8d105dc8a740549452b7532aa36622d078389ec`,
index `156b83194508f6d86cd6860b0488962b1f7a6ff755fdc947f5cc4a6b51e16c88`,
outcomes `5eb70e8703028bd753dbe600449fa4c6c9d9a836147843d5bd61fdd86e99b472`, and
report `86b8857be07a78bbbf15c82aea96b713c055220ef2c8bc7c3fd629b59ae8f9d9`.

No retry was used. The runtime collection remains outside the repository; no
generated project/output tree, raw log, browser profile or automation source is
committed. This closes the independent installed rerun only; release,
publication and Drive lifecycle work remains pending with the controller.
