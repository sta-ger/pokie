import {IReelGameWithFreeGamesSessionFlow} from "./IReelGameWithFreeGamesSessionFlow";
import {ReelGameSessionFlow} from "./ReelGameSessionFlow";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";
import {IGameSessionModel} from "../../../IGameSessionModel";
import {IReelGameWithFreeGamesSessionModel} from "../IReelGameWithFreeGamesSessionModel";

export class ReelGameWithFreeGamesSessionFlow extends ReelGameSessionFlow implements IReelGameWithFreeGamesSessionFlow {
    protected _freeGamesForScatters: {
        [scatterId: string]: {
            [times: number]: number
        }
    };
    
    constructor() {
        super();
    }
    
    protected initialize(): void {
        super.initialize();
        this._freeGamesForScatters = {
            "s": {
                3: 10
            }
        };
    }
    
    public create(model: IGameSessionModel): void {
        super.create(model);
    }
    
    protected resetLastWinningBeforePlay(): void {
        super.resetLastWinningBeforePlay();
        if (this.sessionModel.freeGamesNum === this.sessionModel.freeGamesSum) {
            this.sessionModel.freeBank = 0;
            this.sessionModel.freeGamesNum = 0;
            this.sessionModel.freeGamesSum = 0;
        }
    }
    
    protected updateCreditsBeforePlay(): void {
        if (
                this.sessionModel.freeGamesSum === 0 ||
                this.sessionModel.freeGamesNum === this.sessionModel.freeGamesSum
        ) {
            super.updateCreditsBeforePlay();
        }
    }
    
    protected doPlayStuff(): void {
        super.doPlayStuff();
        if (
                this.sessionModel.freeGamesSum > 0 &&
                this.sessionModel.freeGamesNum < this.sessionModel.freeGamesSum
        ) {
            this.sessionModel.freeGamesNum++;
        }
    }
    
    protected getWonFreeGamesNumber(): number {
        let rv: number;
        let scatterId: string;
        let scatterTimes: number;
        let i: string;
        let wonScatters: {};
        rv = 0;
        wonScatters = this.getWinningScatters();
        for (i in wonScatters) {
            scatterId = wonScatters[i].itemId;
            scatterTimes = wonScatters[i].itemsPositions.length;
            if (this._freeGamesForScatters.hasOwnProperty(scatterId)) {
                if (this._freeGamesForScatters[scatterId].hasOwnProperty(scatterTimes.toString())) {
                    rv = this._freeGamesForScatters[scatterId][scatterTimes];
                }
            }
        }
        return rv;
    }
    
    protected calculateWinning(): void {
        let wonFreeGames: number;
        super.calculateWinning();
        wonFreeGames = this.getWonFreeGamesNumber();
        if (wonFreeGames) {
            this.sessionModel.freeGamesSum += wonFreeGames;
        }
    }
    
    protected updateCreditsAfterPlay(): void {
        super.updateCreditsAfterPlay();
        if (this.sessionModel.freeGamesNum > 0 && this.sessionModel.freeGamesNum < this.sessionModel.freeGamesSum) {
            this.sessionModel.credits -= this.sessionModel.winning; //Decrement winning added at super method
            this.sessionModel.freeBank += this.sessionModel.winning; //and add it to free bank
        }
        if (this.sessionModel.freeGamesSum > 0 && this.sessionModel.freeGamesNum === this.sessionModel.freeGamesSum) {
            this.sessionModel.credits += this.sessionModel.freeBank;
        }
    }
    
    private get sessionModel(): IReelGameWithFreeGamesSessionModel {
        return this._sessionModel as IReelGameWithFreeGamesSessionModel;
    }
}
