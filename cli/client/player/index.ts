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
//     Library) work with. Studio's own cli/studio-client/src/components/common/WinOverlay.tsx (the
//     single "screen, with wins" entrypoint every one of those surfaces renders through -- see its own
//     doc comment) calls this exact adapter to resolve a step's highlighted/payline positions, the same
//     function renderPlayer.ts's own applyPersistentHighlights/renderWinHighlightsList render from --
//     never a second, independently-maintained derivation of "what's highlighted".
//
// Studio still renders its own grid as a themed React/Mantine table (ScreenTable) rather than mounting
// this module's own DOM functions directly -- the one place per-host rendering technology genuinely has
// to differ, since cli/client's player is deliberately a dependency-free static asset (no React runtime)
// while Studio is a themed admin app every other surface of it is built with. The presentation
// *contract* -- which cells are highlighted, in what kind/color, and a line win's own full payline path
// -- is the one shared implementation both render from, proven by
// tests/cli/client/player/renderPlayer.test.ts's "canonical player fixture round parity" suite calling
// the exact same deriveWinHighlightsFromRoundArtifactWins entrypoint
// tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx's own
// "canonical player parity" suite exercises through Play's real session/spin workflow.
export * from "./renderPlayer.js";
export * from "./videoSlotRoundView.js";
