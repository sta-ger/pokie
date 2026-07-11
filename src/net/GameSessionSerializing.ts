import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {GameInitialNetworkData, GameRoundNetworkData} from "./GameNetworkData.js";

export interface GameSessionSerializing {
    getInitialData(session: GameSessionHandling): GameInitialNetworkData;

    getRoundData(session: GameSessionHandling): GameRoundNetworkData;

    // Optional, feature-detected (see PokieDevServer's public/internal response split, docs/cli.md
    // "pokie serve"): a serializer that implements these opts into a second, internal/debug-only
    // payload — RNG info, reel stops, evaluator traces, anything a game author wants available for
    // local debugging/audit but never sent to a client by default. A serializer that doesn't
    // implement them (every existing serializer, unchanged) simply has no debug payload — the public
    // response is exactly getInitialData()/getRoundData(), as it always was.
    getInitialDebugData?(session: GameSessionHandling): Record<string, unknown>;

    getRoundDebugData?(session: GameSessionHandling): Record<string, unknown>;
}
