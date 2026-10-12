# P10-03 installed math-contract rerun: `b6024422`

Date: 2026-10-11. This independent host result is bound to clean candidate
`b602442205d0e028318854f672c57cb911873171` (tree
`56a6708bd83bc7e13f33f7709335cfd7a9340eae`), rather than older P10 receipts.

## Package and collection

One normal `npm run build` exited 0 (about 70.1 s); one
`npm pack --ignore-scripts --pack-destination /tmp/p10-03-b602-1McODV` exited 0
(7.199 s). The resulting `pokie@1.3.0` archive SHA-256 was
`cf2ba9914fc919badbdbe8cff46a3590b8f9e4b1e36dbf6645a31367ff9dd326`.
Exactly one isolated installation, outside the checkout, used:

```sh
npm install --prefix /tmp/p10-03-b602-1McODV/installation \
  --ignore-scripts --no-audit --no-fund /tmp/p10-03-b602-1McODV/pokie-1.3.0.tgz
```

It exited 0 in 14.744 s. The one installed-only consumer invocation was:

```sh
node scripts/math-contract-repro.mjs \
  --candidate /tmp/p10-03-b602-1McODV/candidate.json \
  --compiler "$PWD/node_modules/typescript/lib/tsc.js" \
  --output /tmp/p10-03-b602-1McODV/collection
```

It exited 0 in 16.143 s (2026-10-11T22:37:19.771Z--22:37:35.914Z), after
authenticating candidate tree, archive digest and installed bytes before
resolving installed CJS, ESM, WASM and CLI. The result was `passed`, completed
all twelve records, drained resources and had no cleanup errors. TypeScript was
5.9.3 (`tsc.js` SHA-256
`2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983`). All
recorded child commands exited 0, including five generated TS compiles
(1129--1294 ms), installed CLI builds for tsPackage (1663 ms), WASM (1560 ms),
exact Outcome Library (1848 ms), and report (1577 ms).

## Inputs and observed results

The complete fixture constructors and assertions are
[`math-contract-repro.mjs`](../../scripts/math-contract-repro.mjs). Every
fixture used numeric available bets `[1,0.01,0.1,1.5,1e-7]`, one row and one
line. Fixture checksums: fractional
`3420681487f83a2a3168aa3ab8b6189ae068f3dd6e5067fc746e769606d8eeaa`; omitted
symbol `20945838bc87b66e5872228def90820022c21efe41485fb10d965756869a8e7c`;
omitted count `da58af26e50a3a48c94c4260bdb9739ef464f7d11cc5eb0a98ef829d5b282bab`;
explicit zero `4c7d402bf61624e2b8fe3395f021b21ebc20265cef2ffb8e46cb805bb751c103`;
positive control `b85f01fa785fa9af414e9e3ed78dd56065c1abb3d98f9e9e1de30f504911c2dd`;
reachable line game `0ce55b403d6108e16a3cb180aaea9d3c9bcacfbaf3137621cc195a43ebd443e5`.

All ten generated-package records passed: fractional, omitted-symbol,
omitted-count, explicit-zero and positive-control in CJS and freshly compiled
TS. Available bets stayed numeric; expected/actual `0.01 * 5` was `0.05`,
`1.5 * 5` was `7.5`, and `1e-7 * 5` was `5e-7`. Omitted B/3 and omitted A/3
paid exact zero with no win record; explicit B/3=0 paid zero; authored B/3=2
paid twice stake. The tolerance was
`32 * Number.EPSILON * max(abs(expected), 1e-7)`, with a separate absolute
credit tolerance, so a positive expected amount cannot pass as zero.

The reachable line game compared normal installed Node/WASM play with initial
and after-round-four serialized continuation, fresh restore and replay for ten
commands without RNG rewind; screens, stakes, payouts, credits and RNG state
agreed. The installed CLI exact Outcome Library/report had eight unit-weight
outcomes: only AAA won, total win 5 at stake 1, RTP 0.625, hit frequency 0.125,
and no report error or unauthored payout.

Bounded runtime checksums: result
`6d58883a40b5ae9e65a434103cd0ec3517fec9080b7878f68c42c508b32743a1`; WASM
`caec0883c51552e26b994517116210d68712252b13ee037f5ccd822912823621`; parity
checkpoint `91e1db308dbf455a4e98834d8a52b8f7af95da33ea13781b90802ac7c1db4570`;
Outcome manifest `29a02ead9f3b892e229d8c92f073aa4a423fc2c571350408317c72408e6346df`;
report `2e9e4ab8befb15d5a401eaf0e0dd049f82820ce16a9e834395837e8bf31e172b`.
Generated packages, artifacts, raw logs and the isolated installation remain
outside the repository.
