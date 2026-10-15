import {getSessionCompositionError, resolveSessionStateSchema, type SessionStateSchema} from "../SessionStateRestoring.js";
import type {ReelSequenceSelection, ReelSequenceStatistics} from "./combinations/WeightedSequenceVariant.js";
import type {ScreenGeometry} from "./coordinates/ScreenGeometry.js";
import {projectEvaluationSymbols} from "./coordinates/projectSymbolsCombination.js";
import {SymbolsCombination} from "./combinations/SymbolsCombination.js";
import {ScreenProjection} from "./coordinates/ScreenProjection.js";
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
// It also composes synchronous rollback boundaries; persistence certification remains separate.
export abstract class AbstractVideoSlotSessionDecorator<T extends string | number | symbol = string>
implements VideoSlotSessionHandling<T> {
    protected stepResultValid = true;
    protected readonly baseSession: VideoSlotSessionHandling<T>;

    constructor(baseSession: VideoSlotSessionHandling<T>) {
        this.baseSession = baseSession;
        // Preserve optional capabilities without advertising capabilities absent on the base.
        // A concrete decorator's own implementation always wins.
        for (const name of ["getModifierObservation", "getBetModeId", "setBetMode", "getAvailableBetModeIds", "validateEntryAction",
            "getChargedBetModeId", "getSimulationCategory", "getJackpotStatisticsSnapshot", "getJackpotPools",
            "getJackpotLastRoundOutcome", "getJackpotPoolStatistics", "getJackpotAwardCount", "getJackpotTotalAwarded", "getJackpotTotalContributed",
            "isHoldAndWinActive", "getHoldAndWinEntryBet", "getHoldAndWinLastRoundOutcome", "getLockedHoldAndWinSymbols", "getHoldAndWinRespinsRemaining", "getHoldAndWinPayout",
            "getFreeGamesNum", "getFreeGamesSum", "getFreeGamesBank", "getWonFreeGamesNumber"]) {
            const method: unknown = Reflect.get(baseSession, name);
            if (!(name in this) && typeof method === "function") Reflect.defineProperty(this, name, {value: name === "getModifierObservation"
                ? () => this.stepResultValid ? Reflect.apply(method, baseSession, []) : undefined : method.bind(baseSession)});
        }
    }

    public createStepRollback(): () => void {
        const credits = this.getCreditsAmount();
        const rollback = this.baseSession.createStepRollback?.();
        return () => {
            rollback?.();
            if (this.getCreditsAmount() !== credits) this.setCreditsAmount(credits);
            this.stepResultValid = false;
        };
    }

    public setSelectionContext(context: string): void {
        this.baseSession.setSelectionContext?.(context);
    }
    public getSequenceSelections(): ReelSequenceSelection[] {
        return this.baseSession.getSequenceSelections?.() ?? [];
    }
    public getSequenceStatistics(): ReelSequenceStatistics[] {
        return this.baseSession.getSequenceStatistics?.() ?? [];
    }

    public hasPendingLogicalRound(): boolean {
        return (this.baseSession as {hasPendingLogicalRound?: () => boolean}).hasPendingLogicalRound?.() ?? false;
    }

    public getConfiguredScreenGeometry(): ScreenGeometry | undefined {
        if (this.baseSession.getConfiguredScreenGeometry) return this.baseSession.getConfiguredScreenGeometry();
        // Capability absence permits legacy detection; an authoritative undefined return above
        // must never be replaced with geometry belonging to the previous settled combination.
        return this.baseSession.getSymbolsCombination().getScreenGeometry?.() ?? this.baseSession.getScreenGeometry?.();
    }

    public getScreenGeometry(): ScreenGeometry | undefined {
        return this.baseSession.getScreenGeometry?.();
    }

    public validateScreenCoordinates(): void {
        this.baseSession.validateScreenCoordinates?.();
    }

    public getSettledScreenDimensions(): {reels: number; rows: number} {
        const geometry = this.getScreenGeometry();
        return this.baseSession.getSettledScreenDimensions?.() ?? {
            reels: geometry?.generated.reels ?? this.getReelsNumber(),
            rows: geometry ? new ScreenProjection(geometry).getRows("visible") : this.getReelsSymbolsNumber(),
        };
    }

    public getVisibleSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const geometry = this.getScreenGeometry();
        const generated = this.getSymbolsCombination();
        return geometry ? new SymbolsCombination<T>().fromMatrix(new ScreenProjection(geometry).project(generated.toMatrix(), "visible")).withCoordinates(geometry, "visible") : generated;
    }

    public getEvaluatedSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const geometry = this.getScreenGeometry();
        const generated = this.getSymbolsCombination();
        return projectEvaluationSymbols(geometry
            ? new SymbolsCombination<T>().fromMatrix(generated.toMatrix()).withCoordinates(geometry) : generated);
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.baseSession.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.baseSession.getSymbolsCombination();
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.stepResultValid ? this.baseSession.getWinningLines() : {};
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.stepResultValid ? this.baseSession.getWinningScatters() : {} as Record<T, WinningScatterDescribing<T>>;
    }

    public getWinEvaluationResult(): WinEvaluationResult<T> {
        return this.stepResultValid ? this.baseSession.getWinEvaluationResult() : new WinEvaluationResult<T>();
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
        return this.stepResultValid ? this.baseSession.getWinAmount() : 0;
    }

    public getLinesWinning(): number {
        return this.stepResultValid ? this.baseSession.getLinesWinning() : 0;
    }

    public getScattersWinning(): number {
        return this.stepResultValid ? this.baseSession.getScattersWinning() : 0;
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
    protected executeStep(action: () => void): void {
        let rollback: (() => void) | undefined;
        this.stepResultValid = false;
        try {
            rollback = this.createStepRollback();
            this.stepResultValid = true;
            action();
        } catch (error) {
            rollback?.();
            this.stepResultValid = false;
            throw error;
        }
    }

    protected getCompositionError(kind: SessionStateSchema["kind"]): string | undefined {
        const kinds: string[] = [];
        let schema = resolveSessionStateSchema(this.baseSession);
        while ("base" in schema) {
            kinds.push(schema.kind);
            if (schema.kind === "bet-modes" && schema.stakeModifying) kinds.push("stake-modifying-bet-modes");
            schema = schema.base;
        }
        // Optional capabilities also identify legacy/custom wrappers with no built-in schema.
        for (const [method, baseKind] of [["getJackpotPools", "jackpot"], ["getBetModeId", "bet-modes"], ["getFreeGamesSum", "free-games"], ["isHoldAndWinActive", "hold-and-win"]]) {
            if (typeof Reflect.get(this.baseSession, method) === "function") kinds.push(baseKind);
        }
        return getSessionCompositionError(kind, kinds);
    }

}
