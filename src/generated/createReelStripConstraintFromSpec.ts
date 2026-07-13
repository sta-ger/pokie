import {ForbiddenAdjacencyConstraint} from "../reels/constraints/ForbiddenAdjacencyConstraint.js";
import {ForbiddenSequenceConstraint} from "../reels/constraints/ForbiddenSequenceConstraint.js";
import {MaximumCircularDistanceConstraint} from "../reels/constraints/MaximumCircularDistanceConstraint.js";
import {MaximumConsecutiveOccurrencesConstraint} from "../reels/constraints/MaximumConsecutiveOccurrencesConstraint.js";
import {MinimumCircularDistanceConstraint} from "../reels/constraints/MinimumCircularDistanceConstraint.js";
import {RequiredAdjacencyConstraint} from "../reels/constraints/RequiredAdjacencyConstraint.js";
import {RequiredSequenceConstraint} from "../reels/constraints/RequiredSequenceConstraint.js";
import type {ReelStripConstraint} from "../reels/ReelStripConstraint.js";
import type {ReelStripConstraintSpec} from "./ReelStripConstraintSpec.js";

// Builds a real ReelStripConstraint instance from its JSON-serializable spec. Every constraint
// constructor already fail-fasts on a nonsensical numeric bound (see assertPositiveFiniteInteger and
// friends) -- this only needs to pick the right class and forward fields, not re-validate them.
export function createReelStripConstraintFromSpec(spec: ReelStripConstraintSpec): ReelStripConstraint {
    switch (spec.type) {
        case "minimumCircularDistance":
            return new MinimumCircularDistanceConstraint(spec.minimumDistance, spec.symbolIds, spec.wrapAround);
        case "maximumCircularDistance":
            return new MaximumCircularDistanceConstraint(spec.maximumDistance, spec.symbolIds, spec.wrapAround);
        case "maximumConsecutiveOccurrences":
            return new MaximumConsecutiveOccurrencesConstraint(spec.maximumConsecutive, spec.symbolIds, spec.wrapAround);
        case "forbiddenAdjacency":
            return new ForbiddenAdjacencyConstraint(spec.pairs, spec.wrapAround, spec.directed);
        case "requiredAdjacency":
            return new RequiredAdjacencyConstraint(spec.pairs, spec.directed, spec.wrapAround);
        case "forbiddenSequence":
            return new ForbiddenSequenceConstraint(spec.sequence, spec.maximumOccurrences, spec.reversed, spec.wrapAround);
        case "requiredSequence":
            return new RequiredSequenceConstraint(
                spec.sequence,
                spec.minimumOccurrences,
                spec.maximumOccurrences,
                spec.reversed,
                spec.wrapAround,
            );
        default: {
            const unknownType: never = spec;
            throw new Error(`Unknown reel strip constraint type "${(unknownType as {type: string}).type}".`);
        }
    }
}
