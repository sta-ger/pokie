import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";

// Feature-detected: a game implementing the optional PokieGame.getSessionSerializer() is asked for
// its own net/ serializer once; a game that doesn't implement it gets undefined back, and
// PokieDevServer/SpinCommandHandler fall back to their existing, narrower default response shape —
// see capturePokieSessionState.ts.
export function resolveGameSessionSerializer(game: PokieGame): GameSessionSerializing | undefined {
    if (typeof game.getSessionSerializer !== "function") {
        return undefined;
    }
    return game.getSessionSerializer();
}
