import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires that every occurrence of a "subject" symbol has one of its required neighbor(s) adjacent
// to it -- the mirror image of ForbiddenAdjacencyConstraint: instead of scanning every adjacent
// pair of positions against a blacklist, this scans every occurrence of a subject symbol against a
// whitelist of acceptable neighbors. `requiredPairs` entries sharing the same subject accumulate
// into a set of acceptable neighbors for that subject -- an occurrence satisfying any one of them
// passes (e.g. `[["W", "M"], ["W", "X"]]` requires every "W" to be next to an "M" *or* an "X").
// There's no separate symbolIds filter: `requiredPairs` already determines exactly which symbols
// this constraint inspects (only declared subjects are checked at all).
//
// `directed = false` (default, undirected): either adjacent position (previous or next, per
// `wrapAround`) may hold a required neighbor. `directed = true`: specifically the *next* position
// (subject immediately followed by the required neighbor) must hold one.
//
// Adjacency wraps around the strip's end by default (`wrapAround = true`); pass `false` to only
// check linear adjacency -- a subject occurrence at either physical end of the strip is then judged
// solely on whichever neighbor(s) it actually has (possibly none).
export class RequiredAdjacencyConstraint implements ReelStripConstraint {
    private readonly requiredNeighborsBySubject: ReadonlyMap<string, ReadonlySet<string>>;
    private readonly directed: boolean;
    private readonly wrapAround: boolean;

    constructor(requiredPairs: [string, string][], directed = false, wrapAround = true) {
        const requiredNeighborsBySubject = new Map<string, Set<string>>();
        for (const [subject, requiredNeighbor] of requiredPairs) {
            const neighbors = requiredNeighborsBySubject.get(subject) ?? new Set<string>();
            neighbors.add(requiredNeighbor);
            requiredNeighborsBySubject.set(subject, neighbors);
        }
        this.requiredNeighborsBySubject = requiredNeighborsBySubject;
        this.directed = directed;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "required-adjacency";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const length = strip.getLength();
        const symbols = strip.toArray();

        for (let position = 0; position < length; position++) {
            const subject = symbols[position];
            const requiredNeighbors = this.requiredNeighborsBySubject.get(subject);
            if (!requiredNeighbors) {
                continue;
            }

            const neighborPositions = this.getNeighborPositions(position, length);
            const actualNeighbors = neighborPositions.map((neighborPosition) => symbols[neighborPosition]);
            const isSatisfied = actualNeighbors.some((neighbor) => requiredNeighbors.has(neighbor));

            if (!isSatisfied) {
                const requiredDescription = [...requiredNeighbors].join(" or ");
                const actualDescription = actualNeighbors.length > 0 ? actualNeighbors.join(", ") : "no neighbor at all";
                const directionLabel = this.directed ? "next" : "adjacent";
                violations.push({
                    constraintId: this.getId(),
                    message: `Symbol "${subject}" at position ${position} requires a ${directionLabel} occurrence of "${requiredDescription}", but found ${actualDescription}.`,
                    positions: [position, ...neighborPositions],
                    details: {subject, position, requiredNeighbors: [...requiredNeighbors], actualNeighbors},
                });
            }
        }
        return violations;
    }

    private getNeighborPositions(position: number, length: number): number[] {
        if (this.directed) {
            if (!this.wrapAround && position === length - 1) {
                return [];
            }
            return [(position + 1) % length];
        }

        const positions: number[] = [];
        if (this.wrapAround || position > 0) {
            positions.push((position - 1 + length) % length);
        }
        if (this.wrapAround || position < length - 1) {
            positions.push((position + 1) % length);
        }
        return positions;
    }
}
