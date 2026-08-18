import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GamePackageGenerating} from "../generated/GamePackageGenerating.js";
import {GamePackageGenerator} from "../generated/GamePackageGenerator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";

// Builds a "tsPackage" artifact from a resolved "blueprint" source -- the same validate/resolve-reel-strips/
// generate pipeline "pokie build" always ran (see cli/commands/BuildCommand.ts), now reachable through
// ArtifactBuilderRegistry as a real ArtifactBuilder rather than a command hand-rolling it directly.
// GamePackageGenerator's own publish step is already atomic (temp dir + rename) -- this builder's own
// assertArtifactDestinationAvailable precheck is what turns "destination already occupied" into
// ArtifactBuildConflictError specifically, rather than the bare Error GamePackageGenerator throws itself.
export class TsPackageArtifactBuilder implements ArtifactBuilder {
    public readonly target = "tsPackage";
    public readonly destinationKind = "directory";

    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
    ) {
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.generator = generator;
    }

    // Deliberately not `async`: every step here is synchronous, and require-await (rightly) rejects an `async`
    // method with no `await` in its body -- but build() must still never throw synchronously (see ArtifactBuilder's
    // own doc comment), so every failure path returns a rejected Promise explicitly instead.
    public build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        try {
            assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
            assertArtifactDestinationIsSafe(source.rootPath, destinationPath);

            const blueprint = this.loadBlueprint(source.rootPath);
            const errors = this.validator.validate(blueprint).filter((issue) => issue.severity === "error");
            if (errors.length > 0) {
                throw new Error(
                    `Blueprint "${source.rootPath}" has ${errors.length} error(s): ${errors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            const resolution = resolveReelStripGeneration(blueprint as GameBlueprint);
            if (!resolution.success) {
                const failures = resolution.reels
                    .filter((reel) => !reel.success)
                    .map((reel) => {
                        const violations = reel.diagnostics[reel.diagnostics.length - 1]?.violations ?? [];
                        const details = violations.map((violation) => `${violation.constraintId}: ${violation.message}`).join("; ");
                        return `reel ${reel.reelIndex} (seed ${reel.seed}) failed after ${reel.attemptsUsed} attempt(s)${details ? `: ${details}` : ""}`;
                    });
                throw new Error(`Blueprint "${source.rootPath}" could not generate its reel strips: ${failures.join("; ")}`);
            }

            const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), destinationPath, resolution.reelStripGeneration);
            return Promise.resolve({outputPath: result.projectRoot});
        } catch (error) {
            return Promise.reject(error);
        }
    }
}
