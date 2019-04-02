import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {IGameSession} from "../../IGameSession";
import {GameSession} from "../../GameSession";
import {ReelGameSessionConfig} from "./ReelGameSessionConfig";

export class ReelGameSession implements IReelGameSession {
    private readonly _config: IReelGameSessionConfig;
    private readonly _adaptee: IGameSession;
    private _winningAmount: number;

    constructor(config?: IReelGameSessionConfig) {
        if (config) {
            this._config = config;
        } else {
            this._config = new ReelGameSessionConfig();
        }
        this._adaptee = new GameSession(this._config);
        this._winningAmount = 0
    }

    public getReelsItems(): string[][] {
        return null;
    }
    
    public getWinningLines(): {} {
        return null;
    }
    
    public getWinningScatters(): {} {
        return null;
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
        return this._winningAmount;
    }

    public isBetAvailable(bet: number): boolean {
        return this._adaptee.isBetAvailable(bet);
    }

    public play(): void {
    }

    public setBet(bet: number): void {
        this._adaptee.setBet(bet);
    }
    
}
