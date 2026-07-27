import {ALL_SLOT_GAME_NAME_THEMES, MAX_SIMULATION_WORKERS} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CertificationCommand} from "../../cli/commands/CertificationCommand.js";
import {ClientCommand} from "../../cli/commands/ClientCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {DevCommand} from "../../cli/commands/DevCommand.js";
import {DiffCommand} from "../../cli/commands/DiffCommand.js";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {NameCommand} from "../../cli/commands/NameCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ServeCommand} from "../../cli/commands/ServeCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {StudioCommand} from "../../cli/commands/StudioCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import fs from "fs";
import path from "path";
import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {dispatch} from "../../cli/dispatch.js";
import {buildUsageText} from "../../cli/usageText.js";
import {CLI_COMMAND_DESCRIPTORS} from "./fixtures/cliCommandInventory.js";

const TEST_VERSION = "1.3.0";

// Mirrors cli/pokie.ts's own `commands` array 1:1 (same classes, same order, same names) — the one
// place that registry is duplicated for testing, since cli/pokie.ts itself can't be imported
// directly (its readOwnVersion()/ownClientRoot()/ownStudioRoot() need import.meta.url, and its
// module body calls run() unconditionally on import — see cli/pokie.ts's own comments and
// ClientCommand's/DevCommand's doc comments on the same point). Keep this list's names/order in
// sync with cli/pokie.ts whenever a command is added, renamed, or reordered there.
function registerCommands(): CliCommandHandling[] {
    return [
        new BuildCommand(TEST_VERSION),
        new CertificationCommand(TEST_VERSION),
        new ClientCommand(),
        new CreateCommand(TEST_VERSION),
        new DevCommand(),
        new DiffCommand(),
        new FairnessCommand(),
        new InitCommand(TEST_VERSION),
        new InspectCommand(),
        new NameCommand(),
        new OutcomeLibraryCommand(TEST_VERSION),
        new ParCommand(TEST_VERSION),
        new ReplayCommand(),
        new ReportCommand(),
        new ServeCommand(),
        new SimCommand(),
        new StakeEngineCommand(TEST_VERSION),
        new StudioCommand(TEST_VERSION),
        new ValidateCommand(),
    ];
}

describe("CLI command registry (cli/pokie.ts's `commands` array, mirrored here)", () => {
    const commands = registerCommands();

    it("has exactly the names the inventory expects, in the same order, with no duplicates", () => {
        expect(commands.map((command) => command.getName())).toEqual(CLI_COMMAND_DESCRIPTORS.map((d) => d.name));
        expect(new Set(commands.map((command) => command.getName())).size).toBe(commands.length);
    });

    it.each(CLI_COMMAND_DESCRIPTORS.map((d) => [d.name, d.description] as const))(
        '"%s"\'s getDescription() text is frozen',
        (name, description) => {
            const command = commands.find((candidate) => candidate.getName() === name);
            expect(command?.getDescription()).toBe(description);
        },
    );

    it('"pokie --help" / the unknown-command fallback lists every registered command once, name-padded', () => {
        const usage = buildUsageText(commands);
        expect(usage.split("\n")[0]).toBe("Usage: pokie <command>");
        for (const descriptor of CLI_COMMAND_DESCRIPTORS) {
            expect(usage).toContain(descriptor.name);
        }
        // One "  <name-padded>  <description>" line per command, no more, no fewer.
        expect(usage.split("\n").filter((line) => line.startsWith("  "))).toHaveLength(CLI_COMMAND_DESCRIPTORS.length);
    });
});

type ContractCase = {
    command: string;
    label: string;
    args: string[];
    expectedError: string;
};

