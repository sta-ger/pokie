import {
    AvailableBetsDescribing,
    GameSessionStateDetermining,
    GameSessionStateSetting,
    PlayableGame,
    WinAmountDetermining,
} from "pokie";

export interface GameSessionHandling
    extends GameSessionStateDetermining,
        GameSessionStateSetting,
        PlayableGame,
        WinAmountDetermining,
        AvailableBetsDescribing {}
