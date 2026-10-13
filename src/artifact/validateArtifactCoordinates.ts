import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";
import {projectVisiblePayline} from "../session/videoslot/coordinates/projectVisibleWinData.js";

/** Required canonical evidence, independent of debug capture policy. */
export function validateArtifactCoordinates<T extends string | number>(step: Pick<RoundStepArtifact<T>, "screen" | "wins" | "geometry" | "generatedScreen">): void {
    if (step.geometry === undefined) {
        if (step.generatedScreen !== undefined) throw new Error("Generated screen requires coordinate geometry.");
        return;
    }
    const projection = new ScreenProjection(step.geometry);
    if (!step.generatedScreen) throw new Error("Coordinate artifact requires its generated screen.");
    const expected = projection.project(step.generatedScreen, "visible");
    projection.assertMatrix(step.screen, "visible");
    if (JSON.stringify(expected) !== JSON.stringify(step.screen)) throw new Error("Artifact viewport differs from generated screen projection.");
    for (const win of step.wins) {
        for (const position of [...win.winningPositions, ...win.multiplierBreakdown.flatMap(item => item.positions)]) {
            if (projection.map(position, "evaluated", "generated") === null) throw new Error("Artifact win position is outside evaluation domain.");
        }
        if (win.type === "line") {
            const definition = win.metadata.definition;
            if (!Array.isArray(definition) || definition.length !== step.geometry.generated.reels ||
                !definition.every((row, reel) => typeof row === "number" && projection.map([reel, row], "evaluated", "generated") !== null)) {
                throw new Error("Artifact line definition is outside evaluation domain.");
            }
            // Force the same discrete-index validation used by public drawing projection.
            projectVisiblePayline(definition as number[], projection);
            for (const field of ["symbolsPositions", "wildSymbolsPositions"] as const) {
                const reels = win.metadata[field];
                if (!Array.isArray(reels) || reels.some(reel => typeof reel !== "number" || !Number.isSafeInteger(reel) || reel < 0 || reel >= step.geometry!.generated.reels)) {
                    throw new Error("Artifact line-local reel indexes are invalid.");
                }
            }
        } else if (win.metadata.symbolsPositions !== undefined) {
            const positions = win.metadata.symbolsPositions;
            if (!Array.isArray(positions) || positions.some(position => !Array.isArray(position) || projection.map(position as number[], "evaluated", "generated") === null)) {
                throw new Error("Artifact metadata positions are outside evaluation domain.");
            }
        }
    }
}
