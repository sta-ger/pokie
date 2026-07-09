import {GameSessionConfig} from "../GameSessionConfig.js";
import {HorizontalLines} from "./linesdefinitions/HorizontalLines.js";
import {LeftToRightLinesPatterns} from "./linespatterns/LeftToRightLinesPatterns.js";
import type {LinesDefinitionsDescribing} from "./linesdefinitions/LinesDefinitionsDescribing.js";
import type {LinesPatternsDescribing} from "./linespatterns/LinesPatternsDescribing.js";
import {Paytable} from "./paytable/Paytable.js";
import type {PaytableRepresenting} from "./paytable/PaytableRepresenting.js";
import type {ReelsSymbolsSequencesGenerating} from "./combinations/ReelsSymbolsSequencesGenerating.js";
import {ReelsSymbolsSequencesGenerator} from "./combinations/ReelsSymbolsSequencesGenerator.js";
import type {SymbolsSequenceDescribing} from "./combinations/SymbolsSequenceDescribing.js";
import type {VideoSlotConfigRepresenting} from "./VideoSlotConfigRepresenting.js";

export class VideoSlotConfig<T extends string | number | symbol = string> implements VideoSlotConfigRepresenting<T> {
    private readonly baseConfig: GameSessionConfig;
    private readonly sequencesGenerator: ReelsSymbolsSequencesGenerating<T>;

    private reelsNumber: number;
    private reelsSymbolsNumber: number;
    private availableSymbols: T[];
    private wilds: T[];
    private reelsSymbolsSequences: SymbolsSequenceDescribing<T>[];
    private paytable: PaytableRepresenting<T>;
    private scatters: T[];
    private linesDefinitions: LinesDefinitionsDescribing;
    private linesPatterns: LinesPatternsDescribing;
    private wildSubstitutions: Partial<Record<T, T[]>> = {};

    constructor(
        baseConfig = new GameSessionConfig(),
        sequencesGenerator: ReelsSymbolsSequencesGenerating<T> = new ReelsSymbolsSequencesGenerator<T>(),
    ) {
        this.baseConfig = baseConfig;
        this.sequencesGenerator = sequencesGenerator;
        this.reelsNumber = 5;
        this.reelsSymbolsNumber = 3;
        // Default symbol IDs are string literals — safe for the default `T = string`, but TS
        // can't prove an arbitrary `T` accepts them, hence the cast.
        this.availableSymbols = ["A", "K", "Q", "J", "10", "9", "W", "S"] as unknown as T[];
        this.wilds = ["W"] as unknown as T[];
        this.paytable = new Paytable<T>(
            this.getAvailableBets(),
            this.availableSymbols.filter((symbol) => !this.isSymbolWild(symbol)),
            this.wilds,
            this.reelsNumber,
        );
        this.scatters = ["S"] as unknown as T[];
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
        this.linesPatterns = new LeftToRightLinesPatterns(this.reelsNumber);
        this.reelsSymbolsSequences = this.createReelsSymbolsSequences();
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.paytable;
    }

    public setPaytable(paytable: PaytableRepresenting<T>): void {
        this.paytable = paytable;
    }

    public getWildSymbols(): T[] {
        return this.wilds;
    }

    public setWildSymbols(value: T[]): void {
        this.wilds = value;
    }

    public getWildSubstitutions(): Partial<Record<T, T[]>> {
        return this.wildSubstitutions;
    }

    public setWildSubstitutions(value: Partial<Record<T, T[]>>): void {
        this.wildSubstitutions = value;
    }

    public getScatterSymbols(): T[] {
        return this.scatters.slice();
    }

    public setScatterSymbols(value: T[]): void {
        this.scatters = value.slice();
        this.reelsSymbolsSequences = this.createReelsSymbolsSequences();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.linesDefinitions;
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.linesPatterns;
    }

    public setLinesDefinitions(linesDefinitions: LinesDefinitionsDescribing): void {
        this.linesDefinitions = linesDefinitions;
    }

    public setLinesPatterns(linesPatterns: LinesPatternsDescribing): void {
        this.linesPatterns = linesPatterns;
    }

    public getReelsSymbolsNumber(): number {
        return this.reelsSymbolsNumber;
    }

    public setReelsSymbolsNumber(reelsSymbolsNumber: number): void {
        this.reelsSymbolsNumber = reelsSymbolsNumber;
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
    }

    public getReelsNumber(): number {
        return this.reelsNumber;
    }

    public setReelsNumber(reelsNumber: number): void {
        this.reelsNumber = reelsNumber;
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
        this.linesPatterns = new LeftToRightLinesPatterns(this.reelsNumber);
    }

    public getAvailableSymbols(): T[] {
        return this.availableSymbols.slice();
    }

    public setAvailableSymbols(availableSymbols: T[]): void {
        this.availableSymbols = availableSymbols.slice();
        this.paytable = new Paytable<T>(
            this.getAvailableBets(),
            this.availableSymbols.filter((symbol) => !this.isSymbolWild(symbol)),
            this.wilds,
            this.reelsNumber,
        );
        this.reelsSymbolsSequences = this.createReelsSymbolsSequences();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.reelsSymbolsSequences;
    }

    public setSymbolsSequences(reelsSymbolsSequences: SymbolsSequenceDescribing<T>[]): void {
        this.reelsSymbolsSequences = reelsSymbolsSequences;
    }

    public isSymbolWild(symbolId: T): boolean {
        return this.wilds.includes(symbolId);
    }

    public isSymbolScatter(symbolId: T): boolean {
        return this.scatters.some((s) => s === symbolId);
    }

    public setAvailableBets(availableBets: number[]): void {
        this.baseConfig.setAvailableBets(availableBets.slice());
    }

    public getAvailableBets(): number[] {
        return this.baseConfig.getAvailableBets().slice();
    }

    public isBetAvailable(bet: number): boolean {
        return this.baseConfig.isBetAvailable(bet);
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseConfig.setCreditsAmount(creditsAmount);
    }

    public getCreditsAmount(): number {
        return this.baseConfig.getCreditsAmount();
    }

    public setBet(bet: number): void {
        this.baseConfig.setBet(bet);
    }

    public getBet(): number {
        return this.baseConfig.getBet();
    }

    private createReelsSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.sequencesGenerator.generate(this.reelsNumber, this.availableSymbols, this.wilds, this.scatters);
    }
}
