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
            Object.keys(state.feature).some(key => !["bet", "state", "initialStops", "logicalRound", "lastRound", "analytics", "pendingCommand"].includes(key))) throw new Error("Unexpected compact feature-state fields.");
        if (state.rngState !== undefined) clonePokieWasmHostState(state.rngState);
        const round = state.feature.logicalRound;
        if (round && (round.retention !== "latest" || validateLogicalRound(round))) throw new Error("Invalid compact logical-round continuation.");
        if (state.feature.pendingCommand && !round) throw new Error("Pending delivery requires compact logical progress.");
        const last = state.feature.lastRound;
        if (state.sequence === 0 ? last !== undefined || round !== undefined : !last || last.sequence !== state.sequence || last.credits !== state.credits || JSON.stringify(last.logicalRound) !== JSON.stringify(round)) throw new Error("Feature checkpoint differs from its last accepted delivery.");
        const check = assemble(state.seed, true);
        try {
            check.session.setBet(state.feature.bet);
            check.session.validateSessionState(decode(state.feature.state));
            check.session.fromSessionState(decode(state.feature.state));
            check.session.setCreditsAmount(state.credits);
            if (state.sequence === 0) initialScreen(state);
            else if (state.feature.initialStops !== undefined) throw new Error("Completed initialization must not retain obsolete screen stops.");
            if (state.feature.analytics) new SessionFeatureAnalyticsObserver(check.session).restoreState(state.feature.analytics);
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
                if (stableSlotMathJson(last.screen) !== stableSlotMathJson(last.network?.reelsSymbols)) throw new Error("Last screen contradicts its accepted network observation.");
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
        const onAccepted = (command: SessionCommand, result: Extract<import("../../runtime/SessionRuntimeHandling.js").SessionCommandResult, {status: "played"}>): void => {
            const creditsBefore = state.credits;
            const network = result.deliveryOnly && state.feature.lastRound?.network ? copy(state.feature.lastRound.network)
                : serializer.getRoundData(native! as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding);
            const payout = result.payout ?? Math.max(0, native!.getCreditsAmount() - creditsBefore + result.stake);
            const round: PokieWasmRound = {sequence: state.sequence + 1, draw: currentDraws[0] ?? 0, stops: result.deliveryOnly && state.feature.lastRound ? state.feature.lastRound.stops : built.generator.getLastStopPositions(), screen: network.reelsSymbols,
                winMultiplier: result.win / native!.getBet(), win: result.win, stake: result.stake, payout, creditsBefore, credits: native!.getCreditsAmount(), command,
                network, ...(!result.deliveryOnly ? {analytics: observer.afterPlay(before, result.win, result.mode)} : {}), ...(result.logicalRound ? {logicalRound: result.logicalRound} : {}), ...(result.deliveryOnly ? {deliveryOnly: true} : {}),
                sequenceSelections: built.generator.getSequenceSelections(), sequenceStatistics: built.generator.getSequenceStatistics(),
                ...((native as {getWeightedBonusStatistics?: () => unknown}).getWeightedBonusStatistics?.() ? {weightedBonusStatistics: (native as unknown as {getWeightedBonusStatistics(): PokieWasmRound["weightedBonusStatistics"]}).getWeightedBonusStatistics()} : {})};
            before = observer.beforePlay();
            state = checkpoint(native!, runtime, state, round);
            state = {...state, feature: {...state.feature, analytics: observer.toState()}};
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
                restoreHost(state);
                currentDraws = [];
                const creditsBefore = prefix?.creditsBefore ?? state.credits;
                accepted = [];
                const aggregate = (): PokieWasmRound => {
                    const latest = accepted[accepted.length - 1] ?? state.feature.lastRound!;
                    const win = (prefix?.win ?? 0) + accepted.reduce((sum, round) => sum + (round.deliveryOnly ? 0 : round.win ?? 0), 0);
                    return {...latest, command, creditsBefore, win, stake: (prefix?.stake ?? 0) + accepted.reduce((sum, round) => sum + round.stake, 0),
                        payout: (prefix?.payout ?? 0) + accepted.reduce((sum, round) => sum + round.payout, 0), winMultiplier: win / native!.getBet()};
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
                return {...serializer.getInitialData(native as NativeSession & import("../../session/videoslot/cascade/CascadeResultProviding.js").CascadeResultProviding),
                    ...(state.sequence === 0 ? {reelsSymbols: initialScreen(state)} : state.feature.lastRound?.network)};
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
            const state = {...captured, feature: {...captured.feature, initialStops: built.generator.getLastStopPositions()}};
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
