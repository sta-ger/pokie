import fs from "fs";
import path from "path";
import {
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleBuildResult,
    CertificationEvidenceBundleBuilding,
    CertificationEvidenceBundleModeSampleInput,
    CertificationEvidenceBundleVerifier,
    CertificationEvidenceBundleVerifying,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {CommanderErrorMessages, createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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

    constructor(
        pokieVersion: string,
        builder: CertificationEvidenceBundleBuilding = new CertificationEvidenceBundleBuilder(pokieVersion),
        verifier: CertificationEvidenceBundleVerifying = new CertificationEvidenceBundleVerifier(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
    ) {
        this.builder = builder;
        this.verifier = verifier;
        this.loadJson = loadJson;
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

        let exitCode = 0;
        const parent = createCommanderCliCommand("certification");

        parent
            .command("build")
            .argument("<bundleDir>")
            .argument("<config.json>")
            .argument("[excess...]")
            .option("--out <dir>")
            .action(async (bundleDir: string, configPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${BUILD_USAGE}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "certification");
                exitCode = await this.executeBuild(bundleDir, configPath, outDir);
            });

        parent
            .command("verify")
            .argument("<certDir>")
            .argument("[excess...]")
            .option("--source <bundleDir>")
            .action(async (certDir: string, excess: string[], options: {source?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VERIFY_USAGE}`);
                }
                if (options.source === undefined) {
                    throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
                }
                exitCode = await this.executeVerify(certDir, options.source);
            });

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
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: `${USAGE}\n${CONFIG_HINT}`,
                    noCommand: `${USAGE}\n${CONFIG_HINT}`,
                });
            });
    }

    private async executeBuild(bundleDir: string, configPath: string, outDir: string): Promise<number> {
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
