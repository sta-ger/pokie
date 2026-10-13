import {ScreenProjection} from "./coordinates/ScreenProjection.js";
import {assertEvaluationComponents} from "./coordinates/internal/assertEvaluationComponents.js";
import {areScreenGeometriesCompatible, projectEvaluationSymbols, resolveGeneratedScreenGeometry, resolveScreenProjection, validateEvaluationPaylines} from "./coordinates/projectSymbolsCombination.js";
import type {ScreenGeometry} from "./coordinates/ScreenGeometry.js";
import {SymbolsSequence} from "./combinations/SymbolsSequence.js";
import {validateExecutableState} from "../../runtime/validateExecutableState.js";
import type {SessionStateRestoring} from "../SessionStateRestoring.js";
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
import type {ConvertableToSessionState} from "../ConvertableToSessionState.js";
import type {BuildableFromSessionState} from "../BuildableFromSessionState.js";

export class VideoSlotSession<T extends string | number | symbol = string> implements VideoSlotSessionHandling<T>, ConvertableToSessionState<{rngState?: unknown; reelStrips?: T[][]}>, BuildableFromSessionState<{rngState?: unknown; reelStrips?: T[][]}>, SessionStateRestoring {
    private readonly baseSession: GameSessionHandling;
    private readonly config: VideoSlotConfigRepresenting<T>;
    private readonly combinationsGenerator: SymbolsCombinationsGenerating<T>;
    private readonly winCalculator: VideoSlotWinCalculating<T>;
    private winAmount = 0;
    private resultValid = true;
    private roundGeometry?: ScreenGeometry;
    private roundDimensions = {reels: 0, rows: 0};

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
        const contract = this.resolveUpcomingCoordinates();
        const generated = this.combinationsGenerator.generateSymbolsCombination();
        const geometry = this.validateGeneratedCoordinates(generated, contract, true);
        this.symbolsCombination = generated;
        this.roundGeometry = geometry;
        this.roundDimensions = this.captureScreenDimensions(geometry);
    }

    public getConfiguredScreenGeometry(): ScreenGeometry | undefined {
        const configured = this.config.getScreenGeometry?.();
        // A generator capability owns the upcoming contract, including an ordinary undefined
        // value. Only legacy generators without that capability fall back to their last tag.
        const generatorGeometry = this.combinationsGenerator.getScreenGeometry
            ? this.combinationsGenerator.getScreenGeometry() : this.symbolsCombination.getScreenGeometry?.();
        if ((this.combinationsGenerator.getScreenGeometry || generatorGeometry) && configured &&
            !areScreenGeometriesCompatible(configured, generatorGeometry)) {
            throw new Error("Generator geometry differs from the configured coordinate contract.");
        }
        const geometry = configured ?? generatorGeometry;
        return geometry && new ScreenProjection(geometry).getGeometry();
    }

    public getScreenGeometry(): ScreenGeometry | undefined {
        return this.roundGeometry && new ScreenProjection(this.roundGeometry).getGeometry();
    }

    public getSettledScreenDimensions(): {reels: number; rows: number} {
        return {...this.roundDimensions};
    }

    public getVisibleSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const projection = this.roundGeometry && new ScreenProjection(this.roundGeometry);
        return projection ? new SymbolsCombination<T>().fromMatrix(projection.project(this.symbolsCombination.toMatrix(), "visible")).withCoordinates(projection.getGeometry(), "visible") : this.symbolsCombination;
    }

    public getEvaluatedSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.roundGeometry
            ? projectEvaluationSymbols(new SymbolsCombination<T>().fromMatrix(this.symbolsCombination.toMatrix()).withCoordinates(this.roundGeometry)) : this.symbolsCombination;
    }

    public validateScreenCoordinates(): void {
        this.resolveUpcomingCoordinates();
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.config.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.symbolsCombination;
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.resultValid ? this.winCalculator.getWinningLines() : {};
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.resultValid ? this.winCalculator.getWinningScatters() : {} as Record<T, WinningScatterDescribing<T>>;
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        if (!this.resultValid) return new WinEvaluationResult<T>();
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
        if (!this.resultValid) return 0;
        return this.supportsWinEvaluationResult()
            ? this.getWinEvaluationResult().getTotalWin()
            : this.winCalculator.getWinAmount();
    }

    public getLinesWinning(): number {
        return this.resultValid ? this.winCalculator.getLinesWinning() : 0;
    }

    public getScattersWinning(): number {
        return this.resultValid ? this.winCalculator.getScattersWinning() : 0;
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

    public hasPendingLogicalRound(): boolean {
        return false;
    }

    public play(): void {
        // GameSession.play() silently no-ops the debit on insufficient credits — check the same
        // precondition here too, so a round that couldn't be paid for never generates a screen,
        // computes a win, or pays one out. Callers should check canPlayNextGame() themselves, but
        // this keeps the invariant true even when they don't.
        if (!this.canPlayNextGame()) {
            return;
        }
        this.resultValid = false;
        const contract = this.resolveUpcomingCoordinates();
        const generated = this.combinationsGenerator.generateSymbolsCombination();
        const geometry = this.validateGeneratedCoordinates(generated, contract);
        const evaluationSource = geometry
            ? new SymbolsCombination<T>().fromMatrix(generated.toMatrix()).withCoordinates(geometry) : generated;
        const evaluated = projectEvaluationSymbols(evaluationSource);
        this.winCalculator.calculateWin(this.getBet(), evaluated);
        if (geometry) {
            const result = this.supportsWinEvaluationResult() ? this.winCalculator.getWinEvaluationResult!() : LegacyWinEvaluationResultAdapter.fromWinCalculator(this.winCalculator);
            assertEvaluationComponents(result.getWinComponents(), geometry);
        }
        this.baseSession.play();
        this.symbolsCombination = generated;
        this.roundGeometry = geometry;
        this.roundDimensions = this.captureScreenDimensions(geometry);
        this.resultValid = true;
        this.winAmount = this.getWinAmount();
        this.setCreditsAmount(this.getCreditsAmount() + this.winAmount);
    }

    public getSessionStateSchema(): {readonly kind: "seeded-video-slot"; readonly screenGeometry?: ScreenGeometry} {
        const screenGeometry = this.config.getScreenGeometry?.();
        return {kind: "seeded-video-slot", ...(screenGeometry ? {screenGeometry} : {})};
    }

    public isSessionStateRestorable(): boolean {
        const generator = this.combinationsGenerator as {isRandomStateRestorable?: () => boolean};
        return this.constructor === VideoSlotSession && generator.isRandomStateRestorable?.() === true &&
            this.combinationsGenerator instanceof SymbolsCombinationsGenerator && this.combinationsGenerator.usesConfig(this.config) &&
            this.getSymbolsSequences().every(strip => strip.getSymbols(0, strip.getSize()).every(symbol => typeof symbol === "string" || (typeof symbol === "number" && Number.isFinite(symbol)))) &&
            this.baseSession instanceof GameSession && this.baseSession.usesConfig(this.config) && this.baseSession.isSessionStateRestorable() &&
            this.winCalculator instanceof VideoSlotWinCalculator && this.winCalculator.usesConfig(this.config) && this.winCalculator.isStatelessForSessionRestoration();
    }

    public getRandomStateCodec(): "seeded" | "opaque" {
        return (this.combinationsGenerator as {getRandomStateCodec?: () => "seeded" | "opaque"}).getRandomStateCodec?.() ?? "opaque";
    }

    public toSessionState(): {rngState?: unknown; reelStrips?: T[][]} {
        const rngState = (this.combinationsGenerator as {getRandomState?: () => unknown}).getRandomState?.();
        return rngState === undefined ? {} : {rngState, reelStrips: this.getSymbolsSequences().map(strip => strip.getSymbols(0, strip.getSize()))};
    }

    public validateSessionState(state: unknown): void {
        if (typeof state !== "object" || state === null || Array.isArray(state)) throw new Error("Video-slot state must be an object.");
        const rngState = (state as {rngState?: unknown; reelStrips?: T[][]}).rngState;
        if (rngState === undefined && !this.isSessionStateRestorable()) return;
        validateExecutableState(state, this.getSessionStateSchema());
        const strips = (state as {reelStrips: T[][]}).reelStrips;
        if (strips.length !== this.config.getReelsNumber() || !strips.every(strip => strip.every(symbol => this.config.getAvailableSymbols().includes(symbol)))) throw new Error("Resolved reels do not match the selected model's dimensions or symbols.");
        if (typeof rngState !== "number" || !Number.isSafeInteger(rngState) || rngState < 0 || rngState > 0xffffffff) {
            throw new Error("Video-slot state requires a valid seeded RNG snapshot.");
        }
    }

    public fromSessionState(state: {rngState?: unknown; reelStrips?: T[][]}): this {
        if (this.isSessionStateRestorable()) this.validateSessionState(state);
        if (typeof state !== "object" || state === null || state.rngState === undefined) {
            if (!this.isSessionStateRestorable() && typeof state === "object" && state !== null) return this;
            throw new Error("Video-slot state requires an RNG snapshot.");
        }
        if (state.rngState !== undefined) {
            const generator = this.combinationsGenerator as {setRandomState?: (value: unknown) => void};
            if (generator.setRandomState === undefined) throw new Error("This video-slot session cannot restore its RNG state.");
            if (state.reelStrips !== undefined) this.config.setSymbolsSequences(state.reelStrips.map(strip => new SymbolsSequence<T>().fromArray(strip)));
            generator.setRandomState(state.rngState);
        }
        return this;
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

    private captureScreenDimensions(geometry?: ScreenGeometry): {reels: number; rows: number} {
        return {reels: geometry?.generated.reels ?? this.config.getReelsNumber(),
            rows: geometry ? new ScreenProjection(geometry).getRows("visible") : this.config.getReelsSymbolsNumber()};
    }

    private resolveUpcomingCoordinates(): {geometry?: ScreenGeometry; authoritative: boolean} {
        const geometry = this.getConfiguredScreenGeometry();
        const projection = this.validateCoordinateGeometry(geometry);
        // Without a declared evaluation window, upcoming reel heights are unresolved. Do not
        // use viewport rows or the previous ordinary matrix to constrain the next generation.
        validateEvaluationPaylines(this.config, undefined, projection);
        return {geometry, authoritative: typeof this.combinationsGenerator.getScreenGeometry === "function"};
    }

    private validateCoordinateGeometry(geometry?: ScreenGeometry): ScreenProjection | undefined {
        return resolveScreenProjection({
            getScreenGeometry: () => geometry,
            getReelsNumber: () => this.config.getReelsNumber(),
            getReelsSymbolsNumber: () => this.config.getReelsSymbolsNumber(),
        });
    }

    private validateGeneratedCoordinates(generated: SymbolsCombinationDescribing<T>, contract: {geometry?: ScreenGeometry; authoritative: boolean}, initializing = false): ScreenGeometry | undefined {
        const geometry = resolveGeneratedScreenGeometry(generated, contract.geometry, contract.authoritative);
        const projection = this.validateCoordinateGeometry(geometry);
        // Exact-enumeration metadata probes historically initialize with an empty, untagged
        // display placeholder. It may not be projected or settled; play always validates the matrix.
        const placeholder = initializing && generated.toMatrix().length === 0 && !generated.getScreenGeometry?.();
        if (!placeholder) {
            projection?.assertMatrix(generated.toMatrix(), "generated");
        }
        // Discovered legacy tags and actual ordinary reel heights now provide the missing bounds,
        // before initialization is published or play reaches the calculator and base settlement.
        validateEvaluationPaylines(this.config, placeholder ? undefined : generated, projection);
        return geometry;
    }

    private supportsWinEvaluationResult(): boolean {
        return typeof this.winCalculator.getWinEvaluationResult === "function";
    }
}
