# P6V-02 exact-candidate rendered audit

Candidate SHA: `734ddfe8ed1db338ad0b3a1224fc3fdace692dd0`.

On 2026-08-21, a fresh Chrome profile drove only rendered controls against the
current Studio source browser client and its local Studio backend. The bounded
run used no direct API calls for user actions. `ACTION-TRANSCRIPT.txt` records
the cold-start invalid-draft recovery and semantic completion states.

Desktop Design/Game Model/Play/Simulation/Replay/Build-Export all rendered and
completed. At 405px, `08-build-export-mobile-405.png` shows the exact-outcome
action fully visible. The measured closed-navigation state was
`scrollWidth=405`, `mainPaddingInlineStart=16px`, and action bounds
`left=39`, `right=287.109375`; the audit fails if the action is clipped.

| Capture | SHA-256 | Rendered surface/state |
| --- | --- | --- |
| `00-initial-render.png` | `036c4931612ec6873064a35b54a497f762bc61f798f4d075c58ae4066112ea7b` | Fresh desktop Design Game |
| `01-cold-start-design-desktop.png` | `5b31eb149bd3af02f2e414b6efcd8a67f03fcdec1133d1bc8f48828f8f74f222` | Desktop cold-start Design Game |
| `02-workspace-overview-desktop.png` | `355486db229fc62829fc03ae30366e2365acd3b1c9125fb218f64c3eb0ba9120` | Created workspace |
| `03-game-model-desktop.png` | `4dcb065ff297c6d4c293424ee2f7622a0e16e79de7878a6bd7064dcd20919c56` | Game Model |
| `04-play-success-desktop.png` | `566b5f058ab5d3f2eee56a0581953e717d8e5b9ebc75102a82fbb62249197397` | Settled Play spin |
| `05-simulation-success-desktop.png` | `9299019a9679fdc9a0833a274c40a41341ae6501621d1f3595a38238542bf290` | One-round Simulation result |
| `06-replay-session-spin-desktop.png` | `0c5ac742e769a1327a527d2ab7a23f17f0ec77ebd80963c6d2cb2786891eae82` | Replay Session Spin surface |
| `07-build-export-success-desktop.png` | `e3269678a47261d23a6cebb2769adc7572c96eb263bdd0ceffb0ba625ae9ea83` | Outcome and Stake Engine success |
| `08-build-export-mobile-405.png` | `4f4297003c2b42112c3d764eacf2ebf67501c6f19f370571c6e19b4b989e30fa` | 405px visible Build/Export action |
| `09-reel-strip-modeler-mobile-405.png` | `471fea59d37e165ddcab1eca61bdf2bfc2772b4879a3c5fa5b31a6e9202a3cdf` | 405px Reel Strip Modeler |
