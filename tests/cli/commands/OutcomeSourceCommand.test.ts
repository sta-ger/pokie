import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleWriter,
    OutcomeSourceDiffResult,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceProjectReport,
    OutcomeSourceSampleResult,
    PokieProject,
    PreGeneratedOutcomeSelection,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ProjectTargetResolver,
    WeightedOutcomeRandomSource,
} from "pokie";
import {OutcomeSourceCommand} from "../../../cli/commands/OutcomeSourceCommand.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(project);
        },
    };
}

function stubProjectResolverByPath(byPath: Record<string, PokieProject | undefined>): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(byPath[targetPath]);
        },
    };
}

function stubDiff(result: OutcomeSourceDiffResult): ((left: PokieProject, right: PokieProject) => Promise<OutcomeSourceDiffResult>) & {calls: {left: PokieProject; right: PokieProject}[]} {
    const calls: {left: PokieProject; right: PokieProject}[] = [];
    const fn = (left: PokieProject, right: PokieProject) => {
        calls.push({left, right});
        return Promise.resolve(result);
    };
    return Object.assign(fn, {calls});
}

function stubAnalyzer(report: OutcomeSourceProjectReport): OutcomeSourceProjectAnalyzing & {calls: PokieProject[]} {
    const calls: PokieProject[] = [];
    return {
        calls,
        analyze(project: PokieProject) {
            calls.push(project);
            return Promise.resolve(report);
        },
    };
}

function stubSample(
    result: OutcomeSourceSampleResult,
): ((project: PokieProject, modeName: string, randomSource: WeightedOutcomeRandomSource) => Promise<OutcomeSourceSampleResult>) & {
    calls: {project: PokieProject; modeName: string}[];
} {
    const calls: {project: PokieProject; modeName: string}[] = [];
    const fn = (project: PokieProject, modeName: string) => {
        calls.push({project, modeName});
        return Promise.resolve(result);
    };
    return Object.assign(fn, {calls});
}

const outcomeLibraryProject: PokieProject = {
    type: "outcomeLibrary",
    rootPath: "/libraries/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    provenance: "test fixture",
};

const stakeAdapterProject: PokieProject = {
    type: "stakeAdapter",
    rootPath: "/stake/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    provenance: "test fixture",
};

const blueprintProject: PokieProject = {
    type: "blueprint",
    rootPath: "/blueprints/game.json",
    capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
    provenance: "test fixture",
};

function buildSelection(): PreGeneratedOutcomeSelection {
    return {
        libraryId: "base-lib",
        libraryHash: "hash-1234",
        totalWeight: 1000,
        outcome: {
            id: "2",
            weight: 150,
            artifact: {
                schemaVersion: 1,
                roundId: "base-lib-2",
                provenance: {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.3.0"},
                betMode: "base",
                stake: 1,
                totalWin: 5,
                payoutMultiplier: 5,
                screen: [["A"]],
                steps: [],
                wins: [],
            },
        },
    };
}

describe("OutcomeSourceCommand", () => {
    it("has the expected name and description", () => {
        const command = new OutcomeSourceCommand();

        expect(command.getName()).toBe("outcomesource");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a verb", async () => {
        const command = new OutcomeSourceCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie outcomesource inspect <path>/);
    });

    it("throws a descriptive error for an unrecognized verb", async () => {
        const command = new OutcomeSourceCommand();

        await expect(command.run(["bogus", "/some/path"])).rejects.toThrow(/Usage: pokie outcomesource inspect <path>/);
    });
});

describe("OutcomeSourceCommand inspect", () => {
    it("throws when the path does not resolve to a recognized project", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new OutcomeSourceCommand(resolveProject);

        await expect(command.run(["inspect", "/nowhere"])).rejects.toThrow(/does not resolve to a recognized POKIE project/);
        expect(resolveProject.calls).toEqual(["/nowhere"]);
    });

    it('throws the capability diagnostic for a resolved project that is not an outcome source (e.g. "blueprint")', async () => {
        const resolveProject = stubProjectResolver(blueprintProject);
        const command = new OutcomeSourceCommand(resolveProject);

        await expect(command.run(["inspect", "/blueprints/game.json"])).rejects.toThrow(
            /This Game Blueprint cannot analyze outcome data/,
        );
    });

    it('renders a canonical-reader-backed exact analysis, with limitations, for a resolved "outcomeLibrary" project', async () => {
        const report: OutcomeSourceProjectReport = {
            rootPath: "/libraries/base",
            descriptor: {kind: "native", streaming: true, limitations: ["never re-derives the game model that produced these outcomes"]},
            issues: [],
            modes: [
                {
                    modeName: "base",
                    analysis: {
                        totalWeight: 1000,
                        rtp: 0.955,
                        hitFrequency: 0.25,
                        zeroWinFrequency: 0.75,
                        variance: 0.1,
                        standardDeviation: 0.3162,
                        maxWin: 500,
                        maxWinProbability: 0.001,
                        payoutDistribution: [],
                    },
                },
            ],
        };
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const analyzer = stubAnalyzer(report);
        const command = new OutcomeSourceCommand(resolveProject, analyzer);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["inspect", "/libraries/base"]);

        expect(analyzer.calls).toEqual([outcomeLibraryProject]);
        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('"/libraries/base" is a "native" canonical outcome source (streaming: true).');
        expect(printed).toContain("never re-derives the game model that produced these outcomes");
        expect(printed).toContain('mode "base": rtp 95.50%, hit frequency 25.00%');

        logSpy.mockRestore();
    });

    it("exits 1 and prints structural issues instead of an exact analysis when the source is malformed", async () => {
        const report: OutcomeSourceProjectReport = {
            rootPath: "/libraries/broken",
            descriptor: {kind: "native", streaming: true, limitations: []},
            issues: [{code: "outcome-library-bundle-manifest-invalid-json", severity: "error", message: "manifest.json is not valid JSON."}],
            modes: [],
        };
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const analyzer = stubAnalyzer(report);
        const command = new OutcomeSourceCommand(resolveProject, analyzer);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["inspect", "/libraries/broken"]);

        expect(exitCode).toBe(1);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("1 issue(s) found while reading it:");
        expect(printed).not.toContain("Exact analysis");

        logSpy.mockRestore();
    });
});

