import {BetForNextSimulationRoundSetting, NextSessionRoundPlayableDetermining} from "pokie";

export interface SimulationConfigSetting {
    setNumberOfRounds(value: number): void;

    setPlayStrategy(playStrategy: NextSessionRoundPlayableDetermining): void;

    setChangeBetStrategy(changeBetStrategy: BetForNextSimulationRoundSetting): void;
}
