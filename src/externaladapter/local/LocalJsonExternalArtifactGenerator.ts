import {InvalidJsonValueError} from "../../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {computeWeightedOutcomeLibraryHash} from "../../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {ExternalArtifactGenerationContext} from "../ExternalArtifactGenerationContext.js";
import type {ExternalArtifactGenerationResult} from "../ExternalArtifactGenerationResult.js";
import type {ExternalArtifactGenerator} from "../ExternalArtifactGenerator.js";
import type {ExternalDeploymentModeInput} from "../ExternalDeploymentModeInput.js";
import type {ExternalGeneratedArtifact} from "../ExternalGeneratedArtifact.js";
import {encodeLocalExternalDeploymentPathSegment} from "./internal/encodeLocalExternalDeploymentPathSegment.js";

type ModeOutcomeIndexEntry = {
    readonly id: string; // the outcome's own original, raw id — never itself used as a path segment
    readonly file: string; // the safe, deterministically encoded file name (relative to "directory" below)
};

type ModeIndexEntry = {
    readonly modeName: string; // the mode's own original, raw name — never itself used as a path segment
    readonly directory: string; // the safe, deterministically encoded directory name derived from modeName
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomeCount: number;
    readonly outcomes: readonly ModeOutcomeIndexEntry[];
};

// The example local target's own ExternalArtifactGenerator: for every mode, projects each outcome's
// RoundArtifact through `context.roundProjector` — always the caller's own, never a projector this class holds
// itself (see ExternalArtifactGenerationContext's own doc comment) — and writes it as its own pretty-printed
// JSON file, plus one top-level "index.json" listing every mode's own libraryId/libraryHash/outcome count.
//
// Neither a mode's own "modeName" nor an outcome's own "id" is ever used directly as a path segment: both are
// caller-supplied strings this SDK has no reason to trust as path-safe (a modeName of ".." or an outcome id
// containing "/" would otherwise let caller-controlled data steer where a file lands on disk). Every directory/
// file name here is instead `encodeLocalExternalDeploymentPathSegment(...)` — a deterministic, always-path-safe
// sha256-hex encoding — with the original raw modeName/outcome id preserved in "index.json" so nothing is lost,
// just no longer trusted as a literal path fragment.
//
// Entirely in-memory (see ExternalArtifactGenerator's own doc comment on why generation itself never touches
// disk) — LocalFileExternalDeploymentRuntimeAdapter is what actually persists the result.
export class LocalJsonExternalArtifactGenerator<T extends string | number = string> implements ExternalArtifactGenerator<T> {
    public generate(modes: readonly ExternalDeploymentModeInput<T>[], context: ExternalArtifactGenerationContext<T>): ExternalArtifactGenerationResult {
        const issues: ValidationIssue[] = [];
        const artifacts: ExternalGeneratedArtifact[] = [];
        const indexEntries: ModeIndexEntry[] = [];

        modes.forEach((mode) => {
            const modeDirectory = encodeLocalExternalDeploymentPathSegment(mode.modeName);
            const outcomeEntries: ModeOutcomeIndexEntry[] = [];

            mode.library.outcomes.forEach((outcome) => {
                let projected;
                try {
                    projected = context.roundProjector.project(outcome.artifact);
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

                const outcomeFile = `${encodeLocalExternalDeploymentPathSegment(outcome.id)}.json`;
                artifacts.push({
                    relativePath: `${modeDirectory}/${outcomeFile}`,
                    content: `${JSON.stringify(json, null, 4)}\n`,
                });
                outcomeEntries.push({id: outcome.id, file: outcomeFile});
            });

            indexEntries.push({
                modeName: mode.modeName,
                directory: `${modeDirectory}/`,
                libraryId: mode.library.libraryId,
                libraryHash: computeWeightedOutcomeLibraryHash(mode.library),
                outcomeCount: mode.library.outcomes.length,
                outcomes: outcomeEntries,
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