describe("OutcomeSourceCommand sample", () => {
    it("throws when --mode is omitted", async () => {
        const command = new OutcomeSourceCommand();

        await expect(command.run(["sample", "/libraries/base"])).rejects.toThrow(/--mode is required/);
    });

    it("throws when the path does not resolve to a recognized project", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new OutcomeSourceCommand(resolveProject);

        await expect(command.run(["sample", "/nowhere", "--mode", "base"])).rejects.toThrow(/does not resolve to a recognized POKIE project/);
    });

    it("draws an outcome from a resolved native outcome-library project through the injected sampler, and prints it", async () => {
        const selection = buildSelection();
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const sample = stubSample({supported: true, selection});
        const command = new OutcomeSourceCommand(resolveProject, undefined, sample);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["sample", "/libraries/base", "--mode", "base"]);

        expect(sample.calls).toEqual([{project: outcomeLibraryProject, modeName: "base"}]);
        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Drew outcome "2" from "/libraries/base" (library "base-lib", hash "hash-1234").');
        expect(printed).toContain("payout multiplier 5");

        logSpy.mockRestore();
    });

    it("passes a seeded random source through when --seed is given, for reproducible draws", async () => {
        const selection = buildSelection();
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const sample = stubSample({supported: true, selection});
        const seeds: (string | undefined)[] = [];
        const buildRandomSource = (seed?: string): WeightedOutcomeRandomSource => {
            seeds.push(seed);
            return {nextInt: () => 0};
        };
        const command = new OutcomeSourceCommand(resolveProject, undefined, sample, buildRandomSource);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sample", "/libraries/base", "--mode", "base", "--seed", "demo-seed"]);

        expect(seeds).toEqual(["demo-seed"]);

        (console.log as jest.Mock).mockRestore();
    });

    it("throws the capability diagnostic, rather than attempting package-runtime execution, for a resolved Stake Engine project", async () => {
        const resolveProject = stubProjectResolver(stakeAdapterProject);
        const sample = stubSample({
            supported: false,
            diagnostic: {
                detectedType: "stakeAdapter",
                operation: "outcomeSource.sample",
                missingCapability: "outcomeSource.sample",
                alternatives: ["outcomeLibrary"],
                message: 'This Stake Engine export cannot sample an outcome. You can sample an outcome with Outcome Library. Run "pokie inspect <path>" to see available next actions.',
            },
        });
        const command = new OutcomeSourceCommand(resolveProject, undefined, sample);

        await expect(command.run(["sample", "/stake/base", "--mode", "base"])).rejects.toThrow(
            /This Stake Engine export cannot sample an outcome/,
        );
    });
});

