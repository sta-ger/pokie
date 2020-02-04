import {
    GameSession,
    GameSessionSimulation,
    IGameSession,
    IGameSessionSimulation,
    IGameSessionSimulationConfig
} from "..";

it("changes bet randomly during simulation", () => {
    const betsDuringPlay = [];
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
        }

        setCreditsAmount(value: number): void {
        }

    };

    const simulation: IGameSessionSimulation = new GameSessionSimulation(
        sessionMock,
        GameSessionSimulationConfig
            .builder()
            .withNumberOfRounds(1000)
            .withChangeBetStrategy(new RandomChangeBetStrategy())
            .build()
    );

    simulation.run();

    long[] betsArrayOfSet = betsDuringPlay.stream().mapToLong(Long::valueOf).toArray();

    // Contents of betsDuringPlay after simulation should contain shuffled array of all possible bets
    assertFalse(Arrays.equals(
        betsArrayOfSet,
        sessionMock.getAvailableBets()
    ));
    assertArrayEquals(
        Arrays.stream(betsArrayOfSet).sorted().toArray(),
        sessionMock.getAvailableBets()
    );

});
