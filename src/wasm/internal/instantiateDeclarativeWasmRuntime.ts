import {restoreDeclarativeObservation} from "./restoreDeclarativeObservation.js";
import {buildRoundArtifactFromSession} from "../../artifact/buildRoundArtifactFromSession.js";
import {RoundArtifactValidator} from "../../artifact/RoundArtifactValidator.js";
import {ACTIVE_POKIE_WASM_TRACES as ACTIVE_TRACES} from "./PokieWasmTraceOwnership.js";
import {PortableRandomNumberGenerator} from "../../session/videoslot/combinations/internal/PortableRandomNumberGenerator.js";
import {ScreenProjection} from "../../session/videoslot/coordinates/ScreenProjection.js";
import {observeVideoSlotFeatures} from "../../net/videoslot/observeVideoSlotFeatures.js";
import {stableSlotMathJson} from "../math/SharedSlotMath.js";
import {clonePokieWasmHostState} from "./clonePokieWasmHostState.js";
import type {DeclarativeWasmModel} from "../DeclarativeWasmModel.js";
import type {PokieWasmComponentManifest} from "../../project/wasm/PokieWasmComponentManifest.js";
import {createAuthoredSession} from "../../generated/createAuthoredSession.js";
import {SessionRuntime} from "../../runtime/SessionRuntime.js";
import {validateLogicalRound} from "../../runtime/LogicalRound.js";
import {CascadeSessionSerializer} from "../../net/videoslot/cascade/CascadeSessionSerializer.js";
import {SessionFeatureAnalyticsObserver, setSimulationModelIdentity} from "../../simulation/SessionFeatureAnalyticsObserver.js";
import {VideoSlotSessionSerializer} from "../../net/videoslot/VideoSlotSessionSerializer.js";
import type {SessionStateRestoring} from "../../session/SessionStateRestoring.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";
import {validateSessionCommand, type SessionCommand} from "../../runtime/SessionCommand.js";
import {BoundedPokieWasmTraceCollector, POKIE_WASM_DEFAULT_CREDITS, type PokieWasmFeatureSessionState, type PokieWasmHost, type PokieWasmHostState, type PokieWasmRestorableState, type PokieWasmRound, type PokieWasmRuntime, type PokieWasmRuntimeSession} from "../PokieWasmRuntimeApi.js";

type NativeSession = VideoSlotSessionHandling & SessionStateRestoring & {toSessionState(): unknown; fromSessionState(value: unknown): unknown};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
// A plain feature tail can retain its paid entry's weighted selection context.
// Artifact identity follows that mathematical context, independently of retry identity.
function plainRoundId(command: SessionCommand, sequence: number, selections: PokieWasmRound["sequenceSelections"]): string {
    const context = selections?.[0]?.context;
    return typeof context === "string" && context.startsWith("logical:") ? context.slice(8) : command.roundId ?? `plain:${sequence}`;
}

/** Portable orchestration of the same public session decorators used by generated Node games.
 * A settled checkpoint is authoritative; rebuilding never consumes the host or replays a prefix.
 */
