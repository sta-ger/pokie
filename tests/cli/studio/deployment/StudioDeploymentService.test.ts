import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    ExternalArtifactGenerationResult,
    ExternalDeploymentProjectedModeInput,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    OutcomeLibraryBundleManifest,
    OutcomeLibraryBundleModeIndex,
    OutcomeLibraryBundleReading,
    RoundArtifact,
    RoundArtifactProvenance,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryAnalyzer,
    WinEvaluationResult,
} from "pokie";
import {StudioDeploymentService} from "../../../../cli/studio/deployment/StudioDeploymentService.js";
import type {ValidatedDeploymentRunRequest} from "../../../../cli/studio/deployment/validateDeploymentRunRequest.js";

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

class NoOpRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, never> {
        return {};
    }
}

function stubGenerator() {
    return {
        generate: (_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult => ({
            artifacts: [{relativePath: "index.json", content: "{}"}],
            issues: [],
        }),
    };
}

function stubTarget(overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id: "local-json-example",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new NoOpRoundProjector(),
        artifactGenerator: stubGenerator(),
        ...overrides,
    };
}

function testLibrary(): WeightedOutcomeLibrary {
    const provenance: RoundArtifactProvenance = {game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, pokieVersion: "1.0.0"};
    const artifact = buildRoundArtifact({
        roundId: "lib-0",
        provenance,
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult()}],
    });
    return buildWeightedOutcomeLibrary({libraryId: "lib", outcomes: [{id: "0", weight: 1, artifact}]});
}

function runRequest(overrides: Partial<ValidatedDeploymentRunRequest> = {}): ValidatedDeploymentRunRequest {
    return {targetId: "local-json-example", modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}], publish: false, ...overrides};
}

// These tests use a fake, never-created-on-disk "/project" as the project root, paired with an
// injected `readFile` — this stands in for the real fs.realpathSync too (which would otherwise reject
// "/project" outright as a nonexistent path), so containment checking never needs a real project
// directory just to exercise unrelated behavior.
const identityRealpath = (resolvedPath: string): string => resolvedPath;

// The real resolveCurrentBuildModeIds default would try to actually load "/project" as a built pokie
// package (see resolveCurrentBuildModeIds.ts) and fail, which run() now treats as a rejection (see
// StudioDeploymentService's own doc comment) -- every test below that isn't specifically exercising that
// current-build-modes check supplies this stand-in instead, so it isn't accidentally exercised as a side
// effect of an unrelated scenario.
const buildModeIdsIncludingBase = () => Promise.resolve(["base"] as readonly string[] | undefined);

