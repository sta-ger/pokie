import {
    VideoSlotSessionSerializer,
    VideoSlotSessionSerializing,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSessionHandling,
    VideoSlotWithFreeGamesSessionSerializing,
} from "pokie";

export class VideoSlotWithFreeGamesSessionSerializer<T extends string | number | symbol = string>
implements VideoSlotWithFreeGamesSessionSerializing<T> {
    private readonly baseSerializer: VideoSlotSessionSerializing<T>;

    constructor(baseSerializer: VideoSlotSessionSerializing<T> = new VideoSlotSessionSerializer<T>()) {
        this.baseSerializer = baseSerializer;
    }

    public getInitialData(
        session: VideoSlotWithFreeGamesSessionHandling<T>,
    ): VideoSlotWithFreeGamesInitialNetworkData<T> {
        return {
            ...this.baseSerializer.getInitialData(session),
            ...this.getRoundData(session),
        };
    }

    public getRoundData(session: VideoSlotWithFreeGamesSessionHandling<T>): VideoSlotWithFreeGamesRoundNetworkData<T> {
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
