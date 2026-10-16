import {validateWeightedBonusAccounting, shouldSelectWeightedBonus, weightedBonusPayout, weightedBonusModel, type WeightedBonusState, type WeightedBonusStatistics, type WeightedBonusProviding} from "./WeightedBonus.js";
import {cloneSessionData} from "../../../runtime/internal/cloneSessionData.js";
import {validateAuthoredMechanics} from "../../../generated/validateAuthoredMechanics.js";
import {validateExecutableState} from "../../../runtime/validateExecutableState.js";
import {isSessionStateRestorable, resolveSessionStateSchema, type SessionStateRestoring, type SessionStateSchema} from "../../SessionStateRestoring.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import {VideoSlotConfig} from "../VideoSlotConfig.js";
import type {VideoSlotConfigRepresenting} from "../VideoSlotConfigRepresenting.js";
import {VideoSlotSession} from "../VideoSlotSession.js";
import {SymbolsCombination} from "../combinations/SymbolsCombination.js";
import {SymbolsCombinationsGenerator} from "../combinations/SymbolsCombinationsGenerator.js";
import {VideoSlotWinCalculator} from "../wincalculator/VideoSlotWinCalculator.js";
import {CascadeResult} from "../cascade/CascadeResult.js";
import {CascadingSpinResolver} from "../cascade/CascadingSpinResolver.js";
import {ValueWinComponent} from "../winevaluation/ValueWinComponent.js";
import {WinningValue} from "../WinningValue.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {resolveCollectionTransition, resolveRespinTransition, type BoundedMechanics, type BoundedMechanicObservation, type BoundedMechanicsProviding} from "./BoundedMechanics.js";

export type BoundedSessionState = {base: unknown; value: number; remaining: number; executed: number; entryBet: number; bonus?: WeightedBonusState};

/** One accepted play updates the collection exactly once, on the final screen after cascading.
 * Respins pay each accepted subround; cascade stages are delivery-only after this transaction.
 */
export class BoundedVideoSlotSession extends AbstractVideoSlotSessionDecorator implements SessionStateRestoring, BoundedMechanicsProviding, WeightedBonusProviding {
    private bonus?: WeightedBonusState;
    private readonly rules: BoundedMechanics;
    private readonly config: VideoSlotConfigRepresenting;
    private readonly generator: SymbolsCombinationsGenerator;
    private readonly calculator: VideoSlotWinCalculator;
    private value = 0;
    private remaining = 0;
    private executed = 0;
    private entryBet = 0;
    private observation?: BoundedMechanicObservation;
    private cascade?: CascadeResult;
    private evaluation = new WinEvaluationResult();
    private screen?: string[][];

    constructor(config: VideoSlotConfigRepresenting, generator: SymbolsCombinationsGenerator, rules: BoundedMechanics, calculator = new VideoSlotWinCalculator(config)) {
        const issues = validateAuthoredMechanics({mechanics: rules, symbols: config.getAvailableSymbols(), reels: config.getReelsNumber(), rows: config.getReelsSymbolsNumber(), screenGeometry: config.getScreenGeometry?.()});
        if (issues.length) throw new Error(issues.map(issue => issue.message).join("; "));
        const frozen = cloneSessionData(rules);
        if (Reflect.getPrototypeOf(config) !== VideoSlotConfig.prototype || config.getScreenModifiers?.() || !Object.keys(rules).length || Object.keys(rules).some(key => !["cascade", "respins", "collection", "weightedBonus"].includes(key)) || issues.length) throw new Error(issues.map(issue => issue.message).join("; ") || "Unsupported bounded mechanic composition.");
        if (!generator.isRandomStateRestorable() || !calculator.isStatelessForSessionRestoration()) throw new Error("Bounded mechanics require the built-in seeded generator and stateless evaluator codec.");
        if (!generator.usesConfig(config) || !calculator.usesConfig(config)) throw new Error("Bounded mechanics must share their configuration and RNG owner.");
        super(new VideoSlotSession(config, generator, calculator));
        this.rules = frozen;
        if (frozen.weightedBonus) this.bonus = {selection: null, counts: frozen.weightedBonus.outcomes.map(() => 0), completed: 0, context: "initialization", implicitRound: 0};
        this.config = config;
        this.generator = generator;
        this.calculator = calculator;
        if (frozen.cascade) Reflect.defineProperty(this, "getCascadeResult", {value: () => this.cascade ?? new CascadeResult(this.getSymbolsCombination().toMatrix(), this.getSymbolsCombination().toMatrix(), [], {}, {}, {}, new WinEvaluationResult())});
    }

