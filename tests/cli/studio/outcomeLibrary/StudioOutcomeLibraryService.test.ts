import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    OutcomeLibraryBundleManifest,
    OutcomeLibraryBundleModeIndex,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleValidating,
    RoundArtifactProvenance,
    StakeEngineExportModeInput,
    StakeEngineImporting,
    StakeEngineImportResult,
    ValidationIssue,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryAnalyzer,
    WinEvaluationResult,
} from "pokie";
import {StudioOutcomeLibraryService} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryService.js";
import type {OutcomeLibrarySelector} from "../../../../cli/studio/outcomeLibrary/OutcomeLibrarySelector.js";

const identityRealpath = (resolvedPath: string): string => resolvedPath;
const testProvenance: RoundArtifactProvenance = {game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}, pokieVersion: "1.3.0"};

function testLibrary(libraryId: string, outcomeCount = 1): WeightedOutcomeLibrary<string> {
    const outcomes = Array.from({length: outcomeCount}, (_, index) => ({
        id: String(index).padStart(4, "0"),
        weight: 1,
        artifact: buildRoundArtifact({
            roundId: `${libraryId}-${index}`,
            provenance: testProvenance,
            betMode: "base",
            stake: 1,
            steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
        }),
    }));
    return buildWeightedOutcomeLibrary({libraryId, outcomes});
}

class FakeBundleReader implements OutcomeLibraryBundleReading<string> {
    private readonly manifest: OutcomeLibraryBundleManifest;
    private readonly library: WeightedOutcomeLibrary<string>;

    constructor(manifest: OutcomeLibraryBundleManifest, library: WeightedOutcomeLibrary<string>) {
        this.manifest = manifest;
        this.library = library;
    }

    public readManifest(): Promise<OutcomeLibraryBundleManifest> {
        return Promise.resolve(this.manifest);
    }

    public readModeIndex(): Promise<OutcomeLibraryBundleModeIndex> {
        throw new Error("not used in these tests");
    }

    public iterateModeOutcomes(): AsyncIterable<never> {
        throw new Error("not used in these tests");
    }

    public readOutcomeById(): Promise<undefined> {
        return Promise.resolve(undefined);
    }

    public drawOutcome(): Promise<never> {
        throw new Error("not used in these tests");
    }

    public readLibrary(_bundleDir: string, modeName: string): Promise<WeightedOutcomeLibrary<string>> {
        if (!this.manifest.modes.some((mode) => mode.modeName === modeName)) {
            throw new Error(`unknown mode "${modeName}"`);
        }
        return Promise.resolve(this.library);
    }
}

class FailingBundleReader implements OutcomeLibraryBundleReading<string> {
    public readManifest(): Promise<OutcomeLibraryBundleManifest> {
        throw new Error("ENOENT: no such directory");
    }

    public readModeIndex(): Promise<OutcomeLibraryBundleModeIndex> {
        throw new Error("not used in these tests");
    }

    public iterateModeOutcomes(): AsyncIterable<never> {
        throw new Error("not used in these tests");
    }

    public readOutcomeById(): Promise<undefined> {
        return Promise.resolve(undefined);
    }

    public drawOutcome(): Promise<never> {
        throw new Error("not used in these tests");
    }

    public readLibrary(): Promise<WeightedOutcomeLibrary<string>> {
        throw new Error("ENOENT: no such directory");
    }
}

class FakeBundleValidator implements OutcomeLibraryBundleValidating {
    private readonly issues: ValidationIssue[];

    constructor(issues: ValidationIssue[]) {
        this.issues = issues;
    }

    public validate(): Promise<ValidationIssue[]> {
        return Promise.resolve(this.issues);
    }
}

class FakeStakeEngineImporter implements StakeEngineImporting<string> {
    private readonly result: StakeEngineImportResult<string>;

    constructor(result: StakeEngineImportResult<string>) {
        this.result = result;
    }

    public importFromDirectory(): Promise<StakeEngineImportResult<string>> {
        return Promise.resolve(this.result);
    }
}

