import {Command} from "commander";
import fs from "fs";
import {
    GameBlueprint,
    loadGameBlueprint,
    materializeReelStrips,
    ReelStripGenerationSpec,
    ReelStripGenerationSummary,
    resolveReelStripGeneration,
    writeFileAtomically,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {parseCanonicalNonNegativeInteger} from "./internal/parseCanonicalNonNegativeInteger.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE =
    "Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply | --materialize] [--out <file>] [--format json]";

type ReelGenerateFormat = "summary" | "json";

type ReelGenerateOptions = {
    reel?: number;
    seed?: number;
    apply: boolean;
    materialize: boolean;
    out?: string;
    format: ReelGenerateFormat;
};

// Exposes the same ReelStripGenerator/resolveReelStripGeneration machinery "pokie build" already runs
// silently over a Blueprint's reelStripGeneration (see docs/reel-strip-generation.md/docs/cli.md's own
// "reelStripGeneration" section) as its own inspectable command -- no separate constraint/preset
// vocabulary: whatever counts/weights/locks/stacks/adjacency/sequences/circular-spacing/seed a reel's
// own reelStripGeneration[i] entry already declares (by hand, via POKIE Studio's Blueprint editor, or
// via "pokie create --random"'s own per-reel generation) is exactly what this command runs, previews,
// and (only with --apply) pins back in. Never touches a built package -- reads and writes only the
// given Blueprint Project file.
export class ReelCommand implements CliCommandHandling {
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly writeFile: (filePath: string, contents: string) => Promise<void>;
    private readonly resolveGeneration: typeof resolveReelStripGeneration;

    constructor(
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        // Atomic by default (see writeFileAtomically's own doc): the applied Blueprint is written to a
        // temp file beside the destination and only renamed into place once fully written, so a failed
        // or interrupted write can never leave the destination truncated or partially replaced.
        writeFile: (filePath: string, contents: string) => Promise<void> = (filePath, contents) =>
            writeFileAtomically(filePath, (tempPath) => fs.promises.writeFile(tempPath, contents, "utf-8")),
        resolveGeneration: typeof resolveReelStripGeneration = resolveReelStripGeneration,
    ) {
        this.loadBlueprint = loadBlueprint;
        this.writeFile = writeFile;
        this.resolveGeneration = resolveGeneration;
    }

    public getName(): string {
        return "reel";
    }

    public getDescription(): string {
        return (
            'Generate one or every "generated" reel a Blueprint Project\'s reelStripGeneration declares, via the ' +
            "same ReelStripGenerator/constraints/presets \"pokie build\" already runs -- a deterministic preview/diff " +
            "by default, only pinning the result back in as a literal strip with --apply, or fully collapsing the " +
            'whole blueprint into a plain top-level "reelStrips" (no "reelStripGeneration" left) with optional --materialize ' +
            'persistence for tools that only understand literal reels. PAR workbook export snapshots supported generated, weighted, ' +
            'default, and literal reel sources without materializing the authored Blueprint ' +
            '("pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply | --materialize] ' +
            '[--out <file>] [--format json]").'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rejected explicitly up front
        // (same reasoning as ParCommand's own args.length === 0 check) rather than relying on
        // Commander's own incidental "commander.help" throw for this.
        if (args.length === 0) {
            return Promise.reject(new Error(USAGE));
        }

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    missingArgument: USAGE,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                    optionMissingArgument: (flag) => {
                        if (flag === "--reel") return `--reel must be a non-negative integer. ${USAGE}`;
                        if (flag === "--seed") return `--seed requires an integer value. ${USAGE}`;
                        if (flag === "--out") return `--out requires a file path. ${USAGE}`;
                        if (flag === "--format") return `--format only supports "json". ${USAGE}`;
                        return `Unknown option "${flag}". ${USAGE}`;
                    },
                    unknownCommand: USAGE,
                    noCommand: USAGE,
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by the "generate" verb's own action; run()
    // supplies its own real box and reads it back once parsing resolves, while getCommanderCommand()
    // never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("reel").description(this.getDescription());

        parent
            .command("generate")
            .description('Generate one or every "generated" reel a Blueprint Project\'s reelStripGeneration declares.')
            .argument("<blueprint.json>", "an existing Blueprint Project file with a reelStripGeneration entry")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--reel <index>", 'target a single reel index (default: every "generated" reel)', (value: string): number => {
                const parsed = parseCanonicalNonNegativeInteger(value);
                if (parsed === undefined) {
                    throw new Error(`--reel must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--seed <integer>", "override every targeted reel's own seed for this run", (value: string): number => {
                if (!Number.isInteger(Number(value))) {
                    throw new Error(`--seed requires an integer value. ${USAGE}`);
                }
                return Number(value);
            })
            .option("--apply", "pin the generated strip(s) into reelStripGeneration as literal (default: preview only)")
            .option(
                "--materialize",
                'resolve the whole blueprint and collapse it to a plain top-level "reelStrips" array, dropping ' +
                    '"reelStripGeneration" entirely (incompatible with --reel/--apply)',
            )
            .option("--out <file>", "write the applied blueprint to a different path (default: overwrite <blueprint.json>)")
            .option(
                "--format <value>",
                'only "json" is supported (default: a human-readable summary)',
                (value: string): ReelGenerateFormat => {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${USAGE}`);
                    }
                    return "json";
                },
                "summary" as ReelGenerateFormat,
            )
            .action(
                async (
                    blueprintPath: string,
                    excess: string[],
                    options: {reel?: number; seed?: number; apply?: boolean; materialize?: boolean; out?: string; format: ReelGenerateFormat},
                ) => {
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                    }
                    exitCodeRef.value = await this.executeGenerate(blueprintPath, {
                        reel: options.reel,
                        seed: options.seed,
                        apply: options.apply ?? false,
                        materialize: options.materialize ?? false,
                        out: options.out,
                        format: options.format,
                    });
                },
            );

        return parent;
    }

    private async executeGenerate(blueprintPath: string, options: ReelGenerateOptions): Promise<number> {
        if (options.materialize) {
            if (options.reel !== undefined || options.seed !== undefined || options.apply) {
                throw new Error(
                    "--materialize cannot be combined with --reel/--seed/--apply -- it always resolves the whole blueprint " +
                        `using each reel's own declared seed. ${USAGE}`,
                );
            }
            return this.executeMaterialize(blueprintPath, options.out, options.format);
        }

        const blueprint = this.loadBlueprint(blueprintPath) as GameBlueprint;
        const specs = blueprint.reelStripGeneration;
        if (!Array.isArray(specs) || specs.length === 0) {
            throw new Error(
                `"${blueprintPath}" has no "reelStripGeneration" entries to generate from -- author generated reels via ` +
                    "POKIE Studio's Blueprint editor or by hand (see docs/reel-strip-generation.md), then re-run \"pokie reel generate\".",
            );
        }

        const targetIndices = this.resolveTargetIndices(blueprintPath, specs, options.reel);
        const outcomes = targetIndices.map((reelIndex) => this.generateReel(blueprint, specs, reelIndex, options.seed));
        const failed = outcomes.some((outcome) => !outcome.success);

        let applied = false;
        let outPath: string | undefined;
        if (!failed && options.apply) {
            const updatedSpecs = specs.slice();
            for (const outcome of outcomes) {
                if (outcome.success && outcome.strip) {
                    updatedSpecs[outcome.reelIndex] = {type: "literal", strip: outcome.strip};
                }
            }
            outPath = options.out ?? blueprintPath;
            await this.writeFile(outPath, `${JSON.stringify({...blueprint, reelStripGeneration: updatedSpecs}, null, 4)}\n`);
            applied = true;
        }

        if (options.format === "json") {
            console.log(JSON.stringify({blueprintPath, applied, ...(applied ? {out: outPath} : {}), reels: outcomes}, null, 4));
        } else {
            this.printSummary(blueprintPath, blueprint, outcomes, applied, outPath);
        }

        return failed ? 1 : 0;
    }

    // Resolves every "generated" entry using its own declared seed (never --reel/--seed-scoped, unlike
    // --apply) and collapses the result into a plain top-level "reelStrips" array with "reelStripGeneration"
    // removed entirely -- the same materialization "pokie build"/GamePackageGenerator perform internally
    // when compiling a runtime module, exposed here as its own persisted output. This is the only
    // supported way to turn a --random/--blank-created (or reel-generate --apply'd) blueprint into one
    // "pokie par export" -- which only ever understands literal reelStrips, see ParSheetExporter's own
    // "parsheet-unsupported-reel-source" -- can actually export.
    private async executeMaterialize(blueprintPath: string, out: string | undefined, format: ReelGenerateFormat): Promise<number> {
        const blueprint = this.loadBlueprint(blueprintPath) as GameBlueprint;
        const resolution = this.resolveGeneration(blueprint);

        if (!resolution.success) {
            if (format === "json") {
                console.log(JSON.stringify({blueprintPath, materialized: false, reels: resolution.reels}, null, 4));
            } else {
                console.log(`Reel strip generation for "${blueprintPath}"`);
                for (const outcome of resolution.reels) {
                    console.log(`  reel ${outcome.reelIndex}  FAILED after ${outcome.attemptsUsed} attempt(s) (seed ${outcome.seed})`);
                    for (const violation of outcome.diagnostics[outcome.diagnostics.length - 1]?.violations ?? []) {
                        console.log(`    - ${violation.constraintId}: ${violation.message}`);
                    }
                }
                console.log("\nNo changes written -- fix the failing reel(s) above and re-run.");
            }
            return 1;
        }

        const materialized = materializeReelStrips(blueprint, resolution.reelStripGeneration);
        const outPath = out ?? blueprintPath;
        await this.writeFile(outPath, `${JSON.stringify(materialized, null, 4)}\n`);
        const reelCount = materialized.reelStrips?.length ?? 0;

        if (format === "json") {
            console.log(JSON.stringify({blueprintPath, materialized: true, out: outPath, reelCount}, null, 4));
        } else {
            console.log(`Reel strip generation for "${blueprintPath}"`);
            console.log(`Materialized ${reelCount} reel(s) into "${outPath}" -- "reelStripGeneration" removed, "reelStrips" is now literal.`);
        }
        return 0;
    }

    private resolveTargetIndices(blueprintPath: string, specs: ReelStripGenerationSpec[], reel: number | undefined): number[] {
        if (reel !== undefined) {
            if (reel >= specs.length) {
                throw new Error(
                    `--reel ${reel} is out of range -- "${blueprintPath}" has ${specs.length} reelStripGeneration ` +
                        `entr${specs.length === 1 ? "y" : "ies"} (0-${specs.length - 1}).`,
                );
            }
            if (specs[reel].type !== "generated") {
                throw new Error(`Reel ${reel} in "${blueprintPath}" is a literal strip, not "generated" -- there is nothing to generate for it.`);
            }
            return [reel];
        }

        const targetIndices = specs.flatMap((spec, index) => (spec.type === "generated" ? [index] : []));
        if (targetIndices.length === 0) {
            throw new Error(`"${blueprintPath}" has no "generated" reelStripGeneration entries -- every reel is already literal.`);
        }
        return targetIndices;
    }

    // Runs one reel's own "generated" entry through the existing resolveReelStripGeneration in
    // isolation -- a single-entry reelStripGeneration array containing just that reel's own (possibly
    // seed-overridden) spec -- exactly the technique StudioBlueprintService.previewReelStripGeneration
    // already uses for its own per-reel preview, so a pathological config for ONE targeted reel can
    // never affect any other targeted reel's own result.
    private generateReel(blueprint: GameBlueprint, specs: ReelStripGenerationSpec[], reelIndex: number, seedOverride: number | undefined): ReelStripGenerationSummary {
        const spec = specs[reelIndex] as Extract<ReelStripGenerationSpec, {type: "generated"}>;
        const effectiveSpec = seedOverride === undefined ? spec : {...spec, seed: seedOverride};
        const resolution = this.resolveGeneration({...blueprint, reelStripGeneration: [effectiveSpec]});
        const summary = (resolution.success ? resolution.reelStripGeneration?.reels : resolution.reels)?.[0];
        if (summary === undefined) {
            throw new Error(`Could not resolve reelStripGeneration[${reelIndex}] -- resolveReelStripGeneration returned no summary for it.`);
        }
        return {...summary, reelIndex};
    }

    private printSummary(
        blueprintPath: string,
        blueprint: GameBlueprint,
        outcomes: ReelStripGenerationSummary[],
        applied: boolean,
        outPath: string | undefined,
    ): void {
        console.log(`Reel strip generation for "${blueprintPath}"`);
        for (const outcome of outcomes) {
            if (outcome.success && outcome.strip) {
                console.log(`  reel ${outcome.reelIndex}  seed ${outcome.seed}  attempts ${outcome.attemptsUsed}  length ${outcome.strip.length}`);
                console.log(`    ${outcome.strip.join(" ")}`);
                const previous = blueprint.reelStrips?.[outcome.reelIndex];
                if (previous) {
                    const changed = countChangedPositions(previous, outcome.strip);
                    console.log(`    ${changed}/${outcome.strip.length} position(s) differ from the current reelStrips[${outcome.reelIndex}]`);
                }
            } else {
                console.log(`  reel ${outcome.reelIndex}  FAILED after ${outcome.attemptsUsed} attempt(s) (seed ${outcome.seed})`);
                for (const violation of outcome.diagnostics[outcome.diagnostics.length - 1]?.violations ?? []) {
                    console.log(`    - ${violation.constraintId}: ${violation.message}`);
                }
            }
        }

        if (outcomes.some((outcome) => !outcome.success)) {
            console.log("\nNo changes written -- fix the failing reel(s) above and re-run.");
        } else if (applied) {
            console.log(`\nApplied ${outcomes.length} reel(s) to "${outPath}".`);
        } else {
            console.log('\nDry run -- no files written. Re-run with --apply to pin these strips into reelStripGeneration.');
        }
    }
}

function countChangedPositions(previous: string[], next: string[]): number {
    const length = Math.max(previous.length, next.length);
    let changed = 0;
    for (let position = 0; position < length; position++) {
        if (previous[position] !== next[position]) {
            changed++;
        }
    }
    return changed;
}
