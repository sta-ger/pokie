import {ScreenProjection} from "../ScreenProjection.js";
import type {ScreenGeometry} from "../ScreenGeometry.js";
import type {WinComponent} from "../../winevaluation/WinComponent.js";

/** Mandatory safety check for injected evaluators, aggregation policies and legacy adapters. */
export function assertEvaluationComponents<T extends string | number | symbol>(components: readonly WinComponent<T>[], geometry: ScreenGeometry): void {
    const projection = new ScreenProjection(geometry);
    const assertPositions = (positions: readonly (readonly number[])[]): void => {
        if (!Array.isArray(positions) || positions.some(position => !Array.isArray(position) || projection.map(position, "evaluated", "generated") === null)) {
            throw new Error("Evaluator returned positions outside the evaluation domain.");
        }
    };
    for (const component of components) {
        assertPositions(component.getWinningPositions());
        component.getMultiplierBreakdown().forEach(item => assertPositions(item.positions));
        const metadata = component.getMetadata();
        if (component.getType() === "line") {
            const definition = metadata.definition;
            if (!Array.isArray(definition) || definition.length !== geometry.generated.reels) throw new Error("Evaluator returned an invalid evaluation-local line definition.");
            assertPositions(definition.map((row, reel) => [reel, row]));
            for (const field of ["symbolsPositions", "wildSymbolsPositions"] as const) {
                const reels = metadata[field];
                if (!Array.isArray(reels) || reels.some(reel => !Number.isSafeInteger(reel) || reel < 0 || reel >= geometry.generated.reels)) {
                    throw new Error("Evaluator returned invalid line-local reel indexes.");
                }
            }
        } else if (metadata.symbolsPositions !== undefined) {
            assertPositions(metadata.symbolsPositions as number[][]);
        }
    }
}