export function instantiateDeclarativeWasmRuntime(model: DeclarativeWasmModel, manifest: PokieWasmComponentManifest, initialHost: PokieWasmHost): PokieWasmRuntime {
    const blueprint = copy(model.features.blueprint);
    let host = initialHost;
    let disposed = false;
    let currentDraws: number[] = [];
    const diagnostics = {generatedDraws: 0, hostRestorations: 0, hostPayloadBytes: 0, snapshotPayloadBytes: 0};
    const sessions = new Set<() => void>();
    const artifactIdentity = manifest.artifact!.sha256;
    const serializer = blueprint.mechanics?.cascade ? new CascadeSessionSerializer() : new VideoSlotSessionSerializer();
    function declared(operation: string): void {
        if (disposed) throw new Error("The WASM runtime has been disposed.");
        if (!manifest.capabilities.includes(operation)) throw new Error(`POKIE WASM artifact does not declare ${operation}.`);
    }
    function draw(): number {
        // A finite per-mathematical-step bound fails honestly, without truncating or
        // rounding rejection sampling. Accepted prefixes have their own checkpoint.
        if (currentDraws.length >= 262144) throw new Error("POKIE WASM mathematical step exhausted its bounded RNG budget.");
        const value = host.nextRandom();
        diagnostics.generatedDraws++;
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("POKIE WASM host RNG must return a finite value in [0, 1).");
        currentDraws.push(value);
        return value;
    }
    function hostState(): PokieWasmHostState | undefined {
        const value = host.serializeState?.();
        if (value === undefined) return undefined;
        const encoded = clonePokieWasmHostState(value);
        diagnostics.hostPayloadBytes += bytes(encoded);
        return encoded;
    }
    function restoreHost(state: PokieWasmFeatureSessionState): void {
        if (state.rngState === undefined || !host.restoreState) throw new Error("This POKIE WASM host cannot restore the serialized RNG continuation.");
        host.restoreState(clonePokieWasmHostState(state.rngState));
        diagnostics.hostRestorations++;
    }
    function acquire(trace?: BoundedPokieWasmTraceCollector): void {
        if (!trace) return;
        if (!(trace instanceof BoundedPokieWasmTraceCollector) || trace.status !== "open" || ACTIVE_TRACES.has(trace) || trace.record !== BoundedPokieWasmTraceCollector.prototype.record || trace.complete !== BoundedPokieWasmTraceCollector.prototype.complete || trace.dispose !== BoundedPokieWasmTraceCollector.prototype.dispose) throw new Error("WASM trace collector must be open and exclusively attached.");
        ACTIVE_TRACES.add(trace);
    }
    function release(trace?: BoundedPokieWasmTraceCollector): void {
        if (!trace) return;
        if (trace.status !== "completed") trace.dispose();
        ACTIVE_TRACES.delete(trace);
    }
    function record(trace: BoundedPokieWasmTraceCollector | undefined, kind: "initialization" | "round" | "replay", sequence: number): void {
        trace?.record({kind, sequence, draws: currentDraws});
        currentDraws = [];
    }
    function assemble(seed: string, restoring: boolean) {
        const random = new PortableRandomNumberGenerator(draw, !restoring);
        const built = createAuthoredSession(blueprint, random);
        random.activate();
        return {...built, session: built.session as NativeSession};
    }
    // Resolved strips are artifact-owned model data, not growing session data.
    function encode(value: unknown): unknown {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "reelStrips").map(([key, child]) => [key, key === "base" ? encode(child) : child]));
    }
    function decode(value: unknown): unknown {
        const result = copy(value) as Record<string, unknown>;
        if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid executable feature state.");
        if ("reelStrips" in result) throw new Error("Compact feature state must not replace artifact-owned reels.");
        if ("base" in result) result.base = decode(result.base);
        else {
            const selections = (result.sequenceState as {selections?: {reelIndex: number; variantId: string}[]})?.selections;
            result.reelStrips = blueprint.reelSequences?.map((reel, reelIndex) => reel.type === "exact" ? reel.symbols : reel.variants.find(variant => variant.id === selections?.find(item => item.reelIndex === reelIndex)?.variantId)?.symbols) ?? blueprint.reelStrips;
        }
        return result;
    }
    function checkpoint(native: NativeSession, runtime: Pick<SessionRuntime, "getLogicalRound">, prior: PokieWasmFeatureSessionState, round?: PokieWasmRound): PokieWasmFeatureSessionState {
        if (!Number.isSafeInteger(prior.drawCount + currentDraws.length)) throw new Error("POKIE WASM draw counter is exhausted.");
        const rngState = hostState();
        const logicalRound = runtime.getLogicalRound();
        return {schemaVersion: "pokie.state.v4", artifactIdentity, seed: prior.seed, credits: native.getCreditsAmount(), sequence: prior.sequence + (round ? 1 : 0), drawCount: prior.drawCount + currentDraws.length,
            ...(rngState === undefined ? {} : {rngState}), feature: {bet: native.getBet(), state: encode(native.toSessionState()), ...(logicalRound ? {logicalRound} : {}), ...(round ? {lastRound: round} : {})}};
    }
    function initialScreen(state: PokieWasmFeatureSessionState): string[][] {
        let leaf = decode(state.feature.state) as {base?: unknown; reelStrips?: string[][]};
        while (leaf.base) leaf = leaf.base as typeof leaf;
        const stops = state.feature.initialStops;
        if (!Array.isArray(stops) || stops.length !== blueprint.reels || stops.some((stop, reel) => !Number.isSafeInteger(stop) || stop < 0 || stop >= leaf.reelStrips![reel].length)) throw new Error("Invalid initialized feature screen stops.");
        const generated = leaf.reelStrips!.map((strip, reel) => Array.from({length: blueprint.screenGeometry?.generated.rows ?? blueprint.rows}, (_, row) => strip[(stops[reel] + row) % strip.length]));
        return blueprint.screenGeometry ? new ScreenProjection(blueprint.screenGeometry).project(generated, "visible") : generated;
    }
    function validate(state: PokieWasmRestorableState): asserts state is PokieWasmFeatureSessionState {
        if (!state || state.schemaVersion !== "pokie.state.v4" || state.artifactIdentity !== artifactIdentity || typeof state.seed !== "string" || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Number.isSafeInteger(state.drawCount) || state.drawCount < blueprint.reels || !Number.isFinite(state.credits) || state.credits < 0 || !state.feature || !(blueprint.availableBets ?? [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]).includes(state.feature.bet)) throw new Error("Unsupported or malformed artifact-bound WASM feature state.");
        if (Object.keys(state).some(key => !["schemaVersion", "artifactIdentity", "seed", "sequence", "drawCount", "credits", "rngState", "feature"].includes(key)) ||
            Object.keys(state.feature).some(key => !["bet", "state", "initialStops", "logicalRound", "lastRound", "analytics", "pendingCommand", "deliveryStart", "deliveryPrefix", "plainMath", "analyticsCheckpoint", "componentAmounts", "accounting"].includes(key))) throw new Error("Unexpected compact feature-state fields.");
        if (state.rngState !== undefined) clonePokieWasmHostState(state.rngState);
        const round = state.feature.logicalRound;
        if (round && (round.retention !== "latest" || validateLogicalRound(round))) throw new Error("Invalid compact logical-round continuation.");
        if ((state.feature.pendingCommand || state.feature.deliveryStart) && !round) throw new Error("Retained delivery requires compact logical progress.");
        if (state.sequence === 0 && (state.feature.plainMath || state.feature.deliveryPrefix)) throw new Error("Unexpected initialized receipt mathematics.");
        const last = state.feature.lastRound;
        if (state.sequence === 0 ? last !== undefined || round !== undefined : !last || last.sequence !== state.sequence || last.credits !== state.credits || JSON.stringify(last.logicalRound) !== JSON.stringify(round)) throw new Error("Feature checkpoint differs from its last accepted delivery.");
        if (last) {
            if (Object.keys(last).some(key => !["sequence", "draw", "stops", "screen", "winMultiplier", "win", "stake", "payout", "creditsBefore", "credits", "command", "network", "analytics", "logicalRound", "deliveryOnly", "sequenceSelections", "sequenceStatistics", "weightedBonusStatistics"].includes(key))) throw new Error("Unexpected retained WASM result fields.");
            const command = last.command as SessionCommand;
            const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
            if (validateSessionCommand(command) || ![last.stake, last.win, last.payout, last.creditsBefore, last.credits, last.winMultiplier].every(amount) ||
                !Number.isFinite(last.draw) || last.draw < 0 || last.draw >= 1 || last.winMultiplier !== last.win! / state.feature.bet ||
                Math.abs(last.creditsBefore - last.stake + last.payout - last.credits) > 1e-9 * Math.max(1, last.credits, last.creditsBefore) ||
                last.deliveryOnly !== undefined && typeof last.deliveryOnly !== "boolean" || last.deliveries !== undefined) throw new Error("Malformed retained WASM result.");
            let leaf = decode(state.feature.state) as {base?: unknown; reelStrips: string[][]};
            while (leaf.base) leaf = leaf.base as typeof leaf;
            if (!Array.isArray(last.stops) || last.stops.length !== blueprint.reels || last.stops.some((stop, reel) => !Number.isSafeInteger(stop) || stop < 0 || stop >= leaf.reelStrips[reel].length)) throw new Error("Invalid retained WASM stops.");
            const start = state.feature.deliveryStart;
            const prefix = state.feature.deliveryPrefix;
            if (round && state.feature.plainMath) throw new Error("Unexpected plain mathematics in logical progress.");
            if (round) {
                const subround = round.subrounds[0];
                const cursor = command.continuation?.cursor ?? 0;
                // The mathematical play precedes any saved presentation-only cascade frames.
                const mathematicalCursor = round.deliveryCursor - Math.max(1, round.stageCursor);
                const composite = command.delivery === "composite";
                const deliveryOnly = !!command.continuation && cursor > mathematicalCursor;
                if (cursor >= round.deliveryCursor || !composite && cursor !== round.deliveryCursor - 1 ||
                    !!last.deliveryOnly !== deliveryOnly ||
                    (command.continuation ? command.continuation.roundId !== round.id : stableSlotMathJson(command) !== stableSlotMathJson(round.entry)) ||
                    !composite && !deliveryOnly && stableSlotMathJson(command) !== stableSlotMathJson(subround.command) ||
                    composite && round.deliveryCursor - cursor > (command.maxSubrounds ?? 1000)) throw new Error("Retained command contradicts its accepted logical delivery.");
                if (state.feature.pendingCommand && stableSlotMathJson(state.feature.pendingCommand.command) !== stableSlotMathJson(command)) throw new Error("Pending command differs from its retained receipt.");
                if (composite) {
                    if (!prefix || Object.keys(prefix).some(key => !["stake", "win", "payout"].includes(key)) || ![prefix.stake, prefix.win, prefix.payout].every(amount) ||
                        (cursor >= mathematicalCursor && (prefix.stake !== 0 || prefix.win !== 0 || prefix.payout !== 0))) throw new Error("Invalid retained composite mathematical prefix.");
                    const final = deliveryOnly ? {stake: 0, win: 0, payout: 0} : subround;
                    if (last.stake !== prefix.stake + final.stake || last.win !== prefix.win + final.win || last.payout !== prefix.payout + final.payout) throw new Error("Retained composite money contradicts its accepted logical delivery.");
                } else if (prefix) throw new Error("Unexpected retained composite mathematical prefix.");
                if (composite && command.continuation) {
                    if (!start || Object.keys(start).some(key => !["cursor", "credits", "totalStake", "totalWin", "totalPayout"].includes(key)) || start.cursor !== cursor || ![start.credits, start.totalStake, start.totalWin, start.totalPayout].every(amount) ||
                        start.credits !== last.creditsBefore || start.totalStake !== round.totalStake || start.totalWin > round.totalWin || start.totalPayout > round.totalPayout) throw new Error("Invalid retained composite starting totals.");
                    // Sum in the original accounting domain: subtraction can lose small awards
                    // when the accepted prefix is large. Win and wallet release stay separate.
                    const agrees = (prefix: number, delivered: number, total: number) => Math.abs(prefix + delivered - total) <= 8 * Number.EPSILON * Math.max(Math.abs(prefix), Math.abs(delivered), Math.abs(total));
                    if (last.stake !== 0 || !agrees(start.totalWin, last.win!, round.totalWin) || !agrees(start.totalPayout, last.payout, round.totalPayout)) throw new Error("Retained composite money contradicts its accepted logical delivery.");
                } else {
                    if (start) throw new Error("Unexpected retained composite starting totals.");
                    let expected = command.continuation ? subround : {stake: round.totalStake, win: round.totalWin, payout: round.totalPayout};
                    if (deliveryOnly) expected = {stake: 0, win: 0, payout: 0};
                    if (last.stake !== expected.stake || last.win !== expected.win || last.payout !== expected.payout) throw new Error("Retained money contradicts its accepted logical delivery.");
                }
                // A composite containing only presentation frames settles nothing, even if
                // the retained mathematical subround itself won and paid an award.
                if (deliveryOnly && (last.stake !== 0 || last.win !== 0 || last.payout !== 0)) throw new Error("Retained result contradicts its accepted logical delivery.");
            } else {
                if (start || prefix || last.deliveryOnly || command.delivery || command.continuation) throw new Error("Retained result requires accepted logical delivery.");
                const math = state.feature.plainMath;
                if (!math || stableSlotMathJson(math.command) !== stableSlotMathJson(command) || new RoundArtifactValidator().validate(math.artifact).length || !amount(math.payout) || math.credits !== state.credits ||
                    math.artifact.roundId !== plainRoundId(command, state.sequence, last.sequenceSelections) || last.stake !== math.artifact.stake || last.win !== math.artifact.totalWin || last.payout !== math.payout ||
                    last.network?.totalWin !== math.artifact.totalWin) throw new Error("Retained plain money contradicts its accepted mathematical artifact.");
            }
        }
        const check = assemble(state.seed, true);
        try {
            check.session.setBet(state.feature.bet);
            check.session.validateSessionState(decode(state.feature.state));
            check.session.fromSessionState(decode(state.feature.state));
            check.session.setCreditsAmount(state.credits);
            if (state.sequence === 0) initialScreen(state);
            else if (state.feature.initialStops !== undefined) throw new Error("Completed initialization must not retain obsolete screen stops.");
            if (!state.feature.analytics) throw new Error("Missing required feature analytics continuation.");
            setSimulationModelIdentity(check.session, manifest.artifact?.configurationHash);
            const analytics = new SessionFeatureAnalyticsObserver(check.session);
            analytics.restoreState(state.feature.analytics);
            if (state.feature.analytics.position > state.sequence || state.sequence === 0 && (state.feature.analytics.position !== 0 || Object.keys(state.feature.analytics.active).length || state.feature.analyticsCheckpoint || state.feature.componentAmounts)) throw new Error("Invalid initialized analytics continuation.");
            if (round) {
                if (round.bet !== state.feature.bet || round.subrounds[0].credits !== state.credits) throw new Error("Feature checkpoint selection/ledger differs from logical progress.");
                SessionRuntime.validateLogicalRoundProgress(check.session, round);
                const delivery = new SessionRuntime(check.session, round, undefined, {retention: "latest", pendingDelivery: state.feature.pendingCommand});
                delivery.release();
            }
            if (last) {
                if (stableSlotMathJson(check.generator.getSequenceSelections()) !== stableSlotMathJson(last.sequenceSelections) ||
                    stableSlotMathJson(check.generator.getSequenceStatistics()) !== stableSlotMathJson(last.sequenceStatistics)) throw new Error("Weighted identity/frequency contradicts its last accepted observation.");
                const bonusStatistics = (check.session as {getWeightedBonusStatistics?: () => unknown}).getWeightedBonusStatistics?.();
                if (stableSlotMathJson(bonusStatistics) !== stableSlotMathJson(last.weightedBonusStatistics)) throw new Error("Weighted bonus counters contradict their last accepted observation.");
                const projection = blueprint.screenGeometry && new ScreenProjection(blueprint.screenGeometry);
                const screen = (value: unknown, domain: "visible" | "evaluated" | "generated") => {
                    const rows = projection?.getRows(domain) ?? blueprint.rows;
                    if (!Array.isArray(value) || value.length !== blueprint.reels || value.some(reel => !Array.isArray(reel) || reel.length !== rows || reel.some(symbol => !blueprint.symbols.includes(symbol)))) throw new Error(`Invalid retained ${domain} screen dimensions or symbols.`);
                };
                screen(last.screen, "visible");
                if (stableSlotMathJson(last.screen) !== stableSlotMathJson(last.network?.reelsSymbols)) throw new Error("Last screen contradicts its accepted network observation.");
                {
                    const plain = state.feature.plainMath?.artifact;
                    const subround = round?.subrounds[0];
                    const artifacts = subround?.artifacts ?? plain?.steps ?? [];
                    for (const artifact of artifacts) {
                        screen(artifact.screen, "visible");
                        if (artifact.generatedScreen) screen(artifact.generatedScreen, "generated");
                        if (stableSlotMathJson(artifact.geometry) !== stableSlotMathJson(projection && !projection.isIdentity() ? blueprint.screenGeometry : undefined)) throw new Error("Retained artifact geometry differs from its model.");
                    }

                    const artifact = artifacts[artifacts.length - 1];
                    // A bounded cascade can end at an unevaluated refill, retained separately
                    // from its evaluated mathematical artifact.
                    const finalScreen = subround?.finalScreen ?? state.feature.plainMath?.finalScreen;
                    if (finalScreen) screen(finalScreen, "generated");
                    const visible = finalScreen ?? (artifact?.generatedScreen && projection ? projection.project(artifact.generatedScreen, "visible") : artifact?.screen);
                    if (stableSlotMathJson(last.screen) !== stableSlotMathJson(visible)) throw new Error("Last screen contradicts its accepted mathematical artifact.");
                }
                const artifacts = round?.subrounds[0].artifacts ?? state.feature.plainMath?.artifact.steps ?? [];
                const plainArtifact = state.feature.plainMath?.artifact;
                if (plainArtifact && stableSlotMathJson(plainArtifact.featureEvents ?? []) !== stableSlotMathJson(artifacts.flatMap(step => step.featureEvents ?? []))) throw new Error("Plain feature events contradict their mathematical steps.");
                const mathematicalWin = round?.subrounds[0].win ?? state.feature.plainMath!.artifact.totalWin;
                const final = round?.subrounds[0].finalScreen ?? state.feature.plainMath?.finalScreen ?? artifacts[artifacts.length - 1]?.generatedScreen ?? last.screen!;
                const observation = restoreDeclarativeObservation(check.session, blueprint, artifacts, final as string[][], mathematicalWin, state.feature.componentAmounts);
                // Stops describe the generator's last circular sample, before modifiers or
                // cascade collapse. The public draw is the first request of this mathematical
                // play, which can instead select a weighted variant; presentation requests draw nothing.
                {
                    const strips = check.generator.getResolvedReelStrips();
                    const generated = (step: typeof artifacts[number]) => step.generatedScreen ?? step.screen;
                    const modified = [...(observation.getModifierObservation?.()?.rules.flatMap(rule => rule.positions) ?? []), ...(observeVideoSlotFeatures(observation).holdAndWin?.locks.map(lock => lock.position) ?? [])];
                    const masked = (reel: number, row: number) => modified.some(position => {
                        const mapped = projection ? projection.map(position, "evaluated", "generated") : position;
                        return mapped?.[0] === reel && mapped[1] === row;
                    });
                    const latest = artifacts[artifacts.length - 1];
                    const previous = artifacts[artifacts.length - 2];
                    const target = generated(latest);
                    const exhausted = round?.subrounds[0].finalScreen ?? state.feature.plainMath?.finalScreen;
                    if (!exhausted) for (let reel = 0; reel < strips.length; reel++) {
                        const rows = previous ? new Set(previous.wins.flatMap(win => win.winningPositions).filter(position => position[0] === reel).map(position => position[1])).size : target[reel].length;
                        for (let row = 0; row < rows; row++) if (!masked(reel, row) && target[reel][row] !== strips[reel][(last.stops[reel] + row) % strips[reel].length]) throw new Error("Retained stops contradict their generated screen sample.");
                    }
                    const presentation = !!round && round.stageCursor > 1;
                    if (!presentation && (blueprint.reelSequences?.[0].type !== "weighted" || (round ? round.subrounds[0].index > 0 : state.feature.plainMath!.artifact.stake === 0))) {
                        const first = generated(artifacts[0]);
                        const stop = Math.floor(last.draw * strips[0].length);
                        if (first[0].some((symbol, row) => !masked(0, row) && symbol !== strips[0][(stop + row) % strips[0].length])) throw new Error("Retained draw contradicts its first generated reel stop.");
                    } else if (presentation && last.draw !== 0) throw new Error("Retained presentation draw must be zero.");
                }
                const expectedNetwork = serializer.getRoundData(observation as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding);
                if (!last.network || typeof last.network !== "object" || Array.isArray(last.network)) throw new Error("Missing retained network projection.");
                for (const key of new Set([...Object.keys(last.network), ...Object.keys(expectedNetwork)])) {
                    if (stableSlotMathJson(Reflect.get(last.network, key)) !== stableSlotMathJson(Reflect.get(expectedNetwork, key))) throw new Error(`Retained network.${key} contradicts its accepted mathematical observation or executable state.`);
                }
                const checkpoint = state.feature.analyticsCheckpoint;
                if (!checkpoint || Object.keys(checkpoint).some(key => !["state", "before"].includes(key))) throw new Error("Missing or malformed accepted analytics checkpoint.");
                setSimulationModelIdentity(observation, manifest.artifact?.configurationHash);
                // Construct after binding identity so its envelope is artifact-owned.
                const verifier = new SessionFeatureAnalyticsObserver(observation);
                verifier.restoreState(checkpoint.state);
                if (checkpoint.state.source !== state.feature.analytics.source || checkpoint.state.position + 1 !== state.feature.analytics.position) throw new Error("Analytics source/position contradicts its accepted checkpoint.");
                const mathematicalEntry = round ? round.subrounds[0].index === 0 : state.feature.plainMath!.artifact.stake > 0;
                const accounting = state.feature.accounting;
                const bounded = observeVideoSlotFeatures(observation).boundedMechanics;
                const math = round?.subrounds[0];
                const stake = math?.stake ?? state.feature.plainMath!.artifact.stake;
                const payout = math?.payout ?? state.feature.plainMath!.payout;
                const mathBefore = state.credits + stake - payout;
                if (!accounting || Object.keys(accounting).sort().join(",") !== "baseWin,credits,entryPosition,stake" ||
                    !Number.isSafeInteger(accounting.entryPosition) || accounting.entryPosition < 1 || accounting.entryPosition > checkpoint.state.position + 1 ||
                    ![accounting.credits, accounting.stake, accounting.baseWin].every(value => Number.isFinite(value) && value >= 0) ||
                    mathematicalEntry && (accounting.entryPosition !== checkpoint.state.position + 1 || Math.abs(accounting.credits - mathBefore) > 1e-9 || accounting.stake !== stake ||
                        accounting.baseWin !== mathematicalWin - (bounded?.weightedBonus?.selectedNow ? bounded.weightedBonus.payout : 0))) throw new Error("Invalid accepted analytics entry accounting.");
                const bank = (observation as {getFreeGamesBank?: () => number}).getFreeGamesBank?.() ?? 0;
                const priorImmediateWin = (round ? round.totalWin : state.credits - accounting.credits + accounting.stake) - accounting.baseWin - mathematicalWin;
                verifier.validateAcceptedTransition(checkpoint.before, mathematicalEntry, !mathematicalEntry, {entryPosition: accounting.entryPosition, roundingScale: round ? round.totalWin : Math.max(state.credits, accounting.credits),
                    wins: {weightedBonus: priorImmediateWin, respins: priorImmediateWin, freeGames: bank - mathematicalWin, holdAndWin: 0}});
                const expectedAnalytics = verifier.afterPlay(checkpoint.before, mathematicalWin, round?.mode ?? (blueprint.betModes ? state.feature.plainMath?.artifact.betMode : undefined));
                const finalIsPresentation = !!round && round.stageCursor > 1;
                if (stableSlotMathJson(verifier.toState()) !== stableSlotMathJson(state.feature.analytics) ||
                    stableSlotMathJson(last.analytics) !== stableSlotMathJson(finalIsPresentation ? undefined : copy(expectedAnalytics))) throw new Error("Retained analytics contradicts its accepted mathematical observation.");
                const current = observeVideoSlotFeatures(check.session);
                for (const key of ["holdAndWin", "jackpot", "chargedBetModeId"] as const) if (stableSlotMathJson(current[key]) !== stableSlotMathJson(last.network?.[key])) throw new Error(`Feature ${key} contradicts its last accepted observation.`);
                for (const field of ["freeGamesNum", "freeGamesSum", "freeGamesBank"] as const) {
                    const method = Reflect.get(check.session, `get${field[0].toUpperCase()}${field.slice(1)}`);
                    if (typeof method === "function" && Reflect.apply(method, check.session, []) !== Reflect.get(last.network!, field)) throw new Error("Free-game state contradicts its last accepted observation.");
                }
                const nativeState = check.session.toSessionState() as {remaining?: number; executed?: number; value?: number; bonus?: {selection: unknown}};
                const observed = last.network?.boundedMechanics;
                if (observed?.respins && (observed.respins.remaining !== nativeState.remaining || observed.respins.executed !== nativeState.executed) ||
                    observed?.collection && observed.collection.value !== nativeState.value ||
                    observed?.weightedBonus && (observed.weightedBonus.remaining !== nativeState.remaining || observed.weightedBonus.executed !== nativeState.executed || stableSlotMathJson(observed.weightedBonus.selection) !== stableSlotMathJson(nativeState.bonus?.selection))) throw new Error("Bounded state contradicts its last accepted observation.");
            }
            let base = decode(state.feature.state) as {base?: unknown; rngState?: number};
            while (base.base) base = base.base as typeof base;
            if (base.rngState !== state.drawCount) throw new Error("Feature RNG cursor differs from its exact draw accounting.");
        } finally {
            check.dispose();
        }
    }
    function deliveryIdentity(command: SessionCommand): string | undefined {
        if (command.continuation) return `${command.continuation.roundId}:${command.continuation.cursor}`;
        return command.roundId ? `${command.roundId}:entry` : undefined;
    }
    function own(initial: PokieWasmFeatureSessionState, built: ReturnType<typeof assemble>, initialTrace?: BoundedPokieWasmTraceCollector, replaying = false): PokieWasmRuntimeSession {
        let state = initial;
        let native: NativeSession | undefined = built.session;
        let accepted: PokieWasmRound[] = [];
        let deliveryStart = initial.feature.deliveryStart;
        let deliveryPrefix = initial.feature.deliveryPrefix;
        let delivered = {stake: 0, win: 0, payout: 0};
        let compositeRequest = false;
        let analyticsCheckpoint = initial.feature.analyticsCheckpoint;
        let componentAmounts = initial.feature.componentAmounts;
        let accounting = initial.feature.accounting;
        const onAccepted = (command: SessionCommand, result: Extract<import("../../runtime/SessionRuntimeHandling.js").SessionCommandResult, {status: "played"}>): void => {
            const creditsBefore = state.credits;
            const network = result.deliveryOnly && state.feature.lastRound?.network ? copy(state.feature.lastRound.network)
                : serializer.getRoundData(native! as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding);
            if (!result.deliveryOnly) {
                analyticsCheckpoint = {state: observer.toState(), before: copy(before)};
                if (!before.pending) accounting = {entryPosition: analyticsCheckpoint.state.position + 1, credits: creditsBefore, stake: result.stake,
                    baseWin: result.win - (observeVideoSlotFeatures(native!).boundedMechanics?.weightedBonus?.payout ?? 0)};
                if (blueprint.mechanics?.modifiers) {
                    const result = native!.getWinEvaluationResult();
                    componentAmounts = {ways: result.getWaysWins().map(c => c.getWinningWay().getWinAmount()), clusters: result.getClusterWins().map(c => c.getWinningCluster().getWinAmount())};
                }
            }
            const payout = result.payout ?? Math.max(0, native!.getCreditsAmount() - creditsBefore + result.stake);
            const round: PokieWasmRound = {sequence: state.sequence + 1, draw: currentDraws[0] ?? 0, stops: result.deliveryOnly && state.feature.lastRound ? state.feature.lastRound.stops : built.generator.getLastStopPositions(), screen: network.reelsSymbols,
                winMultiplier: result.win / native!.getBet(), win: result.win, stake: result.stake, payout, creditsBefore, credits: native!.getCreditsAmount(), command,
                network, ...(!result.deliveryOnly ? {analytics: observer.afterPlay(before, result.win, result.mode)} : {}), ...(result.logicalRound ? {logicalRound: result.logicalRound} : {}), ...(result.deliveryOnly ? {deliveryOnly: true} : {}),
                sequenceSelections: built.generator.getSequenceSelections(), sequenceStatistics: built.generator.getSequenceStatistics(),
                ...((native as {getWeightedBonusStatistics?: () => unknown}).getWeightedBonusStatistics?.() ? {weightedBonusStatistics: (native as unknown as {getWeightedBonusStatistics(): PokieWasmRound["weightedBonusStatistics"]}).getWeightedBonusStatistics()} : {})};
            let plainMath: PokieWasmFeatureSessionState["feature"]["plainMath"];
            if (!result.deliveryOnly) {
                if (compositeRequest) deliveryPrefix = {...delivered};
                delivered = {stake: delivered.stake + result.stake, win: delivered.win + result.win, payout: delivered.payout + payout};
                if (!result.logicalRound) plainMath = {command,
                    ...((native as Partial<import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding>).getCascadeResult?.().getMetadata().maxCascadeStepsExceeded
                        ? {finalScreen: (native as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding).getCascadeResult().getFinalScreen()} : {}),
                    artifact: buildRoundArtifactFromSession(native!, {
                        roundId: plainRoundId(command, round.sequence, round.sequenceSelections), stake: result.stake, betMode: result.mode,
                        provenance: {game: {id: "runtime", name: "Runtime", version: "1"}, pokieVersion: "unknown"},
                    }), payout, credits: round.credits};
            }
            before = observer.beforePlay();
            state = checkpoint(native!, runtime, state, round);
            state = {...state, feature: {...state.feature, analytics: observer.toState(), ...(analyticsCheckpoint ? {analyticsCheckpoint} : {}), ...(componentAmounts ? {componentAmounts} : {}), ...(accounting ? {accounting} : {}), ...(deliveryStart ? {deliveryStart} : {}), ...(deliveryPrefix ? {deliveryPrefix} : {}), ...(plainMath ? {plainMath} : {})}};
            record(trace, replaying ? "replay" : "round", state.sequence);
            accepted.push(round);
        };
        let runtime = new SessionRuntime(native, initial.feature.logicalRound, onAccepted, {retention: "latest", pendingDelivery: initial.feature.pendingCommand});
        let trace = initialTrace;
        setSimulationModelIdentity(native, manifest.artifact?.configurationHash);
        let observer = new SessionFeatureAnalyticsObserver(native);
        if (state.feature.analytics) observer.restoreState(state.feature.analytics);
        state = {...state, feature: {...state.feature, analytics: observer.toState()}};
        let before = observer.beforePlay();
        const dispose = (): void => {
            runtime.release();
            built.dispose();
            native = undefined;
            release(trace);
            trace = undefined;
            sessions.delete(dispose);
        };
        sessions.add(dispose);
        return {
            play: (input = {}, options = {}) => Promise.resolve().then(() => {
                declared(replaying ? "runtime.replay" : "runtime.play");
                if (!native) throw new Error("The WASM runtime session has been disposed.");
                if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid-command: Command must be an object.");
                const candidate = {...input, kind: input.kind === undefined ? "spin" : input.kind};
                const malformed = validateSessionCommand(candidate);
                if (malformed) throw new Error(`invalid-command: ${malformed}`);
                const command = copy(candidate) as SessionCommand;
                const last = state.feature.lastRound;
                const identity = deliveryIdentity(command);
                const previous = last?.command as SessionCommand | undefined;
                const priorIdentity = previous && deliveryIdentity(previous);
                const pending = state.feature.pendingCommand;
                const resuming = pending && stableSlotMathJson(command) === stableSlotMathJson(pending.command) ? pending : undefined;
                const prefix = resuming ? state.feature.lastRound : undefined;
                if (identity && identity === priorIdentity && !resuming) {
                    if (stableSlotMathJson(command) !== stableSlotMathJson(previous)) throw new Error("Logical delivery identity conflicts with its original command.");
                    return copy(last!);
                }
                if (options.signal?.aborted) throw new Error("Cancelled before acceptance.");
                if (!Number.isSafeInteger(state.sequence + 1)) throw new Error("POKIE WASM continuation counters are exhausted.");
                if ((native as {hasPendingLogicalRound?: () => boolean}).hasPendingLogicalRound?.() && command.bet !== undefined && command.bet !== state.feature.bet) throw new Error("Continuation cannot change the entry bet.");
                const invalid = resuming ? undefined : runtime.validateSelection(command);
                if (invalid) throw new Error(`invalid-command: ${invalid}`);
                compositeRequest = command.delivery === "composite";
                deliveryPrefix = undefined;
                if (compositeRequest) deliveryPrefix = resuming ? state.feature.deliveryPrefix : {stake: 0, win: 0, payout: 0};
                delivered = {stake: prefix?.stake ?? 0, win: prefix?.win ?? 0, payout: prefix?.payout ?? 0};
                deliveryStart = undefined;
                if (command.delivery === "composite" && command.continuation) deliveryStart = resuming ? state.feature.deliveryStart
                    : {cursor: command.continuation.cursor, credits: state.credits, totalStake: state.feature.logicalRound!.totalStake, totalWin: state.feature.logicalRound!.totalWin, totalPayout: state.feature.logicalRound!.totalPayout};
                restoreHost(state);
                currentDraws = [];
                const creditsBefore = prefix?.creditsBefore ?? state.credits;
                accepted = [];
                const aggregate = (): PokieWasmRound => {
                    const latest = accepted[accepted.length - 1] ?? state.feature.lastRound!;
                    const win = delivered.win;
                    const {deliveryOnly: _deliveryOnly, ...observation} = latest;
                    const deliveryOnly = (!prefix || prefix.deliveryOnly === true) && accepted.every(round => round.deliveryOnly === true);
                    return {...observation, ...(deliveryOnly ? {deliveryOnly: true} : {}), command, creditsBefore, win, stake: delivered.stake,
                        payout: delivered.payout, winMultiplier: win / native!.getBet()};
                };
                const retainedPending = () => {
                    const advanced = (resuming?.advanced ?? 0) + accepted.length;
                    return command.delivery === "composite" && state.feature.logicalRound?.status === "pending" && advanced > 0 && advanced < (command.maxSubrounds ?? 1000)
                        ? {command: resuming?.command ?? command, advanced} : undefined;
                };
                try {
                    const result = runtime.execute(resuming?.command ?? command, options.signal);
                    if (result.status !== "played") throw new Error(`${result.status}: ${result.reason}`);
                    if (!accepted.length && !prefix) throw new Error("WASM command did not accept a delivery.");
                    const output = aggregate();
                    const pendingCommand = options.signal?.aborted ? retainedPending() : undefined;
                    state = {...state, feature: {...state.feature, lastRound: output, ...(pendingCommand ? {pendingCommand} : {})}};
                    // Requested composite observations are return evidence, never executable state.
                    return copy({...output, ...(accepted.length > 1 ? {deliveries: accepted} : {})});
                } catch (error) {
                    if (error instanceof WebAssembly.RuntimeError) {
                        disposeRuntime();
                        throw error;
                    }
                    // Each onAccepted callback already committed its prefix. Restore only the
                    // successor that failed, without recharging or losing that prefix.
                    const pendingCommand = accepted.length ? retainedPending() : state.feature.pendingCommand;
                    if (accepted.length) state = {...state, feature: {...state.feature, lastRound: aggregate(), ...(pendingCommand ? {pendingCommand} : {})}};
                    restoreHost(state);
                    runtime.release();
                    built.dispose();
                    built = assemble(state.seed, true);
                    native = built.session;
                    native.setBet(state.feature.bet);
                    native.fromSessionState(decode(state.feature.state));
                    native.setCreditsAmount(state.credits);
                    setSimulationModelIdentity(native, manifest.artifact?.configurationHash);
                    observer = new SessionFeatureAnalyticsObserver(native);
                    if (state.feature.analytics) observer.restoreState(state.feature.analytics);
                    before = observer.beforePlay();
                    accounting = state.feature.accounting;
                    runtime = new SessionRuntime(native, state.feature.logicalRound, onAccepted, {retention: "latest", pendingDelivery: state.feature.pendingCommand});
                    currentDraws = [];
                    if (accepted.length && state.feature.pendingCommand) {
                        const failure = error instanceof Error && Reflect.isExtensible(error) ? error : new Error(error instanceof Error ? error.message : String(error));
                        Object.assign(failure, {committedProgress: {round: copy(state.feature.lastRound!), continuation: {roundId: state.feature.logicalRound!.id, cursor: state.feature.logicalRound!.deliveryCursor}}});
                        throw failure;
                    }
                    throw error;
                } finally {
                    accepted = [];
                }
            }),
            serialize: () => {
                declared(replaying ? "runtime.replay" : "runtime.serialize");
                if (!native) throw new Error("The WASM runtime session has been disposed.");
                diagnostics.snapshotPayloadBytes += bytes(state);
                return copy(state);
            },
            setTraceCollector: replacement => {
                if (!native || disposed) throw new Error("The WASM runtime session has been disposed.");
                if (trace === replacement) return;
                acquire(replacement);
                release(trace);
                trace = replacement;
            }, getInitialData: () => {
                if (!native || disposed) throw new Error("The WASM runtime session has been disposed.");
                return copy({...serializer.getInitialData(native as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding),
                    ...(state.sequence === 0 ? {reelsSymbols: initialScreen(state)} : state.feature.lastRound?.network)});
            }, dispose,
        };
    }
    function initialize(seed: string, credits: number) {
        if (!host.serializeState || !host.restoreState) throw new Error("Declarative WASM sessions require a bounded serializable/restorable RNG host.");
        host.resetSeed?.(seed);
        currentDraws = [];
        const built = assemble(seed, false);
        try {
            built.session.setCreditsAmount(credits);
            const origin: PokieWasmFeatureSessionState = {schemaVersion: "pokie.state.v4", artifactIdentity, seed, sequence: 0, drawCount: 0, credits, feature: {bet: built.session.getBet(), state: {}}};
            const captured = checkpoint(built.session, {getLogicalRound: () => undefined}, origin);
            setSimulationModelIdentity(built.session, manifest.artifact?.configurationHash);
            const analytics = new SessionFeatureAnalyticsObserver(built.session).toState();
            const state = {...captured, feature: {...captured.feature, initialStops: built.generator.getLastStopPositions(), analytics}};
            return {built, state};
        } catch (error) {
            built.dispose();
            throw error;
        }
    }
    const runtime: PokieWasmRuntime = {
        manifest: copy(manifest), getDiagnostics: () => ({...diagnostics}),
        getBetModes: () => copy(blueprint.betModes ?? []),
        createSession: (seed, options = {}) => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            if (typeof seed !== "string" || !Number.isFinite(options.credits ?? POKIE_WASM_DEFAULT_CREDITS) || (options.credits ?? 0) < 0) throw new Error("Invalid WASM session seed or credits.");
            acquire(options.trace);
            try {
                const {built, state} = initialize(seed, options.credits ?? POKIE_WASM_DEFAULT_CREDITS);
                record(options.trace, "initialization", 0);
                return own(state, built, options.trace);
            } catch (error) {
                release(options.trace);
                throw error;
            } finally {
                currentDraws = [];
            }
        },
        restoreSession: (input, options = {}) => {
            declared("runtime.serialize");
            validate(input);
            acquire(options.trace);
            let built: ReturnType<typeof assemble> | undefined;
            try {
                const state = copy(input);
                built = assemble(state.seed, true);
                built.session.setBet(state.feature.bet);
                built.session.fromSessionState(decode(state.feature.state));
                built.session.setCreditsAmount(state.credits);
                restoreHost(state);
                return own(state, built, options.trace);
            } catch (error) {
                built?.dispose();
                release(options.trace);
                throw error;
            }
        },
        replay: async (input, commands, options = {}) => {
            declared("runtime.replay");
            if (!Array.isArray(commands) || !commands.every(command => command && typeof command === "object" && !Array.isArray(command))) throw new Error("Malformed POKIE WASM replay commands.");
            acquire(options.trace);
            let built: ReturnType<typeof assemble> | undefined;
            let session: PokieWasmRuntimeSession | undefined;
            try {
                if (input?.schemaVersion === "pokie.state.v2" && input.sequence === 0 && input.drawCount === 0 && typeof input.seed === "string" && Number.isFinite(input.credits) && input.credits >= 0) {
                    const initialized = initialize(input.seed, input.credits);
                    input = initialized.state;
                    initialized.built.dispose();
                    record(options.trace, "initialization", 0);
                }
                validate(input);
                built = assemble(input.seed, true);
                built.session.setBet(input.feature.bet);
                built.session.fromSessionState(decode(input.feature.state));
                built.session.setCreditsAmount(input.credits);
                session = own(copy(input), built, options.trace, true);
                const rounds: PokieWasmRound[] = [];
                let stateBeforeFinal;
                for (const command of commands) {
                    stateBeforeFinal = session.serialize();
                    rounds.push(await session.play(command));
                }
                const stateAfter = session.serialize();
                options.trace?.complete();
                // Replay output owns finite requested evidence; detaching preserves it for readback.
                ACTIVE_TRACES.delete(options.trace!);
                return {rounds, ...(stateBeforeFinal ? {stateBeforeFinal} : {}), stateAfter};
            } finally {
                // Detach the collector before releasing the scratch session.
                if (session) session.dispose();
                else {
                    built?.dispose();
                    release(options.trace);
                }
            }
        },
        dispose: () => {
            disposed = true;
            for (const dispose of sessions) dispose();
            currentDraws = [];
            host = {nextRandom: () => {
                throw new Error("The WASM runtime has been disposed.");
            }};
        },
    };
    function disposeRuntime(): void {
        runtime.dispose();
    }
    return runtime;
}
