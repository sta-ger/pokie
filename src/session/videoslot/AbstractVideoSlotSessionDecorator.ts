import type {LinesDefinitionsDescribing} from "./linesdefinitions/LinesDefinitionsDescribing.js";
import type {LinesPatternsDescribing} from "./linespatterns/LinesPatternsDescribing.js";
import type {PaytableRepresenting} from "./paytable/PaytableRepresenting.js";
import type {SymbolsCombinationDescribing} from "./combinations/SymbolsCombinationDescribing.js";
import type {SymbolsSequenceDescribing} from "./combinations/SymbolsSequenceDescribing.js";
import {WinEvaluationResult} from "./winevaluation/WinEvaluationResult.js";
import type {VideoSlotSessionHandling} from "./VideoSlotSessionHandling.js";
import type {WinningLineDescribing} from "./WinningLineDescribing.js";
import type {WinningScatterDescribing} from "./WinningScatterDescribing.js";

// A pure passthrough base for classes that wrap a VideoSlotSessionHandling and only need to
// change a handful of its methods (e.g. VideoSlotWithFreeGamesSession overriding play()).
// It holds no state and no business logic of its own, so it doesn't reintroduce behavior
// inheritance between domain classes — it only removes the boilerplate of forwarding every
// method a decorator doesn't care about.
export abstract class AbstractVideoSlotSessionDecorator<T extends string | number | symbol = string>
implements VideoSlotSessionHandling<T> {
    protected readonly baseSession: VideoSlotSessionHandling<T>;

    constructor(baseSession: VideoSlotSessionHandling<T>) {
        this.baseSession = baseSession;
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.baseSession.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.baseSession.getSymbolsCombination();
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.baseSession.getWinningLines();
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.baseSession.getWinningScatters();
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        return this.baseSession.getWinEvaluationResult();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.baseSession.getSymbolsSequences();
    }

    public getReelsSymbolsNumber(): number {
        return this.baseSession.getReelsSymbolsNumber();
    }

    public getReelsNumber(): number {
        return this.baseSession.getReelsNumber();
    }

    public getAvailableSymbols(): T[] {
        return this.baseSession.getAvailableSymbols();
    }

    public getCreditsAmount(): number {
        return this.baseSession.getCreditsAmount();
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseSession.setCreditsAmount(creditsAmount);
    }

    public getWinAmount(): number {
        return this.baseSession.getWinAmount();
    }

    public getLinesWinning(): number {
        return this.baseSession.getLinesWinning();
    }

    public getScattersWinning(): number {
        return this.baseSession.getScattersWinning();
    }

    public getAvailableBets(): number[] {
        return this.baseSession.getAvailableBets();
    }

    public getBet(): number {
        return this.baseSession.getBet();
    }

    public setBet(bet: number): void {
        this.baseSession.setBet(bet);
    }

    public canPlayNextGame(): boolean {
        return this.baseSession.canPlayNextGame();
    }

    public play(): void {
        this.baseSession.play();
    }

    public isSymbolWild(symbolId: T): boolean {
        return this.baseSession.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: T): boolean {
        return this.baseSession.isSymbolScatter(symbolId);
    }

    public getWildSymbols(): T[] {
        return this.baseSession.getWildSymbols();
    }

    public getScatterSymbols(): T[] {
        return this.baseSession.getScatterSymbols();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.baseSession.getLinesDefinitions();
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.baseSession.getLinesPatterns();
    }
}
