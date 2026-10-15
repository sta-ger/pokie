import type {ScreenCoordinateSpace, ScreenGeometry} from "../coordinates/ScreenGeometry.js";

/** Arrays are executable order; each rule observes the preceding rule's screen. */
export type ScreenModifierRule<T extends string | number | symbol = string> = {
    id: string;
    space: ScreenCoordinateSpace;
    positions: [number, number][];
} & (
    | {type: "transform"; from: T; to: T}
    | {type: "expand"; symbol: T}
    | {type: "sticky"; symbol: T; lifetime: number}
    | {type: "reel"; symbol: T; reels: number[]}
);

export type ScreenModifiers<T extends string | number | symbol = string> = {
    wilds: {symbol: T; substitutes?: T[]; factor?: number}[];
    rules: ScreenModifierRule<T>[];
};

export type StickyModifierCell<T extends string | number | symbol = string> = {
    ruleId: string;
    position: [number, number]; // evaluation-local
    symbol: T;
    factor: number;
    remaining: number; // future executed steps, acquisition step already consumed
};
export type ScreenModifierState<T extends string | number | symbol = string> = {
    identity: string;
    cells: StickyModifierCell<T>[];
};
export type ScreenModifierObservation<T extends string | number | symbol = string> = {
    space: "evaluated";
    rules: {id: string; positions: [number, number][]}[];
    sticky: StickyModifierCell<T>[];
};
export type ScreenModifierModel<T extends string | number | symbol = string> = {
    modifiers: ScreenModifiers<T>;
    symbols: readonly T[];
    wilds: readonly T[];
    reels: number;
    rows: number;
    screenGeometry?: ScreenGeometry;
};

/** Detach plain modifier data in the caller's realm; preserve generic symbol IDs. */
export function cloneModifierData<T>(value: T): T {
    if (Array.isArray(value)) return value.map(cloneModifierData) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneModifierData(child)])) as T;
    return value;
}
