import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {PokieGameContext} from "./PokieGameContext.js";
import type {PokieGameManifest} from "./PokieGameManifest.js";

export interface PokieGame {
    getManifest(): PokieGameManifest;

    createSession(context?: PokieGameContext): GameSessionHandling;
}