// Every case here is side-effect-free by construction: each triggers a command's own parseArgs()
// validation (a missing required positional/subcommand, or a bad flag value) before that command
// ever reaches a filesystem read/write, a loadGame() call, or a server bind — see each command's
// own source for the exact ordering. None of these touch disk, network, or a subprocess.
const CONTRACT_CASES: ContractCase[] = [
    // --- build ---
    {
        command: "build",
        label: "missing <config.json> (an empty-string positional, since a truly empty argv launches the wizard instead)",
        args: [""],
        expectedError:
            "Usage: pokie build <config.json> [--out <dir>] [--dry-run]\n" +
            "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.",
    },
    {
        command: "build",
        label: "--init-blueprint missing <file>",
        args: ["--init-blueprint"],
        expectedError: "Usage: pokie build --init-blueprint <file>",
    },
    {
        command: "build",
        label: "random --seed must be an integer",
        args: ["random", "--seed", "notanumber"],
        expectedError:
            "--seed requires an integer value. Usage: pokie build random [--seed <integer>] [--out <dir>] [--dry-run] [--preset default|variant]",
    },

    // --- certification ---
    {
        command: "certification",
        label: "missing/unknown subcommand",
        args: [],
        expectedError:
            "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
            "   or: pokie certification verify <certDir> --source <bundleDir>\n" +
            '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
            '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
            "docs/certification-evidence-bundle.md for the format.",
    },
    {
        command: "certification",
        label: "build missing <bundleDir>/<config.json>",
        args: ["build"],
        expectedError:
            "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
            '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
            '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
            "docs/certification-evidence-bundle.md for the format.",
    },
    {
        command: "certification",
        label: "verify missing <certDir>",
        args: ["verify"],
        expectedError: "Usage: pokie certification verify <certDir> --source <bundleDir>",
    },
    {
        command: "certification",
        label: "verify missing --source (certDir given)",
        args: ["verify", "certDir"],
        expectedError: "--source <bundleDir> is required. Usage: pokie certification verify <certDir> --source <bundleDir>",
    },

    // --- client ---
    {
        command: "client",
        label: "missing <packageRoot>",
        args: [],
        expectedError:
            "Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-1"],
        expectedError:
            "--port must be a non-negative integer. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },

    // --- create ---
    {
        command: "create",
        label: "missing <name>",
        args: [],
        expectedError: "Usage: pokie create <name>",
    },
    {
        command: "create",
        label: "--random --preset must be default|variant",
        args: ["--random", "--preset", "bogus"],
        expectedError:
            "--preset must be one of: default, variant. Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant]",
    },

    // --- dev ---
    {
        command: "dev",
        label: "missing <packageRoot>",
        args: [],
        expectedError:
            "Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
            "[--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        label: "--client-port must be a non-negative integer",
        args: ["pkg", "--client-port", "abc"],
        expectedError:
            "--client-port must be a non-negative integer. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
            "[--client-port <number>] [--client-host <string>] [--no-open]",
    },

    // --- diff ---
    {
        command: "diff",
        label: "missing <rightReportJson>",
        args: ["left.json"],
        expectedError: "Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]",
    },
    {
        command: "diff",
        label: "--format only supports json",
        args: ["left.json", "right.json", "--format", "html"],
        expectedError:
            '--format only supports "json". Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]',
    },

    // --- fairness ---
    {
        command: "fairness",
        label: "missing/unknown subcommand",
        args: [],
        expectedError:
            "Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>\n" +
            "   or: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]\n" +
            "   or: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]\n" +
            "   or: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        label: "seed-commit missing <serverSeed.txt>",
        args: ["seed-commit"],
        expectedError: "Usage: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        label: "commit missing --client-seed (checked first among its required flags)",
        args: ["commit", "commitment.json"],
        expectedError:
            "--client-seed <seed> is required. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> " +
            "--source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        label: "commit --nonce must be a canonical non-negative integer (no sign)",
        args: ["commit", "commitment.json", "--client-seed", "x", "--nonce", "-1"],
        expectedError:
            '--nonce must be a canonical non-negative decimal integer (e.g. "0", "42" — no sign, decimal point, leading zero, ' +
            'or scientific/hex notation, and no larger than Number.MAX_SAFE_INTEGER), got "-1". Usage: pokie fairness commit ' +
            "<serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        label: "reveal missing --server-seed",
        args: ["reveal", "commitment.json"],
        expectedError:
            "--server-seed <file> is required. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> " +
            "--source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        label: "verify missing --commitment",
        args: ["verify", "proof.json"],
        expectedError:
            "--commitment <commitment.json> is required. Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
    },

    // --- inspect ---
    {
        command: "inspect",
        label: "missing <packageRoot>",
        args: [],
        expectedError: "Usage: pokie inspect <packageRoot>",
    },
    {
        command: "inspect",
        label: "unexpected extra argument",
        args: ["pkgRoot", "extra"],
        expectedError: 'Unknown option "extra". Usage: pokie inspect <packageRoot>',
    },

    // --- name ---
    {
        command: "name",
        label: "--theme must be one of the declared themes",
        args: ["--theme", "not-a-real-theme"],
        expectedError:
            `--theme must be one of: ${ALL_SLOT_GAME_NAME_THEMES.join(", ")}. ` +
            "Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        label: "--words must be 2 or 3",
        args: ["--words", "4"],
        expectedError:
            "--words must be 2 or 3. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },

    // --- outcomelibrary ---
    {
        command: "outcomelibrary",
        label: "missing/unknown subcommand",
        args: [],
        expectedError:
            "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
            "   or: pokie outcomelibrary validate <bundleDir> [--deep]\n" +
            '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
            '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
            'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
            'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
            '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
            "since there's no wrapping library object to read it from; \"schemaVersion\" is optional). Exactly one of " +
            '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.',
    },
    {
        command: "outcomelibrary",
        label: "build missing <config.json>",
        args: ["build"],
        expectedError:
            "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
            '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
            '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
            'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
            'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
            '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
            "since there's no wrapping library object to read it from; \"schemaVersion\" is optional). Exactly one of " +
            '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.',
    },
    {
        command: "outcomelibrary",
        label: "validate missing <bundleDir>",
        args: ["validate"],
        expectedError: "Usage: pokie outcomelibrary validate <bundleDir> [--deep]",
    },

    // --- par ---
    {
        command: "par",
        label: "missing/unknown subcommand",
        args: [],
        expectedError:
            "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]\n" +
            "   or: pokie par export <config.json> [--out <output.xlsx>]",
    },
    {
        command: "par",
        label: "import missing <input.xlsx>",
        args: ["import"],
        expectedError: "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]",
    },
    {
        command: "par",
        label: "import --format only supports json",
        args: ["import", "input.xlsx", "--format", "xml"],
        expectedError:
            '--format only supports "json". Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]',
    },
    {
        command: "par",
        label: "export missing <config.json>",
        args: ["export"],
        expectedError: "Usage: pokie par export <config.json> [--out <output.xlsx>]",
    },

    // --- replay ---
    {
        command: "replay",
        label: "missing <packageRoot>",
        args: [],
        expectedError: "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },
    {
        command: "replay",
        label: "--round is required",
        args: ["pkg"],
        expectedError:
            "--round is required. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },
    {
        command: "replay",
        label: "--round must be a positive integer",
        args: ["pkg", "--round", "0"],
        expectedError:
            "--round must be a positive integer. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },

    // --- report ---
    {
        command: "report",
        label: "missing <simulationReportJson>",
        args: [],
        expectedError: "Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]",
    },
    {
        command: "report",
        label: '--format must be "markdown" or "html"',
        args: ["report.json", "--format", "json"],
        expectedError:
            '--format must be "markdown" or "html". Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]',
    },

    // --- serve ---
    {
        command: "serve",
        label: "missing <packageRoot>",
        args: [],
        expectedError: "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]",
    },
    {
        command: "serve",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-5"],
        expectedError: "--port must be a non-negative integer. Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]",
    },

    // --- sim ---
    {
        command: "sim",
        label: "missing <packageRoot>",
        args: [],
        expectedError:
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] " +
            "[--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        label: "--workers must be within [1, MAX_SIMULATION_WORKERS]",
        args: ["pkg", "--workers", "0"],
        expectedError:
            `--workers must be an integer between 1 and ${MAX_SIMULATION_WORKERS}. Usage: pokie sim <packageRoot> [--rounds <number>] ` +
            "[--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        label: "convergence flags must all be given together (partial group)",
        args: ["pkg", "--min-rounds", "100"],
        expectedError:
            "--min-rounds, --rtp-tolerance and --check-interval must all be provided together to enable adaptive convergence. " +
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] " +
            "[--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        label: "--stable-checks alone (without the required group) is rejected",
        args: ["pkg", "--stable-checks", "3"],
        expectedError:
            "--stable-checks requires --min-rounds, --rtp-tolerance and --check-interval to also be set. " +
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] " +
            "[--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },

    // --- stakeengine ---
    {
        command: "stakeengine",
        label: "missing/unknown subcommand",
        args: [],
        expectedError:
            "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
            "   or: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
            "   or: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]\n" +
            "   or: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]\n" +
            '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
            '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
            'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
            '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
            'of "libraryPath"/"bundleDir" is required per mode — see docs/stake-engine-export.md for the format.',
    },
    {
        command: "stakeengine",
        label: "export missing <config.json>",
        args: ["export"],
        expectedError:
            "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
            '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
            '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
            'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
            '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
            'of "libraryPath"/"bundleDir" is required per mode — see docs/stake-engine-export.md for the format.',
    },
    {
        command: "stakeengine",
        label: "import missing <stakeDir>",
        args: ["import"],
        expectedError:
            "Usage: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
            '<stakeDir> is a directory previously produced by "pokie stakeengine export" (index.json, per-mode lookup ' +
            "CSV/books, and its own pokie-manifest.json) — see docs/stake-engine-import.md for details.",
    },
    {
        command: "stakeengine",
        label: "analyze missing <stakeDir>",
        args: ["analyze"],
        expectedError:
            "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]\n" +
            "<stakeDir> is any Stake Engine outcome directory (index.json, per-mode lookup CSV, per-mode zstd-compressed " +
            "JSONL books) — POKIE's own export or a third party's, with or without a pokie-manifest.json — see " +
            "docs/stake-engine-standalone.md for details.",
    },
    {
        command: "stakeengine",
        label: "diff missing <rightStakeDir>",
        args: ["diff", "left"],
        expectedError:
            "Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]\n" +
            "<leftStakeDir> and <rightStakeDir> are each any Stake Engine outcome directory (index.json, per-mode lookup " +
            "CSV, per-mode zstd-compressed JSONL books) — POKIE's own export or a third party's, with or without a " +
            "pokie-manifest.json — see docs/stake-engine-standalone.md for details.",
    },
    {
        command: "stakeengine",
        label: "analyze --format only supports json (validated before the stakeDir is ever read)",
        args: ["analyze", "some-stake-dir", "--format", "xml"],
        expectedError: '--format only supports "json". Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]',
    },
    {
        command: "stakeengine",
        label: "diff --format only supports json (validated before either stakeDir is ever read)",
        args: ["diff", "left-dir", "right-dir", "--format", "xml"],
        expectedError:
            '--format only supports "json". Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]',
    },

    // --- studio ---
    {
        command: "studio",
        label: "--port must be a non-negative integer (validated before any server/browser is touched)",
        args: ["--port", "notanumber"],
        expectedError:
            "--port must be a non-negative integer. Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]",
    },

    // --- validate ---
    {
        command: "validate",
        label: "missing <packageRoot>",
        args: [],
        expectedError: "Usage: pokie validate <packageRoot> [--format json] [--out <file>]",
    },
    {
        command: "validate",
        label: "--format only supports json",
        args: ["pkg", "--format", "xml"],
        expectedError: '--format only supports "json". Usage: pokie validate <packageRoot> [--format json] [--out <file>]',
    },
];

// Some commands' run() throws synchronously rather than returning a rejected promise (e.g.
// CreateCommand's plain "missing <name>" branch isn't wrapped in a try/catch, since it never awaits
// anything before that check) — a real, if inconsistent, part of today's contract. A plain
// `expect(command.run(args)).rejects...` would blow up evaluating that argument before `expect` ever
// runs for those cases, so every case goes through this helper instead, which catches both a
// synchronous throw and a rejected promise uniformly.
async function captureRunErrorMessage(command: CliCommandHandling, args: string[]): Promise<string> {
    try {
        await command.run(args);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error(`Expected "pokie ${command.getName()} ${args.join(" ")}" to fail, but it resolved.`);
}

describe("CLI command validation contract (frozen, side-effect-free)", () => {
    const commands = registerCommands();

    it.each(CONTRACT_CASES.map((testCase) => [`${testCase.command}: ${testCase.label}`, testCase] as const))(
        "%s",
        async (_label, testCase) => {
            const command = commands.find((candidate) => candidate.getName() === testCase.command);
            if (!command) {
                throw new Error(`No registered command named "${testCase.command}" — update registerCommands().`);
            }

            const message = await captureRunErrorMessage(command, testCase.args);
            expect(message).toBe(testCase.expectedError);
        },
    );

    it("every contract case names a command that actually exists in the registry (guards against a typo silently no-oping)", () => {
        const registered = new Set(commands.map((command) => command.getName()));
        for (const testCase of CONTRACT_CASES) {
            expect(registered.has(testCase.command)).toBe(true);
        }
    });

    it("every command with a validation surface (i.e. every command but init) has at least one contract case", () => {
        const coveredCommands = new Set(CONTRACT_CASES.map((testCase) => testCase.command));
        const commandsWithVerbs = CLI_COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.verbs.length > 0);
        for (const descriptor of commandsWithVerbs) {
            expect(coveredCommands.has(descriptor.name)).toBe(true);
        }
    });
});

describe("CLI defaults (side-effect-free success path)", () => {
    it('"pokie name" with no arguments succeeds using its documented defaults (count 1, no theme/words/seed pin, human output)', async () => {
        const command = new NameCommand();
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await command.run([]);
            expect(exitCode).toBe(0);
            // Exactly one name line plus the "Reproduce with:" line, per NameCommand.printHuman -- a
            // regression here (e.g. a default count silently changing) would print more/fewer lines.
            expect(logSpy).toHaveBeenCalledTimes(2);
            expect(logSpy.mock.calls[1][0]).toMatch(/^\nReproduce with: pokie name --seed -?\d+$/);
        } finally {
            logSpy.mockRestore();
        }
    });

    it('"pokie name --json" with no other flags prints exactly one JSON-serialized result', async () => {
        const command = new NameCommand();
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await command.run(["--json"]);
            expect(exitCode).toBe(0);
            expect(logSpy).toHaveBeenCalledTimes(1);
            const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as unknown[];
            expect(parsed).toHaveLength(1);
        } finally {
            logSpy.mockRestore();
        }
    });

    // "random --dry-run" is the one other command-line shape in the whole registry that succeeds
    // (exit 0) without any filesystem/network/subprocess I/O: the blueprint is generated in memory,
    // validated, and previewed — see buildFromBlueprint's own "if (dryRun)" branch in
    // cli/commands/BuildCommand.ts, which returns before GamePackageGenerator.generate() (the command's
    // one I/O point) is ever called.
    it('"pokie build random --seed <n> --preset variant --dry-run" succeeds without writing anything', async () => {
        const command = new BuildCommand(TEST_VERSION);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await command.run(["random", "--seed", "4242", "--preset", "variant", "--dry-run"]);
            expect(exitCode).toBe(0);
            expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Generated random game"))).toBe(true);
        } finally {
            logSpy.mockRestore();
        }
    });
});

