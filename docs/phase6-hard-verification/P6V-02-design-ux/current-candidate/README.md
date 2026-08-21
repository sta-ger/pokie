# P6V-02 exact-candidate rendered audit

Candidate SHA: `540a60ebd2a1f3a5c9d4cdf0bfcde96f8085b4b0`.

`npm run build-cli` completed before the retained fresh candidate Studio/browser
runs. `ACTION-TRANSCRIPT.txt` records rendered-control observations only. A
fresh recovery launch used `node ./dist/cli/pokie.js --no-open`, imported a
real local package through Home Projects, built a TypeScript package through
Studio, then generated and opened its exact outcome library through Studio's
public project route. This reached the capability-gated surfaces without any
private API calls or DOM/state injection.

| Capture | SHA-256 | Rendered surface/state |
| --- | --- | --- |
| `00-initial-render.png` | `036c4931612ec6873064a35b54a497f762bc61f798f4d075c58ae4066112ea7b` | Fresh desktop Design Game |
| `01-cold-start-design-desktop.png` | `5b31eb149bd3af02f2e414b6efcd8a67f03fcdec1133d1bc8f48828f8f74f222` | Desktop cold start |
| `02-workspace-overview-desktop.png` | `d356c35da5212f0df387adc6534ee32728d9ee8bed64a297c40ccecff07fe650` | Created Workspace |
| `03-game-model-desktop.png` | `c73c803f4c403cb7b877fbe5bb77caddcc634189820c1959d3d1af0ecd7322f0` | Game Model sections |
| `04-play-success-desktop.png` | `f224340235b28f6ea977545cac334bea021a01de6be183c22eb800b1ba70fc8d` | Settled Play spin |
| `05-simulation-success-desktop.png` | `d5387a8e2894610ad1346caecd87e3210b110e2e45a8516c6fd58137fa1c1d87` | One-round Simulation result |
| `06-replay-session-spin-desktop.png` | `09b7878f1c29685ec2133ee4e57645cceaecd0277624011f45540bd51bd43b09` | Replay Session Spin |
| `07-build-export-success-desktop.png` | `1d39868af49138294c4a90b128ae21c19d9291ea1f252e59f2e0cc2d377404f6` | Outcome and export success |
| `08-build-export-mobile-405.png` | `4f4297003c2b42112c3d764eacf2ebf67501c6f19f370571c6e19b4b989e30fa` | 405px visible primary action |
| `09-reel-strip-modeler-mobile-405.png` | `724855ba0e8446de46fa21566bd2fd13b498ec929a5f863a3e3ba9be3498480f` | 405px Reel Strip Modeler |
| `10-qualified-package-outcome-success-desktop.png` | `94f867470068c6343e02c3d22a999bd90ef9651d52f2338ae3c3e2531b61e9f5` | Candidate-built package, exact outcome-library success |
| `11-qualified-provably-fair-success-desktop.png` | `35694a1a5fd1677687d4dcb2275034787982ad63b667790c4e935507000cb3f5` | Verified Provably Fair round proof |
| `12-qualified-provably-fair-success-mobile-405.png` | `6d9aa345b5648df899e2843e75f044c68f6161b5b7b4376daf34266f99df245d` | Verified Provably Fair at 405px |
| `13-qualified-certification-clean-desktop.png` | `a52a0d266b830a5da3e48ea177ee9082ac45da9ae108f54a7093cbbc079410fb` | Clean Certification source validation |
| `14-qualified-certification-warning-desktop.png` | `46a0731d1259ebca525a11408a1af922bc98c5e217732fffcd39d17ef77f539e` | Certification stale-validation warning and recovery |
| `15-qualified-certification-warning-mobile-405.png` | `dd3733abcdec1b5bdef60a11ca468969ef298b160b88c00b0c30e7960cf80d5b` | Certification warning at 405px |

The recovery launch first displayed the supported precise error for a fixture
without exact enumeration; it was not retried. A candidate-built package then
completed the exact-generation and proof workflow. Certification first rendered
`Clean — No issues reported`; changing its source path deliberately rendered the
actionable stale-validation warning. The disabled Build/Inspect/Export steps,
empty pre-configure form, and loading controls were rendered during the same
workflow. The first picker click had no rendered transition; one safe retry
opened the host `zenity` native picker, which was cancelled with Escape without
changing a path or writing output. No rendered product defect was observed.
