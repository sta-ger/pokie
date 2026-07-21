import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import type {JackpotStateDetermining} from "./JackpotStateDetermining.js";
import type {JackpotStateSetting} from "./JackpotStateSetting.js";

// Mirrors VideoSlotWithHoldAndWinSessionHandling's own composition shape.
export interface VideoSlotWithJackpotSessionHandling<T extends string | number | symbol = string>
    extends VideoSlotSessionHandling<T>,
        JackpotStateDetermining<T>,
        JackpotStateSetting<T> {}
