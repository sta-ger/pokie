import type {BetForNextSimulationRoundSetting} from "./BetForNextSimulationRoundSetting.js";
import type {NextSessionRoundPlayableDetermining} from "./playstrategy/NextSessionRoundPlayableDetermining.js";

export interface SimulationConfigSetting {
    setNumberOfRounds(value: number): void;

    setPlayStrategy(playStrategy: NextSessionRoundPlayableDetermining): void;

    setChangeBetStrategy(changeBetStrategy: BetForNextSimulationRoundSetting): void;
}
