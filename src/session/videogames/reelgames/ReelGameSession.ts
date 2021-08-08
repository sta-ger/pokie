import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {IGameSession} from "../../IGameSession";
import {GameSession} from "../../GameSession";
import {IReelGameSessionReelsController} from "./reelscontroller/IReelGameSessionReelsController";
import {IReelGameSessionWinCalculator} from "./wincalculator/IReelGameSessionWinCalculator";
import {ReelGameSessionWinCalculator} from "./wincalculator/ReelGameSessionWinCalculator";
import {IReelGameSessionWinningLineModel} from "./wincalculator/IReelGameSessionWinningLineModel";

export class ReelGameSession implements IReelGameSession {

    public static getLosingCombination(
        winningCalculator: IReelGameSessionWinCalculator,
        reelsController: IReelGameSessionReelsController,
    ): string[][] {
        // TODO test
        let combination: string[][];
        combination = reelsController.getRandomItemsCombination();
        winningCalculator.setGameState(1, combination);
        while (
            Object.keys(winningCalculator.getWinningLines()).length > 0 ||
            Object.keys(winningCalculator.getWinningScatters()).length > 0
            ) {
            combination = reelsController.getRandomItemsCombination();
            winningCalculator.setGameState(1, combination);
        }
        return combination;
    }

    public static getWinningCombinationWithScatter(
        winningCalculator: IReelGameSessionWinCalculator,
        reelsController: IReelGameSessionReelsController,
    ): string[][] {
        // TODO test
        let combination: string[][];
        combination = reelsController.getRandomItemsCombination();
        winningCalculator.setGameState(1, combination);
        while (
            Object.keys(winningCalculator.getWinningLines()).length > 0 ||
            Object.keys(winningCalculator.getWinningScatters()).length === 0
            ) {
            combination = reelsController.getRandomItemsCombination();
            winningCalculator.setGameState(1, combination);
        }
        return combination;
    }

    public static getWinningCombinationForSymbol(
        winningCalculator: IReelGameSessionWinCalculator,
        reelsController: IReelGameSessionReelsController,
        symbolId: string,
        minLinesNumber: number = 1,
        allowWilds: boolean = true,
        wildItemId: string = "",
    ): string[][] {
        // TODO test
        let combination: string[][];
        combination = reelsController.getRandomItemsCombination();
        winningCalculator.setGameState(1, combination);
        while (
            Object.keys(winningCalculator.getWinningLines()).length < minLinesNumber ||
            Object.keys(winningCalculator.getWinningScatters()).length > 0 ||
            ReelGameSessionWinCalculator.getLinesWithSymbol(
                winningCalculator.getWinningLines(),
                symbolId,
            ).length === 0 ||
            !ReelGameSessionWinCalculator.isAllLinesHasSameItemId(winningCalculator.getWinningLines()) ||
            (!allowWilds && ReelGameSessionWinCalculator.getLinesContainingItem(
                winningCalculator.getWinningLines(),
                combination,
                wildItemId,
            ).length > 0)) {
            combination = reelsController.getRandomItemsCombination();
            winningCalculator.setGameState(1, combination);
        }
        return combination;
    }

    public static getWinningCombinationWithDifferentSymbols(
        winningCalculator: IReelGameSessionWinCalculator,
        reelsController: IReelGameSessionReelsController,
    ): string[][] {
        // TODO test
        let combination: string[][];
        combination = reelsController.getRandomItemsCombination();
        winningCalculator.setGameState(1, combination);
        while (
            Object.keys(winningCalculator.getWinningLines()).length <= 1 ||
            Object.keys(winningCalculator.getWinningScatters()).length > 0 ||
            ReelGameSessionWinCalculator.getLinesWithDifferentSymbols(winningCalculator.getWinningLines()).length <= 1
            ) {
            combination = reelsController.getRandomItemsCombination();
            winningCalculator.setGameState(1, combination);
        }
        return combination;
    }

    private readonly _config: IReelGameSessionConfig;
    private readonly _reelsController: IReelGameSessionReelsController;
    private readonly _winningCalculator: IReelGameSessionWinCalculator;
    private readonly _adaptee: IGameSession;
    private _winningAmount: number;
    private _reelsItems: string[][] = [];

    constructor(
        config: IReelGameSessionConfig,
        reelsController: IReelGameSessionReelsController,
        winningCalculator: IReelGameSessionWinCalculator,
    ) {
        this._config = config;
        this._reelsController = reelsController;
        this._winningCalculator = winningCalculator;
        this._adaptee = new GameSession(this._config);
        this._winningAmount = 0;
    }

    public getReelsItems(): string[][] {
        return this._reelsItems;
    }

    public getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel } {
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

    public setCreditsAmount(value: number): void {
        this._adaptee.setCreditsAmount(value);
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
        this.setCreditsAmount(this.getCreditsAmount() + this._winningAmount);
    }

    public setBet(bet: number): void {
        this._adaptee.setBet(bet);
    }

}
