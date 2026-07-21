import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import type {HoldAndWinStateDetermining} from "./HoldAndWinStateDetermining.js";
import type {HoldAndWinStateSetting} from "./HoldAndWinStateSetting.js";

// Mirrors VideoSlotWithFreeGamesSessionHandling's own composition shape.
export interface VideoSlotWithHoldAndWinSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotSessionHandling<T>,
        HoldAndWinStateDetermining<T>,
        HoldAndWinStateSetting<T> {}
