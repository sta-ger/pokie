import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

export interface NextSessionRoundPlayableDetermining {
    canPlayNextSimulationRound(session: GameSessionHandling): boolean;
}
