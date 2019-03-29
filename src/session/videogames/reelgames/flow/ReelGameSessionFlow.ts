import {GameSessionFlow} from "../../../flow/GameSessionFlow";
import {IReelGameSessionFlow} from "./IReelGameSessionFlow";
import {IReelGameSessionReelsController} from "./reelscontroller/IReelGameSessionReelsController";
import {ReelGameSessionReelsController} from "./reelscontroller/ReelGameSessionReelsController";
import {IGameSessionModel} from "../../../IGameSessionModel";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinCalculator} from "./wincalculator/IReelGameSessionWinCalculator";
import {ReelGameSessionWinCalculator} from "./wincalculator/ReelGameSessionWinCalculator";

export class ReelGameSessionFlow extends GameSessionFlow implements IReelGameSessionFlow {
    protected _reelsController: IReelGameSessionReelsController;
    protected _winningCalculator: IReelGameSessionWinCalculator;
    
    constructor() {
        super();
    }
    
    protected initialize(): void {
        super.initialize();
        this._reelsController = this.createReelsController();
        this._winningCalculator = this.createWinningCalculator();
    }
    
    public create(model: IGameSessionModel): void {
        super.create(model);
        this._winningCalculator.setModel(this._sessionModel);
        this.updateReels();
    }
    
    protected doPlayStuff(): void {
        this.updateReels();
        super.doPlayStuff();
    }
    
    protected calculateWinning(): void {
        let win: number;
        super.calculateWinning();
        this._winningCalculator.setReelsItems(this._reelsController.getItems());
        win = this.getTotalRoundWinning();
        this._sessionModel.winning = win;
    }
    
    protected getTotalRoundWinning(): number {
        let scatters: {};
        let lines: { [p: string]: IReelGameSessionWinningLineModel };
        let lineId: string;
        let i: string;
        let win: number;
        win = 0;
        lines = this._winningCalculator.getWinningLines();
        for (lineId in lines) {
            win += lines[lineId].winningAmount;
        }
        scatters = this._winningCalculator.getWinningScatters();
        for (i in scatters) {
            win += scatters[i].winningAmount;
        }
        return win;
    }
    
    protected updateReels(): void {
        this._reelsController.spin();
    }

    public getReelsItems(): string[][] {
        return this._reelsController.getItems();
    }
    
    public getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel } {
        return this._winningCalculator.getWinningLines();
    }
    
    public getWinningScatters(): {} {
        return this._winningCalculator.getWinningScatters();
    }
    
    protected createReelsController(): IReelGameSessionReelsController {
        return new ReelGameSessionReelsController();
    }
    
    protected createWinningCalculator(): IReelGameSessionWinCalculator {
        return new ReelGameSessionWinCalculator();
    }
}
