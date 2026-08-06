// The canonical VideoSlot(WithFreeGames) player surface: pure view-derivation
// (videoSlotRoundView.ts) plus the DOM rendering built directly on top of it (renderPlayer.ts).
// This is the one barrel any consumer -- this repo's own cli/client/main.ts, or an external one
// like pokie-examples -- imports from (see package.json's "./client/player" export), so the two
// modules stay a single reusable unit rather than something each consumer has to know to wire up
// from two separate files.
export * from "./renderPlayer.js";
export * from "./videoSlotRoundView.js";
