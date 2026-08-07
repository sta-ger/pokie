import type {GamePackageInspectionReport, PokieProject, WasmComponentManifestReadResult} from "pokie";
import {buildProjectGameModel, type GameModelSourceReaders} from "../../../../cli/studio/blueprint/buildProjectGameModel.js";
import type {StudioBlueprintLoadView} from "../../../../cli/studio/blueprint/StudioBlueprintLoadView.js";

const GAME = {id: "a", name: "A", version: "1.0.0"};

function readers(overrides: Partial<GameModelSourceReaders> = {}): GameModelSourceReaders {
    return {
        loadBlueprint: () => {
            throw new Error("loadBlueprint should not be called");
        },
        inspectPackage: () => {
            throw new Error("inspectPackage should not be called");
        },
        readWasmManifest: () => {
            throw new Error("readWasmManifest should not be called");
        },
        ...overrides,
    };
}

function wasmProject(overrides: Partial<PokieProject> = {}): PokieProject {
    return {type: "wasm", rootPath: "/games/a.wasm", capabilities: ["wasm.manifest.read"], provenance: "sidecar manifest", ...overrides} as PokieProject;
}

function outcomeLibraryProject(): PokieProject {
    return {
        type: "outcomeLibrary",
        rootPath: "/games/a-library",
        capabilities: ["outcomeLibrary.read"],
        provenance: "canonical bundle",
    } as PokieProject;
}

describe("buildProjectGameModel", () => {
    it("loads and projects the tracked Blueprint source for an opened blueprint project", async () => {
        const loadBlueprint = (root: string): StudioBlueprintLoadView => {
            expect(root).toBe("/games/a/blueprint.json");
            return {status: "ok", path: root, blueprintHash: "sha256:x", blueprint: {manifest: GAME, reels: 3, rows: 3, symbols: ["A"], paytable: {}}};
        };

        const projection = await buildProjectGameModel("/games/a/blueprint.json", undefined, true, readers({loadBlueprint}));

        expect(projection.basics).toEqual({status: "available", data: GAME});
        expect(projection.layout).toEqual({status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0}});
    });

    it("reports every section unavailable, with the load error as the reason, when the tracked Blueprint source fails to load", async () => {
        const loadBlueprint = (): StudioBlueprintLoadView => ({status: "load-error", error: "ENOENT: no such file or directory"});

        const projection = await buildProjectGameModel("/games/a/blueprint.json", undefined, true, readers({loadBlueprint}));

        expect(projection.basics).toEqual({status: "unavailable", reason: expect.stringContaining("ENOENT")});
        expect(projection.paytable).toEqual({status: "unavailable", reason: expect.stringContaining("ENOENT")});
    });

    it("never invents a game model for a resolved outcomeLibrary/stakeAdapter project", async () => {
        const projection = await buildProjectGameModel("/games/a-library", outcomeLibraryProject(), false, readers());

        expect(projection.basics).toEqual({status: "unavailable", reason: expect.stringContaining("pre-generated outcome source")});
        expect(projection.reels).toEqual({status: "unavailable", reason: expect.stringContaining("pre-generated outcome source")});
    });

    it("exposes only the manifest identity for a resolved wasm project with a compatible manifest", async () => {
        const manifest: WasmComponentManifestReadResult = {
            supported: true,
            manifest: {
                schemaVersion: "1.0.0",
                component: {id: "my-component", version: "2.0.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            },
        };
        const readWasmManifest = (project: PokieProject) => {
            expect(project.type).toBe("wasm");
            return Promise.resolve(manifest);
        };

        const projection = await buildProjectGameModel("/games/a.wasm", wasmProject(), false, readers({readWasmManifest}));

        expect(projection.basics).toEqual({status: "available", data: {id: "my-component", version: "2.0.0"}});
        expect(projection.reels).toEqual({status: "unavailable", reason: expect.stringContaining("WASM component")});
    });

    it("reports every section unavailable when a resolved wasm project's manifest is no longer supported", async () => {
        const readWasmManifest = () =>
            Promise.resolve({
                supported: false,
                diagnostic: {
                    detectedType: "wasm",
                    operation: "wasm.inspect",
                    missingCapability: "wasm.manifest.read",
                    alternatives: [],
                    message: "The sidecar manifest is no longer compatible.",
                },
            } as WasmComponentManifestReadResult);

        const projection = await buildProjectGameModel("/games/a.wasm", wasmProject(), false, readers({readWasmManifest}));

        expect(projection.basics).toEqual({status: "unavailable", reason: "The sidecar manifest is no longer compatible."});
    });

    it("exposes only package.json's own fields for a tsPackage project", async () => {
        const inspectPackage = (root: string): GamePackageInspectionReport => {
            expect(root).toBe("/games/a-package");
            return {packageRoot: root, valid: true, packageJson: {name: "a-package", version: "1.0.0", description: "A game"}};
        };

        const projection = await buildProjectGameModel("/games/a-package", undefined, false, readers({inspectPackage}));

        expect(projection.basics).toEqual({status: "available", data: {name: "a-package", version: "1.0.0", description: "A game"}});
        expect(projection.paytable).toEqual({status: "unavailable", reason: expect.stringContaining("compiled TypeScript package")});
    });

    it("reports every section unavailable, with the inspect error as the reason, when a tsPackage project can't be inspected", async () => {
        const inspectPackage = (root: string): GamePackageInspectionReport => ({packageRoot: root, valid: false, error: "not a directory"});

        const projection = await buildProjectGameModel("/games/a-package", undefined, false, readers({inspectPackage}));

        expect(projection.basics).toEqual({status: "unavailable", reason: "not a directory"});
    });
});
