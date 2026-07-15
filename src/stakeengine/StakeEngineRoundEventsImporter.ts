import type {RoundArtifactFeatureEventInput} from "../artifact/RoundArtifactFeatureEvent.js";
import {convertStakeUnitsToRatio} from "./internal/convertStakeUnitsToRatio.js";
import {convertStakeUnitsToRawAmount} from "./internal/convertStakeUnitsToRawAmount.js";
import {StakeEngineImportEventsError} from "./StakeEngineImportEventsError.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import type {
    StakeEngineImportedRound,
    StakeEngineImportedStep,
    StakeEngineRoundEventsImporting,
    StakeEngineRoundImportContext,
} from "./StakeEngineRoundEventsImporting.js";

const FLOAT_EPSILON = 1e-9;

type OpenStep<T extends string | number> = {
    screen: readonly (readonly T[])[];
    featureEvents: RoundArtifactFeatureEventInput[];
    totalWin: number;
    sawWin: boolean;
};

function hasExactKeys(event: StakeEngineEvent, keys: readonly string[]): boolean {
    const actual = Object.keys(event).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, position) => key === expected[position]);
}

// The reverse of StakeEngineRoundEventsProjector: a single forward scan, no lookahead, exploiting the exact,
// deterministic order the forward projector always produces — [reveal, stepFeature*, win?] repeated per step,
// then roundOnlyFeature*, then exactly one finalWin, always last. See StakeEngineRoundEventsImporting.ts for the
// interface/context this implements and why it never builds a RoundArtifact itself.
//
// Two disclosed, pre-existing limitations of the export encoding itself (neither is something this importer
// could detect or work around):
//   - "reveal"/"win"/"finalWin" are reserved by convention only in the forward projector's own vocabulary — a
//     custom RoundArtifactFeatureEvent literally typed one of those would be indistinguishable on import from
//     the real structural event.
//   - A step's own feature-collecting window closes on its own "win" event, or — for every step but the last —
//     on the *next* step's "reveal" regardless of win. The *last* step has neither signal available if it never
//     wins: any feature events between its "reveal" and the round's "finalWin" are then genuinely ambiguous
//     between "the last step's own features" and "round-level-only features" — the event stream carries no
//     explicit count of how many features belong to a step, only their relative position. This never affects a
//     round whose last step has a nonzero win (the "win" event is the closing signal), which covers every round
//     that actually pays out on its final step.
export class StakeEngineRoundEventsImporter<T extends string | number = string> implements StakeEngineRoundEventsImporting<T> {
    public importEvents(events: readonly StakeEngineEvent[], context: StakeEngineRoundImportContext): StakeEngineImportedRound<T> {
        this.validateStructure(events);

        const steps: StakeEngineImportedStep<T>[] = [];
        const roundFeatureEvents: RoundArtifactFeatureEventInput[] = [];
        let currentStep: OpenStep<T> | undefined;

        const closeCurrentStep = (): void => {
            if (currentStep !== undefined) {
                steps.push({screen: currentStep.screen, totalWin: currentStep.totalWin, featureEvents: currentStep.featureEvents});
                currentStep = undefined;
            }
        };

        for (const event of events) {
            if (event.type === "reveal") {
                closeCurrentStep();
                currentStep = {screen: this.parseBoard(event), featureEvents: [], totalWin: 0, sawWin: false};
            } else if (event.type === "win") {
                if (currentStep === undefined || currentStep.sawWin) {
                    throw new StakeEngineImportEventsError(
                        "stakeengine-import-events-unexpected-win",
                        `a "win" event at index ${event.index} appeared with no open step, or a step already had one.`,
                    );
                }
                const amount = this.parseWinAmount(event);
                const rawAmount = convertStakeUnitsToRawAmount(amount, context.stake, context.cost);
                if (rawAmount === undefined) {
                    throw new StakeEngineImportEventsError(
                        "stakeengine-import-win-amount-not-invertible",
                        `"win" event amount (${amount}) at index ${event.index} is not representable without hidden rounding at stake ${context.stake}/cost ${context.cost}.`,
                    );
                }
                currentStep.totalWin = rawAmount;
                currentStep.sawWin = true;
            } else if (event.type === "finalWin") {
                closeCurrentStep();
                return this.finish(steps, roundFeatureEvents, event, context);
            } else {
                const featureEvent = this.parseFeatureEvent(event);
                if (currentStep !== undefined && !currentStep.sawWin) {
                    currentStep.featureEvents.push(featureEvent);
                } else {
                    roundFeatureEvents.push(featureEvent);
                }
            }
        }

        // Unreachable: validateStructure already confirmed the last event is "finalWin", which always returns
        // from within the loop above.
        throw new StakeEngineImportEventsError("stakeengine-import-events-missing-final-win", "no \"finalWin\" event was found.");
    }

