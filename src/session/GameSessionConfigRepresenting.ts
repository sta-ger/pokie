import type {AvailableBetDetermining} from "./AvailableBetDetermining.js";
import type {AvailableBetsDescribing} from "./AvailableBetsDescribing.js";
import type {AvailableBetsSetting} from "./AvailableBetsSetting.js";
import type {GameSessionStateDetermining} from "./GameSessionStateDetermining.js";
import type {GameSessionStateSetting} from "./GameSessionStateSetting.js";

export interface GameSessionConfigRepresenting
    extends GameSessionStateDetermining,
        GameSessionStateSetting,
        AvailableBetsDescribing,
        AvailableBetsSetting,
        AvailableBetDetermining {}
