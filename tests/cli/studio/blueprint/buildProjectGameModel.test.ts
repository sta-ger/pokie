import type {GamePackageInspectionReport} from "pokie";
import {buildProjectGameModel} from "../../../../cli/studio/blueprint/buildProjectGameModel.js";
import type {StudioBlueprintLoadView} from "../../../../cli/studio/blueprint/StudioBlueprintLoadView.js";

const GAME = {id: "a", name: "A", version: "1.0.0"};

function inspectReport(overrides: Partial<GamePackageInspectionReport> = {}): GamePackageInspectionReport {
    return {packageRoot: "/games/a", valid: true, generated: false, ...overrides};
}

describe("buildProjectGameModel", () => {
    it("returns every section unavailable, with no fallback manifest, for a project that wasn't generated at all", () => {
        const projection = buildProjectGameModel(inspectReport({generated: false}), () => {
            throw new Error("must not load a blueprint for a non-generated project");
        });

        expect(projection.basics).toEqual({status: "unavailable", reason: expect.stringContaining("wasn't generated from a tracked source blueprint")});
        expect(projection.paytable.status).toBe("unavailable");
    });

    it("falls back to the build record's own manifest for basics, but still marks every other section unavailable, when generated but no source path is recorded", () => {
        const projection = buildProjectGameModel(
            inspectReport({
                generated: true,
                buildInfo: {schemaVersion: 1, generatedBy: "pokie build", pokieVersion: "1.3.0", generatedAt: "2026-01-01T00:00:00.000Z", blueprintHash: "sha256:x", game: GAME},
            }),
            () => {
                throw new Error("must not load a blueprint when no source path is recorded");
            },
        );

        expect(projection.basics).toEqual({status: "available", data: GAME});
        expect(projection.layout).toEqual({status: "unavailable", reason: expect.stringContaining("no tracked source blueprint path on record")});
    });

    it("loads and projects the tracked source blueprint when generated with a known source path", () => {
        const report = inspectReport({
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:x",
                source: "/games/a-source/blueprint.json",
                game: GAME,
            },
        });
        const loadBlueprint = (path: string): StudioBlueprintLoadView => {
            expect(path).toBe("/games/a-source/blueprint.json");
            return {
                status: "ok",
                path,
                blueprintHash: "sha256:loaded",
                blueprint: {manifest: GAME, reels: 3, rows: 3, symbols: ["A"], paytable: {}},
            };
        };

        const projection = buildProjectGameModel(report, loadBlueprint);

        expect(projection.basics).toEqual({status: "available", data: GAME});
        expect(projection.layout).toEqual({status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0}});
    });

    it("falls back to the build record's own manifest, with the load failure as the reason, when the tracked source can't be loaded", () => {
        const report = inspectReport({
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:x",
                source: "/games/a-source/blueprint.json",
                game: GAME,
            },
        });
        const loadBlueprint = (): StudioBlueprintLoadView => ({status: "load-error", error: "ENOENT: no such file or directory"});

        const projection = buildProjectGameModel(report, loadBlueprint);

        expect(projection.basics).toEqual({status: "available", data: GAME});
        expect(projection.paytable).toEqual({status: "unavailable", reason: expect.stringContaining("ENOENT")});
    });
});
