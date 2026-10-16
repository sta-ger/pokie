import {resolveSessionStateSchema} from "../session/SessionStateRestoring.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import type {LogicalRoundProgressProviding} from "../runtime/LogicalRound.js";
import {SessionRuntime} from "../runtime/SessionRuntime.js";
import {observeVideoSlotFeatures} from "../net/videoslot/observeVideoSlotFeatures.js";
import type {FreeGamesStateDetermining} from "../session/FreeGamesStateDetermining.js";
import type {WonFreeGamesNumberDetermining} from "../session/WonFreeGamesNumberDetermining.js";
import type {HoldAndWinStateDetermining} from "../session/videoslot/holdandwin/HoldAndWinStateDetermining.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import {
    FEATURE_NAMES,
    analyticsEnvelope,
    type AnalyticsEnvelope,
    type AnalyticsFeature,
    type AnalyticsFeatureEvent,
    type FeatureAnalyticsObservation,
} from "./FeatureAnalytics.js";

const identities = new WeakMap<GameSessionHandling, string>();
/** Bind the executable package hash, not its name/version or executable-state shape. */
export function setSimulationModelIdentity(session: GameSessionHandling, modelId: string | undefined): void {
    if (modelId !== undefined) {
        if (!modelId) throw new Error("Simulation model identity must be non-empty.");
        const previous = identities.get(session);
        if (previous && previous !== modelId) throw new Error("Simulation session model identity changed.");
        identities.set(session, modelId);
    }
}
type Active = {duration: number; win: number; known: boolean; entryPosition: number};
export type SessionFeatureAnalyticsState = {
    position: number;
    source: string;
    active: Partial<Record<AnalyticsFeature, Active>>;
    logicalKnown?: boolean;
};
const states = new WeakMap<GameSessionHandling, SessionFeatureAnalyticsState>();
export type SessionFeatureAnalyticsBeforePlay = {
    pending: boolean;
    freeNum: number;
    freeSum: number;
    free: boolean;
    hold: boolean;
    locks: number;
    holdRemaining: number;
    respins: boolean;
    bonus: boolean;
};
export interface SessionFeatureAnalyticsObserving {
    getEnvelope(): AnalyticsEnvelope;
    beforePlay(): SessionFeatureAnalyticsBeforePlay;
    afterPlay(before: SessionFeatureAnalyticsBeforePlay, win: number, mode?: string): FeatureAnalyticsObservation;
}
function sessionAnalyticsEnvelope(session: GameSessionHandling): AnalyticsEnvelope {
    const supported = new Set<AnalyticsFeature>();
    if (typeof (session as Partial<FreeGamesStateDetermining>).getFreeGamesSum === "function") supported.add("freeGames");
    if (typeof (session as Partial<HoldAndWinStateDetermining>).isHoldAndWinActive === "function") supported.add("holdAndWin");
    if (typeof (session as Partial<CascadeResultProviding>).getCascadeResult === "function") supported.add("cascade");
    let schema = resolveSessionStateSchema(session);
    for (let depth = 0; depth < 32; depth++) {
        if (schema.kind === "bounded-mechanics") {
            if (schema.rules.respins) supported.add("respins");
            if (schema.rules.weightedBonus) supported.add("weightedBonus");
            if (schema.rules.collection) supported.add("collection");
        }
        if (schema.kind === "seeded-video-slot" && schema.modifiers) supported.add("modifiers");
        if (!("base" in schema)) break;
        schema = schema.base;
    }
    return analyticsEnvelope(
        identities.get(session) ?? null,
        SessionRuntime.supportsLogicalRoundDelivery(session),
        typeof (session as Partial<VideoSlotSessionHandling>).getWinEvaluationResult === "function",
        FEATURE_NAMES.filter((name) => supported.has(name)),
    );
}

