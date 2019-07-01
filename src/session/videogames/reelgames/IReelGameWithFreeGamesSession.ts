import {IReelGameSession} from "./IReelGameSession";

export interface IReelGameWithFreeGamesSession extends IReelGameSession {

    getWonFreeGamesNumber(): number;

    getFreeGameNum(): number;

    setFreeGameNum(value: number): void;

    getFreeGameSum(): number;

    setFreeGameSum(value: number): void;

    getFreeGameBank(): number;

    setFreeGameBank(value: number): void;

}
