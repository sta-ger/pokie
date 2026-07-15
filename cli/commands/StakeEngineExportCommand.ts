import fs from "fs";
import path from "path";
import {StakeEngineExporter, StakeEngineExporting, StakeEngineExportModeInput, ValidationIssue, WeightedOutcomeLibrary} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const USAGE = "Usage: pokie stakeengine export <config.json> [--out <dir>]";
const CONFIG_HINT =
    '<config.json> lists one WeightedOutcomeLibrary JSON file per Stake mode: ' +
    '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — ' +
    "see docs/stake-engine-export.md for the format.";

type ExportOptions = {configPath: string; outDir: string};

type ExportDescriptorModeEntry = {modeName: string; cost: number; libraryPath: string};
type ExportDescriptor = {modes: ExportDescriptorModeEntry[]};

// One CLI verb ("pokie stakeengine export") today; structured with its own subcommand dispatch (like
// ParCommand) so a future second verb doesn't require restructuring.
export class StakeEngineExportCommand implements CliCommandHandling {
    private readonly exporter: StakeEngineExporting;
    private readonly loadJson: (filePath: string) => unknown;

    constructor(
        pokieVersion: string,
        exporter: StakeEngineExporting = new StakeEngineExporter(pokieVersion),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
    ) {
        this.exporter = exporter;
        this.loadJson = loadJson;
    }

    public getName(): string {
        return "stakeengine";
    }

    public getDescription(): string {
        return 'Export WeightedOutcomeLibrary JSON files to the Stake Engine math-sdk static file format ("pokie stakeengine export <config.json>").';
    }

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "export":
                return this.runExport(rest);
            default:
                return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }
    }

    private async runExport(args: string[]): Promise<number> {
        const options = this.parseExportArgs(args);
        const descriptor = this.loadDescriptor(options.configPath);
        const configDir = path.dirname(options.configPath);

        const modes: StakeEngineExportModeInput[] = descriptor.modes.map((entry) => ({
            modeName: entry.modeName,
            cost: entry.cost,
            library: this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary,
        }));

        const result = await this.exporter.exportToDirectory(modes, options.outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not export "${options.configPath}" to "${options.outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Exported "${options.configPath}" to "${options.outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private loadDescriptor(configPath: string): ExportDescriptor {
        const parsed = this.loadJson(configPath);
        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes)) {
            throw new Error(`"${configPath}" is not a valid Stake Engine export config. ${CONFIG_HINT}`);
        }

        const modes = (parsed as {modes: unknown[]}).modes.map((entry, position) => {
            if (
                typeof entry !== "object" ||
                entry === null ||
                typeof (entry as {modeName?: unknown}).modeName !== "string" ||
                typeof (entry as {cost?: unknown}).cost !== "number" ||
                typeof (entry as {libraryPath?: unknown}).libraryPath !== "string"
            ) {
                throw new Error(`"${configPath}": modes[${position}] must be {"modeName": string, "cost": number, "libraryPath": string}. ${CONFIG_HINT}`);
            }
            return entry as ExportDescriptorModeEntry;
        });

        return {modes};
    }

    private parseExportArgs(args: string[]): ExportOptions {
        const [configPath, ...rest] = args;
        if (!configPath) {
            throw new Error(`${USAGE}\n${CONFIG_HINT}`);
        }

        let outDir = path.join(path.dirname(configPath), "stakeengine");
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {configPath, outDir};
    }
}
