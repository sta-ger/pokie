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

const USAGE =
    "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
    "   or: pokie certification verify <certDir> --source <bundleDir>";
const BUILD_USAGE = "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]";
const VERIFY_USAGE = "Usage: pokie certification verify <certDir> --source <bundleDir>";
const CONFIG_HINT =
    '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
    '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
    "docs/certification-evidence-bundle.md for the format.";

type BuildOptions = {bundleDir: string; configPath: string; outDir: string};
type VerifyOptions = {certDir: string; sourceBundleDir: string};

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

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "build":
                return this.runBuild(rest);
            case "verify":
                return this.runVerify(rest);
            default:
                return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }
    }

    private async runBuild(args: string[]): Promise<number> {
        const options = this.parseBuildArgs(args);
        const descriptor = this.loadDescriptor(options.configPath);

        const modes: CertificationEvidenceBundleModeSampleInput[] = descriptor.modes.map((entry) => ({
            modeName: entry.modeName,
            seed: entry.seed,
            sampleCount: entry.sampleCount,
        }));

        const result: CertificationEvidenceBundleBuildResult = await this.builder.buildFromBundle(options.bundleDir, modes, options.outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not build a certification/evidence bundle from "${options.bundleDir}" to "${options.outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Built a certification/evidence bundle from "${options.bundleDir}" to "${options.outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private async runVerify(args: string[]): Promise<number> {
        const options = this.parseVerifyArgs(args);
        const issues = await this.verifier.verify(options.certDir, {sourceBundleDir: options.sourceBundleDir});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${options.certDir}" did not verify as a valid certification/evidence bundle (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${options.certDir}" verified successfully as a certification/evidence bundle.`);
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

    private parseBuildArgs(args: string[]): BuildOptions {
        const [bundleDir, configPath, ...rest] = args;
        if (!bundleDir || !configPath) {
            throw new Error(`${BUILD_USAGE}\n${CONFIG_HINT}`);
        }

        let outDir = path.join(path.dirname(configPath), "certification");
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${BUILD_USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${BUILD_USAGE}`);
            }
        }

        return {bundleDir, configPath, outDir};
    }

    private parseVerifyArgs(args: string[]): VerifyOptions {
        const [certDir, ...rest] = args;
        if (!certDir) {
            throw new Error(VERIFY_USAGE);
        }

        let sourceBundleDir: string | undefined;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--source": {
                    if (value === undefined) {
                        throw new Error(`--source requires a directory path. ${VERIFY_USAGE}`);
                    }
                    sourceBundleDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${VERIFY_USAGE}`);
            }
        }

        if (sourceBundleDir === undefined) {
            throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
        }

        return {certDir, sourceBundleDir};
    }
}
