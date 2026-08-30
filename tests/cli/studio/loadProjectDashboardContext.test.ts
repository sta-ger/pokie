import ExcelJS from "exceljs";
import {PokieGame, PokieGameManifest, PokieProject, STUDIO_OPERATION} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {loadProjectDashboardContext} from "../../../cli/studio/loadProjectDashboardContext.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

describe("loadProjectDashboardContext", () => {
    it("resolves to loaded with the game's manifest on success", async () => {
        const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
        const loadGame = jest.fn().mockResolvedValue(createFakeGame(manifest));

        const dashboard = await loadProjectDashboardContext("./sample-slot", loadGame);

        expect(dashboard).toEqual({
            status: "loaded",
            projectRoot: path.resolve("./sample-slot"),
            game: manifest,
        });
        expect(loadGame).toHaveBeenCalledWith("./sample-slot");
    });

    it("resolves projectRoot to an absolute path even when given a relative one", async () => {
        const loadGame = jest.fn().mockResolvedValue(createFakeGame({id: "a", name: "A", version: "1.0.0"}));

        const dashboard = await loadProjectDashboardContext("relative-dir", loadGame);

        expect(dashboard.status).toBe("loaded");
        expect(dashboard).toMatchObject({projectRoot: path.resolve("relative-dir")});
    });

    it("leaves an already-absolute projectRoot unchanged", async () => {
        const absolute = path.resolve("/tmp/sample-slot");
        const loadGame = jest.fn().mockResolvedValue(createFakeGame({id: "a", name: "A", version: "1.0.0"}));

        const dashboard = await loadProjectDashboardContext(absolute, loadGame);

        expect(dashboard.status).toBe("loaded");
        expect(dashboard).toMatchObject({projectRoot: absolute});
    });

    it("resolves to an error with the message when loadGame rejects with an Error (e.g. entry load failure)", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("Cannot find module './dist/index.js'"));

        const dashboard = await loadProjectDashboardContext("./broken-game", loadGame);

        expect(dashboard).toEqual({
            status: "error",
            projectRoot: path.resolve("./broken-game"),
            error: "Cannot find module './dist/index.js'",
        });
    });

    it("resolves to an error with a stringified message when loadGame rejects with a non-Error value", async () => {
        const loadGame = jest.fn().mockRejectedValue("boom");

        const dashboard = await loadProjectDashboardContext("./broken-game", loadGame);

        expect(dashboard).toEqual({
            status: "error",
            projectRoot: path.resolve("./broken-game"),
            error: "boom",
        });
    });

    it("resolves to an error when the package doesn't satisfy the PokieGame contract (getManifest() itself throwing)", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("does not export a valid PokieGame"));

        const dashboard = await loadProjectDashboardContext("./not-a-pokie-game", loadGame);

        expect(dashboard.status).toBe("error");
        if (dashboard.status === "error") {
            expect(dashboard.error).toContain("does not export a valid PokieGame");
        }
    });

    it("never rejects", async () => {
        const loadGame = jest.fn().mockRejectedValue(new Error("boom"));

        await expect(loadProjectDashboardContext("./broken-game", loadGame)).resolves.not.toThrow();
    });

    it("opens a compatible WASM component as an inspection-only artifact without preparing or loading a runtime", async () => {
        const loadGame = jest.fn();
        const resolveRuntimePackageRoot = jest.fn();
        const wasmProject: PokieProject = {
            type: "wasm",
            rootPath: "/components/sample.wasm",
            capabilities: ["wasm.manifest.read"],
            provenance: "compatible POKIE WASM sidecar",
        };

        const dashboard = await loadProjectDashboardContext(
            wasmProject.rootPath,
            loadGame,
            resolveRuntimePackageRoot,
            undefined,
            undefined,
            () => Promise.resolve(wasmProject),
        );

        expect(dashboard).toMatchObject({status: "artifact", project: wasmProject});
        expect(resolveRuntimePackageRoot).not.toHaveBeenCalled();
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("opens a runnable PAR workbook through the shared runtime materialization boundary", async () => {
        const manifest: PokieGameManifest = {id: "par-slot", name: "PAR Slot", version: "1.0.0"};
        const loadGame = jest.fn().mockResolvedValue(createFakeGame(manifest));
        const release = jest.fn().mockResolvedValue(undefined);
        const resolveRuntimePackageRoot = jest.fn().mockResolvedValue({runtimePath: "/cached/par-runtime", release});
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-par-dashboard-test-"));
        const workbookPath = path.join(workDir, "sheet.xlsx");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        workbook.addWorksheet("Symbols");
        workbook.addWorksheet("Paytable");

        try {
            await workbook.xlsx.writeFile(workbookPath);
            const dashboard = await loadProjectDashboardContext(workbookPath, loadGame, resolveRuntimePackageRoot);

            expect(dashboard).toEqual({
                status: "loaded",
                projectRoot: workbookPath,
                game: manifest,
            });
            expect(resolveRuntimePackageRoot).toHaveBeenCalledWith(workbookPath);
            expect(loadGame).toHaveBeenCalledWith("/cached/par-runtime");
            expect(release).toHaveBeenCalledTimes(1);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("releases a prepared runtime and never returns loaded when cancellation wins during dashboard loading", async () => {
        const controller = new AbortController();
        const release = jest.fn().mockResolvedValue(undefined);
        let finishLoad: ((game: PokieGame) => void) | undefined;
        const loadGame = jest.fn(() => new Promise<PokieGame>((resolve) => {
            finishLoad = resolve;
        }));
        const resolver = jest.fn().mockResolvedValue({runtimePath: "/temporary-runtime", release});

        const pending = loadProjectDashboardContext(
            "/old-project",
            loadGame,
            resolver,
            undefined,
            () => Promise.resolve(undefined),
            () => Promise.resolve(undefined),
            {signal: controller.signal},
        );
        await new Promise<void>((resolve) => {
            setImmediate(() => resolve());
        });
        controller.abort();
        finishLoad?.(createFakeGame({id: "old", name: "Old", version: "1.0.0"}));

        await expect(pending).resolves.toMatchObject({status: "error", projectRoot: "/old-project"});
        expect(release).toHaveBeenCalledTimes(1);
    });

    it("returns the shared PAR recognition/import diagnostic for corrupt and incomplete workbooks without loading a dashboard runtime", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-malformed-par-dashboard-"));
        const corrupt = path.join(workDir, "corrupt.xlsx");
        const incomplete = path.join(workDir, "incomplete.xlsx");
        fs.writeFileSync(corrupt, "not an XLSX");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        await workbook.xlsx.writeFile(incomplete);
        const loadGame = jest.fn();
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", STUDIO_OPERATION);

        try {
            for (const workbookPath of [corrupt, incomplete]) {
                const dashboard = await loadProjectDashboardContext(workbookPath, loadGame, resolveRuntimePackageRoot);
                expect(dashboard).toMatchObject({
                    status: "error",
                    projectRoot: path.resolve(workbookPath),
                    error: expect.stringMatching(/Cannot prepare a runnable runtime.*PAR workbook recognition.*failed PAR recognition\/import stage.*Next:/),
                });
            }
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
