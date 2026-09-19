# Independent verification provenance — 2026-09-19

Machine-recorded candidate: `8af6b3589b844ba935ba0f093e02cd2c0e6e71d3`.
The evidence-only commit carrying this file has the Git trailer
`Verified-candidate: 8af6b3589b844ba935ba0f093e02cd2c0e6e71d3`; its parent is
that candidate.  The verifier ran `npm run build-cli`, then executed the
persistent harness entrypoint, which launched this checkout's
`node ./dist/cli/pokie.js --no-open` audit path.  The timestamped rendered
workflow record is `AUDIT-TRANSCRIPT.txt`.

SHA-256 screenshot digests:

- `wide-project-overview.png`: `37476db8c91540719c62f35877c2e9df28e17e5f2b1f521d7fa570b859e80aeb`
- `compact-simulation-running.png`: `11d7283431cb0858af7e29a01e0fe28b6bf678645fd030fa65deca3f94deae1c`
- `compact-simulation-cancelling.png`: `dde479ee5ff677be26d89e07feab8a82369755134e089a577b1c4724cf45c08e`
- `compact-simulation-cancelled.png`: `48308a367ec0c15668698293f0b1d72922227a927d6f329b964592877755af64`
- `wide-simulation-completed.png`: `71291adc1a598c2895ca2a86f6731becd06c21c4c65ee70a91757952529f9c3a`
- `small-navigation.png`: `72a5edccc77859d990d308fa9d4768a76dc0c578897af6089e8598ba0fb86c5f`
