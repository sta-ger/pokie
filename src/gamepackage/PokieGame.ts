import {GameSessionHandling, PokieGameContext, PokieGameManifest} from "pokie";

export interface PokieGame {
    getManifest(): PokieGameManifest;

    createSession(context?: PokieGameContext): GameSessionHandling;
}
