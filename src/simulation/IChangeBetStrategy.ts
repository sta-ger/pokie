import {IGameSession} from "..";

export interface IChangeBetStrategy {

    setBetForPlay(session: IGameSession): void;

}
