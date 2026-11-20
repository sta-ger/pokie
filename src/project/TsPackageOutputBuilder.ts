import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GamePackageGenerating} from "../generated/GamePackageGenerating.js";
import {GamePackageGenerator} from "../generated/GamePackageGenerator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {BuildOutputBuilder} from "./BuildOutputBuilder.js";
import type {BuildOutputResult} from "./BuildOutputResult.js";
import {
    assertBuildNotCancelled,
    BuildCancelledError,
    captureOutputDestinationState,
    cleanupIncompleteArtifactOutput,
    reportBuildProgress,
    type BuildOutputOptions,
} from "./BuildOutputOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";

// Builds a "tsPackage" artifact from a resolved "blueprint" source -- the same validate/resolve-reel-strips/
// generate pipeline "pokie build" always ran (see cli/commands/BuildCommand.ts), now reachable through
// BuildOutputBuilderRegistry as a real BuildOutputBuilder rather than a command hand-rolling it directly.
// GamePackageGenerator's own publish step is already atomic (temp dir + rename) -- this builder's own
// assertArtifactDestinationAvailable precheck is what turns "destination already occupied" into
// BuildConflictError specifically, rather than the bare Error GamePackageGenerator throws itself.
export class TsPackageOutputBuilder implements BuildOutputBuilder {
    public readonly target = "tsPackage";
    public readonly destinationKind = "directory";

    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;
    private pokiePackageRoot: string | undefined;

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

    public withRuntimePackageRoot(pokiePackageRoot: string): this {
        this.pokiePackageRoot = pokiePackageRoot;
        return this;
    }

    public async build(source: PokieProject, destinationPath: string, options?: BuildOutputOptions): Promise<BuildOutputResult> {
        let destinationState: ReturnType<typeof captureOutputDestinationState> | undefined;
        try {
            assertBuildNotCancelled(options);
            assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
            assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
            destinationState = captureOutputDestinationState(destinationPath, this.destinationKind);

            reportBuildProgress(options, {status: "running", message: "Loading and validating Blueprint"});
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

            reportBuildProgress(options, {status: "running", message: "Publishing TypeScript package"});
            assertBuildNotCancelled(options);
            const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), destinationPath, resolution.reelStripGeneration, {
                runtimePackageRoot: this.pokiePackageRoot,
                signal: options?.signal,
                onProgress: (progress) =>
                    reportBuildProgress(options, {
                        status: "running",
                        phase: "Writing TypeScript package files",
                        unit: "files",
                        completed: BigInt(progress.completed),
                        total: BigInt(progress.total),
                        message: progress.message,
                    }),
            });
            assertBuildNotCancelled(options);
            reportBuildProgress(options, {status: "completed"});
            return {outputPath: result.projectRoot};
        } catch (error) {
            // The generator normally stages atomically. This cleanup additionally protects injected/custom
            // generators that fail after allocating their output directory.
            if (destinationState !== undefined) await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            if (options?.signal?.aborted) {
                if (!(error instanceof BuildCancelledError)) assertBuildNotCancelled(options);
            } else reportBuildProgress(options, {status: "failed", message: "TypeScript package publishing failed"});
            throw error;
        }
    }
}
