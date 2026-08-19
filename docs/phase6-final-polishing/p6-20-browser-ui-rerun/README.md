# P6-20 independent Studio Player parity rerun

Candidate `6d8d3eb5634091e40bc47e39c6b2255ca6ebf6a1` was built with Node 24.18.0 and exercised in one fresh, headed local Chrome/Studio session. Studio opened the tracked `fixture-slot` Blueprint; both visible surfaces used seed `fixture-round`, round 1.

The normal UI workflow was Play → New Play session → Spin, then Replay → Recreate from seed → Load → Run again. No application API, DOM, or state injection was used: interaction was coordinate mouse/keyboard against rendered controls, with rendered-text/grid checks.

Both screenshots show the same canonical Player result:

- reel columns `A/C/A | A/A/C | A/A/A` (visible rows `A A A / C A A / A C A`), with top-row winning cells `0:0`, `0:1`, `0:2`;
- line `A` win `5`, total `5.00` (`5.00x`), credits `1004`, and paytable `A=5`, `B=3`, `C=1`;
- bet `1`; the fixture correctly has no selectable bet-mode row and no feature counter.

Source confirmation: [CanonicalPlayerView.tsx](../../../cli/studio-client/src/components/common/CanonicalPlayerView.tsx) imports `renderPlayerRound` and `deriveWinHighlightsFromRoundArtifactWins` from the public `cli/client/player` barrel. [GameScreenView.tsx](../../../cli/studio-client/src/components/common/GameScreenView.tsx) is the shared Play/Replay path into that component; [RoundSummary.tsx](../../../cli/studio-client/src/components/common/RoundSummary.tsx) and [RoundArtifactInspector.tsx](../../../cli/studio-client/src/components/common/RoundArtifactInspector.tsx) supply Play and Replay respectively.

See `browser-transcript.txt` and `SHA256SUMS` for the bounded browser record and screenshot integrity hashes.
