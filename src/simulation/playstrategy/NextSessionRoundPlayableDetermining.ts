import {GameSessionHandling} from "pokie";

export interface NextSessionRoundPlayableDetermining {
    canPlayNextSimulationRound(session: GameSessionHandling): boolean;
}
