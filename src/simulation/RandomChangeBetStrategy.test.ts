import {GameSessionSimulation, IGameSession, IGameSessionSimulation} from "..";
import {RandomChangeBetStrategy} from "./RandomChangeBetStrategy";

describe("GameSessionSimulation", () => {

    it("changes bet randomly during simulation", () => {
        const betsDuringPlay: Set<number> = new Set();
        const sessionMock: IGameSession = new class A implements IGameSession {
            canPlayNextGame(): boolean {
                return false;
            }

            getAvailableBets(): number[] {
                return [];
            }

            getBet(): number {
                return 0;
            }

            getCreditsAmount(): number {
                return 0;
            }

            getWinningAmount(): number {
                return 0;
            }

            isBetAvailable(bet: number): boolean {
                return false;
            }

            play(): void {
            }

            setBet(bet: number): void {
                betsDuringPlay.add(bet);
            }

            setCreditsAmount(value: number): void {
            }

        };

        const simulation: IGameSessionSimulation = new GameSessionSimulation(
            sessionMock,
            {
                changeBetStrategy: new RandomChangeBetStrategy(),
                numberOfRounds: 1000
            }
        );

        simulation.run();

        const betsArrayOfSet: number[] = Array.from(betsDuringPlay.values());

        // Contents of betsDuringPlay after simulation should contain shuffled array of all possible bets
        expect(betsArrayOfSet).not.toEqual(sessionMock.getAvailableBets());
        expect(betsArrayOfSet.sort()).not.toEqual(sessionMock.getAvailableBets());
    });

});
