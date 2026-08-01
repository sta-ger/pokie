import type {PokieProject} from "../../src/project/PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import type {ProjectMaterializationResult} from "../../src/project/ProjectMaterializationResult.js";
import type {ProjectMaterializing} from "../../src/project/ProjectMaterializing.js";
import type {ProjectType} from "../../src/project/ProjectType.js";

function projectOf(type: ProjectType): PokieProject {
    return {
        type,
        rootPath: `/projects/${type}`,
        capabilities: PROJECT_TYPE_CAPABILITIES[type],
        provenance: "test fixture",
    } as PokieProject;
}

// A minimal fake standing in for a future concrete ProjectMaterializing — no real build/package-manager
// work, just enough behavior to exercise the contract's two lifecycle-ownership cases. A "tsPackage"
// project is already runtime-shaped, so it's handed back verbatim ("borrowed"); anything else is treated
// as needing a freshly materialized location the caller must release ("owned").
class FakeProjectMaterializing implements ProjectMaterializing {
    public readonly released: string[] = [];

    public materialize(project: PokieProject): Promise<ProjectMaterializationResult> {
        if (project.type === "tsPackage") {
            return Promise.resolve({
                runtimePath: project.rootPath,
                ownsRuntimePath: false,
                release: () => Promise.resolve(),
            });
        }

        const runtimePath = `${project.rootPath}/.pokie-materialized`;
        return Promise.resolve({
            runtimePath,
            ownsRuntimePath: true,
            release: () => {
                this.released.push(runtimePath);
                return Promise.resolve();
            },
        });
    }
}

describe("ProjectMaterializing", () => {
    it("accepts an already-resolved PokieProject rather than a raw path", async () => {
        const materializing = new FakeProjectMaterializing();
        const project = projectOf("tsPackage");

        const result = await materializing.materialize(project);

        expect(result.runtimePath).toBe(project.rootPath);
    });

    it("reports a borrowed runtime path as not owning cleanup, and release() is a safe no-op", async () => {
        const materializing = new FakeProjectMaterializing();

        const result = await materializing.materialize(projectOf("tsPackage"));

        expect(result.ownsRuntimePath).toBe(false);
        await expect(result.release()).resolves.toBeUndefined();
        expect(materializing.released).toEqual([]);
    });

    it("reports a freshly materialized runtime path as owning cleanup, and release() performs it", async () => {
        const materializing = new FakeProjectMaterializing();

        const result = await materializing.materialize(projectOf("blueprint"));

        expect(result.ownsRuntimePath).toBe(true);
        expect(result.runtimePath).not.toBe("/projects/blueprint");
        expect(materializing.released).toEqual([]);

        await result.release();

        expect(materializing.released).toEqual([result.runtimePath]);
    });

    it("exposes release() on every result, so callers never branch on ownsRuntimePath first", async () => {
        const materializing = new FakeProjectMaterializing();
        const borrowed = await materializing.materialize(projectOf("tsPackage"));
        const owned = await materializing.materialize(projectOf("stakeAdapter"));

        expect(typeof borrowed.release).toBe("function");
        expect(typeof owned.release).toBe("function");
    });
});
