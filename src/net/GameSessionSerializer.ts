import {GameSessionHandling, GameSessionSerializing, GameInitialNetworkData, GameRoundNetworkData} from "pokie";

export class GameSessionSerializer implements GameSessionSerializing {
    private static getDefaultData(session: GameSessionHandling): GameRoundNetworkData {
        const credits = session.getCreditsAmount();
        const bet = session.getBet();
        return {
            credits,
            bet,
        };
    }

    public getInitialData(session: GameSessionHandling): GameInitialNetworkData {
        const availableBets = session.getAvailableBets();
        return {
            ...GameSessionSerializer.getDefaultData(session),
            availableBets,
        };
    }

    public getRoundData(session: GameSessionHandling): GameRoundNetworkData {
        return GameSessionSerializer.getDefaultData(session);
    }
}
