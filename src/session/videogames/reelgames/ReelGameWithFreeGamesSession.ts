import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {IReelGameSessionReelsController} from "./reelscontroller/IReelGameSessionReelsController";
import {IReelGameSessionWinCalculator} from "./wincalculator/IReelGameSessionWinCalculator";
import {IReelGameWithFreeGamesSession} from "./IReelGameWithFreeGamesSession";
import {IReelGameSession} from "./IReelGameSession";
import {ReelGameSession} from "./ReelGameSession";

export class ReelGameWithFreeGamesSession implements IReelGameWithFreeGamesSession {
    private readonly _config: IReelGameSessionConfig;
    private readonly _reelsController: IReelGameSessionReelsController;
    private readonly _winningCalculator: IReelGameSessionWinCalculator;
    private readonly _adaptee: IReelGameSession;

    private _freeGamesNum: number;
    private _freeGamesSum: number;
    private _freeBank: number;

    constructor(config: IReelGameSessionConfig, reelsController: IReelGameSessionReelsController, winningCalculator: IReelGameSessionWinCalculator) {
        this._config = config;
        this._reelsController = reelsController;
        this._winningCalculator = winningCalculator;
        this._adaptee = new ReelGameSession(this._config, reelsController, winningCalculator);
    }

    public getReelsItems(): string[][] {
        return this._adaptee.getReelsItems();
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
        return this._adaptee.getCreditsAmount();
    }

    public getWinningAmount(): number {
        return this._adaptee.getWinningAmount();
    }

    public isBetAvailable(bet: number): boolean {
        return this._adaptee.isBetAvailable(bet);
    }

    public play(): void {
        this._adaptee.play();
    }

    public setBet(bet: number): void {
        this._adaptee.setBet(bet);
    }

    public getFreeGameBank(): number {
        return this._freeBank;
    }

    public getFreeGameNum(): number {
        return this._freeGamesNum;
    }

    public getFreeGameSum(): number {
        return this._freeGamesSum;
    }
    
}
