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
        it("reports the registry-owned Blueprint -> Outcome -> Stake targets as supported", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(blueprintPath);

            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry]));
            expect(byTarget.get("tsPackage")?.supported).toBe(true);
            expect(byTarget.get("outcomeLibrary")?.supported).toBe(true);
            expect(byTarget.get("stakeAdapter")?.supported).toBe(true);
            expect(byTarget.get("parWorkbook")?.supported).toBe(false);
            expect(byTarget.get("wasm")?.supported).toBe(false);
        });

        it("marks every target unsupported for a path that isn't a recognized POKIE project", async () => {
            const targets = await service.listTargets(path.join(workDir, "does-not-exist"));

            expect(targets.every((entry) => entry.supported === false)).toBe(true);
        });
    });

    describe("preview", () => {
        it("resolves the same default sibling destination build() itself would use, without writing anything", async () => {
            const blueprintPath = writeBlueprintFile();
            const expectedDestination = path.join(workDir, "tsPackage");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(expectedDestination);
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(expectedDestination)).toBe(false);
        });

        it("resolves an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.preview(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(explicitOut);
        });

        it("previews the registry-owned Blueprint -> Stake hand-off without writing", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.sourceType).toBe("blueprint");
        });

        it("reports a conflict for a pre-existing non-empty destination, agreeing with what build() itself would report, and never writes to it", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            if (result.status !== "conflict") {
                throw new Error("expected conflict");
            }
            expect(result.destination).toBe(destination);
            expect(result.message).toMatch(/already exists and is not empty/);
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.preview(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
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

        it("builds Blueprint -> Stake through the shared registry and registers the generated Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(fs.existsSync(path.join(result.outputPath, "index.json"))).toBe(true);
            expect(registeredProjects).toHaveLength(1);
            expect(fs.existsSync(path.join(registeredProjects[0], "manifest.json"))).toBe(true);
        });

        it("builds Blueprint -> Outcome through the shared registry and registers the opened Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "outcomeLibrary");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "outcomeLibrary"));
            expect(registeredProjects).toEqual([result.outputPath]);
            expect(fs.existsSync(path.join(result.outputPath, "manifest.json"))).toBe(true);
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
