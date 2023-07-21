import {
    BetForNextSimulationRoundSetting,
    SimulationConfigRepresenting,
    NextSessionRoundPlayableDetermining,
} from "pokie";

export class SimulationConfig implements SimulationConfigRepresenting {
    public static readonly DEFAULT_NUMBER_OF_ROUNDS: number = 1000;

    private numberOfRounds: number = SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS;
    private changeBetStrategy?: BetForNextSimulationRoundSetting;
    private playStrategy!: NextSessionRoundPlayableDetermining;

    public setNumberOfRounds(value: number): void {
        this.numberOfRounds = value;
    }

    public getNumberOfRounds(): number {
        return this.numberOfRounds;
    }

    public setPlayStrategy(playStrategy: NextSessionRoundPlayableDetermining): void {
        this.playStrategy = playStrategy;
    }

    public getPlayStrategy(): NextSessionRoundPlayableDetermining {
        return this.playStrategy;
    }

    public setChangeBetStrategy(changeBetStrategy: BetForNextSimulationRoundSetting): void {
        this.changeBetStrategy = changeBetStrategy;
    }

    public getChangeBetStrategy(): BetForNextSimulationRoundSetting | undefined {
        return this.changeBetStrategy;
    }
}
