import {
    PlayUntilAnyWinStrategy,
    PlayUntilSymbolWinStrategy,
    Simulation,
    SimulationConfig,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
    VideoSlotWithResizableGridSession,
} from "pokie";

export type AnyVideoSlotSession = VideoSlotSession | VideoSlotWithFreeGamesSession | VideoSlotWithResizableGridSession;

// Same feature-detection shape as pokie's own internal supportsBetModeSelecting -- AnyVideoSlotSession
// never types setBetMode() itself, since bet-mode selection is an opt-in decorator
// (VideoSlotWithBetModesSession), not part of every session's own interface.
function supportsBetMode(
    session: AnyVideoSlotSession,
): session is AnyVideoSlotSession & {getBetModeId(): string; setBetMode(modeId: string): void; getAvailableBetModeIds(): string[]} {
    const candidate = session as Partial<{getBetModeId(): string; setBetMode(modeId: string): void; getAvailableBetModeIds(): string[]}>;
    return (
        typeof candidate.getBetModeId === "function" &&
        typeof candidate.setBetMode === "function" &&
        typeof candidate.getAvailableBetModeIds === "function"
    );
}

let localSession: AnyVideoSlotSession;
let localSerializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer;
let localCustomScenarios: [string, string, SimulationConfig][] | undefined;
// Lets a game's own index.ts render round state the generic serializer doesn't know about
// (e.g. cascade step history, RNG audit info) without every game forking data.ts/utils.ts.
let onAfterRoundPlayed: ((session: AnyVideoSlotSession) => void) | undefined;

export const initializeData = (
    session: AnyVideoSlotSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
    customScenarios?: [string, string, SimulationConfig][],
    afterRoundPlayed?: (session: AnyVideoSlotSession) => void,
) => {
    localSession = session;
    localSerializer = serializer;
    localCustomScenarios = customScenarios;
    onAfterRoundPlayed = afterRoundPlayed;
};

export const getInitialData = async (): Promise<
    VideoSlotInitialNetworkData | VideoSlotWithFreeGamesInitialNetworkData
> => {
    return new Promise((res) => {
        res(localSerializer.getInitialData(localSession as VideoSlotWithFreeGamesSession));
    });
};

// `bet`/`modeId` mirror pokie's own SpinCommandHandler: applied via setBet()/setBetMode() before
// play(), so an unsupported mode (no session in this bet-mode's own getAvailableBetModeIds(), or a
// session that never opted into bet-mode selection at all) rejects the same way a real server would
// reject it, by throwing synchronously inside this Promise executor -- which the executor's own
// implicit try/catch turns into a rejected promise a caller's .catch() can show as a retryable error.
export const getRoundData = async (
    bet?: number,
    modeId?: string,
): Promise<VideoSlotRoundNetworkData | VideoSlotWithFreeGamesRoundNetworkData> => {
    return new Promise((res) => {
        if (bet !== undefined) {
            localSession.setBet(bet);
        }
        if (modeId !== undefined) {
            if (!supportsBetMode(localSession)) {
                throw new Error("This game does not support bet mode selection.");
            }
            localSession.setBetMode(modeId);
        }
        localSession.play();
        onAfterRoundPlayed?.(localSession);
        res(localSerializer.getRoundData(localSession as VideoSlotWithFreeGamesSession));
    });
};

export const getSymbolWinData = async (itemId: string, times: number) => {
    return new Promise((res) => {
        localSession.play();
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(Infinity);
        const playStrategy = new PlayUntilSymbolWinStrategy(itemId);
        playStrategy.setExactNumberOfWinningSymbols(times);
        simulationConfig.setPlayStrategy(playStrategy);
        res(runSimulation(simulationConfig));
    });
};

export const getAnyWinData = async () => {
    return new Promise((res) => {
        localSession.play();
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(Infinity);
        const playStrategy = new PlayUntilAnyWinStrategy();
        simulationConfig.setPlayStrategy(playStrategy);
        res(runSimulation(simulationConfig));
    });
};

export const getCustomScenarioData = async (scenarioId: string) => {
    return new Promise((res) => {
        const simulationConfig = localCustomScenarios?.find((entry) => entry[0] === scenarioId)!;
        res(runSimulation(simulationConfig[2]));
    });
};

const runSimulation = (simulationConfig: SimulationConfig) => {
    const simulation = new Simulation(localSession, simulationConfig);
    localSession.play();
    simulation.run();
    onAfterRoundPlayed?.(localSession);
    return localSerializer.getRoundData(localSession as VideoSlotWithFreeGamesSession);
};
