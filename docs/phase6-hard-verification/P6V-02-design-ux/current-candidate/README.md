# P6V-02 rendered design and UX closeout

Audited candidate: `a84474587ee4c0677e66eb2d0ef25597271913d1`.

The fresh audit used an isolated Chrome profile, the candidate Studio server,
and Vite's candidate source client. CDP found only rendered controls, sent
mouse/keyboard input at their visible coordinates, captured the rendered
result, and never invoked product APIs to change client state. The complete
machine transcript is `ACTION-TRANSCRIPT.txt`.

## Result

The desktop visual inventory covered Design Game, Workspace/Overview, Game
Model, Play success, Simulation success, Replay's Session Spin discovery,
Build/Export exact Outcome Library plus Stake Engine Export, and editable Reel
Strip Modeler. The separate cold-start route was Design Game -> Create Project
-> Workspace -> Play -> New Play session -> Spin. It reached each feedback
state with no rendered error or dead end.

The approximately 405px audit found and repaired a material P1: the closed
navbar offset left only a narrow content sliver. The candidate's runtime
mobile-width style now gives the main area its normal 16px padding; the final
re-run records `main: "16px"` in the transcript and shows readable Build/Export
and Modeler controls. No P0, P1, or material P2 remains.

## Evidence hashes

| Capture | SHA-256 |
| --- | --- |
| `01-cold-start-design-desktop.png` | `036c4931612ec6873064a35b54a497f762bc61f798f4d075c58ae4066112ea7b` |
| `03-game-model-desktop.png` | `4dcb065ff297c6d4c293424ee2f7622a0e16e79de7878a6bd7064dcd20919c56` |
| `04-play-success-desktop.png` | `7fec9c271c36fc966d136e3dffa55d2bc1e6db335cbd0ed06aa758f8e07b38d3` |
| `05-simulation-success-desktop.png` | `6070e91113633907d2b9dcea22ab646f5e387edfe777d221e914471b28575989` |
| `06-replay-session-spin-desktop.png` | `0c5ac742e769a1327a527d2ab7a23f17f0ec77ebd80963c6d2cb2786891eae82` |
| `07-build-export-success-desktop.png` | `d8162fc3e9c6a1834ad9d68ad718edc194e08fb0677c4558cdf282108b11b27e` |
| `08-build-export-mobile-405.png` | `4c168351928af776980315f24f413a74cecbe9a3ce3f19b51d705591c9813c0c` |
| `09-reel-strip-modeler-mobile-405.png` | `d8c371b3b38444fce09e99c168d6ce4718c7594d5a579b6b0d8d65765bf53f5f` |

Machine-owned targeted result: `npm run test:targeted --
tests/cli/studio-client/src/components/layout/AppShellLayout.mobileNav.test.tsx`
passed (4/4). The repository command policy rejected the named Studio
typecheck wrapper before it launched, so no typecheck result is claimed.
