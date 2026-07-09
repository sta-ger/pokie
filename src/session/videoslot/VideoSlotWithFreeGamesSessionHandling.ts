import type {GameWithFreeGamesSessionHandling} from "../GameWithFreeGamesSessionHandling.js";
import type {VideoSlotSessionHandling} from "./VideoSlotSessionHandling.js";
import type {VideoSlotWithFreeGamesConfigDescribing} from "./VideoSlotWithFreeGamesConfigDescribing.js";

export interface VideoSlotWithFreeGamesSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotSessionHandling<T>,
        GameWithFreeGamesSessionHandling,
        VideoSlotWithFreeGamesConfigDescribing<T> {}
