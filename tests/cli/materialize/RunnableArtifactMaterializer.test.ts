import {
    PokieProject,
    ProjectMaterializationResult,
    ProjectMaterializing,
    PROJECT_TYPE_CAPABILITIES,
} from "pokie";
import {RunnableArtifactMaterializer} from "../../../cli/materialize/RunnableArtifactMaterializer.js";

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/projects/${type}`, provenance: "test", capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("RunnableArtifactMaterializer", () => {
    it("borrows a package through the shared runtime plan", async () => {
        const result: ProjectMaterializationResult = {runtimePath: "/runtime", ownsRuntimePath: false, release: () => Promise.resolve()};
        const materializer: ProjectMaterializing = {materialize: jest.fn(() => Promise.resolve(result))};
        const subject = new RunnableArtifactMaterializer(materializer);

        await expect(subject.materialize(project("tsPackage"))).resolves.toEqual(result);
        expect(materializer.materialize).toHaveBeenCalledWith(project("tsPackage"), {});
    });

    it("stops before allocating a runtime when cancelled", async () => {
        const materializer: ProjectMaterializing = {materialize: jest.fn()};
        const controller = new AbortController();
        controller.abort();

        await expect(new RunnableArtifactMaterializer(materializer).materialize(project("blueprint"), {signal: controller.signal}))
            .rejects.toThrow(/cancelled/i);
        expect(materializer.materialize).not.toHaveBeenCalled();
    });
});
