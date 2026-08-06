import type {GameSessionSerializing} from "../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {SymbolsCombinationsGenerating} from "../session/videoslot/combinations/SymbolsCombinationsGenerating.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import type {BetMode} from "./BetMode.js";
import type {PokieGameContext} from "./PokieGameContext.js";
import type {PokieGameManifest} from "./PokieGameManifest.js";

export interface PokieGame {
    getManifest(): PokieGameManifest;

    createSession(context?: PokieGameContext): GameSessionHandling;

    // Optional, feature-detected (same pattern as ConvertableToSessionState/StakeAmountDetermining):
    // a game MAY expose the net/ serializer that knows how to turn its own session type into a rich,
    // game-specific JSON payload — see src/net/GameSessionSerializing.ts and its VideoSlot(WithFreeGames)
    // subclasses, plus MultiStageRoundSessionSerializer for multi-stage/cascade mechanics. PokieDevServer
    // uses this, when present, instead of its own narrow default response shape — see
    // resolveGameSessionSerializer.ts and docs/cli.md. A game that doesn't implement this keeps getting
    // exactly the response shape it always has.
    getSessionSerializer?(): GameSessionSerializing;

    // Optional, feature-detected (same pattern as getSessionSerializer/getBetModes): a game built from a
    // GameBlueprint MAY expose the authoritative hash of the exact config it was built from (see
    // computeGameBlueprintHash/computeBlueprintHash) — every "pokie build" output (renderBuiltGameModule)
    // implements this itself, deriving it from its own embedded blueprint rather than carrying a
    // precomputed header; a handwritten package simply has no such hash to expose. When present,
    // SpinCommandHandler stamps this into a "full" capture's RoundArtifactProvenance.configHash for every
    // live round it settles, so a recorded artifact can be traced back to the exact config that produced
    // it. A game that doesn't implement this simply has no configHash captured — never a fabricated one.
    getConfigHash?(): string;

    // Optional, feature-detected (same pattern as getSessionSerializer): a game MAY declare its
    // selectable bet modes (see BetMode.ts) so calling code can build a real bet-mode/buy-feature UI
    // against real declared data instead of guessing. A game that doesn't implement this simply has
    // no declared bet modes -- absence is not an error.
    getBetModes?(): BetMode[];

    // Optional, feature-detected (same pattern as getSessionSerializer/getBetModes above): a game whose
    // entire outcome space is a finite, enumerable set of reel-stop combinations MAY implement this so
    // weightedoutcome/generate can build a canonical, exact WeightedOutcomeLibrary straight off this
    // executable package — driving the exact same session/win-calculation runtime a live round uses
    // (createSession's own concrete VideoSlotSessionHandling), just with its randomness-backed
    // SymbolsCombinationsGenerating swapped for the caller-supplied deterministic one, never a second
    // calculation path. A game that doesn't implement this — any stateful or otherwise non-reel-enumerable
    // mechanic (free games, cascades, hold-and-win, ...) — simply has no exact strategy: generation fails
    // closed rather than guessing at one. See docs/weighted-outcome-library.md#generation.
    createExactEnumerationSession?(combinationsGenerator: SymbolsCombinationsGenerating): VideoSlotSessionHandling;
}
