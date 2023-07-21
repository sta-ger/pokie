import {
    AvailableBetDetermining,
    AvailableBetsDescribing,
    AvailableBetsSetting,
    GameSessionStateDetermining,
    GameSessionStateSetting,
} from "pokie";

export interface GameSessionConfigRepresenting
    extends GameSessionStateDetermining,
        GameSessionStateSetting,
        AvailableBetsDescribing,
        AvailableBetsSetting,
        AvailableBetDetermining {}