// Exercises the real top-level dispatcher (cli/dispatch.ts, what cli/pokie.ts's own run() delegates
// to) against the real registered commands above, rather than only each command class's run()
// directly — closing the gap between "this command validates its own args correctly" (the describe
// blocks above) and "the CLI actually surfaces that behavior end to end" (argv resolution, stream
// separation, process exit code). See tests/cli/dispatch.test.ts for dispatch's own generic
// mechanics (fake commands, no real registry); this describe block is the frozen contract for what
// happens when the *real* pokie command list is behind it.
describe("CLI dispatch contract (cli/dispatch.ts, the real entry point cli/pokie.ts's run() delegates to)", () => {
    const commands = registerCommands();

    it.each(CONTRACT_CASES.map((testCase) => [`${testCase.command}: ${testCase.label}`, testCase] as const))(
        "%s (through the real dispatcher: stderr-only, exit 1)",
        async (_label, testCase) => {
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
            try {
                const exitCode = await dispatch(commands, ["node", "pokie", testCase.command, ...testCase.args]);
                expect(exitCode).toBe(1);
                expect(errorSpy).toHaveBeenCalledTimes(1);
                expect(errorSpy.mock.calls[0][0]).toBe(testCase.expectedError);
                expect(logSpy).not.toHaveBeenCalled();
            } finally {
                logSpy.mockRestore();
                errorSpy.mockRestore();
            }
        },
    );

    it.each([["--help"], ["-h"]])('"pokie %s" prints the full registered command list to stdout only and exits 0', async (flag) => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const exitCode = await dispatch(commands, ["node", "pokie", flag]);
            expect(exitCode).toBe(0);
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy.mock.calls[0][0]).toBe(buildUsageText(commands));
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('an unknown command name that is also not an existing path prints the same command list to stdout and exits 1', async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            // Guaranteed not to collide with a real file/directory in the repo root (this test's cwd).
            const exitCode = await dispatch(commands, ["node", "pokie", "totally-bogus-pokie-command-xyz-12345"]);
            expect(exitCode).toBe(1);
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy.mock.calls[0][0]).toBe(buildUsageText(commands));
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('dispatches "pokie name --json" end to end (argv resolution -> real NameCommand -> exit code)', async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await dispatch(commands, ["node", "pokie", "name", "--json"]);
            expect(exitCode).toBe(0);
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(() => JSON.parse(logSpy.mock.calls[0][0] as string)).not.toThrow();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('dispatches "pokie build random --dry-run" end to end, succeeding without writing anything', async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const exitCode = await dispatch(commands, ["node", "pokie", "build", "random", "--seed", "4242", "--dry-run"]);
            expect(exitCode).toBe(0);
        } finally {
            logSpy.mockRestore();
        }
    });
});

// Ties this file's frozen validation-error/dispatch contract to the deep, per-command functional
// coverage (defaults, valid-value success paths, JSON output shapes, actual file I/O) that already
// lives in tests/cli/commands/*.test.ts — one dedicated file per command class, by convention. That
// coverage isn't duplicated here (this file's cases are deliberately side-effect-free, so most
// commands' real success paths — which read/write actual packages — can't live here), but its
// existence is: silently deleting a command's dedicated test file would otherwise go unnoticed by
// everything else in this file.
describe("CLI command test coverage (structural link to tests/cli/commands/*.test.ts)", () => {
    const commands = registerCommands();
    const COMMANDS_TEST_DIR = path.join(__dirname, "commands");

    it("every registered command class has its own dedicated test file", () => {
        for (const command of commands) {
            const testFile = path.join(COMMANDS_TEST_DIR, `${command.constructor.name}.test.ts`);
            expect(fs.existsSync(testFile)).toBe(true);
        }
    });
});
