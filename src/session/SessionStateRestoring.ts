import type {WeightedSequenceVariant} from "./videoslot/combinations/WeightedSequenceVariant.js";
import {ScreenProjection} from "./videoslot/coordinates/ScreenProjection.js";
import type {ScreenGeometry} from "./videoslot/coordinates/ScreenGeometry.js";
import type {GameSessionHandling} from "./GameSessionHandling.js";

export type SessionStateSchema =
    | {readonly kind: "base" | "custom"}
    | {readonly kind: "seeded-video-slot"; readonly weightedReels?: readonly {reelIndex: number; variants: readonly WeightedSequenceVariant<string | number>[]}[]; readonly reels?: number; readonly symbols?: readonly (string | number)[]; readonly screenGeometry?: ScreenGeometry}
    | {readonly kind: "free-games" | "bet-modes"; readonly base: SessionStateSchema}
    | {readonly kind: "hold-and-win"; readonly bets?: readonly number[]; readonly reels: number; readonly rows: number; readonly initialRespins: number; readonly symbolEffects: Readonly<Record<string, unknown>>; readonly base: SessionStateSchema}
    | {readonly kind: "jackpot"; readonly pools: readonly {id: string; type: "fixed" | "accumulating"; amount?: number; seedValue?: number}[]; readonly base: SessionStateSchema};

/** Explicit promise that the codec covers every collaborator influencing future rounds,
 * including resolved configuration, paytables, feature grants and nested calculator dependencies.
 * Built-in certification recognizes only supported resolved data; custom collaborators need
 * a complete capture/restore codec even when their containing calculator is a built-in class.
 */
export interface SessionStateRestoring {
    isSessionStateRestorable(): boolean;
    validateSessionState(state: unknown): void;
    getSessionStateSchema?(): SessionStateSchema;
}

export function isSessionStateRestorable(session: GameSessionHandling): boolean {
    const codec = session as Partial<SessionStateRestoring> & {toSessionState?: unknown; fromSessionState?: unknown};
    return typeof codec.isSessionStateRestorable === "function" && codec.isSessionStateRestorable() &&
        typeof codec.validateSessionState === "function" &&
        typeof codec.toSessionState === "function" && typeof codec.fromSessionState === "function";
}

export function resolveSessionStateSchema(session: GameSessionHandling): SessionStateSchema {
    return (session as Partial<SessionStateRestoring>).getSessionStateSchema?.() ?? {kind: "custom"};
}

export function sessionStateSchemasMatch(first: SessionStateSchema, second: SessionStateSchema | undefined): boolean {
    if (first.kind !== second?.kind) return false;
    if ("base" in first) {
        return second !== undefined && "base" in second && JSON.stringify(canonicalSchema({...first, base: undefined})) === JSON.stringify(canonicalSchema({...second, base: undefined})) && sessionStateSchemasMatch(first.base, second.base);
    }
    if (first.kind === "seeded-video-slot" && second?.kind === "seeded-video-slot") {
        return JSON.stringify(first.weightedReels?.map(reel => [reel.reelIndex, reel.variants.map(variant => [variant.id, variant.weight, variant.symbols])])) === JSON.stringify(second.weightedReels?.map(reel => [reel.reelIndex, reel.variants.map(variant => [variant.id, variant.weight, variant.symbols])])) && JSON.stringify(nonidentityGeometry(first.screenGeometry)) === JSON.stringify(nonidentityGeometry(second.screenGeometry));
    }
    return true;
}


function nonidentityGeometry(geometry: ScreenGeometry | undefined): ScreenGeometry | undefined {
    if (!geometry) return undefined;
    const projection = new ScreenProjection(geometry);
    return projection.isIdentity() ? undefined : projection.getGeometry();
}

function canonicalSchema(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalSchema);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalSchema(item)]));
    return value;
}
