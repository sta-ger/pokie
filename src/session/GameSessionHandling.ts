import type {AvailableBetsDescribing} from "./AvailableBetsDescribing.js";
import type {GameSessionStateDetermining} from "./GameSessionStateDetermining.js";
import type {GameSessionStateSetting} from "./GameSessionStateSetting.js";
import type {PlayableGame} from "./PlayableGame.js";
import type {WinAmountDetermining} from "./WinAmountDetermining.js";

export interface GameSessionHandling
    extends GameSessionStateDetermining,
        GameSessionStateSetting,
        PlayableGame,
        WinAmountDetermining,
        AvailableBetsDescribing {}
