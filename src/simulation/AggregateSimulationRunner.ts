import {GameSessionHandling, NextSessionRoundPlayableDetermining, SimulationAccumulator} from "pokie";

export class AggregateSimulationRunner {
    private readonly session: GameSessionHandling;
    private readonly rounds: number;
    private readonly playStrategy?: NextSessionRoundPlayableDetermining;

    constructor(session: GameSessionHandling, rounds: number, playStrategy?: NextSessionRoundPlayableDetermining) {
        this.session = session;
        this.rounds = rounds;
        this.playStrategy = playStrategy;
    }

    public run(): SimulationAccumulator {
        const accumulator = new SimulationAccumulator();
        for (let round = 0; round < this.rounds; round++) {
            if (!this.session.canPlayNextGame()) {
                break;
            }
            if (this.playStrategy && !this.playStrategy.canPlayNextSimulationRound(this.session)) {
                break;
            }
            const bet = this.session.getBet();
            this.session.play();
            accumulator.addRound(bet, this.session.getWinAmount());
        }
        return accumulator;
    }
}
