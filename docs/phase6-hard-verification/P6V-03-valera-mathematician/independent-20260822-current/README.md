# P6V-03 independent current Studio journey

Candidate: `3d7bcfc8dce810ad067776d24c7f809419d49640` (the checkout HEAD). The verifier built that checkout, then used exactly `node ./dist/cli/pokie.js --no-open` for one Studio launch. A newly-created Chrome profile and XDG runtime registry were used; the existing P6V-03 documentation, source, and prior harness scripts were not consulted.

## Rendered journey transcript

- In Design Game, changed the rendered game id/name to `valera-mathematician` / **Valera Mathematician**. Studio showed valid Game basics, Layout, Symbols, Reels, Paytable, and Bets. The model used literal reel strips (`A,K,Q,J`; `A,K,Q,J`; `K,Q,J,J`; `K,Q,J,J`; `Q,Q,J,J`), A/K/Q/J paytable payouts, and 1/2/5 bets; it was saved as a managed Blueprint.
- Started a new Play session and pressed **Spin**. Studio rendered the settled first round, credits 999, and `Total win 0.00`.
- Ran the rendered Simulation with 200 rounds, then opened its full report: 200/200 rounds, RTP 66.00%, hit frequency 7.50%, max win 18.00. The visible low-sample/no-seed warnings are expected report qualifications, not product errors.
- In Replay, selected the recorded Play spin and loaded it. The rendered inspector reported a complete, inspectable artifact for round 1 and config hash `sha256:62a39c3123d430a6a9ac5c39df361ea8503528816757cf7d2b15f9e8dbf79416`.
- In Build/Export, generated the exact base outcome library: 1,024 outcomes, RTP 100.78%. Then ran Stake Engine Export (base); Studio rendered `Exported 4 file(s)`.

## Bounded proof

- `01-literal-reels.png` — rendered literal-reel modeler.
- `02-simulation-report.png` — settled simulation summary.
- `03-replay-recorded-spin.png` — loaded recorded Play artifact.
- `04-outcome-library-and-stake-export.png` — rendered exact outcome-library and Stake Engine success states.

Generated outputs are deliberately not committed. Their end-of-run SHA-256 values were:

```
blueprint.json                         2ecdde3874f045d807ac47ab59da2caa9311d2567faa742e46d0800419199ccb
outcomelibrary/index_base.json         1c1ca2479fbe71597fd88815225b4a3d3acdb024b9cb4d8b91f1804fbaba3c08
outcomelibrary/manifest.json           be14297620bba1dcbb70f62af364f6d620b55690adfcc08db2268679d88acbbf
outcomelibrary/outcomes_base.jsonl     fcb82a520650f2006dbe8adb6573b1e371f97b01be97dd449be65482c7f257fc
stakeengine/books_base.jsonl.zst       c0dc33f77175b4ee5e1a15afaee2a441360645bee7758e2cf1d829b63c66d901
stakeengine/index.json                 57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5
stakeengine/lookup_base.csv            a6ab06e0ae86547667fff1418a5d62aa3de9c4b53e7cd1d757cde2267c934dc0
stakeengine/pokie-manifest.json        affc1cf28e47791a45863326879e57dd2fa5fa38fe0af895011a320dc81f4157
```
