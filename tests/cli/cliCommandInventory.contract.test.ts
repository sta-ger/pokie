import {
    computeFairnessServerSeedCommitment,
    FairnessRoundProof,
    OutcomeLibraryBundleReading,
    ParallelSimulationRunner,
    PokieGame,
    ReplayDescriptor,
    SimulationReport,
    StakeEngineStandaloneAnalyzer,
} from "pokie";
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
import {createStarterGameBlueprint} from "../../cli/build/createStarterGameBlueprint.js";
import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {dispatch} from "../../cli/dispatch.js";
import {buildUsageText} from "../../cli/usageText.js";
import {CliContractCase, CLI_COMMAND_DESCRIPTORS, CLI_CONTRACT_CASES, CLI_TOP_LEVEL_DISPATCH_CASES} from "./fixtures/cliCommandInventory.js";

const TEST_VERSION = "1.3.0";

// Mirrors cli/pokie.ts's own `commands` array 1:1 (same classes, same order, same names) — the one
// place that registry is duplicated for testing, since cli/pokie.ts itself can't be imported
// directly (its readOwnVersion()/ownClientRoot()/ownStudioRoot() need import.meta.url, and its
// module body calls run() unconditionally on import — see cli/pokie.ts's own comments and
// ClientCommand's/DevCommand's doc comments on the same point). Keep this list's names/order in
// sync with cli/pokie.ts whenever a command is added, renamed, or reordered there.
//
// Every command here is otherwise unstubbed (real production defaults for every dependency) — this
// is the registry CLI_CONTRACT_CASES' "invalid" cases run through, since none of them ever reach an
// I/O boundary (see the fixture's own doc comment). registerCommandsForValidCases() below is the
// separate, per-case registry the "valid" cases run through instead.
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

// A deliberately loose escape hatch for a stub's return value: bypasses structural checking of a
// result type entirely (via the `unknown` intermediate) rather than hand-authoring every field of a
// large production result type this test never actually inspects — used only where the value is
// either consumed exclusively by another stub (so its exact shape is moot) or by a plain
// JSON.stringify (so any shape at all is valid input). Never used for a value real, unstubbed
// production code (a validator, renderer, differ) actually computes over — those get a complete,
// real literal instead, so that code runs exactly as it does in production.
function stub<T>(partial: object): T {
    return partial as unknown as T;
}

function stubAddressServer(port: number): {start: () => Promise<{host: string; port: number}>; stop: () => Promise<void>} {
    return {start: () => Promise.resolve({host: "127.0.0.1", port}), stop: () => Promise.resolve()};
}

// DevCommand/StudioCommand both register real "SIGINT"/"SIGTERM" listeners on whatever `process`
// they're given via `this.process.once(...)` — injecting this instead of the real global `process`
// is what keeps a "valid" dispatch case in this file from leaking a listener onto the actual test
// process (see DevCommand.ts/StudioCommand.ts's own registerShutdown()).
function fakeProcess(): NodeJS.Process {
    return {once: () => undefined, exit: () => undefined} as unknown as NodeJS.Process;
}

// A minimal-but-complete SimulationReport (every field SimulationReport itself requires — see
// src/reporting/SimulationReport.ts — every other field there is additive/optional) — shared by every
// "valid" case whose command hands its input to REAL, unstubbed production code that actually reads
// it (DiffCommand's real SimulationReportDiffer, ReportCommand's real
// Markdown/HtmlSimulationReportRenderer, SimCommand's own real printSummary()), so that code runs
// exactly as it would against a real "pokie sim --out" report.
const SAMPLE_SIMULATION_REPORT: SimulationReport = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    requestedRounds: 100,
    rounds: 100,
    seed: "demo-seed",
    totalBet: 100,
    totalWin: 95,
    rtp: 0.95,
    hitFrequency: 0.3,
    maxWin: 20,
    durationMs: 50,
    spinsPerSecond: 2000,
};