function bundleManifest(overrides: Partial<OutcomeLibraryBundleManifest> = {}): OutcomeLibraryBundleManifest {
    const analyzer = new WeightedOutcomeLibraryAnalyzer<string>();
    return {
        schemaVersion: 1,
        generatedBy: "pokie outcomelibrary build",
        pokieVersion: "1.3.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        configHash: "sha256:config",
        artifactPokieVersion: "1.3.0",
        modes: [
            {
                modeName: "base",
                betMode: "base",
                stake: 1,
                libraryId: "lib-bundle",
                libraryHash: "sha256:whatever",
                outcomeCount: 1,
                totalWeight: 1,
                analysis: analyzer.analyze(testLibrary("lib-bundle")),
                indexFile: "index_base.json",
                outcomesFile: "outcomes_base.jsonl",
            },
        ],
        files: ["manifest.json", "index_base.json", "outcomes_base.jsonl"],
        ...overrides,
    };
}

function jsonSelector(path: string): OutcomeLibrarySelector {
    return {kind: "json", path};
}

describe("StudioOutcomeLibraryService", () => {
    describe("select — json source", () => {
        it("returns provenance/analysis/featureBreakdown/sample for a valid library file", async () => {
            const library = testLibrary("lib-json");
            const readFile = () => JSON.stringify(library);
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.select("/project", jsonSelector("lib.json"));

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.provenance.source).toBe("json");
            expect(view.provenance.libraryId).toBe("lib-json");
            expect(view.provenance.outcomeCount).toBe(1);
            expect(view.provenance.hash).toMatch(/^sha256:/);
            expect(view.provenance.game).toBeUndefined();
            expect(view.errors).toEqual([]);
            expect(view.analysis.rtp).toBe(0);
            expect(view.featureBreakdown.betModes).toEqual([{key: "base", weightedFrequency: 1, outcomeCount: 1}]);
            expect(view.sampleOutcomes).toHaveLength(1);
            expect(view.sampleTruncated).toBe(false);
        });

        it("truncates the sample to the first 20 outcomes for a larger library", async () => {
            const library = testLibrary("lib-large", 25);
            const readFile = () => JSON.stringify(library);
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.select("/project", jsonSelector("lib.json"));

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.provenance.outcomeCount).toBe(25);
            expect(view.sampleOutcomes).toHaveLength(20);
            expect(view.sampleTruncated).toBe(true);
        });

        it("reports invalid, with no analysis, for a library that fails validation", async () => {
            const malformed = {schemaVersion: 1, libraryId: "", outcomes: []};
            const readFile = () => JSON.stringify(malformed);
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.select("/project", jsonSelector("lib.json"));

            expect(view.status).toBe("invalid");
            if (view.status !== "invalid") throw new Error("expected invalid");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports load-error for a path that resolves outside the project root", async () => {
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", jsonSelector("../outside.json"));

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain("outside the project root");
        });

        it("reports load-error for invalid JSON content", async () => {
            const readFile = () => "not json";
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.select("/project", jsonSelector("lib.json"));

            expect(view.status).toBe("load-error");
        });
    });

    describe("select — bundle source", () => {
        it("returns the manifest's game/configHash/pokieVersion as provenance envelope", async () => {
            const library = testLibrary("lib-bundle");
            const bundleReader = new FakeBundleReader(bundleManifest(), library);
            const service = new StudioOutcomeLibraryService(bundleReader, undefined, undefined, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", {kind: "bundle", bundleDir: "bundle", modeName: "base"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.provenance.source).toBe("bundle");
            expect(view.provenance.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
            expect(view.provenance.configHash).toBe("sha256:config");
            expect(view.provenance.pokieVersion).toBe("1.3.0");
        });

        it("reports load-error when the bundle directory can't be read", async () => {
            const service = new StudioOutcomeLibraryService(new FailingBundleReader(), undefined, undefined, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", {kind: "bundle", bundleDir: "bundle", modeName: "base"});

            expect(view.status).toBe("load-error");
        });
    });

    describe("select — stakeengine source", () => {
        it("returns the library for the requested mode when the import succeeds", async () => {
            const library = testLibrary("lib-stake");
            const importer = new FakeStakeEngineImporter({
                stakeDir: "/project/stake",
                manifest: {
                    schemaVersion: 1,
                    generatedBy: "pokie stakeengine export",
                    pokieVersion: "1.3.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                    modes: [{name: "base", betMode: "base", stake: 1, cost: 1, outcomeCount: 1, libraryId: "lib-stake", libraryHash: "sha256:x", events: "base.events.jsonl.zst", weights: "base.csv"}],
                    files: [],
                },
                modes: [{modeName: "base", cost: 1, library}] as StakeEngineExportModeInput<string>[],
                sourceProvenance: undefined,
                issues: [{code: "stakeengine-import-library-hash-differs-from-manifest", severity: "info", message: "hash differs, as expected"}],
            });
            const service = new StudioOutcomeLibraryService(undefined, undefined, importer, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", {kind: "stakeengine", stakeDir: "stake", modeName: "base"});

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.provenance.source).toBe("stakeengine");
            // The importer's own expected "hash differs" info issue is surfaced as a warning, never dropped.
            expect(view.warnings.some((issue) => issue.code === "stakeengine-import-library-hash-differs-from-manifest")).toBe(true);
        });

        it("reports load-error when the import itself has blocking issues (e.g. missing pokie-manifest.json)", async () => {
            const importer = new FakeStakeEngineImporter({
                stakeDir: "/project/stake",
                manifest: undefined,
                modes: [],
                sourceProvenance: undefined,
                issues: [{code: "stakeengine-import-manifest-missing", severity: "error", message: "pokie-manifest.json is missing."}],
            });
            const service = new StudioOutcomeLibraryService(undefined, undefined, importer, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", {kind: "stakeengine", stakeDir: "stake", modeName: "base"});

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain("pokie-manifest.json is missing.");
        });

        it("reports load-error when the requested mode isn't among the imported modes", async () => {
            const library = testLibrary("lib-stake");
            const importer = new FakeStakeEngineImporter({
                stakeDir: "/project/stake",
                manifest: undefined,
                modes: [{modeName: "bonus", cost: 1, library}] as StakeEngineExportModeInput<string>[],
                sourceProvenance: undefined,
                issues: [],
            });
            const service = new StudioOutcomeLibraryService(undefined, undefined, importer, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.select("/project", {kind: "stakeengine", stakeDir: "stake", modeName: "base"});

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain('Mode "base"');
        });
    });

    describe("compare", () => {
        it("returns a diff when both sides load successfully", async () => {
            const left = testLibrary("lib-left");
            const right = testLibrary("lib-right");
            let call = 0;
            const readFile = () => JSON.stringify(call++ === 0 ? left : right);
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.compare("/project", jsonSelector("left.json"), jsonSelector("right.json"));

            expect(view.left.status).toBe("ok");
            expect(view.right.status).toBe("ok");
            expect(view.diff).toBeDefined();
            expect(view.diff?.rtp.left).toBe(0);
            expect(view.diff?.rtp.right).toBe(0);
        });

        it("omits the diff when one side is invalid, but still reports both views", async () => {
            const validLibrary = testLibrary("lib-left");
            const malformed = {schemaVersion: 1, libraryId: "", outcomes: []};
            let call = 0;
            const readFile = () => JSON.stringify(call++ === 0 ? validLibrary : malformed);
            const service = new StudioOutcomeLibraryService(undefined, undefined, undefined, undefined, undefined, undefined, readFile, identityRealpath);

            const view = await service.compare("/project", jsonSelector("left.json"), jsonSelector("right.json"));

            expect(view.left.status).toBe("ok");
            expect(view.right.status).toBe("invalid");
            expect(view.diff).toBeUndefined();
        });
    });

    describe("validateBundleDeep", () => {
        it("splits deep-validation issues by severity", async () => {
            const bundleReader = new FakeBundleReader(bundleManifest(), testLibrary("lib-bundle"));
            const bundleValidator = new FakeBundleValidator([
                {code: "some-warning", severity: "warning", message: "a warning"},
                {code: "some-error", severity: "error", message: "an error"},
            ]);
            const service = new StudioOutcomeLibraryService(bundleReader, bundleValidator, undefined, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.validateBundleDeep("/project", "bundle", "base");

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toHaveLength(1);
            expect(view.warnings).toHaveLength(1);
        });

        it("reports load-error when the requested mode isn't in the bundle manifest", async () => {
            const bundleReader = new FakeBundleReader(bundleManifest(), testLibrary("lib-bundle"));
            const bundleValidator = new FakeBundleValidator([]);
            const service = new StudioOutcomeLibraryService(bundleReader, bundleValidator, undefined, undefined, undefined, undefined, undefined, identityRealpath);

            const view = await service.validateBundleDeep("/project", "bundle", "bonus");

            expect(view.status).toBe("load-error");
        });
    });
});