describe("StudioDeploymentService", () => {
    it("lists the injected target's own id/version/requirements/capabilities", () => {
        const target = stubTarget({requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]});
        const service = new StudioDeploymentService(undefined, () => target);

        const targets = service.listTargets("/project");

        expect(targets).toEqual([{id: "local-json-example", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]}]);
    });

    it("returns target-not-found for an unregistered targetId", async () => {
        const service = new StudioDeploymentService(undefined, () => stubTarget());

        const result = await service.run("/project", runRequest({targetId: "does-not-exist"}));

        expect(result).toEqual({status: "target-not-found"});
    });

    it("rejects a mode absent from the active project's own current build, without ever reading its library", async () => {
        const readFile = jest.fn(() => {
            throw new Error("library file should not be read for a rejected mode");
        });
        const service = new StudioDeploymentService(undefined, () => stubTarget(), readFile, identityRealpath, undefined, undefined, () => Promise.resolve(["bonus"]));

        const result = await service.run("/project", runRequest());

        expect(result).toEqual({
            status: "invalid-modes",
            error: 'mode "base" isn\'t part of this project\'s current build -- rebuild the project, then pick from: bonus.',
        });
        expect(readFile).not.toHaveBeenCalled();
    });

    it("rejects every stale mode in one request, listing only the current build's own modes as pickable", async () => {
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({capabilities: ["multiMode"]}),
            () => "",
            identityRealpath,
            undefined,
            undefined,
            () => Promise.resolve(["bonus"]),
        );

        const result = await service.run(
            "/project",
            runRequest({
                modes: [
                    {modeName: "base", librarySelector: {kind: "json", path: "base.json"}},
                    {modeName: "super", librarySelector: {kind: "json", path: "super.json"}},
                ],
            }),
        );

        expect(result).toEqual({
            status: "invalid-modes",
            error: 'mode "base", mode "super" aren\'t part of this project\'s current build -- rebuild the project, then pick from: bonus.',
        });
    });

    it("deploys a mode that is part of the active project's own current build", async () => {
        const library = testLibrary();
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget(),
            () => JSON.stringify(library),
            identityRealpath,
            undefined,
            undefined,
            () => Promise.resolve(["base", "bonus"]),
        );

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("ok");
    });

    it("rejects, with domain-level remediation, when the active project has no inspectable current build (e.g. an ungenerated project, or one whose entry module fails to load) — never reaching library loading", async () => {
        const readFile = jest.fn(() => {
            throw new Error("library file should not be read when the current build isn't known");
        });
        const service = new StudioDeploymentService(undefined, () => stubTarget(), readFile, identityRealpath, undefined, undefined, () => Promise.resolve(undefined));

        const result = await service.run("/project", runRequest());

        expect(result).toEqual({
            status: "invalid-modes",
            error: 'This project has no current build to deploy against -- run "pokie build" (or the Certification tab\'s own build step), then try again.',
        });
        expect(readFile).not.toHaveBeenCalled();
    });

    it("returns load-error, prefixed with the mode name, when a library fails to load", async () => {
        const readFile = () => {
            throw new Error("simulated read failure");
        };
        const service = new StudioDeploymentService(undefined, () => stubTarget(), readFile, identityRealpath, undefined, undefined, buildModeIdsIncludingBase);

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("load-error");
        expect(result.status === "load-error" && result.error).toContain('mode "base"');
        expect(result.status === "load-error" && result.error).toContain("simulated read failure");
    });

    it("stops at the first mode that fails to load and never calls the generator", async () => {
        const generate = jest.fn(stubGenerator().generate);
        const readFile = () => {
            throw new Error("simulated read failure");
        };
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({artifactGenerator: {generate}}),
            readFile,
            identityRealpath,
            undefined,
            undefined,
            buildModeIdsIncludingBase,
        );

        await service.run("/project", runRequest({modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}]}));

        expect(generate).not.toHaveBeenCalled();
    });

    it("previews (publish: false) without ever calling the target's own runtimeAdapter", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const library = testLibrary();
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({runtimeAdapter: {deliver}}),
            () => JSON.stringify(library),
            identityRealpath,
            undefined,
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run("/project", runRequest({publish: false}));

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.publish).toBe(false);
        expect(result.status === "ok" && result.view.delivery).toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("deploys (publish: true) and calls the target's own runtimeAdapter", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true, details: {published: true}}));
        const library = testLibrary();
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({runtimeAdapter: {deliver}}),
            () => JSON.stringify(library),
            identityRealpath,
            undefined,
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run("/project", runRequest({publish: true}));

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.publish).toBe(true);
        expect(result.status === "ok" && result.view.delivery?.delivered).toBe(true);
        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it("surfaces compatibility issues without ever reaching the generator, for a genuinely incompatible library", async () => {
        const generate = jest.fn(stubGenerator().generate);
        const malformedLibrary = {schemaVersion: 1, libraryId: "", outcomes: []};
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({artifactGenerator: {generate}}),
            () => JSON.stringify(malformedLibrary),
            identityRealpath,
            undefined,
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.compatibilityIssues.length).toBeGreaterThan(0);
        expect(result.status === "ok" && result.view.generation).toBeUndefined();
        expect(generate).not.toHaveBeenCalled();
    });

    it("decodes Buffer artifact content into a plain string in the returned view", async () => {
        const bufferGenerator = {
            generate: (_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult => ({
                artifacts: [{relativePath: "index.json", content: Buffer.from('{"fromBuffer":true}')}],
                issues: [],
            }),
        };
        const library = testLibrary();
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget({artifactGenerator: bufferGenerator}),
            () => JSON.stringify(library),
            identityRealpath,
            undefined,
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("ok");
        const content = result.status === "ok" ? result.view.generation?.artifacts[0]?.content : undefined;
        expect(content).toBe('{"fromBuffer":true}');
        expect(typeof content).toBe("string");
    });

    it("deploys a mode whose librarySelector points at a bundle, not only a flat JSON file", async () => {
        const library = testLibrary();
        const analyzer = new WeightedOutcomeLibraryAnalyzer<string>();
        const manifest: OutcomeLibraryBundleManifest = {
            schemaVersion: 1,
            generatedBy: "pokie outcomelibrary build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-01T00:00:00.000Z",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                    analysis: analyzer.analyze(library),
                    indexFile: "index_base.json",
                    outcomesFile: "outcomes_base.jsonl",
                },
            ],
            files: ["manifest.json", "index_base.json", "outcomes_base.jsonl"],
        };
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget(),
            () => {
                throw new Error("readFile should not be used for a bundle selector");
            },
            identityRealpath,
            new FakeBundleReader(manifest, library),
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run(
            "/project",
            runRequest({modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]}),
        );

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.compatibilityIssues).toEqual([]);
    });

    it("returns load-error, prefixed with the mode name, when a bundle librarySelector's mode isn't in the bundle", async () => {
        const library = testLibrary();
        const analyzer = new WeightedOutcomeLibraryAnalyzer<string>();
        const manifest: OutcomeLibraryBundleManifest = {
            schemaVersion: 1,
            generatedBy: "pokie outcomelibrary build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-01T00:00:00.000Z",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            artifactPokieVersion: "1.3.0",
            modes: [
                {
                    modeName: "bonus",
                    betMode: "bonus",
                    stake: 1,
                    libraryId: "lib-bundle",
                    libraryHash: "sha256:whatever",
                    outcomeCount: 1,
                    totalWeight: 1,
                    analysis: analyzer.analyze(library),
                    indexFile: "index_bonus.json",
                    outcomesFile: "outcomes_bonus.jsonl",
                },
            ],
            files: ["manifest.json", "index_bonus.json", "outcomes_bonus.jsonl"],
        };
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget(),
            () => "",
            identityRealpath,
            new FakeBundleReader(manifest, library),
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run(
            "/project",
            runRequest({modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]}),
        );

        expect(result.status).toBe("load-error");
        expect(result.status === "load-error" && result.error).toContain('mode "base"');
        expect(result.status === "load-error" && result.error).toContain('unknown mode "base"');
    });

    it("rejects a bundle librarySelector whose modeName differs from its own deployment row's mode, before ever reading the bundle", async () => {
        const bundleReader = {
            readManifest: jest.fn(() => {
                throw new Error("bundle should not be read for a mismatched selector");
            }),
            readModeIndex: jest.fn(),
            iterateModeOutcomes: jest.fn(),
            readOutcomeById: jest.fn(),
            drawOutcome: jest.fn(),
            readLibrary: jest.fn(),
        };
        const service = new StudioDeploymentService(undefined, () => stubTarget(), undefined, identityRealpath, bundleReader, undefined, buildModeIdsIncludingBase);

        const result = await service.run(
            "/project",
            runRequest({modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "bonus"}}]}),
        );

        expect(result).toEqual({
            status: "invalid-modes",
            error: 'mode "base"\'s library selector names mode "bonus" -- a bundle/Stake Engine selector must name the exact same mode as its own deployment row.',
        });
        expect(bundleReader.readManifest).not.toHaveBeenCalled();
        expect(bundleReader.readLibrary).not.toHaveBeenCalled();
    });

    it("rejects a Stake Engine librarySelector whose modeName differs from its own deployment row's mode, before ever reading the export", async () => {
        const stakeEngineImporter = {
            importFromDirectory: jest.fn(() => {
                throw new Error("stake engine export should not be read for a mismatched selector");
            }),
        };
        const service = new StudioDeploymentService(undefined, () => stubTarget(), undefined, identityRealpath, undefined, stakeEngineImporter, buildModeIdsIncludingBase);

        const result = await service.run(
            "/project",
            runRequest({modes: [{modeName: "base", librarySelector: {kind: "stakeengine", stakeDir: "stakeexport", modeName: "bonus"}}]}),
        );

        expect(result).toEqual({
            status: "invalid-modes",
            error: 'mode "base"\'s library selector names mode "bonus" -- a bundle/Stake Engine selector must name the exact same mode as its own deployment row.',
        });
        expect(stakeEngineImporter.importFromDirectory).not.toHaveBeenCalled();
    });

    it("deploys a mode whose bundle librarySelector names the same mode as its own deployment row", async () => {
        const library = testLibrary();
        const analyzer = new WeightedOutcomeLibraryAnalyzer<string>();
        const manifest: OutcomeLibraryBundleManifest = {
            schemaVersion: 1,
            generatedBy: "pokie outcomelibrary build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-01T00:00:00.000Z",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
                    analysis: analyzer.analyze(library),
                    indexFile: "index_base.json",
                    outcomesFile: "outcomes_base.jsonl",
                },
            ],
            files: ["manifest.json", "index_base.json", "outcomes_base.jsonl"],
        };
        const service = new StudioDeploymentService(
            undefined,
            () => stubTarget(),
            undefined,
            identityRealpath,
            new FakeBundleReader(manifest, library),
            undefined,
            buildModeIdsIncludingBase,
        );

        const result = await service.run(
            "/project",
            runRequest({modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]}),
        );

        expect(result.status).toBe("ok");
    });
});
