// The canonical player presentation: pure view-derivation (videoSlotRoundView.ts) plus the DOM
// rendering built directly on top of it (renderPlayer.ts). This is the one barrel any consumer --
// this repo's own cli/client/main.ts, an external one like pokie-examples, or Studio
// (cli/studio-client) -- imports from (see package.json's "./client/player" export), so every consumer
// stays wired to a single reusable presentation rather than each maintaining its own.
//
// Two authoritative DTO shapes feed it, via two adapters that both converge on the exact same
// WinHighlight contract (see videoSlotRoundView.ts):
//   - VideoSlotRoundResponse (deriveWinHighlights) -- this repo's own net/videoslot wire format, the
//     shape cli/client/main.ts and pokie-examples' own ui.ts already speak natively.
//   - An arbitrary game's own RoundArtifact wins (deriveWinHighlightsFromRoundArtifactWins) -- the
//     game-generic shape Studio's round-inspection surfaces (Play, Replay, sampled rounds, Outcome
//     Library) work with. Studio's own
//     cli/studio-client/src/components/common/CanonicalPlayerView.tsx (the single "screen, with wins"
//     entrypoint every one of those surfaces renders through, via GameScreenView -- see its own doc
//     comment) calls this exact adapter and then mounts this module's own renderPlayerRound entrypoint,
//     the same entrypoint this repo's own cli/client/main.ts and pokie-examples mount -- never a second,
//     independently-rendered player.
//
// Studio mounts this module's own DOM entrypoint directly, via refs (CanonicalPlayerView), rather than
// re-implementing the same grid/highlight rendering as a themed React/Mantine table -- so the *rendering*
// itself, not just the highlight derivation, is one shared implementation, proven by
// tests/cli/client/player/renderPlayer.test.ts's "canonical player fixture round parity" suite and
// tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx's own
// "canonical player parity" suite (through Play's real session/spin workflow) both asserting on the exact
// same ".player-grid"/[data-cell] DOM output renderReelsGrid produces.
export * from "./renderPlayer.js";
export * from "./videoSlotRoundView.js";
