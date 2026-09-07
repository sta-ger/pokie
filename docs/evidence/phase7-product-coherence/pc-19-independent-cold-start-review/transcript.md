# Rendered public-workflow transcript

The candidate source launched Studio at `http://127.0.0.1:3200` in a newly
created Studio and Chromium profile. The following single-click actions had the
listed rendered local terminal states:

| Ready control | Activation | Rendered local terminal |
| --- | --- | --- |
| Create game | one click | workspace and `Your game was saved` |
| New Play session | one click | enabled `Spin` session with 1000 credits |
| Spin | one click | `Round complete — no win this round`, 999 credits |
| Run Simulation | one click | 10,000/10,000 rounds, RTP 99.82%, full report controls |
| Generate exact outcome library (base) | one click | `Generated 1,024 outcomes for mode "base" using exact` |

The first launch's fixed wait expired while Simulation was already completing;
the later rendered result above reconciled that threshold as a success, not a
product failure. The repeated fresh-profile lifecycle run produced no rendered
product error. Missing mission coverage is a bounded driver/coverage limitation,
not a claimed product finding.
