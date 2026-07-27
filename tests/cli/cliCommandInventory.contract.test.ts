import {
    computeFairnessCommitment,
    computeFairnessServerSeedCommitment,
    FairnessRoundProof,
    GamePackageGenerating,
    HtmlSimulationReportRenderer,
    MarkdownSimulationReportRenderer,
    OutcomeLibraryBundleReading,
    ParallelSimulationRunner,
    PokieGame,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    ReplayDescriptor,
    SimulationReport,
    SlotGameNameGenerator,
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

// Populated ONLY as a side effect of a case's own real dispatch() call actually running (the "CLI
// dispatch contract" describe block below) -- never before it. Every entry comes from one of two real,
// post-invocation sources: (1) an injected dependency argument the real, unstubbed command class
// threads the value through unmodified, recorded by observe() from inside that dependency's own
// callback while dispatch() is executing it, or (2) the actual stdout dispatch() produced, inspected
// after dispatch() resolves (see deriveObservedFormat() below). Nothing is ever written here from
// fixture metadata (e.g. testCase.expectStdout) or from a value this file merely expects -- only from
// what the dispatched invocation itself produced.
const OBSERVED_OPTION_VALUES = new Map<string, Record<string, string>>();

function observe(caseKey: string, flag: string, value: unknown): void {
    const values = OBSERVED_OPTION_VALUES.get(caseKey) ?? {};
    values[flag] = String(value);
    OBSERVED_OPTION_VALUES.set(caseKey, values);
}

// A small number of options have no dependency seam at all while their case's dispatch is running: the
// only thing distinguishing "default" from "accepted" is which of two dependencies never gets called
// (e.g. --dry-run/--no-open/--overwrite skip a callback entirely; an omitted --out skips a writeFile
// call the same way), so there is nothing for observe() to record from inside the invocation itself.
// registerCommandsForValidCases() registers a fallback value for exactly these (flag, case) pairs via
// recordIfSeamUnreached() below -- this is pure data, not a write into OBSERVED_OPTION_VALUES, so it
// changes nothing before dispatch() runs. Once a case's real dispatch() call has resolved with its
// expected exit code (the "CLI dispatch contract" describe block below, immediately after asserting
// that), each registered fallback is applied ONLY if that flag's own dependency callback still never
// fired during that real invocation (OBSERVED_OPTION_VALUES has no entry for it yet) -- i.e. the value
// is still derived from what the actual dispatched invocation did (or provably didn't do), just applied
// after the fact instead of assumed beforehand. If a regression makes the callback fire after all, its
// own observe() call already ran during dispatch() and this fallback is skipped, so the wrong value
// surfaces instead of being masked.
const SEAM_UNREACHED_FALLBACKS = new Map<string, Array<{flag: string; value: string}>>();

function recordIfSeamUnreached(caseKey: string, flag: string, value: string): void {
    const fallbacks = SEAM_UNREACHED_FALLBACKS.get(caseKey) ?? [];
    fallbacks.push({flag, value});
    SEAM_UNREACHED_FALLBACKS.set(caseKey, fallbacks);
}

function applyUnreachedSeamFallbacks(caseKey: string): void {
    for (const fallback of SEAM_UNREACHED_FALLBACKS.get(caseKey) ?? []) {
        if (OBSERVED_OPTION_VALUES.get(caseKey)?.[fallback.flag] === undefined) {
            observe(caseKey, fallback.flag, fallback.value);
        }
    }
}

// The handful of options whose whole effect is which of two deterministic stdout shapes a command
// prints (no dependency seam at all -- json vs a human summary, or --json vs printHuman) are observed
// from the ACTUAL stdout the "CLI dispatch contract" describe block's own console.log spy captured for
// that case, inspected after dispatch() resolves (see deriveObservedFormat() below) -- never from
// fixture metadata like testCase.expectStdout, so a regression that silently changes which shape a
// default/accepted value actually prints is caught here, not masked by an assumption about what it was
// supposed to print. One entry per command that has such an option; a command whose verb doesn't
// actually declare that flag (e.g. par export, stakeengine export/import) simply records a value the
// "CLI option value contract" block never reads for it, which is harmless. "replay" is the deliberate
// degenerate case: its --format is validated-but-inert (parsed, then never used -- run() always prints
// JSON), so both shapes map to the same "json".
const STDOUT_FORMAT_FLAGS: Record<string, {flag: string; jsonValue: string; nonJsonValue: string}> = {
    diff: {flag: "--format", jsonValue: "json", nonJsonValue: "summary"},
    name: {flag: "--json", jsonValue: "true", nonJsonValue: "false"},
    par: {flag: "--format", jsonValue: "json", nonJsonValue: "summary"},
    replay: {flag: "--format", jsonValue: "json", nonJsonValue: "json"},
    sim: {flag: "--format", jsonValue: "json", nonJsonValue: "summary"},
    stakeengine: {flag: "--format", jsonValue: "json", nonJsonValue: "summary"},
    validate: {flag: "--format", jsonValue: "json", nonJsonValue: "summary"},
};

// Derives an option's actual value from the real console.log calls dispatch() produced for this case
// (never from testCase.expectStdout): the entire captured stdout parses as JSON if and only if the
// command actually printed its machine-readable shape, which is the one real, runtime-observable
// difference every STDOUT_FORMAT_FLAGS command's format/json option controls.
function deriveObservedFormat(capturedStdout: string, config: {jsonValue: string; nonJsonValue: string}): string {
    try {
        JSON.parse(capturedStdout);
        return config.jsonValue;
    } catch {
        return config.nonJsonValue;
    }
}

// Builds the one stubbed CliCommandHandling instance a given "valid" CLI_CONTRACT_CASES entry
// (looked up by `${command}::${label}`, so a case with no matching builder fails loudly rather than
// silently skipping) runs through the real dispatch() — every dependency that would otherwise touch
// the filesystem, bind a port, or spawn a worker thread/subprocess is swapped for a fast,
// deterministic fake via that command class's own constructor injection points (the same points
// tests/cli/commands/*.test.ts already uses for its own per-command success-path tests); everything
// else (argv parsing, control flow, console output, exit code) is the real, unstubbed command class.
function registerCommandsForValidCases(): Map<string, CliCommandHandling> {
    const builders: Record<string, (key: string) => CliCommandHandling> = {
        "build::<config.json> (no --out, no --dry-run — writes via the injected generator using its own default output directory)": (key) =>
            new BuildCommand(
                TEST_VERSION,
                () => createStarterGameBlueprint(),
                undefined,
                // Non-dry-run build with no --out: the generator actually runs with outDir === undefined
                // (String(undefined) === "undefined"), and its being called at all is --dry-run's "false" evidence.
                stub<GamePackageGenerating>({
                    generate: (blueprint, cwd, outDir) => {
                        observe(key, "--out", outDir);
                        observe(key, "--dry-run", "false");
                        return {
                            createdFiles: ["package.json"],
                            projectRoot: "/fake/build-default-out",
                            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                            buildInfo: {blueprintHash: "hash-default", source: undefined},
                            unchanged: false,
                        };
                    },
                }),
            ),
        "build::<config.json> --dry-run validates and previews without writing anything (default, no --out)": (key) => {
            // --dry-run's accepted "true" has no dependency seam to observe directly (a real dry-run never
            // reaches generate() at all -- buildFromBlueprint returns before calling it): recordIfSeamUnreached
            // registers "true" as the value to apply once this case's own dispatch() has actually resolved
            // successfully with generate() never called; the injected generator below still throws if it's ever
            // wrongly invoked during a dry-run, which fails dispatch() itself rather than silently recording "false".
            recordIfSeamUnreached(key, "--dry-run", "true");
            return new BuildCommand(
                TEST_VERSION,
                () => createStarterGameBlueprint(),
                undefined,
                stub<GamePackageGenerating>({
                    generate: () => {
                        observe(key, "--dry-run", "false");
                        throw new Error("GamePackageGenerating.generate() must not run during --dry-run.");
                    },
                }),
            );
        },
        "build::<config.json> --out <dir> (accepted --out value, default --dry-run, writes via the injected generator)": (key) =>
            new BuildCommand(
                TEST_VERSION,
                () => createStarterGameBlueprint(),
                undefined,
                stub<GamePackageGenerating>({
                    generate: (blueprint, cwd, outDir) => {
                        observe(key, "--out", outDir);
                        observe(key, "--dry-run", "false");
                        return {
                            createdFiles: ["package.json"],
                            projectRoot: "/fake/build-out-dir",
                            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                            buildInfo: {blueprintHash: "hash-out", source: undefined},
                            unchanged: false,
                        };
                    },
                }),
            ),
        "build::--init-blueprint <file> writes the starter blueprint template": () =>
            new BuildCommand(TEST_VERSION, undefined, undefined, undefined, undefined, undefined, undefined, () => false, () => undefined),
        "build::random --seed <integer> --preset variant --dry-run (accepted --preset value)": (key) => {
            // --preset variant routes runRandom() to the variantRandomBlueprintGenerator (12th ctor param); wrapping
            // a real one keeps its output byte-identical while observing --seed/--preset at its own generate() seam.
            // --dry-run's accepted "true" and --out's default "undefined" have no dependency seam here (this
            // dry-run build never reaches the generate() seam at all), so both are registered as
            // recordIfSeamUnreached fallbacks, applied only once dispatch() actually resolves with generate()
            // never called; the throw-stub below still fails dispatch() outright if it's ever wrongly invoked.
            recordIfSeamUnreached(key, "--dry-run", "true");
            recordIfSeamUnreached(key, "--out", "undefined");
            const variantGenerator = new RandomGameBlueprintGenerator(new SlotGameNameGenerator(), new RandomGameBlueprintVariantStrategy());
            return new BuildCommand(
                TEST_VERSION,
                undefined,
                undefined,
                stub<GamePackageGenerating>({
                    generate: () => {
                        observe(key, "--dry-run", "false");
                        throw new Error("GamePackageGenerating.generate() must not run during a --dry-run random build.");
                    },
                }),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    generate: (input) => {
                        observe(key, "--seed", input?.seed);
                        observe(key, "--preset", "variant");
                        return variantGenerator.generate(input);
                    },
                },
            );
        },
        "build::random --seed <integer> --out <dir> (accepted --out value while --dry-run defaults to false, writes via the injected generator, runs the smoke simulation)": (key) => {
            // Non-dry-run random build (preset defaults, so runRandom() uses the randomBlueprintGenerator, 10th ctor
            // param): observes --out at GamePackageGenerating.generate()'s outDir, --dry-run "false" (generate ran),
            // and --preset "default" at the random generator's own seam; a real random build with a seed also runs
            // the post-build smoke simulation, hence the runSmoke stub.
            const defaultGenerator = new RandomGameBlueprintGenerator();
            return new BuildCommand(
                TEST_VERSION,
                undefined,
                undefined,
                stub<GamePackageGenerating>({
                    generate: (blueprint, cwd, outDir) => {
                        observe(key, "--out", outDir);
                        observe(key, "--dry-run", "false");
                        return {
                            createdFiles: ["package.json"],
                            projectRoot: "/fake/random-accepted-out",
                            manifest: {id: "random-slot-999", name: "Random Slot 999", version: "0.1.0"},
                            buildInfo: {blueprintHash: "hash-999", source: undefined},
                            unchanged: false,
                        };
                    },
                }),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    generate: (input) => {
                        observe(key, "--seed", input?.seed);
                        observe(key, "--preset", "default");
                        return defaultGenerator.generate(input);
                    },
                },
                () => Promise.resolve({ok: true, rounds: 200, roundsRequested: 200, rtp: 0.95, hitFrequency: 0.3, maxWin: 10, averageBet: 1}),
            );
        },
        "build::random --out <dir> --dry-run (accepted --out value, default --seed/--preset)": (key) => {
            // The --seed default (omitted) evidence for random: a dry-run build whose randomBlueprintGenerator (10th
            // ctor param) runs with seed undefined; dry-run means the GamePackageGenerating seam is never reached.
            const defaultGenerator = new RandomGameBlueprintGenerator();
            return new BuildCommand(
                TEST_VERSION,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    generate: (input) => {
                        observe(key, "--seed", input?.seed);
                        observe(key, "--preset", "default");
                        return defaultGenerator.generate(input);
                    },
                },
            );
        },
        "build::random --seed <integer> (default --dry-run/--out/--preset, writes via the injected generator, runs the smoke simulation)": () =>
            new BuildCommand(
                TEST_VERSION,
                undefined,
                undefined,
                stub<GamePackageGenerating>({
                    generate: () => ({
                        createdFiles: ["package.json"],
                        projectRoot: "/fake/random-out",
                        manifest: {id: "random-slot-777", name: "Random Slot 777", version: "0.1.0"},
                        buildInfo: {blueprintHash: "hash-777", source: undefined},
                        unchanged: false,
                    }),
                }),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                () => Promise.resolve({ok: true, rounds: 200, roundsRequested: 200, rtp: 0.95, hitFrequency: 0.3, maxWin: 10, averageBet: 1}),
            ),

        "certification::build <bundleDir> <config.json> (default --out)": (key) =>
            new CertificationCommand(
                TEST_VERSION,
                {
                    buildFromBundle: (bundleDir, modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["evidence.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", seed: "cert-seed", sampleCount: 10}]}),
            ),
        "certification::build <bundleDir> <config.json> --out <dir> (accepted --out value)": (key) =>
            new CertificationCommand(
                TEST_VERSION,
                {
                    buildFromBundle: (bundleDir, modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["evidence.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", seed: "cert-seed", sampleCount: 10}]}),
            ),
        "certification::verify <certDir> --source <bundleDir>": (key) =>
            new CertificationCommand(TEST_VERSION, undefined, {
                verify: (certDir, options) => {
                    observe(key, "--source", options?.sourceBundleDir);
                    return Promise.resolve([]);
                },
            }),

        "client::<packageRoot> (default host/port)": (key) =>
            new ClientCommand((clientRoot, options) => {
                observe(key, "--port", options.port);
                observe(key, "--host", options.host);
                observe(key, "--api-host", options.apiAddress?.host);
                observe(key, "--api-port", options.apiAddress?.port);
                return stubAddressServer(options.port ?? 4000);
            }),
        "client::<packageRoot> --port --host --api-host --api-port (accepted values)": (key) =>
            new ClientCommand((clientRoot, options) => {
                observe(key, "--port", options.port);
                observe(key, "--host", options.host);
                observe(key, "--api-host", options.apiAddress?.host);
                observe(key, "--api-port", options.apiAddress?.port);
                return stubAddressServer(options.port ?? 4444);
            }),

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
        "create::--random --seed <integer> (accepted --seed value, default --preset)": (key) => {
            // --seed/--preset reach runRandom()'s generator.generate({seed, overrides}) seam, where `generator` is
            // the randomBlueprintGenerator (3rd ctor param) for the default preset; wrapping a real one observes
            // both while keeping its (validated-by the real validator) output identical. The packageGenerator (5th)
            // and runSmoke (6th) stay stubbed exactly as before to keep the write/smoke steps side-effect-free.
            const defaultGenerator = new RandomGameBlueprintGenerator();
            return new CreateCommand(
                TEST_VERSION,
                undefined,
                {
                    generate: (input) => {
                        observe(key, "--seed", input?.seed);
                        observe(key, "--preset", "default");
                        return defaultGenerator.generate(input);
                    },
                },
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
            );
        },
        "create::--random --preset variant (accepted --preset value, default --seed)": (key) => {
            // --preset variant routes to the variantRandomBlueprintGenerator (7th ctor param); wrapping a real one
            // observes --preset "variant" and --seed's default (undefined) at its own generate() seam.
            const variantGenerator = new RandomGameBlueprintGenerator(new SlotGameNameGenerator(), new RandomGameBlueprintVariantStrategy());
            return new CreateCommand(
                TEST_VERSION,
                undefined,
                undefined,
                undefined,
                {
                    generate: () => ({
                        projectRoot: "/fake/variant-slot",
                        manifest: {id: "variant-slot", name: "Variant Slot", version: "0.1.0"},
                        createdFiles: [],
                        buildInfo: {
                            schemaVersion: 1,
                            generatedBy: "pokie",
                            pokieVersion: TEST_VERSION,
                            generatedAt: "2026-01-01T00:00:00.000Z",
                            blueprintHash: "hash-variant",
                            game: {id: "variant-slot", name: "Variant Slot", version: "0.1.0"},
                        },
                        unchanged: false,
                    }),
                },
                () => Promise.resolve({ok: true, rounds: 150, roundsRequested: 150, rtp: 0.95, hitFrequency: 0.3, maxWin: 10, averageBet: 1}),
                {
                    generate: (input) => {
                        observe(key, "--seed", input?.seed);
                        observe(key, "--preset", "variant");
                        return variantGenerator.generate(input);
                    },
                },
            );
        },

        "dev::<packageRoot> --no-open (skips the accepted-but-unexercised browser-open step)": (key) => {
            // --no-open's accepted "true" has no dependency seam of its own (openBrowser, which run() calls only
            // when !noOpen, is simply never invoked): recordIfSeamUnreached registers "true", applied only once
            // dispatch() actually resolves with openBrowser never called; the stub below still records "false" if
            // it's ever wrongly invoked, so a regression surfaces the wrong value instead of being masked. This
            // case is also the default (omitted) evidence for the four host/port options, observed for real at the
            // createApiServer/createClientServer seams.
            recordIfSeamUnreached(key, "--no-open", "true");
            return new DevCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (game, options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(5000);
                },
                {
                    createClientServer: (clientRoot, options) => {
                        observe(key, "--client-port", options.port);
                        observe(key, "--client-host", options.host);
                        return stubAddressServer(5100);
                    },
                    waitForHealth: () => Promise.resolve(),
                    openBrowser: () => {
                        observe(key, "--no-open", "false");
                    },
                    clientRoot: "/fake/client/root",
                    process: fakeProcess(),
                },
            );
        },
        "dev::<packageRoot> --port --host --client-port --client-host (accepted values, default --no-open)": (key) =>
            new DevCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (game, options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(5001);
                },
                {
                    createClientServer: (clientRoot, options) => {
                        observe(key, "--client-port", options.port);
                        observe(key, "--client-host", options.host);
                        return stubAddressServer(5101);
                    },
                    waitForHealth: () => Promise.resolve(),
                    openBrowser: () => {
                        observe(key, "--no-open", "false");
                    },
                    clientRoot: "/fake/client/root",
                    process: fakeProcess(),
                },
            ),

        "diff::<left> <right> --format json (accepted --format value, machine-readable shape)": (key) => {
            // --out is omitted here (this is its default evidence): DiffCommand only calls writeFile when
            // options.out is set, so the seam is structurally never reached; recordIfSeamUnreached registers
            // "undefined", applied only once dispatch() actually resolves with writeFile never called.
            recordIfSeamUnreached(key, "--out", "undefined");
            return new DiffCommand(() => JSON.stringify(SAMPLE_SIMULATION_REPORT));
        },
        "diff::<left> <right> --out <file> (accepted --out value, default --format summary)": (key) =>
            new DiffCommand(
                () => JSON.stringify(SAMPLE_SIMULATION_REPORT),
                (file) => {
                    observe(key, "--out", file);
                },
            ),

        "fairness::seed-commit <serverSeed.txt> (default, no --out — prints the commitment JSON)": (key) => {
            // --out default: emit() only calls writeFile when out !== undefined, so with no --out the seam is never
            // reached. --overwrite default "false": with no --out, emit()'s fileExists guard never runs either, so
            // neither flag's dependency ever fires in this case; both are recordIfSeamUnreached fallbacks, applied
            // only once dispatch() actually resolves with the corresponding dependency never called.
            recordIfSeamUnreached(key, "--out", "undefined");
            recordIfSeamUnreached(key, "--overwrite", "false");
            return new FairnessCommand(undefined, undefined, undefined, undefined, undefined, undefined, () => "server-seed-value\n");
        },
        "fairness::seed-commit <serverSeed.txt> --out --overwrite (accepted values)": (key) => {
            // --overwrite's accepted "true" has no dependency seam of its own: --overwrite short-circuits emit()'s
            // `!overwrite && fileExists(out)` guard so fileExists must NOT run; recordIfSeamUnreached registers
            // "true", applied only once dispatch() resolves with fileExists never called -- the stub below still
            // records "false" if it's ever wrongly invoked. --out's accepted value is observed for real at
            // writeFile's own path argument.
            recordIfSeamUnreached(key, "--overwrite", "true");
            return new FairnessCommand(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                () => "server-seed-value\n",
                () => {
                    observe(key, "--overwrite", "false");
                    return false;
                },
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            );
        },
        "fairness::commit <serverSeedCommitment.json> --client-seed --nonce --source --mode (accepted --nonce value)": (key) => {
            // --out/--overwrite defaults: same structurally-unreached seam as seed-commit's default case above.
            recordIfSeamUnreached(key, "--out", "undefined");
            recordIfSeamUnreached(key, "--overwrite", "false");
            return new FairnessCommand(
                undefined,
                // A genuinely valid FairnessServerSeedCommitment (real computeFairnessServerSeedCommitment
                // over an arbitrary string), since the real (unstubbed) computeFairnessCommitment this case
                // exercises validates its shape strictly — a hand-rolled placeholder object fails that check.
                () => computeFairnessServerSeedCommitment({serverSeed: "server-seed-value"}),
                stub<OutcomeLibraryBundleReading>({
                    readModeIndex: (sourceBundleDir, modeName) => {
                        observe(key, "--source", sourceBundleDir);
                        observe(key, "--mode", modeName);
                        return Promise.resolve({libraryId: "lib1", libraryHash: "hash1"});
                    },
                }),
                undefined,
                undefined,
                // --client-seed/--nonce reach computeCommitment(input) (6th ctor param); delegating to the real
                // computeFairnessCommitment keeps the resulting commitment genuinely valid.
                (input) => {
                    observe(key, "--client-seed", input.clientSeed);
                    observe(key, "--nonce", input.nonce);
                    return computeFairnessCommitment(input);
                },
            );
        },
        "fairness::commit <serverSeedCommitment.json> --client-seed --nonce --source --mode --out --overwrite (accepted values)": (key) => {
            // --overwrite's accepted "true": same no-seam case as seed-commit's own --overwrite accepted case above.
            recordIfSeamUnreached(key, "--overwrite", "true");
            return new FairnessCommand(
                undefined,
                () => computeFairnessServerSeedCommitment({serverSeed: "server-seed-value"}),
                stub<OutcomeLibraryBundleReading>({readModeIndex: () => Promise.resolve({libraryId: "lib1", libraryHash: "hash1"})}),
                undefined,
                undefined,
                undefined,
                undefined,
                () => {
                    observe(key, "--overwrite", "false");
                    return false;
                },
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            );
        },
        "fairness::reveal <commitment.json> --server-seed --source": (key) => {
            // --out/--overwrite defaults: same structurally-unreached seam as seed-commit's default case above.
            recordIfSeamUnreached(key, "--out", "undefined");
            recordIfSeamUnreached(key, "--overwrite", "false");
            return new FairnessCommand(
                undefined,
                () => ({}),
                undefined,
                // --source reaches proofBuilder.build(commitment, serverSeed, sourceBundleDir) (4th ctor param).
                {
                    build: (commitment, serverSeed, sourceBundleDir) => {
                        observe(key, "--source", sourceBundleDir);
                        return Promise.resolve(stub<FairnessRoundProof>({}));
                    },
                },
                undefined,
                undefined,
                // --server-seed reaches readTextFile(filePath) (7th ctor param).
                (filePath) => {
                    observe(key, "--server-seed", filePath);
                    return "revealed-seed\n";
                },
            );
        },
        "fairness::reveal <commitment.json> --server-seed --source --out --overwrite (accepted values)": (key) => {
            // --overwrite's accepted "true": same no-seam case as seed-commit's own --overwrite accepted case above.
            recordIfSeamUnreached(key, "--overwrite", "true");
            return new FairnessCommand(
                undefined,
                () => ({}),
                undefined,
                {build: () => Promise.resolve(stub<FairnessRoundProof>({}))},
                undefined,
                undefined,
                () => "revealed-seed\n",
                () => {
                    observe(key, "--overwrite", "false");
                    return false;
                },
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            );
        },
        "fairness::verify <proof.json> --commitment --source": (key) => {
            // runVerify() calls loadJson twice in order (proofPath, then commitmentPath); --commitment is the 2nd
            // call's path. --source reaches verifier.verify(proofCandidate, {commitment, sourceBundleDir}).
            let loadCount = 0;
            return new FairnessCommand(
                {
                    verify: (proofCandidate, context) => {
                        observe(key, "--source", context?.sourceBundleDir);
                        return Promise.resolve([]);
                    },
                },
                (filePath) => {
                    loadCount++;
                    if (loadCount === 2) {
                        observe(key, "--commitment", filePath);
                    }
                    return {};
                },
            );
        },

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

        // --count/--theme/--words/--seed reach the generator's generateUnique(count, request); wrapping a real
        // SlotGameNameGenerator observes each one while keeping the (deterministic, offline) output identical.
        // --json has no such seam and is derived from the real captured stdout instead (see STDOUT_FORMAT_FLAGS).
        "name::(no args — default count 1, human-readable output)": (key) => {
            const realNameGenerator = new SlotGameNameGenerator();
            return new NameCommand({
                generate: (request) => realNameGenerator.generate(request),
                generateUnique: (count, request) => {
                    observe(key, "--count", count);
                    observe(key, "--theme", request?.theme);
                    observe(key, "--words", request?.wordCount);
                    observe(key, "--seed", request?.seed);
                    return realNameGenerator.generateUnique(count, request);
                },
            });
        },
        "name::--json (machine-readable shape)": (key) => {
            const realNameGenerator = new SlotGameNameGenerator();
            return new NameCommand({
                generate: (request) => realNameGenerator.generate(request),
                generateUnique: (count, request) => {
                    observe(key, "--count", count);
                    observe(key, "--theme", request?.theme);
                    observe(key, "--words", request?.wordCount);
                    observe(key, "--seed", request?.seed);
                    return realNameGenerator.generateUnique(count, request);
                },
            });
        },
        "name::--count --theme --words --seed (accepted values)": (key) => {
            const realNameGenerator = new SlotGameNameGenerator();
            return new NameCommand({
                generate: (request) => realNameGenerator.generate(request),
                generateUnique: (count, request) => {
                    observe(key, "--count", count);
                    observe(key, "--theme", request?.theme);
                    observe(key, "--words", request?.wordCount);
                    observe(key, "--seed", request?.seed);
                    return realNameGenerator.generateUnique(count, request);
                },
            });
        },

        "outcomelibrary::build <config.json> (default --out)": (key) =>
            new OutcomeLibraryCommand(
                TEST_VERSION,
                {
                    writeToDirectory: (modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["config.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", libraryPath: "lib.json"}], libraryId: "lib1", schemaVersion: 1, outcomes: []}),
            ),
        "outcomelibrary::build <config.json> --out <dir> (accepted --out value)": (key) =>
            new OutcomeLibraryCommand(
                TEST_VERSION,
                {
                    writeToDirectory: (modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["config.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", libraryPath: "lib.json"}], libraryId: "lib1", schemaVersion: 1, outcomes: []}),
            ),
        "outcomelibrary::validate <bundleDir>": (key) =>
            new OutcomeLibraryCommand(TEST_VERSION, undefined, {
                validate: (bundleDir, options) => {
                    observe(key, "--deep", options?.deep);
                    return Promise.resolve([]);
                },
            }),
        "outcomelibrary::validate <bundleDir> --deep (accepted --deep flag)": (key) =>
            new OutcomeLibraryCommand(TEST_VERSION, undefined, {
                validate: (bundleDir, options) => {
                    observe(key, "--deep", options?.deep);
                    return Promise.resolve([]);
                },
            }),

        // par import always calls writeFile (5th ctor param), so --out is observed at its path argument in both
        // cases (default resolves to defaultBlueprintPath("input.xlsx")); --format is observed via stdout shape.
        "par::import <input.xlsx> --format json (accepted --format value, machine-readable shape)": (key) =>
            new ParCommand(
                TEST_VERSION,
                {importFromFile: () => Promise.resolve({blueprint: createStarterGameBlueprint(), provenance: undefined, issues: []})},
                undefined,
                undefined,
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            ),
        "par::import <input.xlsx> --out <file> (accepted --out value, default --format summary)": (key) =>
            new ParCommand(
                TEST_VERSION,
                {importFromFile: () => Promise.resolve({blueprint: createStarterGameBlueprint(), provenance: undefined, issues: []})},
                undefined,
                undefined,
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            ),
        // par export observes --out at exporter.exportToFile(blueprint, outPath, blueprintPath)'s 2nd argument
        // (default resolves to defaultParSheetPath("config.json")).
        "par::export <config.json> (default --out)": (key) =>
            new ParCommand(
                TEST_VERSION,
                undefined,
                {
                    exportToFile: (blueprint, outPath) => {
                        observe(key, "--out", outPath);
                        return Promise.resolve([]);
                    },
                },
                () => createStarterGameBlueprint(),
            ),
        "par::export <config.json> --out <file> (accepted --out value)": (key) =>
            new ParCommand(
                TEST_VERSION,
                undefined,
                {
                    exportToFile: (blueprint, outPath) => {
                        observe(key, "--out", outPath);
                        return Promise.resolve([]);
                    },
                },
                () => createStarterGameBlueprint(),
            ),

        // --round/--seed reach recorder.record({game, seed, round}); --out is observed at writeFile's path (called
        // only when options.out is set, so the omitted case registers a recordIfSeamUnreached fallback);
        // --format is derived from actual captured stdout (see STDOUT_FORMAT_FLAGS).
        "replay::<packageRoot> --round <number> (accepted --round value, prints the replay JSON)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new ReplayCommand(() => Promise.resolve(stub<PokieGame>({})), undefined, {
                record: (input) => {
                    observe(key, "--round", input.round);
                    observe(key, "--seed", input.seed);
                    return stub<ReplayDescriptor>({});
                },
            });
        },
        "replay::<packageRoot> --round --seed --out --format (accepted --seed/--out/--format values)": (key) =>
            new ReplayCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (filePath) => {
                    observe(key, "--out", filePath);
                },
                {
                    record: (input) => {
                        observe(key, "--round", input.round);
                        observe(key, "--seed", input.seed);
                        return stub<ReplayDescriptor>({});
                    },
                },
            ),

        // --format has a real seam: renderers.markdown/renderers.html are two independently swappable dependencies,
        // and which one's render() fires is the evidence (each delegates to a real renderer to keep output
        // identical). --out is observed at writeFile's path (called only when options.out is set, so the omitted
        // case registers a recordIfSeamUnreached fallback instead).
        "report::<simulationReportJson> (default --format markdown)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            const markdownRenderer = new MarkdownSimulationReportRenderer();
            const htmlRenderer = new HtmlSimulationReportRenderer();
            return new ReportCommand(
                () => JSON.stringify(SAMPLE_SIMULATION_REPORT),
                (filePath) => {
                    observe(key, "--out", filePath);
                },
                {
                    markdown: {
                        render: (report) => {
                            observe(key, "--format", "markdown");
                            return markdownRenderer.render(report);
                        },
                    },
                    html: {
                        render: (report) => {
                            observe(key, "--format", "html");
                            return htmlRenderer.render(report);
                        },
                    },
                },
            );
        },
        "report::<simulationReportJson> --format html --out <file> (accepted --format/--out values)": (key) => {
            const markdownRenderer = new MarkdownSimulationReportRenderer();
            const htmlRenderer = new HtmlSimulationReportRenderer();
            return new ReportCommand(
                () => JSON.stringify(SAMPLE_SIMULATION_REPORT),
                (filePath) => {
                    observe(key, "--out", filePath);
                },
                {
                    markdown: {
                        render: (report) => {
                            observe(key, "--format", "markdown");
                            return markdownRenderer.render(report);
                        },
                    },
                    html: {
                        render: (report) => {
                            observe(key, "--format", "html");
                            return htmlRenderer.render(report);
                        },
                    },
                },
            );
        },

        "serve::<packageRoot> (default host/port)": (key) =>
            new ServeCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (game, options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(4321);
                },
            ),
        "serve::<packageRoot> --port --host (accepted --port/--host values)": (key) =>
            new ServeCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (game, options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(options.port ?? 4321);
                },
            ),

        // --rounds/--seed/--workers/--mode and the four convergence flags all reach
        // createParallelSimulationRunner(packageRoot, rounds, options); --out is observed at writeFile's path
        // (called only when options.out is set, so the omitted cases register a recordIfSeamUnreached fallback
        // instead); --format is derived from actual captured stdout (see STDOUT_FORMAT_FLAGS).
        "sim::<packageRoot> --format json (machine-readable shape, default --rounds/--workers)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new SimCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                undefined,
                {build: () => SAMPLE_SIMULATION_REPORT},
                undefined,
                (packageRoot, rounds, options) => {
                    observe(key, "--rounds", rounds);
                    observe(key, "--seed", options.seed);
                    observe(key, "--workers", options.workers);
                    observe(key, "--mode", options.betModeId);
                    observe(key, "--min-rounds", options.convergence?.minRounds);
                    observe(key, "--rtp-tolerance", options.convergence?.rtpTolerance);
                    observe(key, "--check-interval", options.convergence?.checkIntervalRounds);
                    observe(key, "--stable-checks", options.convergence?.stableChecks);
                    return stub<ParallelSimulationRunner>({run: () => Promise.resolve({})});
                },
            );
        },
        "sim::<packageRoot> --rounds --seed --workers --mode --out (accepted values, default --format summary)": (key) =>
            new SimCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                (filePath) => {
                    observe(key, "--out", filePath);
                },
                {build: () => SAMPLE_SIMULATION_REPORT},
                undefined,
                (packageRoot, rounds, options) => {
                    observe(key, "--rounds", rounds);
                    observe(key, "--seed", options.seed);
                    observe(key, "--workers", options.workers);
                    observe(key, "--mode", options.betModeId);
                    observe(key, "--min-rounds", options.convergence?.minRounds);
                    observe(key, "--rtp-tolerance", options.convergence?.rtpTolerance);
                    observe(key, "--check-interval", options.convergence?.checkIntervalRounds);
                    observe(key, "--stable-checks", options.convergence?.stableChecks);
                    return stub<ParallelSimulationRunner>({run: () => Promise.resolve({})});
                },
            ),
        "sim::<packageRoot> --min-rounds --rtp-tolerance --check-interval --stable-checks (accepted convergence group)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new SimCommand(
                () => Promise.resolve(stub<PokieGame>({})),
                undefined,
                {build: () => SAMPLE_SIMULATION_REPORT},
                undefined,
                (packageRoot, rounds, options) => {
                    observe(key, "--rounds", rounds);
                    observe(key, "--seed", options.seed);
                    observe(key, "--workers", options.workers);
                    observe(key, "--mode", options.betModeId);
                    observe(key, "--min-rounds", options.convergence?.minRounds);
                    observe(key, "--rtp-tolerance", options.convergence?.rtpTolerance);
                    observe(key, "--check-interval", options.convergence?.checkIntervalRounds);
                    observe(key, "--stable-checks", options.convergence?.stableChecks);
                    return stub<ParallelSimulationRunner>({run: () => Promise.resolve({})});
                },
            );
        },

        // export observes --out at exporter.exportToDirectory(modes, outDir)'s 2nd argument (the libraryPath modes
        // take the plain-exporter path, not the streaming one); default resolves to path.join(".", "stakeengine").
        "stakeengine::export <config.json> (default --out)": (key) =>
            new StakeEngineCommand(
                TEST_VERSION,
                {
                    exportToDirectory: (modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["index.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", cost: 1, libraryPath: "lib.json"}]}),
            ),
        "stakeengine::export <config.json> --out <dir> (accepted --out value)": (key) =>
            new StakeEngineCommand(
                TEST_VERSION,
                {
                    exportToDirectory: (modes, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({outDir, files: ["index.json"], manifest: undefined, issues: []});
                    },
                },
                undefined,
                () => ({modes: [{modeName: "base", cost: 1, libraryPath: "lib.json"}]}),
            ),
        // import observes --out at importWriter.writeToDirectory(result, outDir)'s 2nd argument (5th ctor param);
        // default resolves to path.join(".", "stakeDir-imported").
        "stakeengine::import <stakeDir> (default --out)": (key) =>
            new StakeEngineCommand(
                TEST_VERSION,
                undefined,
                {importFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", manifest: undefined, modes: [], sourceProvenance: undefined, issues: []})},
                undefined,
                {
                    writeToDirectory: (result, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({issues: []});
                    },
                },
            ),
        "stakeengine::import <stakeDir> --out <dir> (accepted --out value)": (key) =>
            new StakeEngineCommand(
                TEST_VERSION,
                undefined,
                {importFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", manifest: undefined, modes: [], sourceProvenance: undefined, issues: []})},
                undefined,
                {
                    writeToDirectory: (result, outDir) => {
                        observe(key, "--out", outDir);
                        return Promise.resolve({issues: []});
                    },
                },
            ),
        // analyze/diff observe --out at writeFile (10th ctor param, called only when options.out is set, so the
        // omitted cases register a recordIfSeamUnreached fallback instead); --format is derived from actual
        // captured stdout (see STDOUT_FORMAT_FLAGS).
        "stakeengine::analyze <stakeDir> --format json (accepted --format value, machine-readable shape)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new StakeEngineCommand(TEST_VERSION, undefined, undefined, undefined, undefined, undefined, undefined, {
                readFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", modes: [], issues: []}),
            });
        },
        "stakeengine::analyze <stakeDir> --out <file> (accepted --out value, default --format summary)": (key) =>
            new StakeEngineCommand(
                TEST_VERSION,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {readFromDirectory: () => Promise.resolve({stakeDir: "stakeDir", modes: [], issues: []})},
                undefined,
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            ),
        "stakeengine::diff <leftStakeDir> <rightStakeDir> (no material difference -> the diff(1)-style exit 0)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new StakeEngineCommand(
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
            );
        },
        "stakeengine::diff <leftStakeDir> <rightStakeDir> --format json --out <file> (accepted --format/--out values)": (key) =>
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
                (filePath) => {
                    observe(key, "--out", filePath);
                },
                {diff: () => ({stakeDir: {left: "left", right: "right"}, onlyInLeft: [], onlyInRight: [], perMode: {}})},
            ),

        // --port/--host reach createServer(options); --no-open's accepted "true" has no dependency seam of its
        // own (openBrowser, which run() calls only when !noOpen, is simply never invoked), so it's a
        // recordIfSeamUnreached fallback, applied only once dispatch() resolves with openBrowser never called --
        // the stub below still records "false" if it's ever wrongly invoked.
        "studio::--no-open (home mode: no projectRoot given, skips the accepted-but-unexercised browser-open step)": (key) => {
            recordIfSeamUnreached(key, "--no-open", "true");
            return new StudioCommand(TEST_VERSION, {
                createServer: (options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(6100);
                },
                openBrowser: () => {
                    observe(key, "--no-open", "false");
                },
                process: fakeProcess(),
            });
        },
        "studio::--port --host (accepted values, default --no-open triggers the injected openBrowser stub)": (key) => {
            return new StudioCommand(TEST_VERSION, {
                createServer: (options) => {
                    observe(key, "--port", options.port);
                    observe(key, "--host", options.host);
                    return stubAddressServer(7000);
                },
                openBrowser: () => {
                    observe(key, "--no-open", "false");
                },
                process: fakeProcess(),
            });
        },

        // --out is observed at writeFile (2nd ctor param, called only when options.out is set, so the omitted
        // case registers a recordIfSeamUnreached fallback instead); --format is derived from actual captured
        // stdout (see STDOUT_FORMAT_FLAGS).
        "validate::<packageRoot> --format json (accepted --format value, machine-readable shape)": (key) => {
            recordIfSeamUnreached(key, "--out", "undefined");
            return new ValidateCommand({
                validate: () =>
                    Promise.resolve({packageRoot: "pkg", valid: true, game: {id: "pkg", name: "Pkg", version: "0.1.0"}, errors: [], warnings: [], suggestions: []}),
            });
        },
        "validate::<packageRoot> --out <file> (accepted --out value, default --format summary)": (key) =>
            new ValidateCommand(
                {
                    validate: () =>
                        Promise.resolve({packageRoot: "pkg", valid: true, game: {id: "pkg", name: "Pkg", version: "0.1.0"}, errors: [], warnings: [], suggestions: []}),
                },
                (filePath) => {
                    observe(key, "--out", filePath);
                },
            ),
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
        registry.set(key, build(key));
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

