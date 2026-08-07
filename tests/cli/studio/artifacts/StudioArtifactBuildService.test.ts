import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../../cli/studio/artifacts/StudioArtifactBuildService.js";

function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("StudioArtifactBuildService", () => {
    let workDir: string;
    let service: StudioArtifactBuildService;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-build-test-"));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    function writeBlueprintFile(blueprint: unknown = buildBlueprint()): string {
        const filePath = path.join(workDir, "blueprint.json");
        fs.writeFileSync(filePath, JSON.stringify(blueprint));
        return filePath;
    }

    describe("listTargets", () => {
        it("reports every ArtifactBuilderRegistry target, marking only tsPackage supported for a blueprint project", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(blueprintPath);

            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry]));
            expect(byTarget.get("tsPackage")?.supported).toBe(true);
            expect(byTarget.get("outcomeLibrary")?.supported).toBe(false);
            expect(byTarget.get("stakeAdapter")?.supported).toBe(false);
            expect(byTarget.get("parWorkbook")?.supported).toBe(false);
            expect(byTarget.get("wasm")?.supported).toBe(false);
        });

        it("marks every target unsupported for a path that isn't a recognized POKIE project", async () => {
            const targets = await service.listTargets(path.join(workDir, "does-not-exist"));

            expect(targets.every((entry) => entry.supported === false)).toBe(true);
        });
    });

    describe("build", () => {
        it("builds a tsPackage from a blueprint source to the default sibling destination, matching BuildCommand's own default", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "tsPackage"));
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(path.join(result.outputPath, "package.json"))).toBe(true);
        });

        it("builds to an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.build(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(explicitOut);
        });

        it("reports an unsupported conversion instead of ever invoking a builder", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.build(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("unsupported");
            if (result.status !== "unsupported") {
                throw new Error("expected unsupported");
            }
            expect(result.message).toContain('"stakeAdapter" cannot be built from a "blueprint" project');
        });

        it("reports a conflict (never writing) for a pre-existing non-empty destination", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.build(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
        });

        it("reports a plain error (not a crash) for an invalid blueprint", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({symbols: []}));

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("error");
        });
    });
});
