# P6V-02 exact-candidate rendered audit

Candidate SHA: `35e3388c1c8afab49ce3239adca4d7f63109dfed`.

On 2026-08-21, `npm run build-cli` built the candidate CLI and Studio client;
a fresh Chrome profile then drove only rendered controls against its local
Studio backend. The bounded run used no direct API calls for user actions.
`ACTION-TRANSCRIPT.txt` records the cold-start invalid-draft recovery and
semantic completion states.

Desktop Design/Game Model/Play/Simulation/Replay/Build-Export all rendered and
completed. At 405px, `08-build-export-mobile-405.png` shows the exact-outcome
action fully visible. The measured closed-navigation state was
`scrollWidth=405`, `mainPaddingInlineStart=16px`, and action bounds
`left=39`, `right=287.109375`; the audit fails if the action is clipped.

| Capture | SHA-256 | Rendered surface/state |
| --- | --- | --- |
| `00-initial-render.png` | `036c4931612ec6873064a35b54a497f762bc61f798f4d075c58ae4066112ea7b` | Fresh desktop Design Game |
| `01-cold-start-design-desktop.png` | `5b31eb149bd3af02f2e414b6efcd8a67f03fcdec1133d1bc8f48828f8f74f222` | Desktop cold-start Design Game |
| `02-workspace-overview-desktop.png` | `c9bb14e34bb8c95e777d1a0a96afbcebdf59c3f21835d34729468472af4e57ed` | Created workspace |
| `03-game-model-desktop.png` | `4dcb065ff297c6d4c293424ee2f7622a0e16e79de7878a6bd7064dcd20919c56` | Game Model |
| `04-play-success-desktop.png` | `a124e9857fd41a34b41a3480ba6e0ca10d9a7a65c9ea6c1bd4c0a21d8eee6c2a` | Settled Play spin |
| `05-simulation-success-desktop.png` | `7d3fb0d89b66af8a52139772e64fb775532db4acae53a6adfa30eadbac53074d` | One-round Simulation result |
| `06-replay-session-spin-desktop.png` | `0c5ac742e769a1327a527d2ab7a23f17f0ec77ebd80963c6d2cb2786891eae82` | Replay Session Spin surface |
| `07-build-export-success-desktop.png` | `057bbc1fd903cbeed2737fe74183afb4d5d32020d1e5a71a26b56eb0ccf28216` | Outcome and Stake Engine success |
| `08-build-export-mobile-405.png` | `4f4297003c2b42112c3d764eacf2ebf67501c6f19f370571c6e19b4b989e30fa` | 405px visible Build/Export action |
| `09-reel-strip-modeler-mobile-405.png` | `471fea59d37e165ddcab1eca61bdf2bfc2772b4879a3c5fa5b31a6e9202a3cdf` | 405px Reel Strip Modeler |
