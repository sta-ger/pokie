import type {ScreenModifierHandling} from "./ScreenModifierHandling.js";
import {ScreenProjection} from "../coordinates/ScreenProjection.js";
import {
    cloneModifierData,
    type ScreenModifierModel,
    type ScreenModifierObservation,
    type ScreenModifierState,
    type StickyModifierCell,
} from "./ScreenModifiers.js";
import {validateScreenModifiers} from "./validateScreenModifiers.js";

/** Finite data interpreter. It owns no RNG and commits no session state. */
export class ScreenModifierEngine<T extends string | number | symbol = string> implements ScreenModifierHandling<T> {
    private readonly model: ScreenModifierModel<T>;
    private readonly projection: ScreenProjection;
    private readonly identity: string;
    constructor(model: ScreenModifierModel<T>) {
        const issues = validateScreenModifiers(model.modifiers, model);
        if (issues.length) throw new Error(issues.map((issue) => issue.message).join("; "));
        this.model = cloneModifierData(model);
        this.projection = new ScreenProjection(
            model.screenGeometry ?? {
                generated: {reels: model.reels, rows: model.rows},
                visible: {rowOffset: 0, rows: model.rows},
                evaluated: {rowOffset: 0, rows: model.rows},
                paylineSpace: "evaluated",
            },
        );
        this.identity = JSON.stringify(
            canonical({modifiers: model.modifiers, geometry: this.projection.getGeometry()}),
        );
    }
    public initialState(): ScreenModifierState<T> {
        return {identity: this.identity, cells: []};
    }
    public validateState(value: unknown): void {
        const state = value as ScreenModifierState<T>;
        if (
            !state ||
            typeof state !== "object" ||
            Array.isArray(state) ||
            Object.keys(state).some((key) => !["identity", "cells"].includes(key)) ||
            state.identity !== this.identity ||
            !Array.isArray(state.cells)
        ) throw new Error("Modifier state differs from the selected model.");
        this.validateCells(state.cells, 1);
    }
    /** Validate the last public observation against the same model as executable cells.
     * Expiring cells remain observable at zero for their final executed step.
     */
    public validateObservation(value: unknown, state: ScreenModifierState<T>): void {
        this.validateState(state);
        const observation = value as ScreenModifierObservation<T>;
        const invalid = () => new Error("Invalid screenModifiers observation for its model or retained state.");
        if (!observation || Object.keys(observation).sort().join(",") !== "rules,space,sticky" ||
            observation.space !== "evaluated" || !Array.isArray(observation.rules) || !Array.isArray(observation.sticky) ||
            observation.rules.length !== this.model.modifiers.rules.length) throw invalid();
        this.validateCells(observation.sticky, 0);
        if (JSON.stringify(canonical(observation.sticky.filter(cell => cell.remaining > 0))) !== JSON.stringify(canonical(state.cells))) throw invalid();
        for (const [index, rule] of this.model.modifiers.rules.entries()) {
            const observed = observation.rules[index];
            if (!observed || Object.keys(observed).sort().join(",") !== "id,positions" || observed.id !== rule.id || !Array.isArray(observed.positions)) throw invalid();
            const configured = rule.positions.map(position => this.projection.map(position, rule.space, "evaluated")).filter(position => position !== null);
            const allRows = (reels: number[]) => reels.flatMap(reel => Array.from({length: this.projection.getRows("evaluated")}, (_, row) => [reel, row]));
            let allowed: readonly (readonly number[])[] = configured;
            if (rule.type === "expand") allowed = allRows([...new Set(configured.map(position => position[0]))]);
            if (rule.type === "reel") allowed = allRows(rule.reels);
            const indexes = observed.positions.map(position => {
                if (!this.projection.map(position, "evaluated", "evaluated")) throw invalid();
                return allowed.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(position));
            });
            if (indexes.some(item => item < 0)) throw invalid();
            if (rule.type === "expand") {
                // Triggering cells can encounter a reel later than its first configured cell.
                const reels = [...new Set(observed.positions.map(position => position[0]))];
                if (JSON.stringify(observed.positions) !== JSON.stringify(allRows(reels))) throw invalid();
                let previous = -1;
                for (const reel of reels) {
                    const index = configured.findIndex((position, index) => index > previous && position[0] === reel);
                    if (index < 0) throw invalid();
                    previous = index;
                }
            } else if (indexes.some((item, index) => index > 0 && item <= indexes[index - 1])) throw invalid();
            if (rule.type === "sticky" && JSON.stringify(observed.positions) !== JSON.stringify(observation.sticky.filter(cell => cell.ruleId === rule.id).map(cell => cell.position))) throw invalid();
            if (rule.type === "reel" && JSON.stringify(observed.positions) !== JSON.stringify(allowed)) throw invalid();
        }
    }
    public execute(
        matrix: T[][],
        state: ScreenModifierState<T>,
    ): {matrix: T[][]; state: ScreenModifierState<T>; observation: ScreenModifierObservation<T>} {
        this.validateState(state);
        this.projection.assertMatrix(matrix, "generated");
        if (matrix.some((reel) => reel.some((symbol) => !this.model.symbols.includes(symbol)))) throw new Error("Modifier screen contains unknown symbols.");
        const evaluated = this.projection.project(matrix, "evaluated");
        const next: StickyModifierCell<T>[] = [];
        const observation: ScreenModifierObservation<T> = {space: "evaluated", rules: [], sticky: []};
        for (const rule of this.model.modifiers.rules) {
            const positions = rule.positions
                .map((position) => this.projection.map(position, rule.space, "evaluated"))
                .filter((p): p is [number, number] => p !== null);
            const affected: [number, number][] = [];
            if (rule.type === "sticky") {
                for (const position of positions) {
                    const prior = state.cells.find(
                        (cell) =>
                            cell.ruleId === rule.id &&
                            cell.position[0] === position[0] &&
                            cell.position[1] === position[1],
                    );
                    if (prior || evaluated[position[0]][position[1]] === rule.symbol) {
                        evaluated[position[0]][position[1]] = prior?.symbol ?? rule.symbol;
                        const remaining = (prior?.remaining ?? rule.lifetime) - 1;
                        observation.sticky.push({
                            ruleId: rule.id,
                            position: [...position],
                            symbol: rule.symbol,
                            factor: this.factor(rule.symbol),
                            remaining,
                        });
                        if (remaining > 0) next.push({
                            ruleId: rule.id,
                            position: [...position],
                            symbol: rule.symbol,
                            factor: this.factor(rule.symbol),
                            remaining,
                        });
                        affected.push(position);
                    }
                }
            } else if (rule.type === "transform") {
                for (const [reel, row] of positions) if (evaluated[reel][row] === rule.from) {
                    evaluated[reel][row] = rule.to;
                    affected.push([reel, row]);
                }
            } else {
                const reels =
                    rule.type === "reel"
                        ? rule.reels
                        : [
                            ...new Set(
                                positions
                                    .filter(([reel, row]) => evaluated[reel][row] === rule.symbol)
                                    .map(([reel]) => reel),
                            ),
                        ];
                // Reel fill is unconditional, with explicit selectors; expansion triggers only in evaluation.
                for (const reel of reels) for (let row = 0; row < evaluated[reel].length; row++) {
                    evaluated[reel][row] = rule.symbol;
                    affected.push([reel, row]);
                }
            }
            observation.rules.push({id: rule.id, positions: affected});
        }
        const result = matrix.map((reel) => [...reel]);
        evaluated.forEach((reel, r) =>
            reel.forEach((symbol, row) => {
                const generated = this.projection.map([r, row], "evaluated", "generated")!;
                result[generated[0]][generated[1]] = symbol;
            }),
        );
        return {matrix: result, state: {identity: this.identity, cells: next}, observation};
    }
    private validateCells(cells: StickyModifierCell<T>[], minimum: number): void {
        const seen = new Set<string>();
        for (const cell of cells) {
            const rule = this.model.modifiers.rules.find(rule => rule.id === cell?.ruleId);
            if (!cell || Object.keys(cell).some(key => !["ruleId", "position", "symbol", "factor", "remaining"].includes(key)) ||
                rule?.type !== "sticky" || cell.symbol !== rule.symbol || cell.factor !== this.factor(rule.symbol) ||
                !Number.isSafeInteger(cell.remaining) || cell.remaining < minimum || cell.remaining >= rule.lifetime) throw new Error("Invalid sticky modifier state.");
            const key = JSON.stringify([cell.ruleId, cell.position]);
            if (!this.projection.map(cell.position, "evaluated", "evaluated") ||
                !rule.positions.some(position => JSON.stringify(this.projection.map(position, rule.space, "evaluated")) === JSON.stringify(cell.position)) || seen.has(key)) throw new Error("Invalid retained sticky coordinate.");
            seen.add(key);
        }
    }
    private factor(symbol: T): number {
        return this.model.modifiers.wilds.find((wild) => wild.symbol === symbol)?.factor ?? 1;
    }
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
        Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, canonical(child)]),
    );
    return value;
}
