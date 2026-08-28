import {
    ArtifactBuilderRegistry,
    ArtifactBuildConflictError,
    type ArtifactBuildOptions,
    ArtifactTargetType,
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    computeGameBlueprintHash,
    describeArtifactConversionPlanDiagnostic,
    buildGameBuildInfo,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    loadGameBlueprint,
    ManagedOutcomeProjectService,
    ManagedOutcomeProjectServicing,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
    resolveReelStripGeneration,
} from "pokie";
import {Command} from "commander";
import path from "path";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

// The complete product matrix: every ArtifactTargetType is selectable because it has a builder and supported
// source workflow. WASM is a resolved inspection type, not an artifact target.
const TARGET_TYPES: readonly ArtifactTargetType[] = ADVERTISED_ARTIFACT_BUILD_TARGETS;

const USAGE = "Usage: pokie build <project> --target <artifact> [--exact | --sample <n> --seed <string>] [--out <path>] [--dry-run]";
const TARGET_HINT = `--target must be one of: ${TARGET_TYPES.join(", ")}.`;
const PROJECT_HINT =
    "<project> is a path pokie resolves to a blueprint/tsPackage/outcomeLibrary/stakeAdapter/wasm/parWorkbook " +
    "project (see docs/cli.md#pokie-build-project). Supported workflows: GameBlueprint -> tsPackage, " +
    "outcomeLibrary, stakeAdapter, or parWorkbook; tsPackage -> outcomeLibrary or stakeAdapter; outcomeLibrary -> " +
    "outcomeLibrary or stakeAdapter; stakeAdapter -> stakeAdapter; parWorkbook -> parWorkbook.";
// parWorkbook is the one target whose artifact is a single file rather than a directory (see
// assertArtifactDestinationAvailable's own "file"/"directory" split) -- its default destination needs a real
// file extension, every other target's default is just a bare directory name.
const PAR_WORKBOOK_DEFAULT_EXTENSION = ".xlsx";

type BuildOptions = {target?: ArtifactTargetType; out?: string; dryRun?: boolean; exact?: boolean; sample?: bigint; seed?: string};

function parsePositiveBigIntOption(value: string, flag: string): bigint {
    if (!(/^[0-9]+$/).test(value) || BigInt(value) <= BigInt(0)) {
        throw new Error(`${flag} must be a positive integer. ${USAGE}`);
    }
    return BigInt(value);
}

export class BuildCommand implements CliCommandHandling {
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly resolveProject: ProjectResolving;
    private readonly registry: ArtifactBuilderRegistry;

    constructor(
        pokieVersion: string,
        loadBlueprint?: (filePath: string) => unknown,
        validator?: GameBlueprintValidating,
        resolveProject?: ProjectResolving,
        registry?: ArtifactBuilderRegistry,
        managedOutcomeProjects?: ManagedOutcomeProjectServicing,
        pokiePackageRoot?: string,
    ) {
        const projectResolver = resolveProject ?? new ProjectTargetResolver();
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint ?? loadGameBlueprint;
        this.validator = validator ?? new GameBlueprintValidator();
        this.resolveProject = projectResolver;
        this.registry = registry ?? new ArtifactBuilderRegistry(pokieVersion, undefined, managedOutcomeProjects ?? new ManagedOutcomeProjectService(projectResolver));
        if (pokiePackageRoot !== undefined) this.registry.withRuntimePackageRoot(pokiePackageRoot);
    }

    public getName(): string {
        return "build";
    }

