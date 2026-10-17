import type {PokieWasmSessionState, PokieWasmRound} from "./PokieWasmRuntimeApi.js";
import type {SessionCommand} from "../runtime/SessionCommand.js";
import type {SimulationAccumulator} from "../simulation/SimulationAccumulator.js";
import {analyticsEnvelope} from "../simulation/FeatureAnalytics.js";

/** Fixed initialization for accepted-step simulation sampling, shared with sample replay. */
export const POKIE_WASM_SIMULATION_CREDITS = Number.MAX_SAFE_INTEGER;

/** Tool commands keep the current entry identity through every delivery/feature boundary. */
export function nextPokieWasmCommand(state: PokieWasmSessionState, mode?: string, delivery: "stepwise" | "composite" = "stepwise"): SessionCommand {
    return nextCommand(state.sequence, state.schemaVersion === "pokie.state.v4", state.schemaVersion === "pokie.state.v4" ? state.feature.logicalRound : undefined, mode, delivery);
}

/** Play/simulation callers need no serialization capability to choose the successor. */
export function nextPokieWasmPlayCommand(previous: PokieWasmRound | undefined, features: boolean, mode?: string, delivery: "stepwise" | "composite" = "stepwise"): SessionCommand {
    return nextCommand(previous?.sequence ?? 0, features, previous?.logicalRound, mode, delivery);
}
function nextCommand(sequence: number, features: boolean, round: PokieWasmRound["logicalRound"], mode: string | undefined, delivery: "stepwise" | "composite"): SessionCommand {
    if (!features) return {kind: "spin", ...(mode === undefined ? {} : {mode})};
    if (round?.status === "pending") return {kind: "spin", delivery, continuation: {roundId: round.id, cursor: round.deliveryCursor}};
    return {kind: "spin", delivery, roundId: `portable:${sequence}`, ...(mode === undefined ? {} : {mode})};
}

/** Consume accepted mathematical observations. Delivery-only frames never add a sample. */
export class PokieWasmSimulationObserver {
    private position = 0;
    private entry = 0;
    private source = "wasm";
    public observe(accumulator: SimulationAccumulator, round: PokieWasmRound, modelId: string | null): void {
        if (round.deliveries) {
            for (const delivery of round.deliveries) this.observe(accumulator, delivery, modelId);
            return;
        }
        const logical = round.logicalRound;
        if (logical && this.position === 0) accumulator.enableLogicalRoundSampling();
        if (!round.deliveryOnly) {
            if (logical?.cursor === 1) this.entry = this.position;
            this.source = round.analytics?.source ?? this.source;
            accumulator.addRound(round.stake, round.win ?? round.payout, round.analytics ?? {envelope: analyticsEnvelope(modelId), source: this.source, logicalEntry: false, logicalCompletion: false, carriedSubround: false, cascadeSteps: 0, features: []});
            if (round.sequenceStatistics) accumulator.setReelSequenceStatistics(round.sequenceStatistics);
            if (round.weightedBonusStatistics) accumulator.setWeightedBonusStatistics(round.weightedBonusStatistics);
            if (logical) accumulator.addLogicalSamplingRanges([{trajectory: this.source, observed: [[this.position, this.position + 1]], completed: []}]);
            this.position++;
        }
        if (logical?.mathematicalStatus === "completed" && !round.deliveryOnly) {
            accumulator.addLogicalRound({rounds: 1, steps: logical.cursor, totalStake: logical.totalStake, totalWin: logical.totalWin});
            accumulator.addLogicalSamplingRanges([{trajectory: this.source, observed: [], completed: [[this.entry, this.position]]}]);
        }
    }
}