// Builds the one stubbed CliCommandHandling instance a given "valid" CLI_CONTRACT_CASES entry
// (looked up by `${command}::${label}`, so a case with no matching builder fails loudly rather than
// silently skipping) runs through the real dispatch() — every dependency that would otherwise touch
// the filesystem, bind a port, or spawn a worker thread/subprocess is swapped for a fast,
// deterministic fake via that command class's own constructor injection points (the same points
// tests/cli/commands/*.test.ts already uses for its own per-command success-path tests); everything
// else (argv parsing, control flow, console output, exit code) is the real, unstubbed command class.
function registerCommandsForValidCases(): Map<string, CliCommandHandling> {
    const builders: Record<string, () => CliCommandHandling> = {
        "build::<config.json> --dry-run validates and previews without writing anything (default, no --out)": () =>
            new BuildCommand(TEST_VERSION, () => createStarterGameBlueprint()),
        "build::--init-blueprint <file> writes the starter blueprint template": () =>
            new BuildCommand(TEST_VERSION, undefined, undefined, undefined, undefined, undefined, undefined, () => false, () => undefined),
        "build::random --seed <integer> --preset variant --dry-run (accepted --preset value)": () => new BuildCommand(TEST_VERSION),

        "certification::build <bundleDir> <config.json> (default --out)": () =>
            new CertificationCommand(
                TEST_VERSION,
                {buildFromBundle: () => Promise.resolve({outDir: "out", files: ["evidence.json"], manifest: undefined, issues: []})},
                undefined,
                () => ({modes: [{modeName: "base", seed: "cert-seed", sampleCount: 10}]}),
            ),
        "certification::verify <certDir> --source <bundleDir>": () =>
            new CertificationCommand(TEST_VERSION, undefined, {verify: () => Promise.resolve([])}),

        "client::<packageRoot> (default host/port)": () => new ClientCommand(() => stubAddressServer(4000)),

        "create::<name>": () =>
            new CreateCommand(TEST_VERSION, {
                create: () => ({
                    projectRoot: "/fake/sample-slot",
                    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                    createdFiles: [],
                    updatedFiles: [],
                    skippedFiles: [],
                }),
            }),
        "create::--random --seed <integer> (accepted --seed value, default --preset)": () =>
            new CreateCommand(
                TEST_VERSION,
                undefined,
                undefined,
                undefined,
                {
                    generate: () => ({
                        projectRoot: "/fake/random-slot",
                        manifest: {id: "random-slot", name: "Random Slot", version: "0.1.0"},
                        createdFiles: [],
                        buildInfo: {
                            schemaVersion: 1,
                            generatedBy: "pokie",
                            pokieVersion: TEST_VERSION,
                            generatedAt: "2026-01-01T00:00:00.000Z",
                            blueprintHash: "hash",
                            game: {id: "random-slot", name: "Random Slot", version: "0.1.0"},
                        },
                        unchanged: false,
                    }),
                },
                () => Promise.resolve({ok: true, rounds: 200, roundsRequested: 200, rtp: 0.95, hitFrequency: 0.3, maxWin: 10, averageBet: 1}),
            ),

        "dev::<packageRoot> --no-open (skips the accepted-but-unexercised browser-open step)": () =>
            new DevCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                () => stubAddressServer(5000),
                {
                    createClientServer: () => stubAddressServer(5100),
                    waitForHealth: () => Promise.resolve(),
                    openBrowser: () => undefined,
                    clientRoot: "/fake/client/root",
                    process: fakeProcess(),
                },
            ),

        "diff::<left> <right> --format json (accepted --format value, machine-readable shape)": () =>
            new DiffCommand(() => JSON.stringify(SAMPLE_SIMULATION_REPORT)),

        "fairness::seed-commit <serverSeed.txt> (default, no --out — prints the commitment JSON)": () =>
            new FairnessCommand(undefined, undefined, undefined, undefined, undefined, undefined, () => "server-seed-value\n"),
        "fairness::commit <serverSeedCommitment.json> --client-seed --nonce --source --mode (accepted --nonce value)": () =>
            new FairnessCommand(
                undefined,
                // A genuinely valid FairnessServerSeedCommitment (real computeFairnessServerSeedCommitment
                // over an arbitrary string), since the real (unstubbed) computeFairnessCommitment this case
                // exercises validates its shape strictly — a hand-rolled placeholder object fails that check.
                () => computeFairnessServerSeedCommitment({serverSeed: "server-seed-value"}),
                stub<OutcomeLibraryBundleReading>({readModeIndex: () => Promise.resolve({libraryId: "lib1", libraryHash: "hash1"})}),
            ),
        "fairness::reveal <commitment.json> --server-seed --source": () =>
            new FairnessCommand(
                undefined,
                () => ({}),
                undefined,
                {build: () => Promise.resolve(stub<FairnessRoundProof>({}))},
                undefined,
                undefined,
                () => "revealed-seed\n",
            ),
        "fairness::verify <proof.json> --commitment --source": () =>
            new FairnessCommand({verify: () => Promise.resolve([])}, () => ({})),

        "init::(no args — scaffolds the current project via the injected scaffolder)": () =>
            new InitCommand(TEST_VERSION, {
                scaffold: () => ({
                    projectRoot: "/fake/project",
                    manifest: {id: "fake-project", name: "Fake Project", version: "0.1.0"},
                    createdFiles: [],
                    updatedFiles: [],
                    skippedFiles: [],
                }),
            }),

        "inspect::<packageRoot>": () =>
            new InspectCommand({
                inspect: () => ({packageRoot: "pkg", valid: true, generated: false, packageJson: {name: "pkg", version: "0.1.0"}}),
            }),

        "name::(no args — default count 1, human-readable output)": () => new NameCommand(),
        "name::--json (machine-readable shape)": () => new NameCommand(),

        "outcomelibrary::build <config.json> (default --out)": () =>
            new OutcomeLibraryCommand(
                TEST_VERSION,
                {writeToDirectory: () => Promise.resolve({outDir: "out", files: ["config.json"], manifest: undefined, issues: []})},
                undefined,
                () => ({modes: [{modeName: "base", libraryPath: "lib.json"}], libraryId: "lib1", schemaVersion: 1, outcomes: []}),
            ),
        "outcomelibrary::validate <bundleDir>": () =>
            new OutcomeLibraryCommand(TEST_VERSION, undefined, {validate: () => Promise.resolve([])}),

        "par::import <input.xlsx> --format json (accepted --format value, machine-readable shape)": () =>
            new ParCommand(
                TEST_VERSION,
                {importFromFile: () => Promise.resolve({blueprint: createStarterGameBlueprint(), provenance: undefined, issues: []})},
                undefined,
                undefined,
                () => undefined,
            ),
        "par::export <config.json> (default --out)": () =>
            new ParCommand(TEST_VERSION, undefined, {exportToFile: () => Promise.resolve([])}, () => createStarterGameBlueprint()),

        "replay::<packageRoot> --round <number> (accepted --round value, prints the replay JSON)": () =>
            new ReplayCommand(() => Promise.resolve(stub<PokieGame>({})), undefined, {record: () => stub<ReplayDescriptor>({})}),

        "report::<simulationReportJson> (default --format markdown)": () => new ReportCommand(() => JSON.stringify(SAMPLE_SIMULATION_REPORT)),

        "serve::<packageRoot> --port --host (accepted --port/--host values)": () =>
            new ServeCommand(() => Promise.resolve(stub<PokieGame>({})), () => stubAddressServer(4321)),

        "sim::<packageRoot> --format json (machine-readable shape, default --rounds/--workers)": () =>
            new SimCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                undefined,
                {build: () => SAMPLE_SIMULATION_REPORT},
                undefined,
                () => stub<ParallelSimulationRunner>({run: () => Promise.resolve({})}),
            ),

        "stakeengine::export <config.json> (default --out)": () =>
            new StakeEngineCommand(
                TEST_VERSION,
                {exportToDirectory: () => Promise.resolve({outDir: "out", files: ["index.json"], manifest: undefined, issues: []})},
                undefined,
                () => ({modes: [{modeName: "base", cost: 1, libraryPath: "lib.json"}]}),
            ),
        "stakeengine::import <stakeDir> (default --out)": () =>
            new StakeEngineCommand(
                TEST_VERSION,
                undefined,
                {importFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", manifest: undefined, modes: [], sourceProvenance: undefined, issues: []})},
                undefined,
                {writeToDirectory: () => Promise.resolve({issues: []})},
            ),
        "stakeengine::analyze <stakeDir> --format json (accepted --format value, machine-readable shape)": () =>
            new StakeEngineCommand(TEST_VERSION, undefined, undefined, undefined, undefined, undefined, undefined, {
                readFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", modes: [], issues: []}),
            }),
        "stakeengine::diff <leftStakeDir> <rightStakeDir> (no material difference -> the diff(1)-style exit 0)": () =>
            new StakeEngineCommand(
                TEST_VERSION,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {readFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", modes: [], issues: []})},
                stub<StakeEngineStandaloneAnalyzer>({analyze: () => ({stakeDir: "stakeDir", modes: []})}),
                undefined,
                {diff: () => ({stakeDir: {left: "left", right: "right"}, onlyInLeft: [], onlyInRight: [], perMode: {}})},
            ),

        "studio::--no-open (home mode: no projectRoot given, skips the accepted-but-unexercised browser-open step)": () =>
            new StudioCommand(TEST_VERSION, {createServer: () => stubAddressServer(6100), process: fakeProcess()}),

        "validate::<packageRoot> --format json (accepted --format value, machine-readable shape)": () =>
            new ValidateCommand({
                validate: () =>
                    Promise.resolve({packageRoot: "pkg", valid: true, game: {id: "pkg", name: "Pkg", version: "0.1.0"}, errors: [], warnings: [], suggestions: []}),
            }),
    };

    const registry = new Map<string, CliCommandHandling>();
    for (const testCase of CLI_CONTRACT_CASES) {
        if (testCase.kind !== "valid") {
            continue;
        }
        const key = `${testCase.command}::${testCase.label}`;
        const build = builders[key];
        if (!build) {
            throw new Error(`No stubbed command builder registered for valid case "${key}" — add one in registerCommandsForValidCases().`);
        }
        registry.set(key, build());
    }
    return registry;
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

const INVALID_CASES = CLI_CONTRACT_CASES.filter((testCase): testCase is CliContractCase & {expectedError: string} => testCase.kind === "invalid");
const VALID_CASES = CLI_CONTRACT_CASES.filter((testCase) => testCase.kind === "valid");

describe("CLI command validation contract (frozen, side-effect-free)", () => {
    const commands = registerCommands();

    it.each(INVALID_CASES.map((testCase) => [`${testCase.command}: ${testCase.label}`, testCase] as const))(
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
        for (const testCase of CLI_CONTRACT_CASES) {
            expect(registered.has(testCase.command)).toBe(true);
        }
    });

    it("every command with a validation surface (i.e. every command but init) has at least one invalid contract case", () => {
        const coveredCommands = new Set(INVALID_CASES.map((testCase) => testCase.command));
        const commandsWithVerbs = CLI_COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.verbs.length > 0);
        for (const descriptor of commandsWithVerbs) {
            expect(coveredCommands.has(descriptor.name)).toBe(true);
        }
    });

    it("every registered command (including init) has at least one valid contract case", () => {
        const coveredCommands = new Set(VALID_CASES.map((testCase) => testCase.command));
        for (const descriptor of CLI_COMMAND_DESCRIPTORS) {
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
// to) against real command classes above, rather than only each command class's run() directly —
// closing the gap between "this command validates its own args correctly" / "this command's accepted
// path behaves correctly" (the describe blocks above) and "the CLI actually surfaces that behavior end
// to end" (argv resolution, stream separation, process exit code). See tests/cli/dispatch.test.ts for
// dispatch's own generic mechanics (fake commands, no real registry); this describe block is the
// frozen contract for what happens when the *real* pokie command list is behind it.
describe("CLI dispatch contract (cli/dispatch.ts, the real entry point cli/pokie.ts's run() delegates to)", () => {
    const commands = registerCommands();
    const validCommands = registerCommandsForValidCases();

    it.each(INVALID_CASES.map((testCase) => [`${testCase.command}: ${testCase.label}`, testCase] as const))(
        "%s (through the real dispatcher: stderr-only, exit 1)",
        async (_label, testCase) => {
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
            try {
                const exitCode = await dispatch(commands, ["node", "pokie", testCase.command, ...testCase.args]);
                expect(exitCode).toBe(testCase.expectedExitCode);
                expect(errorSpy).toHaveBeenCalledTimes(1);
                expect(errorSpy.mock.calls[0][0]).toBe(testCase.expectedError);
                expect(logSpy).not.toHaveBeenCalled();
            } finally {
                logSpy.mockRestore();
                errorSpy.mockRestore();
            }
        },
    );

    it.each(VALID_CASES.map((testCase) => [`${testCase.command}: ${testCase.label}`, testCase] as const))(
        "%s (through the real dispatcher, against a dependency-injected instance of the real command class)",
        async (_label, testCase) => {
            const command = validCommands.get(`${testCase.command}::${testCase.label}`);
            if (!command) {
                throw new Error(`No stubbed command registered for valid case "${testCase.command}::${testCase.label}".`);
            }

            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
            try {
                const exitCode = await dispatch([command], ["node", "pokie", testCase.command, ...testCase.args]);
                expect(exitCode).toBe(testCase.expectedExitCode);
                expect(errorSpy).not.toHaveBeenCalled();

                if (testCase.expectStdout === "json") {
                    expect(logSpy).toHaveBeenCalledTimes(1);
                    expect(() => JSON.parse(logSpy.mock.calls[0][0] as string)).not.toThrow();
                } else {
                    expect(logSpy).toHaveBeenCalled();
                }
            } finally {
                logSpy.mockRestore();
                errorSpy.mockRestore();
            }
        },
    );
});

// The dispatcher-level contract that isn't any one command's own: --help/-h and an unrecognized
// command name (both resolved by resolveCliInvocation before any command is ever reached), plus
// --version (which has no dedicated top-level handling today — see CLI_TOP_LEVEL_DISPATCH_CASES'
// own comment on that case).
describe("CLI top-level dispatch contract (--help/-h, unknown command, --version)", () => {
    const commands = registerCommands();

    it.each(CLI_TOP_LEVEL_DISPATCH_CASES.map((testCase) => [testCase.label, testCase] as const))("%s", async (_label, testCase) => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const exitCode = await dispatch(commands, ["node", "pokie", ...testCase.argv]);
            expect(exitCode).toBe(testCase.expectedExitCode);

            if (testCase.expectedStdoutIsUsage) {
                expect(logSpy).toHaveBeenCalledTimes(1);
                expect(logSpy.mock.calls[0][0]).toBe(buildUsageText(commands));
                expect(errorSpy).not.toHaveBeenCalled();
            } else {
                expect(logSpy).not.toHaveBeenCalled();
                expect(errorSpy).toHaveBeenCalledTimes(1);
                expect(errorSpy.mock.calls[0][0]).toBe(testCase.expectedStderr);
            }
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });
});

// Ties this file's frozen validation/dispatch contract to the deep, per-command functional coverage
// (every accepted option value, every JSON output shape, actual file I/O) that already lives in
// tests/cli/commands/*.test.ts — one dedicated file per command class, by convention. That coverage
// isn't duplicated here — CLI_CONTRACT_CASES' own "valid" cases above are this file's real,
// executable evidence that every command's accepted path actually works end to end through
// dispatch(), not this file-existence check alone (a dedicated test file could exist and still not
// prove that, and its own absence wouldn't be caught by the checks above) — but silently deleting a
// command's dedicated test file would otherwise go unnoticed by everything else in this file, so it
// still gets its own guard.
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
