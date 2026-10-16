import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";
import {projectVisiblePayline} from "../session/videoslot/coordinates/projectVisibleWinData.js";

/** Required canonical evidence, independent of debug capture policy. */
export function validateArtifactCoordinates<T extends string | number>(step: Pick<RoundStepArtifact<T>, "screen" | "wins" | "geometry" | "generatedScreen">): void {
    if (step.geometry === undefined) {
        if (step.generatedScreen !== undefined) throw new Error("Generated screen requires coordinate geometry.");
    }
    const projection = step.geometry && new ScreenProjection(step.geometry);
    if (projection) {
        if (!step.generatedScreen) throw new Error("Coordinate artifact requires its generated screen.");
        const expected = projection.project(step.generatedScreen, "visible");
        projection.assertMatrix(step.screen, "visible");
        if (JSON.stringify(expected) !== JSON.stringify(step.screen)) throw new Error("Artifact viewport differs from generated screen projection.");
    }
    const reelsNumber = step.geometry?.generated.reels ?? step.screen.length;
    const contains = (position: readonly number[]): boolean => Array.isArray(position) && position.length === 2 &&
        position.every(index => Number.isSafeInteger(index) && index >= 0) &&
        (projection ? projection.map(position, "evaluated", "generated") !== null :
            position[0] < reelsNumber && position[1] < step.screen[position[0]]?.length);
    const assertPositions = (positions: readonly (readonly number[])[]): void => {
        if (!Array.isArray(positions) || Array.from(positions).some(position => !contains(position))) {
            throw new Error("Artifact win position is outside evaluation domain.");
        }
    };
    for (const win of step.wins) {
        assertPositions(win.winningPositions);
        for (const item of win.multiplierBreakdown) {
            if (!item) throw new Error("Artifact multiplier breakdown is invalid.");
            assertPositions(item.positions);
        }
        if (win.type === "line") {
            const definition = win.metadata.definition;
            // Custom/legacy components may omit presentation metadata. Any supplied
            // coordinates must still satisfy the same domain as canonical components.
            if (definition !== undefined) {
                if (!Array.isArray(definition) || definition.length !== reelsNumber ||
                    !Array.from(definition).every((row, reel) => typeof row === "number" && contains([reel, row]))) {
                    throw new Error("Artifact line definition is outside evaluation domain.");
                }
                // Force the same discrete-index validation used by public drawing projection.
                if (projection) projectVisiblePayline(definition as number[], projection);
            }
            for (const field of ["symbolsPositions", "wildSymbolsPositions"] as const) {
                const reels = win.metadata[field];
                if (reels !== undefined && (!Array.isArray(reels) || Array.from(reels).some(reel => typeof reel !== "number" || !Number.isSafeInteger(reel) || reel < 0 || reel >= reelsNumber))) {
                    throw new Error("Artifact line-local reel indexes are invalid.");
                }
            }
        } else if (win.metadata.symbolsPositions !== undefined) {
            const positions = win.metadata.symbolsPositions;
            assertPositions(positions as number[][]);
        }
    }
}