export type PokieWasmSimulationOptions = {
    readonly bet?: number;
    readonly mode?: string;
    readonly signal?: AbortSignal;
    readonly chunkSize?: number;
    readonly yieldToHost?: () => Promise<void>;
    readonly onProgress?: (completed: number, mode: string | undefined, modeCount: number, statistics: import("../simulation/SimulationStatistics.js").SimulationStatistics) => void;
};
/** Fixed-budget tool sampling shares mode policy and counts accepted plays rather than deliveries. */
export async function collectPokieWasmSimulation(runtime: import("./PokieWasmRuntimeApi.js").PokieWasmRuntime, seed: string, rounds: number, options: PokieWasmSimulationOptions = {}) {
    const {SimulationAccumulator} = await import("../simulation/SimulationAccumulator.js");
    const {SimulationCancelledError} = await import("../simulation/parallel/SimulationCancelledError.js");
    if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error("WASM simulation requires a positive bounded round count.");
    if (options.signal?.aborted) throw new SimulationCancelledError();
    let modes: (string | undefined)[] = [options.mode];
    if (options.mode === "all") {
        const probe = runtime.createSession(seed);
        try {
            const declared = probe.getInitialData?.().availableBetModeIds;
            if (!declared?.length) throw new Error("This WASM model has no declared bet modes for --mode all.");
            modes = [...declared];
        } finally {
            probe.dispose();
        }
    }
    const results: {mode?: string; targetRtp?: number; statistics: import("../simulation/SimulationStatistics.js").SimulationStatistics}[] = [];
    let completed = 0;
    for (const mode of modes) {
        const session = runtime.createSession(seed, {credits: POKIE_WASM_SIMULATION_CREDITS});
        const accumulator = new SimulationAccumulator();
        const observer = new PokieWasmSimulationObserver();
        let previous: PokieWasmRound | undefined;
        let accepted = 0;
        try {
            while (accepted < rounds) {
                if (options.signal?.aborted) throw new SimulationCancelledError(accumulator.getStatistics());
                const features = runtime.manifest.serialization?.state === "pokie.state.v4";
                const command = features ? nextPokieWasmPlayCommand(previous, true, mode) : {...(mode === undefined ? {} : {mode})};
                const round = await session.play({...command, ...(options.bet === undefined || (features && previous?.logicalRound?.status === "pending") ? {} : {bet: options.bet})});
                previous = round;
                observer.observe(accumulator, round, runtime.manifest.artifact?.configurationHash ?? null);
                if (!round.deliveryOnly) {
                    accepted++;
                    completed++;
                }
                options.onProgress?.(completed, mode, modes.length, accumulator.getStatistics());
                if (accepted > 0 && accepted % (options.chunkSize ?? 1000) === 0 && accepted < rounds) await options.yieldToHost?.();
            }
            if (options.signal?.aborted) throw new SimulationCancelledError(accumulator.getStatistics());
            results.push({...(mode === undefined ? {} : {mode, targetRtp: runtime.getBetModes?.().find(item => item.id === mode)?.targetRtp}), statistics: accumulator.getStatistics()});
        } finally {
            session.dispose();
        }
    }
    return results;
}

/** Replay addresses accepted mathematical plays or complete logical entries.
 * Saved cascade display frames are delivered without spending another requested play.
 */
export async function advancePokieWasmReplay(
    runtime: import("./PokieWasmRuntimeApi.js").PokieWasmRuntime,
    initial: import("./PokieWasmRuntimeApi.js").PokieWasmRestorableState,
    options: {unit?: "step" | "logical-round"; mode?: string; entry?: SessionCommand; index: number},
) {
    let state = initial;
    const rounds: PokieWasmRound[] = [];
    const commands: Record<string, unknown>[] = [];
    for (let delivery = 0; delivery < 10000; delivery++) {
        const features = runtime.manifest.serialization?.state === "pokie.state.v4";
        const progress = state.schemaVersion === "pokie.state.v4" ? state.feature.logicalRound : undefined;
        const stages = progress?.subrounds[0]?.artifacts?.length ?? 0;
        const draining = progress?.status === "pending" && progress.stageCursor < stages;
        const policy = options.unit === "logical-round" ? "composite" : "stepwise";
        let command: Record<string, unknown>;
        if (!features && options.unit === "logical-round") throw new Error("This ordinary WASM artifact does not declare logical-round replay.");
        if (!features) command = {...(options.mode === undefined ? {} : {mode: options.mode}), ...options.entry};
        else if (progress?.status === "pending") {
            if (!draining && ((options.entry?.bet !== undefined && options.entry.bet !== progress.bet) || (options.entry?.mode !== undefined && options.entry.mode !== progress.mode))) throw new Error("Replay continuation cannot change entry selection.");
            command = {kind: "spin", delivery: draining ? "stepwise" : policy, continuation: {roundId: progress.id, cursor: progress.deliveryCursor}, ...(policy === "composite" && !draining ? {maxSubrounds: 10000} : {})};
        } else command = {kind: "spin", ...(options.mode === undefined ? {} : {mode: options.mode}), ...options.entry,
            delivery: options.entry?.delivery ?? policy, roundId: options.entry?.roundId ?? `replay:${options.index + 1}`, ...(policy === "composite" ? {maxSubrounds: options.entry?.maxSubrounds ?? 10000} : {})};
        const replay = await runtime.replay(state, [command]);
        const last = replay.rounds[replay.rounds.length - 1];
        rounds.push(...replay.rounds);
        commands.push(command);
        state = replay.stateAfter;
        if (last && !last.deliveryOnly) {
            if (options.unit === "logical-round" && features && last.logicalRound?.status !== "completed") throw new Error("WASM replay reached an incomplete logical-round boundary.");
            return {...replay, rounds, commands};
        }
    }
    throw new Error("WASM replay exceeded its bounded delivery cursor.");
}
