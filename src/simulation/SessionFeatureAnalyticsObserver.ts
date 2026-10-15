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
type Active = {duration: number; win: number; known: boolean};
type ObserverState = {
    position: number;
    source: string;
    active: Partial<Record<AnalyticsFeature, Active>>;
    logicalKnown?: boolean;
};
const states = new WeakMap<GameSessionHandling, ObserverState>();
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
    private readonly state: ObserverState;
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
            if (!retained && wasActive) retained = {duration: 0, win: 0, known: false};
            if (entry) retained = {duration: 0, win: 0, known: true};
            if (retained) {
                if (wasActive || entryExecuted) retained.duration++;
                retained.win += featureWin;
                this.state.active[feature] = retained;
            }
            const event: AnalyticsFeatureEvent = {feature, entry, retrigger, granted, entryExecuted};
            if (retained && !active && !exhausted) {
                if (retained.known) event.completion = {duration: retained.duration, win: retained.win};
                else event.excludedCompletion = true;
                Reflect.deleteProperty(this.state.active, feature);
            }
            if (entry || retrigger || granted || event.completion || event.excludedCompletion) events.push(event);
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
        if (bounded?.collection?.triggered) events.push({feature: "collection", entry: true, completion: {duration: 0, win: bounded.collection.payout}});
        if ((bounded?.cascade?.winningCascades ?? cascade?.getCascadeSteps().length ?? 0) > 0) events.push({feature: "cascade", entry: true, ...(exhausted ? {} : {completion: {duration: 0, win}})});
        if (this.envelope.supportedFeatures.includes("modifiers") && observations.modifiers?.rules.some((rule) => rule.positions.length > 0)) events.push({feature: "modifiers", entry: true, completion: {duration: 0, win}});
        this.state.position++;
        return {
            position: this.state.position,
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
