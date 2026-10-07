import {
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieProject,
    ProjectMaterializationResult,
    ProjectMaterializing,
    PROJECT_TYPE_CAPABILITIES,
    SIM_OPERATION,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {RunnableArtifactMaterializer} from "../../../cli/materialize/RunnableArtifactMaterializer.js";
import {RuntimePreparationCancelledError} from "../../../cli/materialize/RuntimePreparationCancelledError.js";
import {RuntimePreparationCleanupError} from "../../../cli/materialize/RuntimePreparationCleanupError.js";

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
            .rejects.toBeInstanceOf(RuntimePreparationCancelledError);
        expect(materializer.materialize).not.toHaveBeenCalled();
    });

    it("retains a PAR stage release failure even when it carries a cancellation error", async () => {
        const failure = new RuntimePreparationCancelledError();
        const release = jest.fn(() => Promise.reject(failure));
        const subject = new RunnableArtifactMaterializer({materialize: () => Promise.resolve({
            runtimePath: "/runtime", ownsRuntimePath: false, release,
        })});
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-par-release-failure-"));
        const workbookPath = path.join(workDir, "game.xlsx");
        fs.copyFileSync(path.join(process.cwd(), "examples", "parsheets", "starter.par.xlsx"), workbookPath);
        try {
            const lease = await subject.materialize({...project("parWorkbook"), rootPath: workbookPath});
            const pending = lease.release();
            await expect(pending).rejects.toBeInstanceOf(RuntimePreparationCleanupError);
            await expect(pending).rejects.toMatchObject({cause: failure});
            expect(release).toHaveBeenCalledTimes(1);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("reuses only a verified matching PAR runtime and invalidates it when the workbook bytes change", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runnable-par-"));
        const cacheRoot = path.join(workDir, "cache");
        const workbookPath = path.join(workDir, "slot.par.xlsx");
        fs.copyFileSync(path.join(process.cwd(), "examples", "parsheets", "starter.par.xlsx"), workbookPath);
        const runnerCalls: string[] = [];
        const runCommand = jest.fn((command: string, args: string[], cwd: string) => {
            runnerCalls.push(cwd);
            return Promise.resolve({stdout: "", stderr: ""});
        });
        const packageValidator: PokieGamePackageValidating = {
            validate: (packageRoot: string): Promise<PokieGamePackageValidationReport> => Promise.resolve({
                packageRoot,
                valid: true,
                game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                errors: [],
                warnings: [],
                suggestions: [],
            }),
        };
        const blueprintMaterializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runCommand, packageValidator, cacheRoot);
        const resolveRuntimePackage = createMaterializingRuntimePackageResolver("1.3.0", SIM_OPERATION, undefined, {
            materializer: blueprintMaterializer,
        });

        try {
            const first = await resolveRuntimePackage(workbookPath);
            const second = await resolveRuntimePackage(workbookPath);
            expect(second.runtimePath).toBe(first.runtimePath);
            expect(runnerCalls).toHaveLength(1);
            await first.release();
            await second.release();

            // The PAR import can produce the same Blueprint model after this
            // harmless byte change; the workbook identity still must prevent
            // stale runtime reuse.
            fs.appendFileSync(workbookPath, "\nchanged-workbook-byte\n");
            const changed = await resolveRuntimePackage(workbookPath);
            expect(changed.runtimePath).not.toBe(first.runtimePath);
            expect(runnerCalls).toHaveLength(2);
            await changed.release();

            expect(fs.readdirSync(workDir).filter((entry) => entry.startsWith("pokie-runtime-par-")).length).toBe(0);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
