import {GameSession} from "../GameSession.js";
import type {GameSessionHandling} from "../GameSessionHandling.js";
import type {LinesDefinitionsDescribing} from "./linesdefinitions/LinesDefinitionsDescribing.js";
import type {LinesPatternsDescribing} from "./linespatterns/LinesPatternsDescribing.js";
import type {PaytableRepresenting} from "./paytable/PaytableRepresenting.js";
import {SymbolsCombination} from "./combinations/SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "./combinations/SymbolsCombinationDescribing.js";
import type {SymbolsCombinationsGenerating} from "./combinations/SymbolsCombinationsGenerating.js";
import {SymbolsCombinationsGenerator} from "./combinations/SymbolsCombinationsGenerator.js";
import type {SymbolsSequenceDescribing} from "./combinations/SymbolsSequenceDescribing.js";
import {VideoSlotConfig} from "./VideoSlotConfig.js";
import type {VideoSlotConfigRepresenting} from "./VideoSlotConfigRepresenting.js";
import type {VideoSlotSessionHandling} from "./VideoSlotSessionHandling.js";
import type {VideoSlotWinCalculating} from "./wincalculator/VideoSlotWinCalculating.js";
import {VideoSlotWinCalculator} from "./wincalculator/VideoSlotWinCalculator.js";
import type {WinningLineDescribing} from "./WinningLineDescribing.js";
import type {WinningScatterDescribing} from "./WinningScatterDescribing.js";
import {LegacyWinEvaluationResultAdapter} from "./winevaluation/LegacyWinEvaluationResultAdapter.js";
import {WinEvaluationResult} from "./winevaluation/WinEvaluationResult.js";

export class VideoSlotSession<T extends string | number | symbol = string> implements VideoSlotSessionHandling<T> {
    private readonly baseSession: GameSessionHandling;
    private readonly config: VideoSlotConfigRepresenting<T>;
    private readonly combinationsGenerator: SymbolsCombinationsGenerating<T>;
    private readonly winCalculator: VideoSlotWinCalculating<T>;
    private winAmount = 0;
    private symbolsCombination: SymbolsCombinationDescribing<T> = new SymbolsCombination<T>();

    constructor(
        config: VideoSlotConfigRepresenting<T> = new VideoSlotConfig<T>(),
        combinationsGenerator: SymbolsCombinationsGenerating<T> = new SymbolsCombinationsGenerator<T>(config),
        winCalculator: VideoSlotWinCalculating<T> = new VideoSlotWinCalculator<T>(config),
        baseSession: GameSessionHandling = new GameSession(config),
    ) {
        this.config = config;
        this.combinationsGenerator = combinationsGenerator;
        this.winCalculator = winCalculator;
        this.baseSession = baseSession;
        this.symbolsCombination = this.combinationsGenerator.generateSymbolsCombination();
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.config.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.symbolsCombination;
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.winCalculator.getWinningLines();
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.winCalculator.getWinningScatters();
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        if (this.supportsWinEvaluationResult()) {
            return this.winCalculator.getWinEvaluationResult!();
        }
        return LegacyWinEvaluationResultAdapter.fromWinCalculator(this.winCalculator);
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.config.getSymbolsSequences();
    }

    public getReelsSymbolsNumber(): number {
        return this.config.getReelsSymbolsNumber();
    }

    public getReelsNumber(): number {
        return this.config.getReelsNumber();
    }

    public getAvailableSymbols(): T[] {
        return [...this.config.getAvailableSymbols()];
    }

    public getCreditsAmount(): number {
        return this.baseSession.getCreditsAmount();
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseSession.setCreditsAmount(creditsAmount);
    }

    public getWinAmount(): number {
        return this.supportsWinEvaluationResult()
            ? this.getWinEvaluationResult().getTotalWin()
            : this.winCalculator.getWinAmount();
    }

    public getLinesWinning(): number {
        return this.winCalculator.getLinesWinning();
    }

    public getScattersWinning(): number {
        return this.winCalculator.getScattersWinning();
    }

    public getAvailableBets(): number[] {
        return [...this.config.getAvailableBets()];
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
        this.symbolsCombination = this.combinationsGenerator.generateSymbolsCombination();
        this.winCalculator.calculateWin(this.getBet(), this.symbolsCombination);
        this.winAmount = this.getWinAmount();
        this.setCreditsAmount(this.getCreditsAmount() + this.winAmount);
    }

    public isSymbolWild(symbolId: T): boolean {
        return this.config.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: T): boolean {
        return this.config.isSymbolScatter(symbolId);
    }

    public getWildSymbols(): T[] {
        return this.config.getWildSymbols();
    }

    public getScatterSymbols(): T[] {
        return this.config.getScatterSymbols();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.config.getLinesDefinitions();
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.config.getLinesPatterns();
    }

    private supportsWinEvaluationResult(): boolean {
        return typeof this.winCalculator.getWinEvaluationResult === "function";
    }
}
