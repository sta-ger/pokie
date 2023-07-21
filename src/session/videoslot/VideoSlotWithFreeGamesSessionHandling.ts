import {
    GameWithFreeGamesSessionHandling,
    VideoSlotSessionHandling,
    VideoSlotWithFreeGamesConfigDescribing,
} from "pokie";

export interface VideoSlotWithFreeGamesSessionHandling
    extends VideoSlotSessionHandling,
        GameWithFreeGamesSessionHandling,
        VideoSlotWithFreeGamesConfigDescribing {}
