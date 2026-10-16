import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";
import {projectVisiblePayline} from "../session/videoslot/coordinates/projectVisibleWinData.js";

/** Required canonical evidence, independent of debug capture policy. */
export function validateArtifactCoordinates<T extends string | number>(step: Pick<RoundStepArtifact<T>, "screen" | "wins" | "geometry" | "generatedScreen">): void {
    if (step.geometry === undefined) {
        if (step.generatedScreen !== undefined) throw new Error("Generated screen requires coordinate geometry.");
    }
    const geometry = step.geometry ?? {
        generated: {reels: step.screen.length, rows: step.screen[0]?.length},
        visible: {rowOffset: 0, rows: step.screen[0]?.length},
        evaluated: {rowOffset: 0, rows: step.screen[0]?.length}, paylineSpace: "evaluated" as const,
    };
    const projection = new ScreenProjection(geometry);
    if (step.geometry && !step.generatedScreen) throw new Error("Coordinate artifact requires its generated screen.");
    const expected = projection.project(step.generatedScreen ?? step.screen, "visible");
    projection.assertMatrix(step.screen, "visible");
    if (JSON.stringify(expected) !== JSON.stringify(step.screen)) throw new Error("Artifact viewport differs from generated screen projection.");
    const assertPositions = (positions: readonly (readonly number[])[]): void => {
        if (!Array.isArray(positions) || Array.from(positions).some(position => !Array.isArray(position) || projection.map(position, "evaluated", "generated") === null)) {
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
                if (!Array.isArray(definition) || definition.length !== geometry.generated.reels ||
                    !Array.from(definition).every((row, reel) => typeof row === "number" && projection.map([reel, row], "evaluated", "generated") !== null)) {
                    throw new Error("Artifact line definition is outside evaluation domain.");
                }
                // Force the same discrete-index validation used by public drawing projection.
                projectVisiblePayline(definition as number[], projection);
            }
            for (const field of ["symbolsPositions", "wildSymbolsPositions"] as const) {
                const reels = win.metadata[field];
                if (reels !== undefined && (!Array.isArray(reels) || Array.from(reels).some(reel => typeof reel !== "number" || !Number.isSafeInteger(reel) || reel < 0 || reel >= geometry.generated.reels))) {
                    throw new Error("Artifact line-local reel indexes are invalid.");
                }
            }
        } else if (win.metadata.symbolsPositions !== undefined) {
            const positions = win.metadata.symbolsPositions;
            assertPositions(positions as number[][]);
        }
    }
}
