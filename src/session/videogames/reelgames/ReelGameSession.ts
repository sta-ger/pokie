import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {IGameSession} from "../../IGameSession";
import {GameSession} from "../../GameSession";
import {IReelGameSessionReelsController} from "./reelscontroller/IReelGameSessionReelsController";
import {IReelGameSessionWinCalculator} from "./wincalculator/IReelGameSessionWinCalculator";

export class ReelGameSession implements IReelGameSession {
    private readonly _config: IReelGameSessionConfig;
    private readonly _reelsController: IReelGameSessionReelsController;
    private readonly _winningCalculator: IReelGameSessionWinCalculator;
    private readonly _adaptee: IGameSession;
    private _winningAmount: number;
    private _reelsItems: string[][];
    private _creditsAmount: number;

    constructor(config: IReelGameSessionConfig, reelsController: IReelGameSessionReelsController, winningCalculator: IReelGameSessionWinCalculator) {
        this._config = config;
        this._reelsController = reelsController;
        this._winningCalculator = winningCalculator;
        this._adaptee = new GameSession(this._config);
        this._winningAmount = 0;
        this._creditsAmount = this._adaptee.getCreditsAmount();
    }

    public getReelsItems(): string[][] {
        return this._reelsItems;
    }
    
    public getWinningLines(): {} {
        return this._winningCalculator.getWinningLines();
    }
    
    public getWinningScatters(): {} {
        return this._winningCalculator.getWinningScatters();
    }
    
    public getPaytable(): { [p: string]: { [p: number]: number } } {
        return this._config.paytable[this.getBet()];
    }
    
    public getReelsItemsSequences(): string[][] {
        return this._config.reelsItemsSequences;
    }
    
    public getReelsItemsNumber(): number {
        return this._config.reelsItemsNumber;
    }
    
    public getReelsNumber(): number {
        return this._config.reelsNumber;
    }

    public canPlayNextGame(): boolean {
        return this._adaptee.canPlayNextGame();
    }

    public getAvailableBets(): number[] {
        return this._config.availableBets;
    }

    public getBet(): number {
        return this._adaptee.getBet();
    }

    public getCreditsAmount(): number {
        return this._creditsAmount;
    }

    public getWinningAmount(): number {
        return this._winningAmount;
    }

    public isBetAvailable(bet: number): boolean {
        return this._adaptee.isBetAvailable(bet);
    }

    public play(): void {
        this._adaptee.play();
        this._reelsItems = this._reelsController.getRandomItemsCombination();
        this._winningCalculator.setGameState(this.getBet(), this._reelsItems);
        this._winningAmount = this._winningCalculator.getWinningAmount();
        this._creditsAmount = this._adaptee.getCreditsAmount() + this._winningAmount;
    }

    public setBet(bet: number): void {
        this._adaptee.setBet(bet);
    }
    
}
