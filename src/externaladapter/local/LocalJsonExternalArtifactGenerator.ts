import {InvalidJsonValueError} from "../../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {computeWeightedOutcomeLibraryHash} from "../../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {ExternalArtifactGenerationResult} from "../ExternalArtifactGenerationResult.js";
import type {ExternalArtifactGenerator} from "../ExternalArtifactGenerator.js";
import type {ExternalDeploymentModeInput} from "../ExternalDeploymentModeInput.js";
import type {ExternalGeneratedArtifact} from "../ExternalGeneratedArtifact.js";
import type {ExternalRoundProjector} from "../ExternalRoundProjector.js";
import {LocalJsonExternalRoundProjector} from "./LocalJsonExternalRoundProjector.js";

type ModeIndexEntry = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomeCount: number;
    readonly outcomes: string; // relative directory holding this mode's own "<outcomeId>.json" files
};

// The example local target's own ExternalArtifactGenerator: for every mode, projects each outcome's
// RoundArtifact through the injected ExternalRoundProjector (never recomputed independently — see that
// interface's own doc comment) and writes it as its own pretty-printed JSON file at
// "<modeName>/<outcomeId>.json", plus one top-level "index.json" listing every mode's own libraryId/libraryHash/
// outcome count. Entirely in-memory (see ExternalArtifactGenerator's own doc comment on why generation itself
// never touches disk) — LocalFileExternalDeploymentRuntimeAdapter is what actually persists the result.
export class LocalJsonExternalArtifactGenerator<T extends string | number = string> implements ExternalArtifactGenerator<T> {
    private readonly roundProjector: ExternalRoundProjector<T>;

    constructor(roundProjector: ExternalRoundProjector<T> = new LocalJsonExternalRoundProjector<T>()) {
        this.roundProjector = roundProjector;
    }

    public generate(modes: readonly ExternalDeploymentModeInput<T>[]): ExternalArtifactGenerationResult {
        const issues: ValidationIssue[] = [];
        const artifacts: ExternalGeneratedArtifact[] = [];
        const indexEntries: ModeIndexEntry[] = [];

        modes.forEach((mode) => {
            mode.library.outcomes.forEach((outcome) => {
                let projected;
                try {
                    projected = this.roundProjector.project(outcome.artifact);
                } catch (error) {
                    issues.push({
                        code: "local-json-target-projection-failed",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": round projector failed: ${error instanceof Error ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, outcomeId: outcome.id},
                    });
                    return;
                }

                let json: unknown;
                try {
                    json = toCanonicalJson(projected);
                } catch (error) {
                    issues.push({
                        code: "local-json-target-projection-not-json-safe",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": projected output is not JSON-safe: ${error instanceof InvalidJsonValueError ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, outcomeId: outcome.id},
                    });
                    return;
                }

                artifacts.push({
                    relativePath: `${mode.modeName}/${outcome.id}.json`,
                    content: `${JSON.stringify(json, null, 4)}\n`,
                });
            });

            indexEntries.push({
                modeName: mode.modeName,
                libraryId: mode.library.libraryId,
                libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
                outcomeCount: mode.library.outcomes.length,
                outcomes: `${mode.modeName}/`,
            });
        });

        if (issues.some((issue) => issue.severity === "error")) {
            return {artifacts: [], issues};
        }

        artifacts.push({
            relativePath: "index.json",
            content: `${JSON.stringify({modes: indexEntries}, null, 4)}\n`,
        });

        return {artifacts, issues};
    }
}
