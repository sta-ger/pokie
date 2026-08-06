import {Command} from "commander";
import fs from "fs";
import path from "path";
import {
    CERTIFICATION_BUILD_OPERATION,
    CERTIFICATION_VERIFY_OPERATION,
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleBuildResult,
    CertificationEvidenceBundleBuilding,
    CertificationEvidenceBundleModeSampleInput,
    CertificationEvidenceBundleVerifier,
    CertificationEvidenceBundleVerifying,
    describeUnsupportedProjectOperation,
    PokieOperation,
    ProjectResolving,
    ProjectTargetResolver,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE =
    "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
    "   or: pokie certification verify <certDir> --source <bundleDir>";
const BUILD_USAGE = "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]";
const VERIFY_USAGE = "Usage: pokie certification verify <certDir> --source <bundleDir>";
const CONFIG_HINT =
    '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
    '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
    "docs/certification-evidence-bundle.md for the format.";

type BuildDescriptorModeEntry = {modeName: string; seed: string; sampleCount: number};
type BuildDescriptor = {modes: BuildDescriptorModeEntry[]};

// Two CLI verbs ("pokie certification build"/"pokie certification verify") sharing one command, the same way
// OutcomeLibraryCommand owns "build"/"validate" and StakeEngineCommand owns "export"/"import" — cli/pokie.ts
// dispatches by exact name match, so two separate classes could never both return getName() === "certification".
export class CertificationCommand implements CliCommandHandling {
    private readonly builder: CertificationEvidenceBundleBuilding;
    private readonly verifier: CertificationEvidenceBundleVerifying;
    private readonly loadJson: (filePath: string) => unknown;
    // Consulted once per verb, on the source bundleDir only (never <config.json>/<certDir>, which never name
    // an existing outcome-library bundle themselves) -- see executeBuild/executeVerify's own comment on why a
    // resolved, non-"outcomeLibrary" source produces a capability diagnostic instead of falling through to
    // this.builder/this.verifier's own confusing "not a valid outcome library bundle" error. An unrecognized
    // path (resolve() returns undefined) is unaffected: it still reaches the builder/verifier exactly as
    // before this resolver existed.
    private readonly resolveProject: ProjectResolving;

    constructor(
        pokieVersion: string,
        builder: CertificationEvidenceBundleBuilding = new CertificationEvidenceBundleBuilder(pokieVersion),
        verifier: CertificationEvidenceBundleVerifying = new CertificationEvidenceBundleVerifier(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
    ) {
        this.builder = builder;
        this.verifier = verifier;
        this.loadJson = loadJson;
        this.resolveProject = resolveProject;
    }

    public getName(): string {
        return "certification";
    }

    public getDescription(): string {
        return (
            "Build a canonical POKIE certification/evidence bundle on top of an outcome-library bundle, or verify one " +
            '("pokie certification build <bundleDir> <config.json>" / "pokie certification verify <certDir>").'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    // Two ordinary-word verbs ("build"/"verify") sharing one parent Commander instance — real nested
    // subcommands (see cli/commands/internal/CommanderCliAdapter.ts), so Commander itself both
    // dispatches by exact verb name and validates each verb's own args/options. The messages passed
    // to translateCommanderError are picked per-verb (from args[0], read before parsing) since a
    // structural error caught at the shared parent.parseAsync() call doesn't otherwise say which
    // subcommand it came from; an empty/unrecognized verb falls back to the combined USAGE+hint the
    // original hand-rolled switch's own `default` case threw.
    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie certification help"), reject it explicitly up front with the
        // same combined usage+hint text the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);
        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "build") {
            verbMessages = {
                missingArgument: `${BUILD_USAGE}\n${CONFIG_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${BUILD_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${BUILD_USAGE}` : `Unknown option "${flag}". ${BUILD_USAGE}`),
            };
        } else if (verb === "verify") {
            verbMessages = {
                missingArgument: VERIFY_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${VERIFY_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--source" ? `--source requires a directory path. ${VERIFY_USAGE}` : `Unknown option "${flag}". ${VERIFY_USAGE}`),
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: `${USAGE}\n${CONFIG_HINT}`,
                    noCommand: `${USAGE}\n${CONFIG_HINT}`,
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by whichever verb's action actually runs;
    // run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("certification").description(this.getDescription());

        parent
            .command("build")
            .description("Build a canonical certification/evidence bundle on top of an outcome-library bundle.")
            .argument("<bundleDir>", "an existing outcome-library bundle directory (see \"pokie outcomelibrary build\")")
            .argument("<config.json>", "lists one sample source per mode -- see docs/certification-evidence-bundle.md")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <dir>", "output directory (default: a \"certification\" sibling of <config.json>)")
            .action(async (bundleDir: string, configPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${BUILD_USAGE}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "certification");
                exitCodeRef.value = await this.executeBuild(bundleDir, configPath, outDir);
            });

        parent
            .command("verify")
            .description("Verify a certification/evidence bundle against its outcome-library source.")
            .argument("<certDir>", "an existing certification/evidence bundle directory built by \"pokie certification build\"")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--source <bundleDir>", "the outcome-library bundle the certification bundle was built from (required)")
            .action(async (certDir: string, excess: string[], options: {source?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VERIFY_USAGE}`);
                }
                if (options.source === undefined) {
                    throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
                }
                exitCodeRef.value = await this.executeVerify(certDir, options.source);
            });

        return parent;
    }

    private async executeBuild(bundleDir: string, configPath: string, outDir: string): Promise<number> {
        await this.checkOutcomeLibrarySource(bundleDir, CERTIFICATION_BUILD_OPERATION);

        const descriptor = this.loadDescriptor(configPath);

        const modes: CertificationEvidenceBundleModeSampleInput[] = descriptor.modes.map((entry) => ({
            modeName: entry.modeName,
            seed: entry.seed,
            sampleCount: entry.sampleCount,
        }));

        const result: CertificationEvidenceBundleBuildResult = await this.builder.buildFromBundle(bundleDir, modes, outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not build a certification/evidence bundle from "${bundleDir}" to "${outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Built a certification/evidence bundle from "${bundleDir}" to "${outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private async executeVerify(certDir: string, sourceBundleDir: string): Promise<number> {
        await this.checkOutcomeLibrarySource(sourceBundleDir, CERTIFICATION_VERIFY_OPERATION);

        const issues = await this.verifier.verify(certDir, {sourceBundleDir});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${certDir}" did not verify as a valid certification/evidence bundle (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${certDir}" verified successfully as a certification/evidence bundle.`);
        for (const issue of rest) {
            console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    // Only ever rejects a *recognized*-but-wrong-type source (a tsPackage/blueprint/stakeAdapter/
    // parWorkbook/wasm path) with a capability diagnostic explaining exactly why certification can't run
    // against it -- the same "only reject a recognized mismatch, never an unrecognized path" discipline
    // BuildCommand's own runDefault() already follows. An unrecognized path -- resolve() returns undefined,
    // e.g. an arbitrary or malformed directory this resolver can't classify at all -- falls straight through
    // to this.builder/this.verifier exactly as it always has, so an ordinary "not a valid outcome library
    // bundle" error is unaffected.
    private async checkOutcomeLibrarySource(bundleDir: string, operation: PokieOperation): Promise<void> {
        const project = await this.resolveProject.resolve(bundleDir);
        if (project === undefined || project.type === "outcomeLibrary") {
            return;
        }

        const diagnostic = describeUnsupportedProjectOperation(project, operation);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private loadDescriptor(configPath: string): BuildDescriptor {
        const parsed = this.loadJson(configPath);
        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes)) {
            throw new Error(`"${configPath}" is not a valid certification bundle config. ${CONFIG_HINT}`);
        }

        const modes = (parsed as {modes: unknown[]}).modes.map((entry, position) => {
            if (
                typeof entry !== "object" ||
                entry === null ||
                typeof (entry as {modeName?: unknown}).modeName !== "string" ||
                typeof (entry as {seed?: unknown}).seed !== "string" ||
                typeof (entry as {sampleCount?: unknown}).sampleCount !== "number"
            ) {
                throw new Error(`"${configPath}": modes[${position}] must be an object with a string "modeName"/"seed" and a number "sampleCount". ${CONFIG_HINT}`);
            }
            const e = entry as BuildDescriptorModeEntry;
            return {modeName: e.modeName, seed: e.seed, sampleCount: e.sampleCount};
        });

        return {modes};
    }

}
