import {validateSequenceSelections} from "./validateSequenceSelections.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {validateArtifactCoordinates} from "./validateArtifactCoordinates.js";
import {assertValidFeatureEventInput} from "./internal/assertValidFeatureEventInput.js";
import {canonicalizeJsonField} from "./internal/canonicalizeJsonField.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import {RoundArtifactBuildError} from "./RoundArtifactBuildError.js";
import type {RoundArtifactStepSource} from "./RoundArtifactStepSource.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";

const FLOAT_EPSILON = 1e-9;

// Pure mapping from an already-computed WinEvaluationResult to one RoundStepArtifact — totalWin/wins are read
// straight off the win evaluation pipeline's own output, never recalculated. Every nested value (positions,
// multiplier breakdowns, metadata, feature event data, debug) is deep-copied — none of it shares references
// with the win evaluation pipeline's own state or the caller's own input — and the returned RoundStepArtifact
// is deeply frozen, so nothing can mutate it after the fact either. Throws RoundArtifactBuildError immediately
// if: any derived win amount isn't a finite, non-negative number; the win evaluation pipeline's own totalWin
// isn't a finite, non-negative number, or doesn't match the sum of those same win amounts (a cross-check against
// the pipeline itself, since totalWin and the individual wins both ultimately come from the same
// WinEvaluationResult but are read via two different getters); a feature event has a missing/empty "type"; or
// metadata/debug/feature event data isn't JSON-safe (see canonicalizeJsonField) — never returns a step that
// would only fail later at hash/projection time.
export function buildRoundStepArtifact<T extends string | number = string>(
    index: number,
    source: RoundArtifactStepSource<T>,
): RoundStepArtifact<T> {
    if (source.generatedScreen !== undefined && source.geometry === undefined) throw new Error("Generated screen requires coordinate geometry.");
    const wins: RoundArtifactWin<T>[] = source.winEvaluationResult.getWinComponents().map((component) => {
        const winAmount = component.getWinAmount();
        if (!Number.isFinite(winAmount) || winAmount < 0) {
            throw new RoundArtifactBuildError(
                "round-artifact-win-amount-invalid",
                `win "${component.getId()}" has an invalid winAmount (${winAmount}); must be a finite number >= 0.`,
            );
        }
        return {
            type: component.getType(),
            id: component.getId(),
            symbolId: component.getSymbolId(),
            winAmount,
            winningPositions: component.getWinningPositions().map((position) => [...position]),
            multiplierBreakdown: component.getMultiplierBreakdown().map((breakdown) => ({
                source: breakdown.source,
                positions: breakdown.positions.map((position) => [...position]),
                values: [...breakdown.values],
                combinedMultiplier: breakdown.combinedMultiplier,
            })),
            metadata: canonicalizeJsonField(`win "${component.getId()}" metadata`, component.getMetadata()),
        };
    });

    const totalWin = source.winEvaluationResult.getTotalWin();
    if (!Number.isFinite(totalWin) || totalWin < 0) {
        throw new RoundArtifactBuildError(
            "round-artifact-step-total-win-invalid",
            `step ${index} totalWin (${totalWin}) must be a finite number >= 0.`,
        );
    }
    const winsSum = wins.reduce((sum, win) => sum + win.winAmount, 0);
    if (Math.abs(totalWin - winsSum) > FLOAT_EPSILON) {
        throw new RoundArtifactBuildError(
            "round-artifact-step-total-win-mismatch",
            `step ${index} totalWin (${totalWin}) does not match the sum of its own wins (${winsSum}).`,
        );
    }

    source.featureEvents?.forEach((event) => assertValidFeatureEventInput(event, `step ${index}`));
    const featureEvents: RoundArtifactFeatureEvent[] | undefined = source.featureEvents?.map((event) => ({
        type: event.type,
        ...(event.data !== undefined
            ? {data: canonicalizeJsonField(`step ${index} feature event "${event.type}" data`, event.data)}
            : {}),
    }));

    validateSequenceSelections(source.sequenceSelections, source.screen.length);
    const step: RoundStepArtifact<T> = {
        ...(source.sequenceSelections ? {sequenceSelections: source.sequenceSelections.map(item => ({...item}))} : {}),
        index,
        ...(source.geometry ? {geometry: new ScreenProjection(source.geometry).getGeometry(), generatedScreen: source.generatedScreen?.map(reel => [...reel])} : {}),
        screen: source.screen.map((reel) => [...reel]),
        totalWin,
        wins,
        ...(featureEvents !== undefined ? {featureEvents} : {}),
        ...(source.debug !== undefined ? {debug: canonicalizeJsonField(`step ${index} debug`, source.debug)} : {}),
    };

    validateArtifactCoordinates(step);
    return deepFreeze(step);
}