    private finish(
        steps: StakeEngineImportedStep<T>[],
        roundFeatureEvents: RoundArtifactFeatureEventInput[],
        finalWinEvent: StakeEngineEvent,
        context: StakeEngineRoundImportContext,
    ): StakeEngineImportedRound<T> {
        const {amount, payoutMultiplier} = this.parseFinalWin(finalWinEvent);
        if (amount !== payoutMultiplier) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-final-win-amount-payout-multiplier-mismatch",
                `"finalWin" amount (${amount}) and payoutMultiplier (${payoutMultiplier}) must be numerically identical.`,
            );
        }

        const reversedTotalWin = convertStakeUnitsToRawAmount(amount, context.stake, context.cost);
        const reversedPayoutMultiplier = convertStakeUnitsToRatio(payoutMultiplier, context.cost);
        if (reversedTotalWin === undefined || reversedPayoutMultiplier === undefined) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-payout-multiplier-not-invertible",
                `"finalWin" amount/payoutMultiplier (${amount}) is not representable without hidden rounding at stake ${context.stake}/cost ${context.cost}.`,
            );
        }

        const stepsTotalWin = steps.reduce((sum, step) => sum + step.totalWin, 0);
        if (Math.abs(stepsTotalWin - reversedTotalWin) > FLOAT_EPSILON) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-total-win-mismatch",
                `the sum of reconstructed step totalWins (${stepsTotalWin}) does not match the round's own reconstructed totalWin (${reversedTotalWin}).`,
            );
        }

        return {steps, roundFeatureEvents, totalWin: reversedTotalWin, payoutMultiplier: reversedPayoutMultiplier};
    }

    private validateStructure(events: readonly StakeEngineEvent[]): void {
        if (events.length === 0) {
            throw new StakeEngineImportEventsError("stakeengine-import-events-empty", "events must be a non-empty array.");
        }

        events.forEach((event, position) => {
            if (event.index !== position) {
                throw new StakeEngineImportEventsError(
                    "stakeengine-import-events-index-out-of-sequence",
                    `event at position ${position} has index ${event.index}, expected ${position}.`,
                );
            }
        });

        if (events[0].type !== "reveal") {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-missing-reveal",
                `the first event must be "reveal", got "${events[0].type}".`,
            );
        }

        const lastIndex = events.length - 1;
        events.forEach((event, position) => {
            if (event.type === "finalWin" && position !== lastIndex) {
                throw new StakeEngineImportEventsError(
                    "stakeengine-import-events-final-win-not-last",
                    `a "finalWin" event appeared at position ${position}, before the last position (${lastIndex}).`,
                );
            }
        });

        if (events[lastIndex].type !== "finalWin") {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-missing-final-win",
                `the last event must be "finalWin", got "${events[lastIndex].type}".`,
            );
        }
    }

    private parseBoard(event: StakeEngineEvent): readonly (readonly T[])[] {
        if (!hasExactKeys(event, ["index", "type", "board"])) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-reveal-shape-invalid",
                `"reveal" event at index ${event.index} must have exactly {index, type, board}.`,
            );
        }
        const board = (event as unknown as {board: unknown}).board;
        if (!Array.isArray(board) || board.length === 0 || !board.every((reel) => Array.isArray(reel) && reel.length > 0)) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-reveal-shape-invalid",
                `"reveal" event at index ${event.index} has an invalid "board" (must be a non-empty array of non-empty arrays).`,
            );
        }
        return board as readonly (readonly T[])[];
    }

    private parseWinAmount(event: StakeEngineEvent): number {
        if (!hasExactKeys(event, ["index", "type", "amount"])) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-win-shape-invalid",
                `"win" event at index ${event.index} must have exactly {index, type, amount}.`,
            );
        }
        const amount = (event as unknown as {amount: unknown}).amount;
        if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-win-shape-invalid",
                `"win" event at index ${event.index} has an invalid "amount" (${String(amount)}); must be a non-negative safe integer.`,
            );
        }
        return amount;
    }

    private parseFinalWin(event: StakeEngineEvent): {amount: number; payoutMultiplier: number} {
        if (!hasExactKeys(event, ["index", "type", "amount", "payoutMultiplier"])) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-final-win-shape-invalid",
                `"finalWin" event at index ${event.index} must have exactly {index, type, amount, payoutMultiplier}.`,
            );
        }
        const {amount, payoutMultiplier} = event as unknown as {amount: unknown; payoutMultiplier: unknown};
        if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-final-win-shape-invalid",
                `"finalWin" event at index ${event.index} has an invalid "amount" (${String(amount)}); must be a non-negative safe integer.`,
            );
        }
        if (typeof payoutMultiplier !== "number" || !Number.isSafeInteger(payoutMultiplier) || payoutMultiplier < 0) {
            throw new StakeEngineImportEventsError(
                "stakeengine-import-events-final-win-shape-invalid",
                `"finalWin" event at index ${event.index} has an invalid "payoutMultiplier" (${String(payoutMultiplier)}); must be a non-negative safe integer.`,
            );
        }
        return {amount, payoutMultiplier};
    }

    private parseFeatureEvent(event: StakeEngineEvent): RoundArtifactFeatureEventInput {
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(event)) {
            if (key !== "index" && key !== "type") {
                data[key] = value;
            }
        }
        return Object.keys(data).length > 0 ? {type: event.type, data} : {type: event.type};
    }
}
