import {SymbolsCombinationsAnalyzer} from "../combinations/SymbolsCombinationsAnalyzer.js";
import type {HoldAndWinCollecting} from "./HoldAndWinCollecting.js";
import type {HoldAndWinSymbolEffect} from "./HoldAndWinSymbolEffect.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// The default, config-driven HoldAndWinCollecting: a symbol is collectible iff it's present as a key in
// "symbolEffects" (mirrors ValueWinCalculator's own Partial<Record<T, number>> configuration vocabulary,
// generalized to HoldAndWinSymbolEffect so a symbol can carry either a flat value or a multiplier), and
// every occurrence of it on the grid is collected independently, in the same reel-major position order
// SymbolsCombinationsAnalyzer.getScatterSymbolsPositions already returns positions in — a position already
// present in "alreadyLocked" (compared by reelId/rowId, not by symbolId — a respin can never re-land into
// an already-locked cell in the first place, but this stays correct even if it did) is never returned
// again. This is the "configurable symbol values/multipliers" extension point: swap in a different
// HoldAndWinCollecting implementation (e.g. one resolving a random value per landing instead of a static
// map) without changing anything else about the feature.
export class SymbolSetHoldAndWinCollector<T extends string | number | symbol = string> implements HoldAndWinCollecting<T> {
    private readonly symbolEffects: Partial<Record<T, HoldAndWinSymbolEffect>>;

    constructor(symbolEffects: Partial<Record<T, HoldAndWinSymbolEffect>>) {
        for (const effect of Object.values(symbolEffects) as HoldAndWinSymbolEffect[]) {
            if (!effect || ((effect.kind !== "value" && effect.kind !== "multiplier") || (effect.kind === "value" && (!Number.isFinite(effect.amount) || effect.amount < 0)) || (effect.kind === "multiplier" && (!Number.isFinite(effect.factor) || effect.factor < 0)))) throw new Error("HoldAndWin effects require finite nonnegative values or multipliers.");
        }
        this.symbolEffects = symbolEffects;
    }

    public getRestorationEffects(): Partial<Record<T, HoldAndWinSymbolEffect>> | undefined {
        return this.constructor === SymbolSetHoldAndWinCollector ? this.symbolEffects : undefined;
    }

    public collect(symbols: readonly (readonly T[])[], alreadyLocked: readonly LockedHoldAndWinSymbol<T>[]): readonly LockedHoldAndWinSymbol<T>[] {
        const lockedPositionKeys = new Set(alreadyLocked.map((locked) => this.positionKey(locked.position)));
        const collected: LockedHoldAndWinSymbol<T>[] = [];

        for (const symbolId in this.symbolEffects) {
            if (this.symbolEffects[symbolId] !== undefined) {
                const effect = this.symbolEffects[symbolId] as HoldAndWinSymbolEffect;
                const positions = SymbolsCombinationsAnalyzer.getScatterSymbolsPositions<T>(symbols as T[][], symbolId as T);
                for (const [reelId, rowId] of positions) {
                    if (!lockedPositionKeys.has(this.positionKey([reelId, rowId]))) {
                        collected.push({position: [reelId, rowId], symbolId: symbolId as T, effect});
                    }
                }
            }
        }
        return collected.sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]);
    }

    private positionKey(position: readonly [number, number]): string {
        return `${position[0]}:${position[1]}`;
    }
}
