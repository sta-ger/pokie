import {ScreenModifierEngine} from "../session/videoslot/modifiers/ScreenModifierEngine.js";
import {validateMechanicState} from "./validateMechanicState.js";
import {WeightedSymbolsSequence} from "../session/videoslot/combinations/WeightedSymbolsSequence.js";
import {validateSequenceSelections} from "../artifact/validateSequenceSelections.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import type {LiveSnapshotPolicy} from "./internal/LiveSessionAuthority.js";
import type {SessionStateSchema} from "../session/SessionStateRestoring.js";
/** Validate the built-in state envelopes without constructing a session or drawing randomness.
 * Custom codecs additionally validate their opaque payload in PokieGame.validateSessionState.
 * The built-in live-only partial policy permits an absent RNG/reel pair, while preserving model
 * constraints, feature counters and nested envelopes. It never authorizes reconstruction.
 */
export function validateExecutableState(value: unknown, schema?: SessionStateSchema, customValidator?: (state: unknown) => void, partial?: boolean, live?: LiveSnapshotPolicy): void {
    partial = live?.partial ?? partial ?? false;
    if (schema !== undefined && (typeof schema !== "object" || schema === null ||
        !["base", "seeded-video-slot", "free-games", "bet-modes", "hold-and-win", "jackpot", "custom"].includes(schema.kind))) throw new Error("Unknown executable state schema.");
    if (schema?.kind === "seeded-video-slot" && schema.screenGeometry) new ScreenProjection(schema.screenGeometry).getGeometry();
    if (schema?.kind === "custom") {
        if (live?.opaque === true) {
            if (value === undefined && !live.optional) throw new Error("Required opaque live snapshot is missing.");
            return;
        }
        if (customValidator === undefined) throw new Error("Custom executable state requires the selected game's validator.");
        customValidator(value);
        return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Executable state must be an object.");
    const state = value as Record<string, unknown>;
    if (state.selectionContext !== undefined && (typeof state.selectionContext !== "string" ||
        !(/^(implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(state.selectionContext) || state.selectionContext.includes("\0") ||
        (state.selectionContext.startsWith("implicit:") && (!Number.isSafeInteger(Number(state.selectionContext.slice(9))) ||
            (state.implicitRound !== undefined && Number(state.selectionContext.slice(9)) > (state.implicitRound as number)))))) throw new Error("Invalid pending whole-sequence round context.");
    if (state.featureEntryPending !== undefined && (typeof state.featureEntryPending !== "boolean" ||
        (state.featureEntryPending && !(typeof state.freeGamesSum === "number" && typeof state.freeGamesNum === "number" && state.freeGamesSum > state.freeGamesNum)))) throw new Error("Invalid pending feature entry.");
    if (schema?.kind === "seeded-video-slot") {
        if (schema.modifiers) new ScreenModifierEngine({modifiers: schema.modifiers, symbols: schema.symbols ?? [], wilds: schema.wilds ?? [], reels: schema.reels!, rows: schema.rows!, screenGeometry: schema.screenGeometry}).validateState(state.modifierState);
        else if (state.modifierState !== undefined) throw new Error("Unexpected modifier state.");
    }
    if (schema?.kind === "base" && Object.keys(state).length !== 0) throw new Error("Base-game state must be empty.");
    if (partial && schema?.kind === "seeded-video-slot" && (state.rngState === undefined) !== (state.reelStrips === undefined)) throw new Error("Partial seeded state must omit RNG and reels together.");
    if (!partial && schema?.kind === "seeded-video-slot" && state.rngState === undefined) throw new Error("Required seeded RNG snapshot is missing.");
    if (schema?.kind === "seeded-video-slot" && (!partial || state.reelStrips !== undefined) && (!Array.isArray(state.reelStrips) || state.reelStrips.length === 0 ||
        !state.reelStrips.every(strip => Array.isArray(strip) && strip.length > 0 && strip.every(symbol => typeof symbol === "string" || (typeof symbol === "number" && Number.isFinite(symbol)))))) throw new Error("Required resolved reel strips are missing or invalid.");
    if (schema?.kind === "seeded-video-slot" && state.reelStrips !== undefined) {
        const strips = state.reelStrips as (string | number)[][];
        if ((schema.reels !== undefined && strips.length !== schema.reels) ||
            (schema.symbols !== undefined && !strips.every(strip => strip.every(symbol => schema.symbols!.includes(symbol))))) throw new Error("Resolved reel strips do not match the selected model.");
    }
    if (schema?.kind === "seeded-video-slot" && schema.weightedReels && state.reelStrips !== undefined) {
        const strips = state.reelStrips as (string | number)[][];
        const selection = state.sequenceState as {context: string; contextRequested: boolean; implicitGeneration: number; selections: import("../session/videoslot/combinations/WeightedSequenceVariant.js").ReelSequenceSelection[]; counts: Record<string, number>[]};
        if (!selection || !Array.isArray(selection.selections) || selection.selections.length !== schema.weightedReels.length || typeof selection.context !== "string" || !Array.isArray(selection.counts) || selection.counts.length !== strips.length || typeof selection.contextRequested !== "boolean" || !Number.isSafeInteger(selection.implicitGeneration) || selection.implicitGeneration < 0 || !Number.isSafeInteger(state.implicitRound) || (state.implicitRound as number) < 0) throw new Error("Missing weighted selection state.");
        if (selection.context.startsWith("implicit:") && (!Number.isSafeInteger(Number(selection.context.slice(9))) || Number(selection.context.slice(9)) > Math.min(selection.implicitGeneration, state.implicitRound as number))) throw new Error("Unreserved implicit weighted context.");
        if (selection.context !== "initialization") validateSequenceSelections(selection.selections, strips.length);
        for (const reel of schema.weightedReels) {
            const definition = new WeightedSymbolsSequence(reel.variants, schema.symbols);
            const retained = selection.selections.find(item => item.reelIndex === reel.reelIndex);
            if (!retained || retained.context !== selection.context || JSON.stringify(definition.resolve(retained.variantId).toArray()) !== JSON.stringify(strips[reel.reelIndex])) throw new Error("Invalid resolved weighted variant/context.");
        }
        Array.from(selection.counts).forEach((counts, reelIndex) => {
            const definition = schema.weightedReels!.find(reel => reel.reelIndex === reelIndex);
            if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.entries(counts).some(([id, count]) => !definition?.variants.some(variant => variant.id === id && variant.weight > 0) || !Number.isSafeInteger(count) || count < 0)) throw new Error("Invalid weighted counters.");
        });
    }
    if (schema?.kind === "free-games" && (state.freeGamesNum === undefined || state.freeGamesSum === undefined || state.freeGamesBank === undefined)) throw new Error("Required free-games state is missing.");
    if (schema?.kind === "bet-modes" && state.betModeId === undefined) throw new Error("Required bet-mode state is missing.");
    if ((schema !== undefined && "base" in schema) && (schema.base === undefined || (state.base === undefined && live?.base?.optional !== true))) throw new Error("Required base schema/state is missing.");
    if (schema) validateMechanicState(state, schema);
    if ("rngState" in state && live?.opaqueRng !== true && (typeof state.rngState !== "number" || !Number.isSafeInteger(state.rngState) || state.rngState < 0 || state.rngState > 0xffffffff)) {
        throw new Error("Invalid seeded RNG snapshot.");
    }
    if ("freeGamesNum" in state || "freeGamesSum" in state || "freeGamesBank" in state) {
        for (const key of ["freeGamesNum", "freeGamesSum"] as const) {
            if (typeof state[key] !== "number" || !Number.isSafeInteger(state[key]) || state[key] < 0) throw new Error(`Invalid ${key}.`);
        }
        if ((state.freeGamesNum as number) > (state.freeGamesSum as number) ||
            typeof state.freeGamesBank !== "number" || !Number.isFinite(state.freeGamesBank) || state.freeGamesBank < 0 ||
            (state.wonFreeGamesNumber !== undefined && (typeof state.wonFreeGamesNumber !== "number" || !Number.isSafeInteger(state.wonFreeGamesNumber) || state.wonFreeGamesNumber < 0))) throw new Error("Invalid free-games progress or bank.");
        if (state.base === undefined && live?.base?.optional !== true) throw new Error("Free-games state requires its nested base state.");
    }
    if ("betModeId" in state && (typeof state.betModeId !== "string" || !state.betModeId || (state.base === undefined && live?.base?.optional !== true))) throw new Error("Invalid bet-mode state.");
    if (schema?.kind === "bet-modes" && live !== undefined && !live.modes?.includes(state.betModeId as string)) throw new Error("Persisted bet mode is not supported by the trusted live model.");
    if ((schema !== undefined && "base" in schema) && live !== undefined && live.base === undefined) throw new Error("Trusted nested snapshot policy is missing.");
    if (state.base !== undefined) validateExecutableState(state.base,
        schema !== undefined && "base" in schema ? schema.base : undefined, customValidator, partial, live?.base);
}