describe("OutcomeSourceCommand diff", () => {
    it("throws when the left path does not resolve to a recognized project", async () => {
        const resolveProject = stubProjectResolverByPath({"/nowhere": undefined, "/libraries/base": outcomeLibraryProject});
        const command = new OutcomeSourceCommand(resolveProject);

        await expect(command.run(["diff", "/nowhere", "/libraries/base"])).rejects.toThrow(/"\/nowhere" does not resolve to a recognized POKIE project/);
    });

    it("throws when the right path does not resolve to a recognized project", async () => {
        const resolveProject = stubProjectResolverByPath({"/libraries/base": outcomeLibraryProject, "/nowhere": undefined});
        const command = new OutcomeSourceCommand(resolveProject);

        await expect(command.run(["diff", "/libraries/base", "/nowhere"])).rejects.toThrow(/"\/nowhere" does not resolve to a recognized POKIE project/);
    });

    it("diffs two resolved outcome-source projects through the injected differ, and prints a summary", async () => {
        const resolveProject = stubProjectResolverByPath({"/libraries/left": outcomeLibraryProject, "/stake/right": stakeAdapterProject});
        const diffResult: OutcomeSourceDiffResult = {
            supported: true,
            diff: {
                left: {rootPath: "/libraries/left", kind: "native", issues: []},
                right: {rootPath: "/stake/right", kind: "stakeEngine", issues: []},
                perMode: {
                    base: {
                        modeName: "base",
                        rtp: {left: 0.9, right: 0.95, delta: 0.05, percentDelta: 5.56},
                        hitFrequency: {left: 0.25, right: 0.3, delta: 0.05, percentDelta: 20},
                        zeroWinFrequency: {left: 0.75, right: 0.7, delta: -0.05, percentDelta: -6.67},
                        variance: {left: 0.1, right: 0.1, delta: 0, percentDelta: 0},
                        standardDeviation: {left: 0.3162, right: 0.3162, delta: 0, percentDelta: 0},
                        maxWinProbability: {left: 0.001, right: 0.001, delta: 0, percentDelta: 0},
                    },
                },
                onlyInLeft: [],
                onlyInRight: [],
            },
        };
        const diff = stubDiff(diffResult);
        const command = new OutcomeSourceCommand(resolveProject, undefined, undefined, undefined, diff);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["diff", "/libraries/left", "/stake/right"]);

        expect(diff.calls).toEqual([{left: outcomeLibraryProject, right: stakeAdapterProject}]);
        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diffing "/libraries/left" (native) -> "/stake/right" (stakeEngine)');
        expect(printed).toContain('Mode "base":');

        logSpy.mockRestore();
    });

    it("throws the capability diagnostic, rather than diffing, when either side is unsupported", async () => {
        const resolveProject = stubProjectResolverByPath({"/blueprints/game.json": blueprintProject, "/libraries/base": outcomeLibraryProject});
        const diff = stubDiff({
            supported: false,
            diagnostic: {
                detectedType: "blueprint",
                operation: "outcomeSource.diff",
                missingCapability: "outcomeSource.read",
                alternatives: ["outcomeLibrary", "stakeAdapter"],
                message: 'This Game Blueprint cannot compare outcome sources. You can compare outcome sources with Outcome Library or Stake Engine export. Run "pokie inspect <path>" to see available next actions.',
            },
        });
        const command = new OutcomeSourceCommand(resolveProject, undefined, undefined, undefined, diff);

        await expect(command.run(["diff", "/blueprints/game.json", "/libraries/base"])).rejects.toThrow(
            /This Game Blueprint cannot compare outcome sources/,
        );
    });

    it("exits 1 when either side's own canonical reader reported structural issues", async () => {
        const resolveProject = stubProjectResolverByPath({"/libraries/left": outcomeLibraryProject, "/libraries/right": outcomeLibraryProject});
        const diff = stubDiff({
            supported: true,
            diff: {
                left: {rootPath: "/libraries/left", kind: "native", issues: [{code: "outcome-library-bundle-manifest-invalid-json", severity: "error", message: "boom"}]},
                right: {rootPath: "/libraries/right", kind: "native", issues: []},
                perMode: {},
                onlyInLeft: [],
                onlyInRight: [],
            },
        });
        const command = new OutcomeSourceCommand(resolveProject, undefined, undefined, undefined, diff);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["diff", "/libraries/left", "/libraries/right"]);

        expect(exitCode).toBe(1);
        (console.log as jest.Mock).mockRestore();
    });
});

// Real, non-stubbed end-to-end coverage: both verbs pointed straight at a real, on-disk outcome-library
// bundle (built by "pokie outcomelibrary build", not mocked), resolved and served through the same
// ProjectTargetResolver/OutcomeSourceProjectAnalyzer/sampleOutcomeSourceProject path the unit tests above stub
// out.
describe("OutcomeSourceCommand (integration, real outcome-library bundle)", () => {
    let bundleDir: string;

    beforeEach(async () => {
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomesource-command-test-"));
        fs.rmdirSync(bundleDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
    });

    afterEach(() => {
        fs.rmSync(bundleDir, {recursive: true, force: true});
    });

    it('renders a real bundle\'s exact analysis via "pokie outcomesource inspect"', async () => {
        const command = new OutcomeSourceCommand(new ProjectTargetResolver());
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["inspect", bundleDir]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('is a "native" canonical outcome source (streaming: true)');
        expect(printed).toContain('mode "base":');

        logSpy.mockRestore();
    });

    it('draws a real outcome, through the real selector, via "pokie outcomesource sample"', async () => {
        const command = new OutcomeSourceCommand(new ProjectTargetResolver());
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["sample", bundleDir, "--mode", "base", "--seed", "sample-seed"]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain(`Drew outcome "`);
        expect(printed).toContain('from "' + bundleDir + '" (library "base-lib"');

        logSpy.mockRestore();
    });

    it('diffs a real bundle against itself, through the real differ, via "pokie outcomesource diff"', async () => {
        const command = new OutcomeSourceCommand(new ProjectTargetResolver());
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        const exitCode = await command.run(["diff", bundleDir, bundleDir]);

        expect(exitCode).toBe(0);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain(`Diffing "${bundleDir}" (native) -> "${bundleDir}" (native)`);
        expect(printed).toContain('Mode "base":');

        logSpy.mockRestore();
    });
});