    public override setSelectionContext(context: string): void {
        if (this.bonus && ((this.remaining > 0 && context !== this.bonus.context) || (this.remaining === 0 && context === this.bonus.context))) throw new Error("Weighted bonus context is pending or already consumed; use the runtime to retry a retained request.");
        // Implicit contexts are a monotonic entry counter. Reject before the nested setter
        // can change its pending request or counter, so every accepted snapshot restores.
        if (this.bonus && context.startsWith("implicit:") && this.remaining === 0 && Number(context.slice(9)) <= this.bonus.implicitRound) throw new Error("Weighted bonus implicit context must advance the consumed counter.");
        super.setSelectionContext(context);
        if (this.bonus) {
            this.bonus.requestedContext = context;
        }
    }

    public getWeightedBonusStatistics(): WeightedBonusStatistics | undefined {
        const table = this.rules.weightedBonus;
        if (!table || !this.bonus) return undefined;
        const selections = this.bonus.counts.reduce((sum, count) => sum + count, 0);
        const total = table.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
        return {tableId: table.id, model: weightedBonusModel(table), selections, completed: this.bonus.completed, incomplete: selections - this.bonus.completed, outcomes: table.outcomes.map((outcome, index) => ({id: outcome.id, weight: outcome.weight, probability: outcome.weight / total, count: this.bonus!.counts[index], frequency: selections ? this.bonus!.counts[index] / selections : 0, uncovered: outcome.weight > 0 && this.bonus!.counts[index] === 0}))};
    }

