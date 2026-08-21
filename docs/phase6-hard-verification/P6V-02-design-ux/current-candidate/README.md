# P6V-02 rendered design and UX closeout

Audited candidate: `aa8006458af28cb773f0ee31a7b36a9e9e0c914d`.

This bounded audit launches the public Studio CLI on the audited candidate and
serves its exact source client. A fresh Chrome profile uses only rendered
controls (visible-coordinate mouse input and keyboard input); it does not use
product APIs to change client state. The machine-owned sequence is recorded in
`ACTION-TRANSCRIPT.txt`.

## Results

The desktop inventory covers Design Game, Workspace/Overview, Game Model, a
completed Play spin, completed Simulation, Replay's Session Spin discovery,
Build/Export exact Outcome Library plus Stake Engine Export, and editable Reel
Strip Modeler. The separate cold-start path is Design Game → Create Project →
Workspace → Play → New Play session → Spin. It records the navigation and
success feedback without a rendered error or dead end.

At 405px, the final rerun records `main: "16px"` and `scrollWidth: 405` in the
transcript. The Build/Export and Reel Strip Modeler captures remain readable
and operable. No P0, P1, or material P2 was observed in the rendered audit.

## Evidence hashes

| Capture | SHA-256 |
| --- | --- |
| `00-initial-render.png` | `036c4931612ec6873064a35b54a497f762bc61f798f4d075c58ae4066112ea7b` |
| `01-cold-start-design-desktop.png` | `5b31eb149bd3af02f2e414b6efcd8a67f03fcdec1133d1bc8f48828f8f74f222` |
| `02-workspace-overview-desktop.png` | `2b865cb155b5d753685bab9def3597c14f62c2c7eaedc74eef0c8991fc0fdbb9` |
| `03-game-model-desktop.png` | `4dcb065ff297c6d4c293424ee2f7622a0e16e79de7878a6bd7064dcd20919c56` |
| `04-play-success-desktop.png` | `96f9a2f054586de09a3a184e69b6fef640bdb08023f3961aaf3ed3fa5046e7d7` |
| `05-simulation-success-desktop.png` | `a1a6357eddf74f330d3e9978d5fad898db456012459509a0c89bb21a1619e51c` |
| `06-replay-session-spin-desktop.png` | `0c5ac742e769a1327a527d2ab7a23f17f0ec77ebd80963c6d2cb2786891eae82` |
| `07-build-export-success-desktop.png` | `047ac7593b8dcde926744a9b889af0d4b034eaa00c5c22df414e15033a9794b4` |
| `08-build-export-mobile-405.png` | `75d891c27731b15dfea3beda0c6a468beb77e1bb5841a26a6ed77627d77ea087` |
| `09-reel-strip-modeler-mobile-405.png` | `d8c371b3b38444fce09e99c168d6ce4718c7594d5a579b6b0d8d65765bf53f5f` |

Machine-owned targeted validation: `npm run test:targeted --
tests/cli/studio-client/src/components/layout/AppShellLayout.mobileNav.test.tsx`
passed (4/4). `npm run typecheck-studio-client` was blocked by the repository's
implementation-command policy before the TypeScript compiler launched, so this
evidence does not claim a typecheck result.
