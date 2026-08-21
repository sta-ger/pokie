# P6V-02 exact-HEAD rendered audit

Candidate SHA: `1f700c9894be6dcec66abc1e08ed09876c2f7e30`.

On 2026-08-21, a fresh headed Chromium profile drove only rendered controls
against Studio launched from this checkout with `node ./dist/cli/pokie.js
--no-open`. `ACTION-TRANSCRIPT.txt` records the cold-start recovery and the
semantic completion states. The temporary managed project, generated outcome
library, Stake Engine export, browser profile, and diagnostic log were removed.

Desktop Design/Game Model/Play/Simulation/Replay/Build-Export all rendered and
completed. At 405px the document has no root horizontal scroll (`scrollWidth=405`),
but `08-build-export-mobile-405.png` shows the closed navigation still taking a
large left offset: the primary exact-outcome action is clipped. This is a P2
responsive-layout finding.

| Capture | SHA-256 | Rendered surface/state |
| --- | --- | --- |
| `00-initial-render.png` | `7fee3ed3d26443b947885db8cd2c8a21f06b95ec3541710fd823aeaa142aa1de` | Fresh desktop Design Game |
| `01-cold-start-design-desktop.png` | `7fee3ed3d26443b947885db8cd2c8a21f06b95ec3541710fd823aeaa142aa1de` | Desktop cold-start Design Game |
| `02-workspace-overview-desktop.png` | `3d43f996452822ce2b462c7c3f7b17d6958aa1b781e62ee045c06dbfa21c7db3` | Created workspace |
| `03-game-model-desktop.png` | `32c8ee254730fa4bf7dd6330ee8112a841b147862c952146db42712c592986b0` | Game Model |
| `04-play-success-desktop.png` | `789f2661fa596bfeaae2a03f988e277eb674df0075c0810975a0f7998413f47d` | Settled Play spin |
| `05-simulation-success-desktop.png` | `b55cb95657beadc02a46f4e1c04b1459da1b051ccb59b32f024a30dce0ecb29f` | One-round Simulation result |
| `06-replay-session-spin-desktop.png` | `3678548989ea160eed5aaee3c7e159ec658c01adad931472770e5b4565571422` | Replay Session Spin surface |
| `07-build-export-success-desktop.png` | `53a8ea2ebde062b6b164f292d79c8617889dc49a2604278ffd8d1726c19a0568` | Outcome and Stake Engine success |
| `08-build-export-mobile-405.png` | `e2ea1634b99475822234b307a042b891567ac1cf12f4ac7e5eeb1461a10d5e65` | 405px clipped Build/Export action (P2) |
| `09-reel-strip-modeler-mobile-405.png` | `f367c4ed066f08f8ff35b88fcd095ab838d84eebc9987d9a14eccc25d877a45a` | 405px Reel Strip Modeler |