    public getBoundedMechanicObservation(): BoundedMechanicObservation | undefined {
        if (!this.stepResultValid) return undefined;
        const {collection, respins, cascade} = this.rules;
        return cloneSessionData(this.observation ?? {
            ...(collection ? {collection: {value: this.value, cap: collection.cap, threshold: collection.threshold, contribution: 0, triggered: false, reset: collection.reset, payout: 0}} : {}),
            ...(respins ? {respins: {remaining: this.remaining, executed: this.executed, granted: 0, limit: respins.maxRespins}} : {}),
            ...(cascade ? {cascade: {winningCascades: 0, evaluatedSteps: 0}} : {}),
        });
    }
    public override getWinEvaluationResult(): WinEvaluationResult {
        return this.stepResultValid ? this.evaluation : new WinEvaluationResult();
    }
    public override getWinAmount(): number {
        return this.getWinEvaluationResult().getTotalWin();
    }
    public override getWinningLines() {
        return Object.fromEntries(this.getWinEvaluationResult().getLineWins().map((component, index) => [String(index), component.getWinningLine()]));
    }
    public override getWinningScatters() {
        return Object.fromEntries(this.getWinEvaluationResult().getScatterWins().map(component => [component.getSymbolId(), component.getWinningScatter()]));
    }
    public override getLinesWinning(): number {
        return this.getWinEvaluationResult().getLineWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }
    public override getScattersWinning(): number {
        return this.getWinEvaluationResult().getScatterWins().reduce((sum, component) => sum + component.getWinAmount(), 0);
    }
    public override getSymbolsCombination() {
        return this.screen ? new SymbolsCombination().fromMatrix(this.screen) : super.getSymbolsCombination();
    }
    public getStakeAmount(): number {
        return this.remaining > 0 ? 0 : this.getBet();
    }
    public getSimulationCategory(): string {
        return this.remaining > 0 ? "respins" : "base";
    }
    public override canPlayNextGame(): boolean {
        return this.remaining > 0 || super.canPlayNextGame();
    }
    public override hasPendingLogicalRound(): boolean {
        return this.remaining > 0;
    }
    public override setBet(bet: number): void {
        if (this.remaining > 0 && bet !== this.entryBet) throw new Error("Cannot change bet during respins.");
        super.setBet(bet);
    }
    public override createStepRollback(): () => void {
        const rollback = super.createStepRollback();
        const state = {value: this.value, remaining: this.remaining, executed: this.executed, entryBet: this.entryBet, bonus: cloneSessionData(this.bonus)};
        const screen = this.screen;
        return () => {
            rollback();
            Object.assign(this, state);
            this.screen = screen;
            this.cascade = undefined;
            this.observation = undefined;
            this.evaluation = new WinEvaluationResult();
        };
    }
    public override validateScreenCoordinates(): void {
        super.validateScreenCoordinates();
        const issues = validateAuthoredMechanics({mechanics: this.rules, symbols: this.getAvailableSymbols(), reels: this.getReelsNumber(), rows: this.getReelsSymbolsNumber(), screenGeometry: this.config.getScreenGeometry?.()});
        if (issues.length || this.config.getScreenModifiers?.()) throw new Error(issues.map(issue => issue.message).join("; ") || "Bounded mechanics do not support modifiers.");
    }
    public override play(): void {
        if (!this.canPlayNextGame()) return;
        this.validateScreenCoordinates();
        this.executeStep(() => {
            const credits = this.getCreditsAmount();
            const stake = this.getStakeAmount();
            const continuing = this.remaining > 0;
            if (continuing && this.getBet() !== this.entryBet) throw new Error("Respin entry denomination changed.");
            if (!continuing) {
                this.executed = 0;
                this.entryBet = this.getBet();
                if (this.bonus) this.bonus.selection = null;
            }
            if (this.bonus) {
                if (!continuing) {
                    if (!this.bonus.requestedContext && this.bonus.implicitRound === Number.MAX_SAFE_INTEGER) throw new Error("Bonus contexts exhausted.");
                    this.bonus.context = this.bonus.requestedContext ?? `implicit:${++this.bonus.implicitRound}`;
                    if (this.bonus.context.startsWith("implicit:")) this.bonus.implicitRound = Math.max(this.bonus.implicitRound, Number(this.bonus.context.slice(9)));
                }
                Reflect.deleteProperty(this.bonus, "requestedContext");
                this.baseSession.setSelectionContext?.(this.bonus.context);
            }
            if (!super.canPlayNextGame()) this.setCreditsAmount(this.getBet());
            // A direct play() continuation owns the same weighted selection as its entry.
            // Runtime commands supply that same context explicitly; refills also reuse it.
            if (continuing && !this.bonus && this.generator.getSequenceSelections().length > 0) this.baseSession.setSelectionContext?.(this.generator.getSelectionState().context);
            this.baseSession.play();
            this.screen = this.baseSession.getSymbolsCombination().toMatrix();
            let evaluation = this.baseSession.getWinEvaluationResult();
            this.cascade = undefined;
            if (this.rules.cascade) {
                const cascade = new CascadingSpinResolver(this.calculator.getWinEvaluationPipeline(), this.config, {
                    getRefillSymbols: (_screen, removed) => {
                        this.generator.setSelectionContext(this.generator.getSelectionState().context);
                        const draw = this.generator.generateSymbolsCombination().toMatrix();
                        return draw.map((reel, index) => reel.slice(0, removed.filter(position => position[0] === index).length));
                    },
                }, undefined, {maxCascadeSteps: this.rules.cascade.maxCascades}).resolve(this.screen, this.getBet());
                this.cascade = cascade;
                this.screen = cascade.getFinalScreen();
                evaluation = new WinEvaluationResult({winComponents: cascade.getCascadeSteps().flatMap(step => step.getWinEvaluationResult().getWinComponents())});
            }
            const count = (symbol: string): number => this.screen!.flat().filter(cell => cell === symbol).length;
            const collection = this.rules.collection;
            const collectionObservation = collection ? resolveCollectionTransition(collection, this.value, count(collection.symbolId)) : undefined;
            if (collectionObservation) {
                this.value = collectionObservation.value;
                if (collectionObservation.triggered) {
                    const component = new ValueWinComponent(new WinningValue(collection!.symbolId, [], collectionObservation.payout));
                    evaluation = new WinEvaluationResult({winComponents: [...evaluation.getWinComponents(), component]});
                    if (this.cascade) this.cascade = new CascadeResult(this.cascade.getInitialScreen(), this.screen, this.cascade.getCascadeSteps(), this.cascade.getMetadata(), {}, {}, new WinEvaluationResult({winComponents: [component]}));
                }
            }
            const respins = this.rules.respins;
            let granted = 0;
            if (respins) {
                const transition = resolveRespinTransition(respins, this.remaining, this.executed, count(respins.trigger.symbolId));
                this.executed = transition.executed;
                this.remaining = transition.remaining;
                granted = transition.granted;
            } else if (continuing) {
                this.executed++;
                this.remaining--;
            }
            const table = this.rules.weightedBonus;
            let bonusPayout = 0;
            let selectedNow = false;
            if (table && this.bonus) {
                if (shouldSelectWeightedBonus(table, continuing, this.screen!)) {
                    const outcome = this.generator.selectBonus(table);
                    const index = table.outcomes.findIndex(item => item.id === outcome.id);
                    if (this.bonus.counts.reduce((sum, count) => sum + count, 0) === Number.MAX_SAFE_INTEGER) throw new Error("Weighted bonus counter overflow.");
                    this.bonus.counts[index]++;
                    this.bonus.selection = {tableId: table.id, outcomeId: outcome.id, context: this.generator.getSelectionState().context, model: weightedBonusModel(table)};
                    this.remaining = outcome.duration;
                    bonusPayout = weightedBonusPayout(outcome, this.entryBet);
                    selectedNow = true;
                    const component = new ValueWinComponent(new WinningValue(table.feature.id, [], bonusPayout));
                    evaluation = new WinEvaluationResult({winComponents: [...evaluation.getWinComponents(), component]});
                }
                if (this.bonus.selection && this.remaining === 0 && (continuing || selectedNow)) this.bonus.completed++;
            }
            const balance = credits - stake + evaluation.getTotalWin();
            if (!Number.isFinite(evaluation.getTotalWin()) || !Number.isFinite(balance) || balance < 0) throw new Error("Bounded mechanic payout or balance overflow.");
            this.setCreditsAmount(balance);
            this.evaluation = evaluation;
            this.observation = {
                ...(this.bonus?.selection ? {weightedBonus: {selection: cloneSessionData(this.bonus.selection), selectedNow, payout: bonusPayout, remaining: this.remaining, executed: this.executed}} : {}),
                ...(collectionObservation ? {collection: collectionObservation} : {}),
                ...(respins ? {respins: {remaining: this.remaining, executed: this.executed, granted, limit: respins.maxRespins}} : {}),
                ...(this.cascade ? {cascade: {winningCascades: this.cascade.getCascadeSteps().length, evaluatedSteps: this.cascade.getCascadeSteps().length + 1}} : {}),
            };
        });
    }
    public getSessionStateSchema(): SessionStateSchema {
        const base = resolveSessionStateSchema(this.baseSession);
        return {kind: "bounded-mechanics", rules: cloneSessionData(this.rules), bets: this.getAvailableBets(), base: this.rules.weightedBonus && base.kind === "seeded-video-slot" ? {...base, reels: this.getReelsNumber(), rows: this.getReelsSymbolsNumber(), symbols: this.getAvailableSymbols()} : base};
    }
    public isSessionStateRestorable(): boolean {
        return this.constructor === BoundedVideoSlotSession && isSessionStateRestorable(this.baseSession);
    }
    public validateAcceptedSelectionAccounting(mathematicalPlays: number, entryPosition: number): void {
        if (this.rules.weightedBonus && this.bonus) validateWeightedBonusAccounting(this.rules.weightedBonus, this.bonus, this.remaining, this.executed, mathematicalPlays, entryPosition);
    }
    public toSessionState(): BoundedSessionState {
        return {base: (this.baseSession as VideoSlotSession).toSessionState(), value: this.value, remaining: this.remaining, executed: this.executed, entryBet: this.entryBet, ...(this.bonus ? {bonus: cloneSessionData(this.bonus)} : {})};
    }
    public validateSessionState(value: unknown): void {
        validateExecutableState(value, this.getSessionStateSchema(), undefined, !isSessionStateRestorable(this.baseSession));
        (this.baseSession as VideoSlotSession).validateSessionState((value as BoundedSessionState).base);
    }
    public fromSessionState(value: BoundedSessionState): this {
        this.validateSessionState(value);
        (this.baseSession as VideoSlotSession).fromSessionState(value.base as ReturnType<VideoSlotSession["toSessionState"]>);
        this.value = value.value;
        this.remaining = value.remaining;
        this.executed = value.executed;
        this.entryBet = value.entryBet;
        this.bonus = cloneSessionData(value.bonus);
        this.observation = undefined;
        this.cascade = undefined;
        this.screen = undefined;
        this.evaluation = new WinEvaluationResult();
        return this;
    }
}