// Resolves which CliVerbDescriptor.verb a given CLI_CONTRACT_CASES entry's `args` actually exercises,
// mirroring each command's own real dispatch logic (never a second, hand-rolled *parser* — this only
// ever inspects `args[0]`/`args.includes(...)` the same shallow way each command's own run() does to
// pick a subcommand, and is used purely to bucket test-fixture cases for the coverage assertions
// below, never to assert behavior itself): a subcommand-style command (certification/fairness/
// outcomelibrary/par/stakeengine) always has its verb literal as `args[0]`; "build"/"create" each have
// one sentinel verb recognized by a flag rather than a positional ("--init-blueprint"/"random" for
// build, "--random" for create); every other command has exactly one verb (`undefined`).
function deriveVerbForCase(commandName: string, args: string[]): string | undefined {
    const descriptor = CLI_COMMAND_DESCRIPTORS.find((candidate) => candidate.name === commandName);
    if (!descriptor) {
        return undefined;
    }
    const verbLiterals = descriptor.verbs.map((verb) => verb.verb).filter((verb): verb is string => verb !== undefined);
    if (verbLiterals.length === 0) {
        return undefined;
    }
    if (verbLiterals.includes("--init-blueprint") && args[0] === "--init-blueprint") {
        return "--init-blueprint";
    }
    if (verbLiterals.includes("random") && args[0] === "random") {
        return "random";
    }
    if (verbLiterals.includes("--random") && args.includes("--random")) {
        return "--random";
    }
    if (args[0] !== undefined && verbLiterals.includes(args[0])) {
        return args[0];
    }
    return undefined;
}

