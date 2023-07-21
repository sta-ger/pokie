import {BetForNextSimulationRoundSetting, NextSessionRoundPlayableDetermining} from "pokie";

export interface SimulationConfigDescribing {
    getNumberOfRounds(): number;

    getPlayStrategy(): NextSessionRoundPlayableDetermining;

    getChangeBetStrategy(): BetForNextSimulationRoundSetting | undefined;
}
