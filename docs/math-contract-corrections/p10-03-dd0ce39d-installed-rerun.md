# P10-03 installed math-contract rerun: `dd0ce39d`

Date: 2026-10-11. The supplied checkout was clean at candidate and HEAD
`dd0ce39d3d6c2b113d271b0e185b179134fea1f9` (tree
`c7020f7d02de1d69019a2cfebd99bfcc758ec8d8`) before this evidence record.
The previous receipt was independently reauthenticated but not relabelled: its
three later candidate-tooling/test changes are not evidence of this result.

## Package identity and command record

One normal `npm run build` exited 0 in about 94.5 s, followed by one
`npm pack --ignore-scripts --pack-destination /tmp/p10-03-dd0ce39d-installed`
(exit 0, 7.289 s). The resulting `pokie@1.3.0` archive had SHA-256
`cf2ba9914fc919badbdbe8cff46a3590b8f9e4b1e36dbf6645a31367ff9dd326`.
Exactly one isolated installation outside the checkout used:

```sh
npm install --prefix /tmp/p10-03-dd0ce39d-installed/installation \
  --ignore-scripts --no-audit --no-fund \
  /tmp/p10-03-dd0ce39d-installed/pokie-1.3.0.tgz
```

It exited 0 in 11.049 s. The consumer authenticated the candidate/tree,
archive bytes and every installed packed file before resolving the installed
CJS, ESM, WASM and CLI entries. TypeScript 5.9.3 used `tsc.js` SHA-256
`2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983`.
The one installed-only consumer command was:

```sh
node scripts/math-contract-repro.mjs \
  --candidate /tmp/p10-03-dd0ce39d-installed/candidate.json \
  --compiler "$PWD/node_modules/typescript/lib/tsc.js" \
  --output /tmp/p10-03-dd0ce39d-installed/collection
```

It exited 0 in 15.669 s (2026-10-11T23:18:50.823Z--23:19:06.492Z), completed
all 12 required records, drained resources, and had no cleanup errors. Its
bounded `result.json` checksum was
`20dc8aa5830b2a434ebc3b1a7f5f167c29592993c0a6dab89936442ed27664ab`.
The five generated-TypeScript compiles exited 0 in 1219, 1205, 1139, 1180 and
1122 ms. Installed CLI `build` commands for `tsPackage`, WASM and exact Outcome
Library exited 0 in 1552, 1520 and 1758 ms; installed CLI `report` exited 0 in
1514 ms. Authentication commands (Git/tree, archive listing/type/listing,
extraction, resolution and compiler version) also all exited 0.

## Reproducible inputs and observations

The complete fixture constructors and assertions are the committed
[`math-contract-repro.mjs`](../../scripts/math-contract-repro.mjs). The run
used numeric available bets `[1, 0.01, 0.1, 1.5, 1e-7]`; fixture checksums were
fractional `3420681487f83a2a3168aa3ab8b6189ae068f3dd6e5067fc746e769606d8eeaa`,
omitted-symbol `20945838bc87b66e5872228def90820022c21efe41485fb10d965756869a8e7c`,
omitted-count `da58af26e50a3a48c94c4260bdb9739ef464f7d11cc5eb0a98ef829d5b282bab`,
explicit-zero `4c7d402bf61624e2b8fe3395f021b21ebc20265cef2ffb8e46cb805bb751c103`,
positive-control `b85f01fa785fa9af414e9e3ed78dd56065c1abb3d98f9e9e1de30f504911c2dd`,
and reachable line game `0ce55b403d6108e16a3cb180aaea9d3c9bcacfbaf3137621cc195a43ebd443e5`.

Both actual installed CJS and freshly recompiled generated TypeScript observed
`0.01 * 5 = 0.05`, `1.5 * 5 = 7.5`, and `1e-7 * 5 = 5e-7`, retaining numeric
scientific-notation bets. Omitted B/3 and omitted A/3 paid exactly zero with
no win record; explicit B/3=0 paid zero; configured B/3=2 correctly paid twice
the stake. Every comparison used
`32 * Number.EPSILON * max(abs(expected), 1e-7)`, with a separate absolute
credit-ledger tolerance so a positive payout cannot satisfy a zero expectation.

One serial reachable line-game session compared normal installed Node and WASM
play over ten commands, with initial and after-round-four serialization,
fresh restoration and replay without RNG rewind. Initial RNG state was
`2089752206` at credits `1000`; the later Node/WASM checkpoint agreed on state
`2593705482` and credits `997.39`. The retained parity checkpoint checksum was
`91e1db308dbf455a4e98834d8a52b8f7af95da33ea13781b90802ac7c1db4570`; WASM was
`caec0883c51552e26b994517116210d68712252b13ee037f5ccd822912823621`.

The same installed CLI built one exact, eight-unit-weight Outcome Library and
JSON report. Only AAA paid; total win was expected/actual `5` at stake 1, RTP
was `0.625`, and hit frequency was `0.125`, with no report issue or unauthored
payout. Manifest and report checksums were
`3976f4f8f69574f5e53874076aa0991f3155cda7cee66d91e9acf6586b185966` and
`3e38bf066a0e34719649283fc71ec374cae888e7dc67efe081565d0e2089a9c5`.

No runtime collection, generated game/package, archive, installation, raw log,
or browser artifact is committed. This transcript is the bounded proof surface;
the runtime collection is deliberately retained outside the repository by its
checksums and original absolute paths.