type OptionCoverageGroup = {
    valid: CliContractCase[];
    invalid: Array<CliContractCase & {expectedError: string}>;
};

function groupCasesByVerb(commandName: string): Map<string | undefined, OptionCoverageGroup> {
    const groups = new Map<string | undefined, OptionCoverageGroup>();
    for (const testCase of CLI_CONTRACT_CASES) {
        if (testCase.command !== commandName) {
            continue;
        }
        const verb = deriveVerbForCase(commandName, testCase.args);
        const group = groups.get(verb) ?? {valid: [], invalid: []};
        if (testCase.kind === "valid") {
            group.valid.push(testCase);
        } else {
            group.invalid.push(testCase as CliContractCase & {expectedError: string});
        }
        groups.set(verb, group);
    }
    return groups;
}

// Derives, from CLI_COMMAND_DESCRIPTORS alone, exactly which executable evidence every declared
// option of every verb is required to have among CLI_CONTRACT_CASES — closing the gap the reviewer
// flagged: a declared option that exists only in a verb's `usage` string, with no case anywhere
// actually passing/rejecting it, previously went unnoticed. Every option requires "accepted" evidence
// (some valid case's args include its flag); a non-required option additionally requires "default"
// evidence (some valid case in the same verb group omits it); a required option requires
// "required-missing" evidence (some invalid case's error names the flag and says it's required); and
// a "validated" option additionally requires "rejected-value" evidence (some invalid case whose args
// include the flag and whose error names it). A "grouped" option (sim's convergence flags, whose
// required/rejected semantics are cross-field, not independently meaningful per flag — see
// CliOptionKind's own doc comment) only needs accepted+default, same as an "unvalidated" one.
describe("CLI option contract coverage (every declared option has executable evidence, derived from CLI_COMMAND_DESCRIPTORS)", () => {
    for (const descriptor of CLI_COMMAND_DESCRIPTORS) {
        const groups = groupCasesByVerb(descriptor.name);

        for (const verbDescriptor of descriptor.verbs) {
            const group = groups.get(verbDescriptor.verb) ?? {valid: [], invalid: []};
            const verbLabel = verbDescriptor.verb ?? "(default)";

            for (const option of verbDescriptor.options) {
                it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" has an accepted-value case`, () => {
                    expect(group.valid.some((testCase) => testCase.args.includes(option.flag))).toBe(true);
                });

                if (!option.required) {
                    it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" has a default (omitted) case`, () => {
                        expect(group.valid.some((testCase) => !testCase.args.includes(option.flag))).toBe(true);
                    });
                }

                if (option.required) {
                    it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" has a missing-required case`, () => {
                        const hasRequiredMissing = group.invalid.some(
                            (testCase) => testCase.expectedError.includes(option.flag) && testCase.expectedError.includes("required"),
                        );
                        expect(hasRequiredMissing).toBe(true);
                    });
                }

                if (option.kind === "validated") {
                    it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" has a rejected-value case`, () => {
                        const hasRejectedValue = group.invalid.some(
                            (testCase) => testCase.args.includes(option.flag) && testCase.expectedError.includes(option.flag),
                        );
                        expect(hasRejectedValue).toBe(true);
                    });
                }
            }
        }
    }
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

            const key = `${testCase.command}::${testCase.label}`;
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

                // Everything below only runs once the assertions above have already proven this exact case's
                // real dispatch() call resolved with its expected exit code and stream behavior -- so every
                // OBSERVED_OPTION_VALUES write from here on is derived strictly from what THIS invocation
                // actually produced, never from testCase's own fixture fields.
                const formatConfig = STDOUT_FORMAT_FLAGS[testCase.command];
                if (formatConfig) {
                    const capturedStdout = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
                    observe(key, formatConfig.flag, deriveObservedFormat(capturedStdout, formatConfig));
                }
                applyUnreachedSeamFallbacks(key);
            } finally {
                logSpy.mockRestore();
                errorSpy.mockRestore();
            }
        },
    );
});

