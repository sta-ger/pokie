import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GamePackageGenerating} from "../generated/GamePackageGenerating.js";
import {GamePackageGenerator} from "../generated/GamePackageGenerator.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {
    assertArtifactBuildNotCancelled,
    ArtifactBuildCancelledError,
    captureArtifactDestinationState,
    cleanupIncompleteArtifactOutput,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import fs from "fs";
import path from "path";

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
    private pokiePackageRoot: string | undefined;
    private runtimePackageLinkTarget: string | undefined;

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

    /**
     * Overrides only the text of a generated local runtime link. Dedicated
     * evidence runners can make that artifact input stable without changing
     * the runtime root used by normal callers.
     */
    public withRuntimePackageLinkTarget(runtimePackageLinkTarget: string): this {
        this.runtimePackageLinkTarget = runtimePackageLinkTarget;
        return this;
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        let destinationState: ReturnType<typeof captureArtifactDestinationState> | undefined;
        try {
            assertArtifactBuildNotCancelled(options);
            assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
            assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
            destinationState = captureArtifactDestinationState(destinationPath, this.destinationKind);

            reportArtifactBuildProgress(options, {status: "running", message: "Loading and validating Blueprint"});
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

            reportArtifactBuildProgress(options, {status: "running", message: "Publishing TypeScript package"});
            assertArtifactBuildNotCancelled(options);
            const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), destinationPath, resolution.reelStripGeneration, {
                signal: options?.signal,
                onProgress: (progress) =>
                    reportArtifactBuildProgress(options, {
                        status: "running",
                        completed: BigInt(progress.completed),
                        total: BigInt(progress.total),
                        message: progress.message,
                    }),
            });
            if (this.pokiePackageRoot !== undefined) this.linkRuntime(result.projectRoot, this.pokiePackageRoot, this.runtimePackageLinkTarget);
            assertArtifactBuildNotCancelled(options);
            reportArtifactBuildProgress(options, {status: "completed"});
            return {outputPath: result.projectRoot};
        } catch (error) {
            // The generator normally stages atomically. This cleanup additionally protects injected/custom
            // generators that fail after allocating their output directory.
            if (destinationState !== undefined) await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            if (options?.signal?.aborted) {
                if (!(error instanceof ArtifactBuildCancelledError)) assertArtifactBuildNotCancelled(options);
            } else reportArtifactBuildProgress(options, {status: "failed", message: "TypeScript package publishing failed"});
            throw error;
        }
    }

    private linkRuntime(packageRoot: string, pokiePackageRoot: string, runtimePackageLinkTarget?: string): void {
        const nodeModules = path.join(packageRoot, "node_modules");
        fs.mkdirSync(nodeModules, {recursive: true});
        // The CLI/Studio entry point supplies the running POKIE root. This bounded link makes that
        // just-built package executable immediately, before a user has to run npm. It is ignored by
        // npm packing, and a later npm install resolves package.json's released runtime range instead.
        fs.symlinkSync(runtimePackageLinkTarget ?? path.resolve(pokiePackageRoot), path.join(nodeModules, "pokie"), "junction");
    }
}
