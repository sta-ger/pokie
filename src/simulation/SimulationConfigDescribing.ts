import type {BetForNextSimulationRoundSetting} from "./BetForNextSimulationRoundSetting.js";
import type {NextSessionRoundPlayableDetermining} from "./playstrategy/NextSessionRoundPlayableDetermining.js";

export interface SimulationConfigDescribing {
    getNumberOfRounds(): number;

    getPlayStrategy(): NextSessionRoundPlayableDetermining;

    getChangeBetStrategy(): BetForNextSimulationRoundSetting | undefined;
}
