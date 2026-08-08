// The canonical VideoSlot(WithFreeGames) player surface: pure view-derivation
// (videoSlotRoundView.ts) plus the DOM rendering built directly on top of it (renderPlayer.ts).
// This is the one barrel any consumer -- this repo's own cli/client/main.ts, or an external one
// like pokie-examples -- imports from (see package.json's "./client/player" export), so the two
// modules stay a single reusable unit rather than something each consumer has to know to wire up
// from two separate files. Both consumers' own render sequence is locked in by
// tests/cli/client/player/renderPlayer.test.ts's "canonical player fixture round parity" suite.
//
// Studio (cli/studio-client) is deliberately not a third consumer of this barrel: this module's own
// VideoSlotRoundResponse shape is specific to one game family's wire format, while Studio's round-
// inspection surfaces (Play, Replay, Runtime Session Tools, Outcome Library) render an arbitrary
// game's own RoundArtifact -- a different, game-generic shape this module has no way to interpret.
// Studio's own single shared renderer for that shape is GameScreenView (see its own doc comment) --
// a second canonical player, not a gap, kept in step with this one by
// tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx's own
// "canonical player parity" suite (Play's live workflow vs. a direct GameScreenView/
// RoundArtifactInspector render of the identical fixture round).
export * from "./renderPlayer.js";
export * from "./videoSlotRoundView.js";
