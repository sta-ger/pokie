import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {NextSessionRoundPlayableDetermining} from "./NextSessionRoundPlayableDetermining.js";

export class PlayUntilAnyWinStrategy implements NextSessionRoundPlayableDetermining {
    public canPlayNextSimulationRound(session: GameSessionHandling): boolean {
        return session.getWinAmount() === 0;
    }
}