// Closes the reviewer's gap: the "CLI option contract coverage" block above only proves each declared
// option has *some* case whose args mention its flag; this block proves the flag's actual VALUE (or,
// when omitted, its documented default) reaches the option's own command-observable seam. It reads
// OBSERVED_OPTION_VALUES, populated as a side effect of the "CLI dispatch contract" block above
// actually dispatching every valid case through the real, unstubbed command classes (see that Map's
// own doc comment) -- so this block is placed AFTER it, and Jest runs it()s in file-declaration order,
// guaranteeing the map is fully populated before any assertion here reads it.
describe("CLI option value contract (defaults/accepted values observed at the command's own seam)", () => {
    for (const descriptor of CLI_COMMAND_DESCRIPTORS) {
        const groups = groupCasesByVerb(descriptor.name);

        for (const verbDescriptor of descriptor.verbs) {
            const group = groups.get(verbDescriptor.verb) ?? {valid: [], invalid: []};
            const verbLabel = verbDescriptor.verb ?? "(default)";

            for (const option of verbDescriptor.options) {
                const acceptedCase = group.valid.find((testCase) => testCase.args.includes(option.flag));
                it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" resolves to its documented accepted value at the command's own seam`, () => {
                    if (!acceptedCase) {
                        throw new Error(`No valid case exercises "${option.flag}" for "${descriptor.name} ${verbLabel}".`);
                    }
                    const observed = OBSERVED_OPTION_VALUES.get(`${acceptedCase.command}::${acceptedCase.label}`);
                    expect(observed?.[option.flag]).toBe(option.acceptedValue);
                });

                if (!option.required) {
                    const defaultCase = group.valid.find((testCase) => !testCase.args.includes(option.flag));
                    it(`"${descriptor.name} ${verbLabel}"'s "${option.flag}" resolves to its documented default value at the command's own seam`, () => {
                        if (!defaultCase) {
                            throw new Error(`No valid case omits "${option.flag}" for "${descriptor.name} ${verbLabel}".`);
                        }
                        const observed = OBSERVED_OPTION_VALUES.get(`${defaultCase.command}::${defaultCase.label}`);
                        expect(observed?.[option.flag]).toBe(option.defaultValue);
                    });
                }
            }
        }
    }
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
