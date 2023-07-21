import {
    VideoSlotSessionSerializer,
    VideoSlotSessionSerializing,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSessionHandling,
    VideoSlotWithFreeGamesSessionSerializing,
} from "pokie";

export class VideoSlotWithFreeGamesSessionSerializer implements VideoSlotWithFreeGamesSessionSerializing {
    private readonly baseSerializer: VideoSlotSessionSerializing;

    constructor(baseSerializer: VideoSlotSessionSerializing = new VideoSlotSessionSerializer()) {
        this.baseSerializer = baseSerializer;
    }

    public getInitialData(session: VideoSlotWithFreeGamesSessionHandling): VideoSlotWithFreeGamesInitialNetworkData {
        return {
            ...this.baseSerializer.getInitialData(session),
            ...this.getRoundData(session),
        };
    }

    public getRoundData(session: VideoSlotWithFreeGamesSessionHandling): VideoSlotWithFreeGamesRoundNetworkData {
        const freeGamesNum = session.getFreeGamesNum();
        const freeGamesSum = session.getFreeGamesSum();
        const freeGamesBank = session.getFreeGamesBank();
        const wonFreeGamesNumber = session.getWonFreeGamesNumber();
        return {
            ...this.baseSerializer.getRoundData(session),
            freeGamesNum,
            freeGamesSum,
            freeGamesBank,
            wonFreeGamesNumber,
        };
    }
}
