import type {ExternalArtifactGenerationResult} from "../ExternalArtifactGenerationResult.js";
import type {ExternalArtifactGenerator} from "../ExternalArtifactGenerator.js";
import type {ExternalDeploymentProjectedModeInput} from "../ExternalDeploymentProjectedModeInput.js";
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

// The example local target's own ExternalArtifactGenerator: for every mode, writes each outcome's *already
// projected* content (see ExternalDeploymentProjectedOutcome — ExternalDeploymentService projected it through
// this target's own roundProjector before generate() was ever called; this class never sees a RoundArtifact,
// an ExternalRoundProjector, or the source WeightedOutcomeLibrary, and has no way to reach for either) as its
// own pretty-printed JSON file, plus one top-level "index.json" listing every mode's own libraryId/libraryHash/
// outcome count.
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
export class LocalJsonExternalArtifactGenerator implements ExternalArtifactGenerator {
    public generate(modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult {
        const artifacts: ExternalGeneratedArtifact[] = [];
        const indexEntries: ModeIndexEntry[] = [];

        modes.forEach((mode) => {
            const modeDirectory = encodeLocalExternalDeploymentPathSegment(mode.modeName);
            const outcomeEntries: ModeOutcomeIndexEntry[] = [];

            mode.outcomes.forEach((outcome) => {
                const outcomeFile = `${encodeLocalExternalDeploymentPathSegment(outcome.id)}.json`;
                artifacts.push({
                    relativePath: `${modeDirectory}/${outcomeFile}`,
                    content: `${JSON.stringify(outcome.projected, null, 4)}\n`,
                });
                outcomeEntries.push({id: outcome.id, file: outcomeFile});
            });

            indexEntries.push({
                modeName: mode.modeName,
                directory: `${modeDirectory}/`,
                libraryId: mode.libraryId,
                libraryHash: mode.libraryHash,
                outcomeCount: mode.outcomes.length,
                outcomes: outcomeEntries,
            });
        });

        artifacts.push({
            relativePath: "index.json",
            content: `${JSON.stringify({modes: indexEntries}, null, 4)}\n`,
        });

        return {artifacts, issues: []};
    }
}
