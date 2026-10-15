import {cloneModifierData, type ScreenModifiers} from "./modifiers/ScreenModifiers.js";
import {validateScreenModifiers} from "./modifiers/validateScreenModifiers.js";
import {WeightedSymbolsSequence, validateWeightedReelDefinitions} from "./combinations/WeightedSymbolsSequence.js";
import type {ScreenGeometry} from "./coordinates/ScreenGeometry.js";
import {ScreenProjection} from "./coordinates/ScreenProjection.js";
import {CustomLinesDefinitions} from "./linesdefinitions/CustomLinesDefinitions.js";
import {RightToLeftLinesPatterns} from "./linespatterns/RightToLeftLinesPatterns.js";
import {ScatteredLinesPatterns} from "./linespatterns/ScatteredLinesPatterns.js";
import {SymbolsSequence} from "./combinations/SymbolsSequence.js";
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
    private screenGeometry?: ScreenGeometry;

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

    private screenModifiers?: ScreenModifiers<T>;

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

    public getScreenModifiers(): ScreenModifiers<T> | undefined {
        return this.screenModifiers && cloneModifierData(this.screenModifiers);
    }
    public setScreenModifiers(modifiers: ScreenModifiers<T> | undefined): void {
        if (modifiers !== undefined) {
            const issues = validateScreenModifiers(modifiers, {symbols: this.getAvailableSymbols(), wilds: this.getWildSymbols(), reels: this.getReelsNumber(), rows: this.getReelsSymbolsNumber(), screenGeometry: this.getScreenGeometry()});
            if (issues.length) throw new Error(issues.map(issue => issue.message).join("; "));
        }
        this.screenModifiers = modifiers && cloneModifierData(modifiers);
    }

    public getScreenGeometry(): ScreenGeometry | undefined {
        return this.screenGeometry && new ScreenProjection(this.screenGeometry).getGeometry();
    }

    public setScreenGeometry(geometry: ScreenGeometry | undefined): void {
        this.screenGeometry = geometry === undefined ? undefined : new ScreenProjection(geometry).getGeometry();
    }

    /** Built-in resolved data only: subclasses and injected model strategies need their own complete codec. */
    public isResolvedForSessionRestoration(): boolean {
        return this.constructor === VideoSlotConfig && this.baseConfig.constructor === GameSessionConfig &&
            this.paytable.constructor === Paytable &&
            [HorizontalLines, CustomLinesDefinitions].some(kind => this.linesDefinitions.constructor === kind) &&
            [LeftToRightLinesPatterns, RightToLeftLinesPatterns, ScatteredLinesPatterns].some(kind => this.linesPatterns.constructor === kind) &&
            this.reelsSymbolsSequences.every(strip => strip.constructor === SymbolsSequence || strip.constructor === WeightedSymbolsSequence);
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
        if (!this.screenModifiers) return this.wildSubstitutions;
        const substitutions = Object.assign(Object.create(null) as Partial<Record<T, T[]>>, this.wildSubstitutions);
        for (const wild of this.screenModifiers.wilds) {
            if (wild.substitutes === undefined) Reflect.deleteProperty(substitutions, wild.symbol);
            else Reflect.defineProperty(substitutions, wild.symbol, {value: [...wild.substitutes], enumerable: true, configurable: true, writable: true});
        }
        return substitutions;
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
        validateWeightedReelDefinitions(reelsSymbolsSequences, this.reelsNumber, this.availableSymbols, this.screenGeometry?.generated.rows ?? this.reelsSymbolsNumber);
        this.reelsSymbolsSequences = [...reelsSymbolsSequences];
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