    public getDescription(): string {
        return (
            'Build an artifact from a resolved POKIE project ("pokie build <project> --target <artifact>") -- ' +
            "the supported source-to-target matrix includes GameBlueprint -> tsPackage/outcomeLibrary/stakeAdapter/parWorkbook, " +
            "tsPackage -> outcomeLibrary/stakeAdapter, outcomeLibrary -> outcomeLibrary/stakeAdapter, and same-type " +
            'republish for stakeAdapter/parWorkbook (for a first random game instead, see "pokie ' +
            'create --random"). --dry-run validates and previews without writing anything.'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const exitCodeRef = {value: 0};
        const command = this.buildCommand(exitCodeRef);

        return command
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    missingArgument: `${USAGE}\n${PROJECT_HINT}`,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                    optionMissingArgument: (flag) => {
                        if (flag === "--target") return `--target requires a value. ${TARGET_HINT}`;
                        if (flag === "--out") return `--out requires a path. ${USAGE}`;
                        if (flag === "--sample") return `--sample must be a positive integer. ${USAGE}`;
                        if (flag === "--seed") return `--seed requires a value. ${USAGE}`;
                        return `Unknown option "${flag}". ${USAGE}`;
                    },
                });
            });
    }

    // The exact Commander tree run() itself parses argv with -- see getCommanderCommand()'s own use for
    // --help coverage. A single default action (no subcommands): "build" no longer has a "random" verb --
    // first-class random generation lives on "pokie create --random" instead (see CreateCommand), which
    // writes a Blueprint Project this command can then build like any other.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        return createCommanderCliCommand("build")
            .description(this.getDescription())
            .argument("<project>", PROJECT_HINT)
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option(
                "--target <artifact>",
                TARGET_HINT,
                (value: string) => {
                    if (!TARGET_TYPES.includes(value as ArtifactTargetType)) {
                        throw new Error(`Unknown --target "${value}". ${TARGET_HINT}`);
                    }
                    return value as ArtifactTargetType;
                },
            )
            .option("--out <path>", "where to write the built artifact (default: a <target>-named sibling of <project>)")
            .option(
                "--exact",
                "explicitly request full Outcome Library enumeration; large managed Blueprint/package Outcome builds otherwise use deterministic bounded coverage (only valid with --target outcomeLibrary)",
            )
            .option("--sample <n>", "directly perform n deterministic Outcome Library draws (requires --seed; only valid with --target outcomeLibrary)", (value: string): bigint => parsePositiveBigIntOption(value, "--sample"))
            .option("--seed <string>", "deterministic seed for --sample")
            .option("--dry-run", "validate and preview without writing anything")
            .action(async (projectPath: string, excess: string[], options: BuildOptions) => {
                // An empty-string positional ("pokie build ''") is present as far as Commander's own
                // required-argument check is concerned, but is treated the same as an entirely missing one --
                // same convention the old <config.json>-only grammar used.
                if (!projectPath || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : `${USAGE}\n${PROJECT_HINT}`);
                }
                exitCodeRef.value = await this.execute(projectPath, options);
            });
    }

    private async execute(projectPath: string, options: BuildOptions): Promise<number> {
        // --target is checked before ever resolving `projectPath` -- a pure argv-shape problem (like a
        // missing positional or an unknown option), so reporting it never needs the filesystem I/O resolving
        // a project requires, the same "invalid argv is always side-effect-free" contract every other
        // CLI_CONTRACT_CASES "invalid" case already relies on. --out has no such shortcut: omitting it is
        // valid argv (see resolveDestination below), so it's never checked here at all.
        if (options.target === undefined) {
            throw new Error(`--target is required. ${TARGET_HINT}\n\n${USAGE}`);
        }
        const generation = this.outcomeLibraryGeneration(options);

        const project = await this.resolveProject.resolve(projectPath);
        if (project === undefined) {
            throw new Error(`"${projectPath}" was not recognized as a POKIE project.\n\n${PROJECT_HINT}`);
        }

        const out = options.out ?? this.resolveDestination(project.rootPath, options.target);
        const conversionPlan = this.registry.plan(project, options.target, {destinationPath: out});
        if (conversionPlan.status === "unavailable") {
            const compatibility = describeArtifactConversionPlanDiagnostic(conversionPlan);
            throw new Error(`${conversionPlan.diagnostic!.message} Next: ${conversionPlan.diagnostic!.recovery}${compatibility === undefined ? "" : `\n${compatibility}`}`);
        }
        if (conversionPlan.status === "conflict") {
            throw new Error(describeDestinationConflict(options.target, conversionPlan.diagnostic!.message));
        }

        if (options.dryRun) {
            const destinationCheck = this.registry.checkDestination(options.target, out, project.rootPath);
            if (!destinationCheck.available) throw new Error(describeDestinationConflict(options.target, destinationCheck.message));
            // Blueprint -> tsPackage retains its richer command-owned preview below, which validates the
            // injected Blueprint reader/validator and renders the complete generated-package summary.
            // Every other supported cell must validate its own registry source/artifact contract before
            // the generic dry-run branch can claim success.
            if (!(options.target === "tsPackage" && project.type === "blueprint")) {
                await this.registry.validate(options.target, project);
            }
        }

        if (options.target === "tsPackage" && project.type === "blueprint") {
            return this.buildTsPackageFromBlueprint(project, out, options.dryRun ?? false);
        }

        return this.buildArtifact(options.target, project, out, options.dryRun ?? false, generation);
    }

    // The default --out when it's omitted: a `target`-named sibling of the resolved project's own rootPath --
    // e.g. building "tsPackage" from "./blueprints/sample-slot.blueprint.json" defaults to
    // "./blueprints/tsPackage". Deterministic (same project + target always resolves to the same path) and
    // target-appropriate (the name itself says what got built there) without needing to load/inspect the
    // project's own contents (a blueprint's manifest.id, an outcome-library bundle's manifest, ...) just to
    // name a directory. Never collides with `rootPath` itself: a sibling name always differs from the resolved
    // project's own basename, so the existing conflict protections (assertArtifactDestinationAvailable) are
    // the only thing standing between this default and an existing, unrelated file/directory of the same name.
    private resolveDestination(rootPath: string, target: ArtifactTargetType): string {
        const siblingName = target === "parWorkbook" ? `${target}${PAR_WORKBOOK_DEFAULT_EXTENSION}` : target;
        return path.join(path.dirname(rootPath), siblingName);
    }

    // The rich, well-known "pokie build" path: a GameBlueprint source built into a runnable tsPackage. The
    // actual build always goes straight through ArtifactBuilderRegistry: TsPackageArtifactBuilder owns the
    // load -> validate -> materialize reels -> generate sequence, so the CLI must not run a second, subtly
    // different copy before calling the registry. Dry runs are intentionally read-only previews and therefore
    // retain their own validation/materialization probe without producing an artifact.
    private async buildTsPackageFromBlueprint(project: PokieProject, out: string, dryRun: boolean): Promise<number> {
        if (dryRun) {
            const blueprint = this.loadBlueprint(project.rootPath);
            const issues = this.validator.validate(blueprint);
            const errors = issues.filter((issue) => issue.severity === "error");
            const warnings = issues.filter((issue) => issue.severity !== "error");

            for (const issue of warnings) {
                console.log(`  warning  ${issue.code}: ${issue.message}`);
            }

            if (errors.length > 0) {
                console.error(`Blueprint "${project.rootPath}" has ${errors.length} error(s):`);
                for (const issue of errors) {
                    console.error(`  - ${issue.code}: ${issue.message}`);
                }
                console.error(`\n${PROJECT_HINT}`);
                return 1;
            }

            const resolution = resolveReelStripGeneration(blueprint as GameBlueprint);
            if (!resolution.success) {
                console.error(`Blueprint "${project.rootPath}" could not generate its reel strips:`);
                for (const reel of resolution.reels.filter((candidate) => !candidate.success)) {
                    console.error(`  - reel ${reel.reelIndex} (seed ${reel.seed}): failed after ${reel.attemptsUsed} attempt(s)`);
                    const lastDiagnostic = reel.diagnostics[reel.diagnostics.length - 1];
                    for (const violation of lastDiagnostic?.violations ?? []) {
                        console.error(`      ${violation.constraintId}: ${violation.message}`);
                    }
                }
                console.error(`\n${PROJECT_HINT}`);
                return 1;
            }

            this.printDryRunSummary(blueprint as GameBlueprint, project.rootPath, out);
            return 0;
        }

        let result: {readonly outputPath: string};
        try {
            result = await this.runWithArtifactLifecycle((lifecycle) => this.registry.build("tsPackage", project, out, lifecycle));
        } catch (error) {
            // Reel-strip constraints are an authored Blueprint condition, not an invocation failure.
            // The registry remains the only build path; this CLI boundary merely turns its structured
            // build diagnostic back into the conventional nonzero command result callers receive.
            if (isReelStripGenerationFailure(error)) {
                console.error(error.message);
                console.error(`\n${PROJECT_HINT}`);
                return 1;
            }
            if (error instanceof ArtifactBuildConflictError) {
                throw new Error(describeDestinationConflict("tsPackage", error.message));
            }
            throw error;
        }

        // Reading provenance for the CLI summary happens only after the registry has produced the package;
        // it is not part of the Project -> Artifact execution path above.
        const blueprint = this.loadBlueprint(project.rootPath) as GameBlueprint;
        const manifest = (blueprint as GameBlueprint).manifest;
        const blueprintHash = computeGameBlueprintHash(blueprint);

        console.log("Build summary:");
        console.log(`  package root     ${result.outputPath}`);
        console.log(`  game             ${manifest.name} (id: "${manifest.id}", v${manifest.version})`);
        console.log(`  blueprint hash   ${blueprintHash}`);
        console.log(`  source           ${project.rootPath}`);

        console.log(`\nGame package "${manifest.name}" (id: "${manifest.id}") built in "${result.outputPath}".`);
        console.log(`\nNext:`);
        console.log(`  cd ${result.outputPath} && npm install`);
        console.log(`  pokie inspect ${result.outputPath}`);
        console.log(`  pokie validate ${result.outputPath}`);
        console.log(`  pokie sim ${result.outputPath} --rounds 10000 --seed demo --out sim.json`);
        console.log(`  pokie report sim.json`);
        console.log(`  pokie replay ${result.outputPath} --seed demo --round 1`);
        console.log(`  pokie dev ${result.outputPath}`);

        return 0;
    }

    // Every remaining target is dispatched to the shared registry. A Blueprint -> Outcome request is the one
    // managed lifecycle exception: the requested destination is generated, verified, registered and reopened as
    // the canonical Outcome Project before this method reports it; Blueprint -> Stake then reuses that record.
    private async buildArtifact(
        target: ArtifactTargetType,
        project: PokieProject,
        out: string,
        dryRun: boolean,
        generation: ArtifactBuildOptions["outcomeLibraryGeneration"],
    ): Promise<number> {
        if (dryRun) {
            console.log(`Dry run -- would build "${target}" from "${project.rootPath}" (${project.provenance}) to "${out}". No files written.`);
            return 0;
        }

        let result;
        try {
            result = await this.runWithArtifactLifecycle((lifecycle) => this.registry.build(target, project, out, {...lifecycle, ...(generation !== undefined ? {outcomeLibraryGeneration: generation} : {})}));
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                throw new Error(describeDestinationConflict(target, error.message));
            }
            throw error;
        }

        console.log("Build summary:");
        console.log(`  artifact root    ${result.outputPath}`);
        console.log(`  target           ${target}`);
        console.log(`  source           ${project.rootPath}`);

        if (result.reusedCompatibleProject) {
            console.log(`  requested root   ${result.requestedDestinationPath}`);
            console.log("  outcome project  reused compatible registered project");
        }

        console.log(
            result.reusedCompatibleProject
                ? `\nArtifact "${target}" reused compatible Outcome Project "${result.outputPath}" instead of writing "${result.requestedDestinationPath}".`
                : `\nArtifact "${target}" built in "${result.outputPath}".`,
        );

        return 0;
    }

    // This is intentionally checked before resolving/loading a project: malformed sampled invocations are
    // argv errors, and a valid direct sample is threaded into the one registry-owned generation lifecycle.
    private outcomeLibraryGeneration(options: BuildOptions): ArtifactBuildOptions["outcomeLibraryGeneration"] {
        const hasGenerationOption = options.exact || options.sample !== undefined || options.seed !== undefined;
        if (!hasGenerationOption) return undefined;
        if (options.target !== "outcomeLibrary") {
            throw new Error(`--exact, --sample, and --seed are only valid with --target outcomeLibrary. ${USAGE}`);
        }
        if (options.exact && (options.sample !== undefined || options.seed !== undefined)) {
            throw new Error(`--exact cannot be combined with --sample or --seed. ${USAGE}`);
        }
        if (options.exact) return {exact: true};
        if (options.sample === undefined) {
            if (options.seed !== undefined) throw new Error(`--seed requires --sample <n>. ${USAGE}`);
            return undefined;
        }
        if (options.seed === undefined) throw new Error(`--sample requires --seed. ${USAGE}`);
        return {sampled: {sampleSize: options.sample, seed: options.seed}};
    }

    // The CLI's interactive cancellation surface is Ctrl+C.  It feeds the same AbortSignal as Studio
    // into the registry, so large Outcome/Stake publishes stop at their next cooperative progress boundary
    // instead of merely terminating the process after a final directory swap.  Progress is intentionally
    // throttled by message: outcome streaming may report every record, while the terminal only needs a
    // truthful phase/count update.
    private async runWithArtifactLifecycle<T>(run: (options: ArtifactBuildOptions) => Promise<T>): Promise<T> {
        const controller = new AbortController();
        let lastMessage: string | undefined;
        const cancel = (): void => {
            if (!controller.signal.aborted) {
                console.log("Cancelling artifact build…");
                controller.abort();
            }
        };
        process.once("SIGINT", cancel);
        try {
            return await run({
                signal: controller.signal,
                onProgress: (progress) => {
                    if (progress.status === "preflight") {
                        const count = progress.preflight?.estimatedItemCount;
                        const bytes = progress.preflight?.estimatedBytes;
                        console.log(
                            `Build preflight: ${count !== undefined ? `${count} estimated item(s)` : "item count unavailable"}` +
                                `${bytes !== undefined ? `, ${bytes} estimated bytes` : ""}` +
                                `${progress.preflight?.complexityWarning ? `. Warning: ${progress.preflight.complexityWarning}` : ""}`,
                        );
                    }
                    if (progress.message !== undefined && progress.message !== lastMessage) {
                        lastMessage = progress.message;
                        console.log(
                            `Build ${progress.status}: ${progress.message}` +
                                `${progress.completed !== undefined ? ` (${progress.completed}${progress.total !== undefined ? `/${progress.total}` : ""})` : ""}`,
                        );
                    }
                    if (progress.status === "cancelled") console.log("Artifact build cancelled.");
                },
            });
        } finally {
            process.off("SIGINT", cancel);
        }
    }

    // Previews what "pokie build" would generate without touching the filesystem: same validation, same
    // blueprintHash computation (buildGameBuildInfo is a pure function -- no file I/O), just no
    // ArtifactBuilderRegistry.build() call. `destination` is still the exact --out (explicit or resolved
    // default) a real build would use -- printed here so a dry run previews the same resolved destination a
    // real build would write to, even though nothing is created at it.
    private printDryRunSummary(blueprint: GameBlueprint, sourcePath: string, destination: string): void {
        const buildInfo = buildGameBuildInfo(blueprint, this.pokieVersion, sourcePath);
        const paylines = blueprint.paylines ? String(blueprint.paylines.length) : "default (one horizontal line per row)";
        const bets = blueprint.availableBets ? blueprint.availableBets.join(", ") : "default";

        console.log("Dry run — blueprint is valid, no files written.\n");
        console.log("Blueprint summary:");
        console.log(`  game             ${blueprint.manifest.name} (id: "${blueprint.manifest.id}", v${blueprint.manifest.version})`);
        console.log(`  reels x rows     ${blueprint.reels} x ${blueprint.rows}`);
        console.log(`  symbols          ${blueprint.symbols.length}`);
        console.log(`  paylines         ${paylines}`);
        console.log(`  bets             ${bets}`);
        console.log(`  blueprint hash   ${buildInfo.blueprintHash}`);
        console.log(`  would generate   ${buildInfo.files!.join(", ")}`);
        console.log(`  destination      ${destination}`);
    }
}

function isReelStripGenerationFailure(error: unknown): error is Error {
    return error instanceof Error && error.message.includes("could not generate its reel strips:");
}

function describeDestinationConflict(target: ArtifactTargetType, detail: string): string {
    return `Cannot build target "${target}" because its destination is unavailable. ${detail} Next: choose a different --out path or remove the existing destination, then retry.`;
}
