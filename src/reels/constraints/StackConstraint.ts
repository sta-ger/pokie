import {getCircularRuns} from "../internal/circularRuns.js";
import {assertPositiveFiniteInteger} from "../internal/assertPositiveFiniteInteger.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Describes visible, same-symbol stacks as maximal runs.  A run is a stack once it reaches
// minimumLength; optional bounds then make it possible to require, forbid, space, and keep stacks
// out of an overly dense visible window without encoding overlapping requiredSequence rules.
export class StackConstraint implements ReelStripConstraint {
    private readonly minimumLength: number;
    private readonly maximumLength: number;
    private readonly minimumStacks: number;
    private readonly maximumStacks: number;
    private readonly minimumSpacing?: number;
    private readonly visibleWindowRows?: number;
    private readonly maximumSymbolsInWindow?: number;
    private readonly allowedSymbolIds?: Set<string>;
    private readonly wrapAround: boolean;

    constructor(
        minimumLength: number,
        maximumLength?: number,
        minimumStacks?: number,
        maximumStacks?: number,
        symbolIds?: string[],
        minimumSpacing?: number,
        visibleWindowRows?: number,
        maximumSymbolsInWindow?: number,
        wrapAround?: boolean,
    ) {
        const resolvedMaximumLength = maximumLength ?? Infinity;
        const resolvedMinimumStacks = minimumStacks ?? 0;
        const resolvedMaximumStacks = maximumStacks ?? Infinity;
        const resolvedWrapAround = wrapAround ?? true;
        assertPositiveFiniteInteger(minimumLength, "minimumLength");
        if (resolvedMaximumLength !== Infinity && (!Number.isInteger(resolvedMaximumLength) || resolvedMaximumLength < minimumLength)) {
            throw new Error(`maximumLength must be an integer >= minimumLength, got ${resolvedMaximumLength}.`);
        }
        if (!Number.isInteger(resolvedMinimumStacks) || resolvedMinimumStacks < 0 || (resolvedMaximumStacks !== Infinity && (!Number.isInteger(resolvedMaximumStacks) || resolvedMaximumStacks < resolvedMinimumStacks))) {
            throw new Error("Stack occurrence bounds must be non-negative integers with maximumStacks >= minimumStacks.");
        }
        if (minimumSpacing !== undefined) assertPositiveFiniteInteger(minimumSpacing, "minimumSpacing");
        if (visibleWindowRows !== undefined) assertPositiveFiniteInteger(visibleWindowRows, "visibleWindowRows");
        if (maximumSymbolsInWindow !== undefined && (!Number.isInteger(maximumSymbolsInWindow) || maximumSymbolsInWindow < 0)) {
            throw new Error(`maximumSymbolsInWindow must be a non-negative integer, got ${maximumSymbolsInWindow}.`);
        }
        if ((visibleWindowRows === undefined) !== (maximumSymbolsInWindow === undefined)) {
            throw new Error("visibleWindowRows and maximumSymbolsInWindow must be set together.");
        }
        this.minimumLength = minimumLength;
        this.maximumLength = resolvedMaximumLength;
        this.minimumStacks = resolvedMinimumStacks;
        this.maximumStacks = resolvedMaximumStacks;
        this.minimumSpacing = minimumSpacing;
        this.visibleWindowRows = visibleWindowRows;
        this.maximumSymbolsInWindow = maximumSymbolsInWindow;
        this.allowedSymbolIds = symbolIds === undefined ? undefined : new Set(symbolIds);
        this.wrapAround = resolvedWrapAround;
    }

    public getId(): string {
        return "stack";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const symbols = strip.toArray();
        const stacks = getCircularRuns(symbols, this.wrapAround).filter((run) =>
            (this.allowedSymbolIds === undefined || this.allowedSymbolIds.has(run.symbolId)) && run.length >= this.minimumLength,
        );
        const violations: ReelStripConstraintViolation[] = [];
        for (const stack of stacks) {
            if (stack.length > this.maximumLength) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Stack of "${stack.symbolId}" at position ${stack.start} has length ${stack.length}, exceeding ${this.maximumLength}.`,
                    positions: stack.positions,
                });
            }
        }
        if (stacks.length < this.minimumStacks || stacks.length > this.maximumStacks) {
            violations.push({
                constraintId: this.getId(),
                message: `Found ${stacks.length} stack(s); expected ${this.minimumStacks}${this.maximumStacks === Infinity ? "+" : `–${this.maximumStacks}`}.`,
                positions: stacks.flatMap((stack) => stack.positions),
            });
        }
        if (this.minimumSpacing !== undefined && stacks.length > 1) {
            const length = strip.getLength();
            const ordered = [...stacks].sort((a, b) => a.start - b.start);
            for (let index = 0; index < ordered.length; index++) {
                const current = ordered[index];
                const next = ordered[(index + 1) % ordered.length];
                const distance = (next.start - current.start + length) % length;
                if (distance < this.minimumSpacing) {
                    violations.push({
                        constraintId: this.getId(),
                        message: `Stacks at positions ${current.start} and ${next.start} are ${distance} positions apart, below ${this.minimumSpacing}.`,
                        positions: [...current.positions, ...next.positions],
                    });
                }
            }
        }
        if (this.visibleWindowRows !== undefined && this.maximumSymbolsInWindow !== undefined) {
            const stackPositions = new Set(stacks.flatMap((stack) => stack.positions));
            for (let start = 0; start < symbols.length; start++) {
                const positions = Array.from({length: this.visibleWindowRows}, (_, offset) => (start + offset) % symbols.length);
                const count = positions.filter((position) => stackPositions.has(position)).length;
                if (count > this.maximumSymbolsInWindow) {
                    violations.push({
                        constraintId: this.getId(),
                        message: `Visible window at position ${start} contains ${count} stack symbol(s), exceeding ${this.maximumSymbolsInWindow}.`,
                        positions,
                    });
                }
            }
        }
        return violations;
    }
}