function initialHoldGrant(session: GameSessionHandling): number | undefined {
    let schema = resolveSessionStateSchema(session);
    for (let depth = 0; depth < 32; depth++) {
        if (schema.kind === "hold-and-win") return schema.initialRespins;
        if (!("base" in schema)) break;
        schema = schema.base;
    }
    return undefined;
}
export class SessionFeatureAnalyticsObserver implements SessionFeatureAnalyticsObserving {
    private readonly holdGrant: number | undefined;
    private readonly envelope: AnalyticsEnvelope;
    private readonly session: GameSessionHandling;
    private readonly state: SessionFeatureAnalyticsState;
    constructor(session: GameSessionHandling) {
        this.session = session;
        this.envelope = sessionAnalyticsEnvelope(session);
        this.holdGrant = initialHoldGrant(session);
        let state = states.get(session);
        if (!state) {
            state = {source: globalThis.crypto.randomUUID(), position: 0, active: {}};
            states.set(session, state);
        }
        this.state = state;
    }
    public toState(): SessionFeatureAnalyticsState {
        return JSON.parse(JSON.stringify(this.state)) as SessionFeatureAnalyticsState;
    }
    public restoreState(value: SessionFeatureAnalyticsState): void {
        if (!value || Object.keys(value).some(key => !["position", "source", "active", "logicalKnown"].includes(key)) ||
            !Number.isSafeInteger(value.position) || value.position < 0 || typeof value.source !== "string" || !value.source || value.source.length > 1024 ||
            (value.logicalKnown !== undefined && typeof value.logicalKnown !== "boolean") || !value.active || typeof value.active !== "object" || Array.isArray(value.active) ||
            Object.entries(value.active).some(([feature, active]) => !this.envelope.supportedFeatures.includes(feature as AnalyticsFeature) || !active ||
                Object.keys(active).some(key => !["duration", "win", "known", "entryPosition"].includes(key)) ||
                !Number.isSafeInteger(active.duration) || active.duration < 0 || active.duration > value.position || !Number.isFinite(active.win) || active.win < 0 || typeof active.known !== "boolean" ||
                !Number.isSafeInteger(active.entryPosition) || active.entryPosition < 0 || active.entryPosition > value.position || (active.known && active.entryPosition === 0))) throw new Error("Invalid active feature analytics continuation.");
        const restored = JSON.parse(JSON.stringify(value)) as SessionFeatureAnalyticsState;
        Reflect.deleteProperty(this.state, "logicalKnown");
        Object.assign(this.state, restored);
    }
    /** The caller supplies entry identity from accepted mathematics, never from analytics copies. */
    public validateAcceptedTransition(before: SessionFeatureAnalyticsBeforePlay, entry: boolean, logicalContinuation: boolean, accepted?: {entryPosition: number; roundingScale?: number; wins: Partial<Record<AnalyticsFeature, number>>}): void {
        const invalid = () => new Error("Analytics prior state contradicts its accepted mathematical entry or continuation.");
        if (!before || Object.keys(before).sort().join(",") !== "bonus,free,freeNum,freeSum,hold,holdRemaining,locks,pending,respins" ||
            ![before.pending, before.free, before.hold, before.respins, before.bonus].every(value => typeof value === "boolean") ||
            ![before.freeNum, before.freeSum, before.locks, before.holdRemaining].every(value => Number.isSafeInteger(value) && value >= 0) ||
            before.pending === entry || before.free !== (before.freeSum > before.freeNum) || before.freeNum > before.freeSum ||
            before.pending !== (before.free || before.hold || before.respins || before.bonus) ||
            !before.pending && (this.state.logicalKnown === true || Object.keys(this.state.active).length > 0) ||
            logicalContinuation && this.state.logicalKnown !== true) throw invalid();
        const supported = (name: AnalyticsFeature) => this.envelope.supportedFeatures.includes(name);
        if (before.free !== (before.pending && supported("freeGames")) || before.hold !== (before.pending && supported("holdAndWin")) ||
            before.respins !== (before.pending && supported("respins")) || before.bonus !== (before.pending && supported("weightedBonus")) ||
            !supported("freeGames") && (before.freeNum !== 0 || before.freeSum !== 0) ||
            !supported("holdAndWin") && (before.locks !== 0 || before.holdRemaining !== 0)) throw invalid();
        const active = {freeGames: before.free, holdAndWin: before.hold, respins: before.respins, weightedBonus: before.bonus};
        if (Object.keys(this.state.active).some(feature => Reflect.get(active, feature) !== true)) throw invalid();
        for (const [feature, wasActive] of Object.entries(active)) {
            const retained = this.state.active[feature as AnalyticsFeature];
            if (retained && !wasActive || logicalContinuation && wasActive && (!retained || !retained.known)) throw invalid();
        }
        if (accepted) {
            for (const [feature, retained] of Object.entries(this.state.active)) {
                const expected = accepted.wins[feature as AnalyticsFeature];
                const tolerance = 32 * Number.EPSILON * Math.max(1, accepted.roundingScale ?? 0, Math.abs(expected ?? 0), retained!.win);
                if (!Number.isFinite(expected) || expected! < -tolerance || Math.abs(retained!.win - expected!) > tolerance ||
                    retained!.entryPosition !== accepted.entryPosition || !retained!.known) throw new Error("Analytics accumulated feature win or provenance contradicts accepted accounting.");
            }
        }
        const after = this.beforePlay();
        const grant = (this.session as Partial<WonFreeGamesNumberDetermining>).getWonFreeGamesNumber?.() ?? 0;
        if (before.free && (after.freeNum !== before.freeNum + 1 || after.freeSum !== before.freeSum + grant)) throw invalid();
        if (before.hold && (before.locks > after.locks || before.holdRemaining < 1 || before.holdRemaining > this.holdGrant! ||
            after.hold && after.holdRemaining !== (after.locks > before.locks ? this.holdGrant : before.holdRemaining - 1))) throw invalid();
        const bounded = observeVideoSlotFeatures(this.session).boundedMechanics;
        for (const [feature, observed] of [["weightedBonus", bounded?.weightedBonus], ["respins", bounded?.respins]] as const) {
            if (!observed) continue;
            const continuing = observed.executed > 0;
            if (before[feature === "weightedBonus" ? "bonus" : "respins"] !== continuing) throw invalid();
            const retained = this.state.active[feature];
            if (retained?.known && (retained.duration !== observed.executed - 1 || retained.entryPosition !== this.state.position - retained.duration)) throw invalid();
        }
    }
    public getEnvelope(): AnalyticsEnvelope {
        return {...this.envelope, supportedFeatures: [...this.envelope.supportedFeatures]};
    }
    public beforePlay(): SessionFeatureAnalyticsBeforePlay {
        const session = this.session;
        const free = session as Partial<FreeGamesStateDetermining>;
        const hold = session as Partial<HoldAndWinStateDetermining>;
        const bounded = observeVideoSlotFeatures(session).boundedMechanics;
        const pending = (session as Partial<LogicalRoundProgressProviding>).hasPendingLogicalRound?.() ?? false;
        return {
            pending,
            freeNum: free.getFreeGamesNum?.() ?? 0,
            freeSum: free.getFreeGamesSum?.() ?? 0,
            free: (free.getFreeGamesSum?.() ?? 0) > (free.getFreeGamesNum?.() ?? 0),
            hold: hold.isHoldAndWinActive?.() ?? false,
            locks: hold.getLockedHoldAndWinSymbols?.().length ?? 0,
            holdRemaining: hold.getHoldAndWinRespinsRemaining?.() ?? 0,
            respins: bounded?.respins ? bounded.respins.remaining > 0 : pending && this.envelope.supportedFeatures.includes("respins"),
            bonus: bounded?.weightedBonus ? bounded.weightedBonus.remaining > 0 : pending && this.envelope.supportedFeatures.includes("weightedBonus"),
        };
    }
    public afterPlay(before: SessionFeatureAnalyticsBeforePlay, win: number, mode?: string): FeatureAnalyticsObservation {
        const session = this.session,
            after = this.beforePlay();
        const observations = observeVideoSlotFeatures(session),
            bounded = observations.boundedMechanics;
        const cascade = (session as Partial<CascadeResultProviding>).getCascadeResult?.();
        const exhausted = cascade?.getMetadata().maxCascadeStepsExceeded === true;
        const components = (session as Partial<VideoSlotSessionHandling>).getWinEvaluationResult?.().getWinComponents();
        let schema = resolveSessionStateSchema(session);
        while ("base" in schema && schema.kind !== "bounded-mechanics") schema = schema.base;
        const rules = schema.kind === "bounded-mechanics" ? schema.rules : undefined;
        const bonusId = rules?.weightedBonus?.feature.id;
        const collectionId = rules?.collection?.symbolId;
        const carriedSubround = before.pending && !this.state.logicalKnown;
        if (!before.pending) this.state.logicalKnown = true;
        const logicalCompletion = this.envelope.lifecycle && !after.pending && !exhausted && this.state.logicalKnown === true;
        if (!after.pending || exhausted) this.state.logicalKnown = false;
        const holdResult = (session as Partial<HoldAndWinStateDetermining>).getHoldAndWinLastRoundOutcome?.();
        const forcedFreeEntry = !before.free && after.freeNum > 0;
        const holdBaseCount = holdResult?.kind === "completed" ? holdResult.baseRoundResult.winEvaluationResult.getWinComponents().length : Infinity;
        const canonical = components?.map((c, index) => {
            let partition: "base" | "feature" | "jackpot" = "base";
            if (
                before.pending ||
                forcedFreeEntry ||
                index >= holdBaseCount ||
                (c.getType() === "value" && (c.getId() === bonusId || (bounded?.collection?.triggered && c.getId() === collectionId)))
            ) partition = "feature";
            if (c.getType() === "jackpot") partition = "jackpot";
            const symbol = c.getSymbolId();
            return {
                type: c.getType(),
                id: c.getId(),
                symbol: symbol === null || symbol === undefined ? null : String(symbol),
                amount: c.getWinAmount(),
                partition,
            };
        });
        const events: AnalyticsFeatureEvent[] = [];
        const update = (
            feature: AnalyticsFeature,
            wasActive: boolean,
            active: boolean,
            entry: boolean,
            retrigger = false,
            granted = 0,
            featureWin = win,
            entryExecuted = false,
        ) => {
            if (!this.envelope.supportedFeatures.includes(feature)) return;
            let retained = this.state.active[feature];
            if (!retained && wasActive) retained = {duration: 0, win: 0, known: false, entryPosition: 0};
            if (entry) retained = {duration: 0, win: 0, known: true, entryPosition: this.state.position + 1};
            if (retained) {
                if (wasActive || entryExecuted) retained.duration++;
                retained.win += featureWin;
                this.state.active[feature] = retained;
            }
            const event: AnalyticsFeatureEvent = {feature, entry, retrigger, granted, entryExecuted};
            if (retained && !active && !exhausted) {
                if (retained.known) event.completion = {duration: retained.duration, win: retained.win, entryPosition: retained.entryPosition};
                else event.excludedCompletion = true;
                Reflect.deleteProperty(this.state.active, feature);
            }
            if (exhausted && retained?.known) event.abandonedEntryPosition = retained.entryPosition;
            if (entry || retrigger || granted || event.completion || event.excludedCompletion || event.abandonedEntryPosition) events.push(event);
            // Exhausted observations remain unfinished and cannot be completed by a later base play.
            if (exhausted && retained) Reflect.deleteProperty(this.state.active, feature);
        };
        const grant = (session as Partial<WonFreeGamesNumberDetermining>).getWonFreeGamesNumber?.() ?? 0;
        update(
            "freeGames",
            before.free,
            after.free,
            !before.free && (grant > 0 || after.free || forcedFreeEntry),
            before.free && grant > 0,
            forcedFreeEntry ? after.freeSum : grant,
            before.free || forcedFreeEntry ? win : 0,
            forcedFreeEntry,
        );
        const holdOutcome = (session as Partial<HoldAndWinStateDetermining>).getHoldAndWinLastRoundOutcome?.();
        const holdEntry = !before.hold && (after.hold || holdOutcome?.kind === "completed");
        const holdRetrigger = before.hold && after.locks > before.locks;
        const holdReset = this.holdGrant ?? after.holdRemaining;
        let holdGrants = 0;
        if (holdEntry) holdGrants = holdReset;
        else if (holdRetrigger) holdGrants = Math.max(0, holdReset - Math.max(0, before.holdRemaining - 1));
        update("holdAndWin", before.hold, after.hold, holdEntry, holdRetrigger, holdGrants, holdOutcome?.kind === "completed" ? holdOutcome.payout : 0);
        update(
            "respins",
            before.respins,
            after.respins,
            !before.respins && (bounded?.respins?.granted ?? 0) > 0,
            before.respins && (bounded?.respins?.granted ?? 0) > 0,
            bounded?.respins?.granted ?? 0,
            before.respins ? win : 0,
        );
        update(
            "weightedBonus",
            before.bonus,
            after.bonus,
            bounded?.weightedBonus?.selectedNow === true,
            false,
            bounded?.weightedBonus?.selectedNow ? bounded.weightedBonus.remaining : 0,
            before.bonus ? win : bounded?.weightedBonus?.payout ?? 0,
        );
        if (bounded?.collection?.triggered) events.push({feature: "collection", entry: true, completion: {duration: 0, win: bounded.collection.payout, entryPosition: this.state.position + 1}});
        if ((bounded?.cascade?.winningCascades ?? cascade?.getCascadeSteps().length ?? 0) > 0) events.push({feature: "cascade", entry: true, ...(exhausted ? {abandonedEntryPosition: this.state.position + 1} : {completion: {duration: 0, win, entryPosition: this.state.position + 1}})});
        if (this.envelope.supportedFeatures.includes("modifiers") && observations.modifiers?.rules.some((rule) => rule.positions.length > 0)) events.push({feature: "modifiers", entry: true, completion: {duration: 0, win, entryPosition: this.state.position + 1}});
        this.state.position++;
        return {
            position: this.state.position,
            activeEntryPositions: Object.fromEntries(FEATURE_NAMES.filter(name => this.state.active[name]?.known).map(name => [name, this.state.active[name]!.entryPosition])),
            activeKnownFeatures: FEATURE_NAMES.filter((name) => this.state.active[name]?.known === true),
            activeCarriedFeatures: FEATURE_NAMES.filter((name) => this.state.active[name]?.known === false),
            envelope: this.getEnvelope(),
            source: this.state.source,
            logicalEntry: this.envelope.lifecycle && !before.pending,
            logicalCompletion,
            carriedSubround,
            cascadeSteps: bounded?.cascade?.evaluatedSteps ?? (cascade ? cascade.getCascadeSteps().length + 1 : 0),
            mode: mode ?? observations.chargedBetModeId,
            components: canonical,
            features: events,
        };
    }
}
