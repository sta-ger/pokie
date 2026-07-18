import type {GameSessionSerializing} from "../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
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

    // Optional, feature-detected (same pattern as getSessionSerializer): a game MAY declare its
    // selectable bet modes (see BetMode.ts) so calling code can build a real bet-mode/buy-feature UI
    // against real declared data instead of guessing. A game that doesn't implement this simply has
    // no declared bet modes -- absence is not an error.
    getBetModes?(): BetMode[];
}
