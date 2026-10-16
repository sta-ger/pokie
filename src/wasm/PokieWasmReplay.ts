import {advancePokieWasmReplay} from "./PokieWasmCommands.js";
import type {PokieWasmRuntime, PokieWasmRestorableState, PokieWasmRound, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";
import type {SessionCommand} from "../runtime/SessionCommand.js";

export type PokieWasmReplayOptions = {
    readonly seed: string;
    readonly round: number;
    readonly modeName?: string;
    readonly unit?: "step" | "logical-round";
    readonly entryCommands?: readonly SessionCommand[];
};
export type PokieWasmReplayObservation = {
    readonly finalRound?: PokieWasmRound;
    readonly stateBefore?: PokieWasmSessionState;
    readonly stateAfter: PokieWasmRestorableState;
    readonly totalBet: number;
    readonly totalWin: number;
    readonly totalPayout: number;
};

/** Bounded forward reproduction shared by Studio's Node and browser hosts. */
export async function collectPokieWasmReplay(runtime: PokieWasmRuntime, options: PokieWasmReplayOptions, control: {
    readonly signal?: AbortSignal;
    readonly yieldToHost?: () => Promise<void>;
    readonly onProgress?: (completed: number) => void;
} = {}): Promise<PokieWasmReplayObservation> {
    if (!Number.isSafeInteger(options.round) || options.round < 1 || options.round > 1000000) throw new Error("WASM replay requires a positive bounded round index.");
    let state: PokieWasmRestorableState = {schemaVersion: "pokie.state.v2", seed: options.seed, drawCount: 0, sequence: 0, credits: 1000};
    let finalRound: PokieWasmRound | undefined;
    let stateBefore: PokieWasmSessionState | undefined;
    let totalBet = 0;
    let totalWin = 0;
    let totalPayout = 0;
    for (let index = 0; index < options.round; index++) {
        if (control.signal?.aborted) throw new Error("WASM replay cancelled.");
        const replay = await advancePokieWasmReplay(runtime, state, {mode: options.modeName, unit: options.unit, entry: options.entryCommands?.[index], index});
        state = replay.stateAfter;
        finalRound = replay.rounds[replay.rounds.length - 1];
        stateBefore = replay.stateBeforeFinal;
        totalBet += finalRound.stake;
        totalWin += finalRound.win ?? finalRound.payout;
        totalPayout += finalRound.payout;
        if ((index + 1) % 128 === 0 || index + 1 === options.round) {
            control.onProgress?.(index + 1);
            await control.yieldToHost?.();
        }
    }
    if (control.signal?.aborted) throw new Error("WASM replay cancelled.");
    return {finalRound, stateBefore, stateAfter: state, totalBet, totalWin, totalPayout};
}
