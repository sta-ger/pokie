import {
    GameWithFreeGamesSessionHandling,
    VideoSlotSessionHandling,
    VideoSlotWithFreeGamesConfigDescribing,
} from "pokie";

export interface VideoSlotWithFreeGamesSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotSessionHandling<T>,
        GameWithFreeGamesSessionHandling,
        VideoSlotWithFreeGamesConfigDescribing<T> {}
